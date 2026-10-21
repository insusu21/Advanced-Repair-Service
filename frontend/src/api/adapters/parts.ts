/* 부품 · 재고 · 공장 · 발주 변환 */
import type { OrderStatus, Part, PurchaseOrder } from '@/types'
import type { CreateOrderRequest } from '@/types/api'
import type { BeFactory, BeOrder, BeOrderStatus, BePart, BeProcurement, BeStock } from './types'

/** 부품 + 창고 재고 + 공급 공장 → Part. 공장 담당자·이메일·단가·호환 모델은 백엔드에 없어 비운다 */
export function toPart(p: BePart, stocks: BeStock[], factories: BeFactory[]): Part {
  const f = [...factories].sort((a, b) => (a.lead_days ?? 999) - (b.lead_days ?? 999))[0]
  return {
    id: p.id,
    name: p.name,
    partNo: p.part_number,
    category: p.category,
    // 호환 모델 정보가 부품 목록에 없음 → 빈 배열 = 모든 모델 허용 (isCompatible 참고)
    compatibleModels: [],
    stocks: stocks.map((s) => ({ warehouse: s.warehouse_name, location: s.address || s.region, quantity: s.available, warehouseId: s.warehouse_id, phone: s.phone })),
    factory: f ? `${f.name}${f.region ? ` (${f.region})` : ''}` : '-',
    factoryContact: { manager: '', phone: f?.phone ?? '', email: '' },
    leadTimeDays: f?.lead_days ?? 0,
    unitPrice: 0,
    factoryId: f?.id,
  }
}

export function toOrderStatus(s: BeOrderStatus): OrderStatus {
  return s === 'PENDING' ? 'REQUESTED' : s
}

/** 프론트 발주 카드 id = "주문id#품목id" (주문 하나에 품목이 여러 개일 수 있음) */
export const orderIdOf = (cardId: string) => cardId.split('#')[0]

const user = (id: string | null) => (id ? `사용자 #${id}` : undefined)

/** 백엔드 발주(품목 n개) → 프론트 발주 카드 n장 */
export function toPurchaseOrders(o: BeOrder, parts: Part[]): PurchaseOrder[] {
  const decided = o.status === 'APPROVED' || o.status === 'ORDERED' || o.status === 'RECEIVED' ? 'APPROVED' : o.status === 'REJECTED' ? 'REJECTED' : 'PENDING'
  return o.items.map((it) => {
    const part = parts.find((p) => p.id === it.part_id)
    const from =
      it.source === 'FACTORY'
        ? `공장 발주 · ${part?.factory ?? `공장 #${it.factory_id}`}`
        : (part?.stocks.find((s) => s.warehouseId === it.warehouse_id)?.warehouse ?? `창고 #${it.warehouse_id}`)
    return {
      id: `${o.id}#${it.id}`,
      repairId: Number(o.case_id),
      receiptNo: '',
      partId: it.part_id,
      partNo: part?.partNo ?? '-',
      partName: part?.name ?? `부품 #${it.part_id}`,
      quantity: it.quantity,
      fromWarehouse: from,
      aiReason: it.source === 'FACTORY' ? '재고 부족 · 공장 발주 요청' : '창고 재고 출고 요청',
      aiConfidence: 0,
      sourceIds: [],
      status: toOrderStatus(o.status),
      requestedBy: user(o.requested_by),
      requestedAt: o.created_at,
      decision: { state: decided, decidedBy: user(o.decided_by), decidedByRole: o.decided_by ? 'QUALITY_MANAGER' : undefined, decidedAt: o.decided_at ?? undefined, comment: o.decision_note ?? undefined },
      createdAt: o.created_at,
    }
  })
}

/** 조달 스냅샷(body 스키마 미정)에서 AI 발주 제안 품목을 찾아 AI_DRAFT 카드로. items/proposals/recommendations/parts 배열을 순서대로 확인 */
export function toProcurementDrafts(p: BeProcurement, repairId: number, parts: Part[]): PurchaseOrder[] {
  const snap = [...p.snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (!snap) return []
  const body = snap.body ?? {}
  const list = (['items', 'proposals', 'recommendations', 'parts'] as const).map((k) => body[k]).find(Array.isArray) as Record<string, unknown>[] | undefined
  return (list ?? [])
    .map((x) => {
      const partId = String(x.partId ?? x.part_id ?? '')
      const quantity = Number(x.quantity ?? 1)
      if (!partId) return null
      const part = parts.find((pp) => pp.id === partId)
      const best = [...(part?.stocks ?? [])].sort((a, b) => b.quantity - a.quantity)[0]
      const order: PurchaseOrder = {
        id: `draft-${partId}`,
        repairId,
        receiptNo: '',
        partId,
        partNo: part?.partNo ?? '-',
        partName: part?.name ?? `부품 #${partId}`,
        quantity,
        fromWarehouse: best?.warehouse ?? '',
        aiReason: String(x.reason ?? x.rationale ?? 'AI 조달 제안'),
        aiConfidence: typeof x.confidence === 'number' ? Math.round(x.confidence <= 1 ? x.confidence * 100 : x.confidence) : 0,
        sourceIds: [],
        status: 'AI_DRAFT',
        decision: { state: 'PENDING' },
        createdAt: snap.created_at,
      }
      return order
    })
    .filter((x): x is PurchaseOrder => !!x)
}

/** 발주 요청 → POST /repairs/{id}/orders 품목. 선택 창고 재고가 충분하면 WAREHOUSE, 부족하면 FACTORY(공급 공장) */
export function toOrderItem(req: CreateOrderRequest, part: Part | undefined) {
  const stock = part?.stocks.find((s) => s.warehouse === req.fromWarehouse)
  if (stock?.warehouseId && stock.quantity >= req.quantity) {
    return { partId: req.partId, quantity: req.quantity, source: 'WAREHOUSE' as const, warehouseId: stock.warehouseId }
  }
  if (!part?.factoryId) throw new Error('이 부품의 공급 공장 정보가 없어 공장 발주를 요청할 수 없습니다.')
  return { partId: req.partId, quantity: req.quantity, source: 'FACTORY' as const, factoryId: part.factoryId }
}
