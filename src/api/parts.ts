/* 부품 · 재고 · 발주 API
 * Mock: src/mocks/handlers.ts / 실서버: 백엔드 API v2 (src/api/adapters/parts.ts 에서 변환) */
import { ApiError, http, mockDelay, USE_MOCK } from './http'
import * as mock from '@/mocks/handlers'
import { orderIdOf, toOrderItem, toPart, toProcurementDrafts, toPurchaseOrders } from './adapters/parts'
import type { BeFactory, BeOrder, BePart, BeProcurement, BeRepairDetail, BeRepairPage, BeStock, BeTask } from './adapters/types'
import type { Part, PurchaseOrder } from '@/types'
import type { CreateOrderRequest, OrderDecisionRequest } from '@/types/api'

/* ---------- 실서버: 부품 목록 캐시 (재고·공장은 부품마다 따로 조회) ---------- */
let partsCache: { at: number; p: Promise<Part[]> } | null = null
const PARTS_TTL = 30_000

async function loadParts(): Promise<Part[]> {
  const parts = (await http.get<BePart[]>('/parts')).data
  return Promise.all(
    parts.map(async (p) => {
      const [stocks, factories] = await Promise.all([
        http.get<BeStock[]>(`/parts/${p.id}/inventory`).then((r) => r.data).catch(() => [] as BeStock[]),
        http.get<BeFactory[]>(`/parts/${p.id}/factories`).then((r) => r.data).catch(() => [] as BeFactory[]),
      ])
      return toPart(p, stocks, factories)
    }),
  )
}
function realParts(fresh = false): Promise<Part[]> {
  if (!fresh && partsCache && Date.now() - partsCache.at < PARTS_TTL) return partsCache.p
  const p = loadParts()
  partsCache = { at: Date.now(), p }
  p.catch(() => (partsCache = null))
  return p
}

const getOrder = (id: string) => http.get<BeOrder>(`/orders/${id}`).then((r) => r.data)

/** 동시 요청 수를 제한해 순서대로 실행 */
async function pool<T, R>(list: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const idx = i++
        out[idx] = await fn(list[idx])
      }
    }),
  )
  return out
}

export const partApi = {
  /** GET /api/parts (+ 부품마다 /inventory · /factories) */
  async list(): Promise<Part[]> {
    if (USE_MOCK) return mockDelay(() => mock.listParts())
    return realParts()
  },

  /** GET /api/parts/{id}/inventory · /factories */
  async inventory(partId: string): Promise<Part> {
    if (USE_MOCK) return mockDelay(() => mock.getPartInventory(partId))
    const part = (await realParts()).find((p) => p.id === partId)
    if (!part) throw new ApiError(404, '부품 정보를 찾을 수 없습니다.', 'NOT_FOUND')
    return part
  },

  /**
   * 수리 건의 AI 발주 제안 + 요청된 발주
   *  실서버: GET /api/repairs/{id}/procurement → 스냅샷의 제안(AI_DRAFT) + 발주마다 GET /api/orders/{id}
   *  스냅샷에 제안이 없으면 진단 권장 부품 중 재고가 부족한 것을 발주안으로 만든다.
   */
  async repairOrders(repairId: number): Promise<PurchaseOrder[]> {
    if (USE_MOCK) return mockDelay(() => mock.listRepairOrders(repairId))
    const [proc, parts] = await Promise.all([http.get<BeProcurement>(`/repairs/${repairId}/procurement`).then((r) => r.data), realParts()])
    const orders = (await pool(proc.orders, 4, (o) => getOrder(o.id))).flatMap((o) => toPurchaseOrders(o, parts))
    let drafts = toProcurementDrafts(proc, repairId, parts)
    if (!drafts.length) {
      const task = await http
        .get<BeTask>(`/repairs/${repairId}/diagnosis`)
        .then((r) => r.data)
        .catch(() => null)
      const rec = (task?.recommendedParts?.length ? task.recommendedParts : task?.result?.recommendedParts) ?? []
      drafts = toProcurementDrafts({ status: '', orders: [], snapshots: [{ id: '0', case_id: String(repairId), created_at: task?.updated_at ?? '', body: { items: rec } }] }, repairId, parts).filter((d) => {
        const total = parts.find((p) => p.id === d.partId)?.stocks.reduce((a, s) => a + s.quantity, 0) ?? 0
        return total < d.quantity
      })
    }
    // 이미 요청된 부품의 제안은 빼고 보여 준다
    return [...orders, ...drafts.filter((d) => !orders.some((o) => o.partId === d.partId))]
  },

  /**
   * 전체 발주 목록 (본사 품질 담당자 · 부품 화면)
   *  실서버에는 발주 목록 API 가 없어, 접수 목록(최대 100건) → 접수 상세의 orders → GET /api/orders/{id} 로 모은다.
   */
  async orders(): Promise<PurchaseOrder[]> {
    if (USE_MOCK) return mockDelay(() => mock.listOrders())
    const [page, parts] = await Promise.all([http.get<BeRepairPage>('/repairs', { params: { page: 0, size: 100 } }).then((r) => r.data), realParts()])
    // 진단 전 접수는 발주가 없으므로 건너뜀
    const candidates = page.items.filter((r) => ['DIAGNOSED', 'REPAIRING', 'CLOSED', 'MANUAL_REVIEW'].includes(r.status))
    const details = await pool(candidates, 4, (r) => http.get<BeRepairDetail>(`/repairs/${r.id}`).then((x) => x.data))
    const headers = details.flatMap((d) => d.orders ?? [])
    const orders = await pool(headers, 4, (h) => getOrder(h.id))
    return orders
      .flatMap((o) => toPurchaseOrders(o, parts))
      .sort((a, b) => (b.requestedAt ?? b.createdAt).localeCompare(a.requestedAt ?? a.createdAt))
  },

  /** POST /api/repairs/{id}/orders {items:[{partId, quantity, source, warehouseId|factoryId}]} — 재고 부족이면 FACTORY */
  async createOrder(repairId: number, req: CreateOrderRequest): Promise<PurchaseOrder> {
    if (USE_MOCK) return mockDelay(() => mock.createOrder(repairId, req), 500)
    const parts = await realParts()
    let item
    try {
      item = toOrderItem(req, parts.find((p) => p.id === req.partId))
    } catch (e) {
      throw new ApiError(400, (e as Error).message, 'INVALID_INPUT')
    }
    // 요청 메모(comment)는 백엔드 Proposal 스키마에 없어 보내지 않는다
    const order = (await http.post<BeOrder>(`/repairs/${repairId}/orders`, { items: [item] })).data
    return toPurchaseOrders(order, parts)[0]
  },

  /** POST /api/orders/{id}/approve | /reject {reason} */
  async decide(orderId: string, req: OrderDecisionRequest): Promise<PurchaseOrder> {
    if (USE_MOCK) return mockDelay(() => mock.decideOrder(orderId, req), 500)
    const action = req.action === 'APPROVE' ? 'approve' : 'reject'
    const reason = req.comment?.trim() || (req.action === 'APPROVE' ? '승인' : '반려')
    const order = (await http.post<BeOrder>(`/orders/${orderIdOf(orderId)}/${action}`, { reason })).data
    // 승인되면 재고 예약이 바뀌므로 부품 캐시를 새로 받는다
    const cards = toPurchaseOrders(order, await realParts(true))
    return cards.find((c) => c.id === orderId) ?? cards[0]
  },
}
