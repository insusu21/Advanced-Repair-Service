/* =========================================================================
 * Mock REST 핸들러 — 실제 백엔드 엔드포인트와 1:1 대응
 * 전역 규칙을 서버 측에서도 강제: AI 산출물은 사람 결정 없이 상태가 확정되지 않는다.
 * ========================================================================= */
import type {
  ApprovalRecord,
  DefectDashboard,
  Diagnosis,
  Page,
  Part,
  PhotoRequest,
  PurchaseOrder,
  Repair,
  RepairImage,
  RepairQuery,
  RepairSummaryCounts,
  Role,
  User,
} from '@/types'
import type {
  ApprovalRequest,
  CreateOrderRequest,
  CreateRepairRequest,
  LoginRequest,
  LoginResponse,
  OrderDecisionRequest,
  ReanalysisRequest,
  TechnicianReviewRequest,
  UploadImageRequest,
} from '@/types/api'
import { ApiError } from '@/api/http'
import { productFromSerial, stagesFor, USERS, type DefectRecord } from './data'
import { approvedRecords, baseDefectRecords, db, nextId, persist } from './db'
import { restartAnalysis, runAnalysis } from './engine'
import { uid } from '@/utils/format'

let currentUser: User | null = null
export function setMockUser(u: User | null) {
  currentUser = u
}
function me(): User {
  if (!currentUser) throw new ApiError(401, '로그인이 필요합니다.')
  return currentUser
}
function requireRole(...roles: Role[]) {
  const u = me()
  if (!roles.includes(u.role)) throw new ApiError(403, '이 작업을 할 권한이 없습니다.')
  return u
}
function repairOr404(id: number): Repair {
  const r = db.repairs.find((x) => x.id === id)
  if (!r) throw new ApiError(404, '수리 건을 찾을 수 없습니다.')
  return r
}
function log(r: Repair, rec: Omit<ApprovalRecord, 'id' | 'at'>) {
  r.history.push({ ...rec, id: uid('h'), at: new Date().toISOString() })
  r.updatedAt = new Date().toISOString()
}
function latestDiagnosis(id: number): Diagnosis | undefined {
  const list = db.diagnoses[id]
  return list?.[list.length - 1]
}
function toImage(req: UploadImageRequest): RepairImage {
  return { id: uid('img'), kind: req.kind, url: req.dataUrl ?? '', name: req.file?.name ?? 'image.jpg', uploadedAt: new Date().toISOString() }
}

/* ---------------- 인증 ---------------- */
export function login(req: LoginRequest): LoginResponse {
  const u = USERS.find((x) => x.employeeId === req.employeeId.trim().toUpperCase())
  if (!u || u.password !== req.password) throw new ApiError(401, '사번 또는 비밀번호가 올바르지 않습니다.')
  const { password: _pw, ...user } = u
  void _pw
  currentUser = user
  return { token: `mock-token-${user.employeeId}`, user }
}

/* ---------------- 제품 조회 ---------------- */
export function getProduct(serial: string) {
  const p = productFromSerial(serial)
  if (!p) throw new ApiError(404, '등록되지 않은 시리얼 번호입니다. 제품 라벨의 12자리(RC + 숫자 10자리)를 확인해 주세요.')
  return p
}

/* ---------------- 수리 목록 ---------------- */
const URGENCY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 }
export function listRepairs(q: RepairQuery): Page<Repair> & { counts: RepairSummaryCounts } {
  const u = me()
  // 기사는 본인 지점 건만, 본사·부품 담당자는 전체
  let items = db.repairs.filter((r) => (u.role === 'TECHNICIAN' ? r.branch === u.branch : true))
  const scope = items
  if (q.status && q.status !== 'ALL') items = items.filter((r) => r.status === q.status)
  if (q.model) items = items.filter((r) => r.product.model === q.model)
  if (q.keyword) {
    const k = q.keyword.trim().toLowerCase()
    const idMatch = /^#(\d+)$/.exec(k)
    // "#101" 처럼 수리 ID 로 검색하면 해당 건만 정확히 반환
    items = idMatch
      ? items.filter((r) => r.id === Number(idMatch[1]))
      : items.filter((r) =>
          [r.receiptNo, r.product.serialNumber, r.product.model, r.technician, r.symptom, ...r.errorCodes].some((v) => v.toLowerCase().includes(k)),
        )
  }
  const sort = q.sort ?? 'receivedAt_desc'
  items = [...items].sort((a, b) => {
    if (sort === 'urgency') return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.receivedAt.localeCompare(a.receivedAt)
    return sort === 'receivedAt_asc' ? a.receivedAt.localeCompare(b.receivedAt) : b.receivedAt.localeCompare(a.receivedAt)
  })
  const c = (s: Repair['status'][]) => scope.filter((r) => s.includes(r.status)).length
  return {
    items,
    total: items.length,
    counts: {
      needPhoto: c(['ADDITIONAL_INFO_NEEDED']),
      technicianReview: c(['DIAGNOSIS_COMPLETED', 'TECHNICIAN_REVIEW']),
      hqApproval: c(['HQ_APPROVAL']),
      completed: c(['APPROVED', 'CLOSED']),
      analyzing: c(['RECEIVED', 'QUEUED', 'ANALYZING']),
      manualReview: c(['MANUAL_REVIEW']),
    },
  }
}

export function getRepair(id: number) {
  const r = repairOr404(id)
  if (['RECEIVED', 'QUEUED', 'ANALYZING'].includes(r.status)) void runAnalysis(id)
  return r
}

/* ---------------- 접수 ---------------- */
export function createRepair(req: CreateRepairRequest): Repair {
  const u = requireRole('TECHNICIAN')
  const id = nextId()
  const now = new Date().toISOString()
  // 데모: 증상에 "흐림"/"사진" 포함 시 추가 사진 시나리오, "실패" 포함 시 실패 시나리오
  const scenario: Repair['mockScenario'] = /실패/.test(req.symptom) ? 'FAIL' : /흐림|덜컹|흔들/.test(req.symptom) ? 'NEED_PHOTO' : 'NORMAL'
  const r: Repair = {
    id,
    receiptNo: `SR-2026-${String(10000 + id * 7).padStart(5, '0')}`,
    product: { ...req.product },
    symptom: req.symptom,
    errorCodes: [...req.errorCodes],
    branch: u.branch,
    technician: u.name,
    technicianId: u.employeeId,
    receivedAt: now,
    updatedAt: now,
    status: 'DRAFT',
    urgency: req.urgency,
    images: [],
    photoRequestCount: 0,
    stages: stagesFor('DRAFT'),
    progress: 0,
    history: [],
    mockScenario: scenario,
  }
  log(r, { target: 'SYSTEM', action: 'CREATED', actor: u.name, actorRole: 'TECHNICIAN', comment: '수리 접수 작성' })
  db.repairs.unshift(r)
  persist()
  return r
}

export function uploadImage(id: number, req: UploadImageRequest): RepairImage {
  const r = repairOr404(id)
  const img = toImage(req)
  r.images.push(img)
  persist()
  return img
}

/** POST /api/repairs/{id}/submit — 사진 업로드 후 진단 요청 */
export function submitRepair(id: number): Repair {
  const u = requireRole('TECHNICIAN')
  const r = repairOr404(id)
  const kinds = new Set(r.images.map((i) => i.kind))
  if (!kinds.has('PRODUCT') || !kinds.has('MOTOR') || !kinds.has('PCB')) throw new ApiError(422, '제품 전체·모터·PCB 사진이 모두 필요합니다.')
  r.status = 'RECEIVED'
  log(r, { target: 'SYSTEM', action: 'SUBMITTED', actor: u.name, actorRole: 'TECHNICIAN', comment: `사진 ${r.images.length}장 등록 · AI 진단 요청` })
  persist()
  restartAnalysis(r)
  return r
}

/* ---------------- 추가 사진 ---------------- */
export function getPhotoRequests(id: number): PhotoRequest[] {
  return db.photoRequests[id] ?? []
}

export function uploadAdditionalImages(id: number, reqs: UploadImageRequest[]): Repair {
  const u = requireRole('TECHNICIAN')
  const r = repairOr404(id)
  if (r.status !== 'ADDITIONAL_INFO_NEEDED') throw new ApiError(409, '추가 사진을 요청받은 상태가 아닙니다.')
  const pending = (db.photoRequests[id] ?? []).find((p) => !p.resolved)
  reqs.forEach((q) => r.images.push({ ...toImage({ ...q, kind: 'ADDITIONAL' }), note: pending?.target }))
  if (pending) pending.resolved = true
  log(r, { target: 'PHOTO', action: 'PHOTO_ADDED', actor: u.name, actorRole: 'TECHNICIAN', comment: `추가 사진 ${reqs.length}장 등록 (${pending?.target ?? '추가'})` })
  // 데모: 추가 사진 등록 후 정상 진행
  r.mockScenario = 'NORMAL'
  restartAnalysis(r, 'MOTOR_ANALYSIS')
  return r
}

/* ---------------- 진단 ---------------- */
export function getDiagnosis(id: number): { current: Diagnosis | null; versions: Diagnosis[] } {
  repairOr404(id)
  const list = db.diagnoses[id] ?? []
  return { current: list[list.length - 1] ?? null, versions: list }
}

export function approval(id: number, req: ApprovalRequest): Repair {
  const u = me()
  const r = repairOr404(id)
  const now = new Date().toISOString()
  const decision = (state: Diagnosis['technicianDecision']['state']) => ({ state, decidedBy: u.name, decidedByRole: u.role, decidedAt: now, comment: req.comment })

  if (req.target === 'DIAGNOSIS') {
    requireRole('TECHNICIAN')
    const latest = latestDiagnosis(id)
    // 분석 실패 건은 진단 없이도 본사 수동 검토를 요청할 수 있음
    if (req.action === 'REQUEST_HQ_REVIEW' && (r.analysisError || r.status === 'ADDITIONAL_INFO_NEEDED')) {
      r.status = 'MANUAL_REVIEW'
      log(r, { target: 'DIAGNOSIS', action: 'HQ_REVIEW_REQUESTED', actor: u.name, actorRole: u.role, comment: req.comment || 'AI 분석 실패로 본사 수동 검토 요청' })
      db.notifications.unshift({ id: uid('n'), title: '본사 검토 요청', body: `수리 #${r.id} 분석 실패 건 수동 검토 요청`, at: now, read: false, link: `/approvals/${r.id}`, roles: ['QUALITY'] })
      persist()
      return r
    }
    if (!latest) throw new ApiError(404, '진단 결과가 없습니다.')
    const d = latest
    if (r.status !== 'DIAGNOSIS_COMPLETED' && req.action !== 'COMMENT') throw new ApiError(409, '이미 처리된 진단입니다. 화면을 새로고침해 주세요.')
    switch (req.action) {
      case 'APPROVE':
        d.technicianDecision = decision('APPROVED')
        r.status = 'TECHNICIAN_REVIEW'
        log(r, { target: 'DIAGNOSIS', action: 'CONFIRMED', actor: u.name, actorRole: u.role, comment: req.comment || `AI 진단 v${d.version} 확인 · 점검 진행` })
        break
      case 'REJECT':
        if (!req.comment) throw new ApiError(422, '반려 사유를 입력해 주세요.')
        d.technicianDecision = decision('REJECTED')
        r.status = 'TECHNICIAN_REVIEW' // AI 진단은 버리고 기사가 직접 점검·입력
        log(r, { target: 'DIAGNOSIS', action: 'REJECTED', actor: u.name, actorRole: u.role, comment: req.comment })
        break
      case 'REQUEST_HQ_REVIEW':
        d.technicianDecision = decision('CHANGE_REQUESTED')
        r.status = 'MANUAL_REVIEW'
        log(r, { target: 'DIAGNOSIS', action: 'HQ_REVIEW_REQUESTED', actor: u.name, actorRole: u.role, comment: req.comment })
        db.notifications.unshift({ id: uid('n'), title: '본사 검토 요청', body: `수리 #${r.id} 기사가 본사 검토를 요청했습니다.`, at: now, read: false, link: `/approvals/${r.id}`, roles: ['QUALITY'] })
        break
      case 'COMMENT':
        log(r, { target: 'DIAGNOSIS', action: 'COMMENTED', actor: u.name, actorRole: u.role, comment: req.comment })
        break
      default:
        throw new ApiError(400, '지원하지 않는 처리입니다.')
    }
  } else if (req.target === 'TECH_REVIEW') {
    requireRole('QUALITY')
    const tr = r.technicianReview
    if (!tr || r.status !== 'HQ_APPROVAL') throw new ApiError(409, '본사 승인 대기 상태가 아닙니다.')
    switch (req.action) {
      case 'APPROVE': {
        tr.hqDecision = decision('APPROVED')
        r.status = 'APPROVED'
        log(r, { target: 'TECH_REVIEW', action: 'APPROVED', actor: u.name, actorRole: u.role, comment: req.comment || '고장 DB·품질 대시보드 반영 승인' })
        // ★ 승인된 결과만 사내 고장 DB 에 반영
        const d = latestDiagnosis(id)
        const month = now.slice(0, 7)
        const rec: DefectRecord = {
          repairId: r.id,
          receiptNo: r.receiptNo,
          model: r.product.model,
          part: tr.replacedParts[0]?.partName ?? '기타',
          cause: tr.actualCause,
          branch: r.branch,
          factory: r.product.factory,
          month,
          aiMatched: tr.aiMatch === 'MATCH' || (tr.aiMatch === 'PARTIAL' && !!d),
          approvedAt: now,
        }
        approvedRecords.push(rec)
        break
      }
      case 'REJECT':
        if (!req.comment) throw new ApiError(422, '반려 사유를 입력해 주세요.')
        tr.hqDecision = decision('REJECTED')
        r.status = 'REJECTED'
        log(r, { target: 'TECH_REVIEW', action: 'REJECTED', actor: u.name, actorRole: u.role, comment: req.comment })
        break
      case 'REQUEST_CHANGE':
        if (!req.comment) throw new ApiError(422, '수정 요청 내용을 입력해 주세요.')
        tr.hqDecision = decision('CHANGE_REQUESTED')
        r.status = 'TECHNICIAN_REVIEW'
        log(r, { target: 'TECH_REVIEW', action: 'CHANGE_REQUESTED', actor: u.name, actorRole: u.role, comment: req.comment })
        db.notifications.unshift({ id: uid('n'), title: '본사 수정 요청', body: `수리 #${r.id}: ${req.comment}`, at: now, read: false, link: `/repairs/${r.id}/review`, roles: ['TECHNICIAN'] })
        break
      default:
        throw new ApiError(400, '지원하지 않는 처리입니다.')
    }
  } else if (req.target === 'MANUAL_REVIEW') {
    requireRole('QUALITY')
    if (r.status !== 'MANUAL_REVIEW') throw new ApiError(409, '수동 검토 상태가 아닙니다.')
    if (!req.comment) throw new ApiError(422, '검토 의견을 입력해 주세요.')
    r.status = 'TECHNICIAN_REVIEW'
    log(r, { target: 'DIAGNOSIS', action: 'CHANGE_REQUESTED', actor: u.name, actorRole: u.role, comment: `본사 수동 진단: ${req.comment}` })
    db.notifications.unshift({ id: uid('n'), title: '본사 수동 진단 회신', body: `수리 #${r.id}: ${req.comment}`, at: now, read: false, link: `/repairs/${r.id}/review`, roles: ['TECHNICIAN'] })
  }
  persist()
  return r
}

export function reanalysis(id: number, req: ReanalysisRequest): Repair {
  const u = me()
  const r = repairOr404(id)
  if (!req.reason?.trim()) throw new ApiError(422, '재분석 요청 사유를 입력해 주세요.')
  const d = latestDiagnosis(id)
  if (d && d.technicianDecision.state === 'PENDING') {
    d.technicianDecision = { state: 'REANALYSIS_REQUESTED', decidedBy: u.name, decidedByRole: u.role, decidedAt: new Date().toISOString(), comment: req.reason }
  }
  log(r, { target: 'DIAGNOSIS', action: 'REANALYSIS_REQUESTED', actor: u.name, actorRole: u.role, comment: req.reason })
  r.mockScenario = 'NORMAL'
  restartAnalysis(r)
  return r
}

/* ---------------- 기사 수리 결과 ---------------- */
export function technicianReview(id: number, req: TechnicianReviewRequest): Repair {
  const u = requireRole('TECHNICIAN')
  const r = repairOr404(id)
  if (r.status !== 'TECHNICIAN_REVIEW') throw new ApiError(409, '수리 결과를 입력할 수 있는 상태가 아닙니다.')
  if (!req.actualCause.trim()) throw new ApiError(422, '실제 고장 원인을 입력해 주세요.')
  r.technicianReview = {
    aiMatch: req.aiMatch,
    actualCause: req.actualCause,
    replacedParts: req.replacedParts,
    repairMethod: req.repairMethod,
    comment: req.comment,
    beforeImages: req.beforeImages.map(toImage),
    afterImages: req.afterImages.map(toImage),
    submittedBy: u.name,
    submittedAt: new Date().toISOString(),
    hqDecision: { state: 'PENDING' },
  }
  r.status = 'HQ_APPROVAL'
  log(r, { target: 'TECH_REVIEW', action: 'SUBMITTED', actor: u.name, actorRole: u.role, comment: '수리 결과 입력 및 본사 승인 요청' })
  db.notifications.unshift({ id: uid('n'), title: '본사 승인 요청', body: `수리 #${r.id} 수리 결과 승인이 필요합니다.`, at: new Date().toISOString(), read: false, link: `/approvals/${r.id}`, roles: ['QUALITY'] })
  persist()
  return r
}

/* ---------------- 부품·발주 ---------------- */
export function listParts(): Part[] {
  return db.parts
}
export function getPartInventory(partId: string): Part {
  const p = db.parts.find((x) => x.id === partId)
  if (!p) throw new ApiError(404, '부품 정보를 찾을 수 없습니다.')
  return p
}

/** AI 발주안이 없으면 진단의 필요 부품으로부터 생성 (AI_DRAFT — 아직 요청 아님) */
export function listRepairOrders(id: number): PurchaseOrder[] {
  const r = repairOr404(id)
  const d = latestDiagnosis(id)
  if (d && d.technicianDecision.state === 'APPROVED') {
    for (const rec of d.parts) {
      if (db.orders.some((o) => o.repairId === id && o.partId === rec.partId)) continue
      const part = db.parts.find((p) => p.id === rec.partId)
      const best = part?.stocks.slice().sort((a, b) => b.quantity - a.quantity)[0]
      db.orders.push({
        id: uid('PO'),
        repairId: id,
        receiptNo: r.receiptNo,
        partId: rec.partId,
        partNo: rec.partNo,
        partName: rec.partName,
        quantity: rec.quantity,
        fromWarehouse: best?.warehouse ?? '-',
        aiReason: `${rec.reason}. ${best && best.quantity > 0 ? `${best.warehouse} 재고 ${best.quantity}개로 출고 가능` : `재고 없음 · ${part?.factory} 생산 요청 필요 (예상 ${part?.leadTimeDays}일)`}`,
        aiConfidence: d.confidence,
        sourceIds: d.candidates[0]?.sourceIds ?? [],
        status: 'AI_DRAFT',
        decision: { state: 'PENDING' },
        createdAt: new Date().toISOString(),
      })
    }
    persist()
  }
  return db.orders.filter((o) => o.repairId === id)
}

export function listOrders(): PurchaseOrder[] {
  const u = me()
  const list = u.role === 'TECHNICIAN' ? db.orders.filter((o) => db.repairs.find((r) => r.id === o.repairId)?.branch === u.branch) : db.orders
  return [...list].sort((a, b) => (b.requestedAt ?? b.createdAt).localeCompare(a.requestedAt ?? a.createdAt))
}

export function createOrder(id: number, req: CreateOrderRequest): PurchaseOrder {
  const u = requireRole('TECHNICIAN')
  const r = repairOr404(id)
  if (req.quantity < 1) throw new ApiError(422, '발주 수량은 1개 이상이어야 합니다.')
  const part = getPartInventory(req.partId)
  let o = req.draftOrderId ? db.orders.find((x) => x.id === req.draftOrderId) : undefined
  if (!o) {
    o = { id: uid('PO'), repairId: id, receiptNo: r.receiptNo, partId: part.id, partNo: part.partNo, partName: part.name, quantity: req.quantity, fromWarehouse: req.fromWarehouse, aiReason: '기사 직접 요청 (AI 발주안 아님)', aiConfidence: 0, sourceIds: [], status: 'AI_DRAFT', decision: { state: 'PENDING' }, createdAt: new Date().toISOString() }
    db.orders.push(o)
  }
  if (o.status !== 'AI_DRAFT' && o.status !== 'REJECTED') throw new ApiError(409, '이미 요청된 발주입니다.')
  Object.assign(o, { quantity: req.quantity, fromWarehouse: req.fromWarehouse, status: 'REQUESTED', requestedBy: u.name, requestedAt: new Date().toISOString(), requestComment: req.comment, decision: { state: 'PENDING' } })
  log(r, { target: 'ORDER', action: 'ORDER_REQUESTED', actor: u.name, actorRole: u.role, comment: `${o.partName}(${o.partNo}) ${o.quantity}개 · ${o.fromWarehouse}` })
  db.notifications.unshift({ id: uid('n'), title: '발주 승인 요청', body: `${o.partName}(${o.partNo}) ${o.quantity}개 · 수리 #${r.id}`, at: new Date().toISOString(), read: false, link: '/parts', roles: ['PARTS'] })
  persist()
  return o
}

export function decideOrder(orderId: string, req: OrderDecisionRequest): PurchaseOrder {
  const u = requireRole('PARTS')
  const o = db.orders.find((x) => x.id === orderId)
  if (!o) throw new ApiError(404, '발주 요청을 찾을 수 없습니다.')
  if (o.status !== 'REQUESTED') throw new ApiError(409, '승인 대기 상태가 아닙니다.')
  if (req.action === 'REJECT' && !req.comment) throw new ApiError(422, '반려 사유를 입력해 주세요.')
  o.status = req.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
  o.decision = { state: req.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', decidedBy: u.name, decidedByRole: u.role, decidedAt: new Date().toISOString(), comment: req.comment }
  if (req.action === 'APPROVE') {
    const stock = db.parts.find((p) => p.id === o.partId)?.stocks.find((s) => s.warehouse === o.fromWarehouse)
    if (stock) stock.quantity = Math.max(0, stock.quantity - o.quantity)
  }
  const r = db.repairs.find((x) => x.id === o.repairId)
  if (r) log(r, { target: 'ORDER', action: req.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', actor: u.name, actorRole: u.role, comment: `${o.partName} 발주 ${req.action === 'APPROVE' ? '승인' : '반려'}${req.comment ? ` · ${req.comment}` : ''}` })
  persist()
  return o
}

/* ---------------- 승인 대기 ---------------- */
export function listApprovalQueue(): Repair[] {
  requireRole('QUALITY')
  return db.repairs
    .filter((r) => r.status === 'HQ_APPROVAL' || r.status === 'MANUAL_REVIEW')
    .map((r) => ({ ...r, aiTopCause: latestDiagnosis(r.id)?.topCause }))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
}

/* ---------------- 대시보드 ---------------- */
function allRecords() {
  return [...baseDefectRecords, ...approvedRecords]
}
function countBy(list: DefectRecord[], key: keyof DefectRecord) {
  const m = new Map<string, number>()
  list.forEach((r) => m.set(String(r[key]), (m.get(String(r[key])) ?? 0) + 1))
  return [...m.entries()].map(([k, count]) => ({ key: k, label: k, count })).sort((a, b) => b.count - a.count)
}

export function dashboard(months = 6): DefectDashboard {
  requireRole('QUALITY')
  const recs = allRecords()
  const monthKeys = [...new Set(recs.map((r) => r.month))].sort().slice(-months)
  const inRange = recs.filter((r) => monthKeys.includes(r.month))
  const received = inRange.length + Math.round(inRange.length * 0.14) + db.repairs.length // 승인 전·반려 건 포함 접수
  const matchRate = Math.round((inRange.filter((r) => r.aiMatched).length / Math.max(1, inRange.length)) * 1000) / 10
  const trend = monthKeys.map((m) => {
    const d = inRange.filter((r) => r.month === m).length
    return { month: m, received: d + Math.round(d * 0.14), defects: d }
  })
  const causes = countBy(inRange, 'cause').slice(0, 5)
  const half = monthKeys.slice(-2)
  const recurring = causes.map((c) => {
    const recent = inRange.filter((r) => r.cause === c.key && half.includes(r.month)).length
    const prev = inRange.filter((r) => r.cause === c.key && !half.includes(r.month)).length / Math.max(1, monthKeys.length - 2)
    const avgRecent = recent / Math.max(1, half.length)
    return {
      type: c.key,
      count: c.count,
      models: [...new Set(inRange.filter((r) => r.cause === c.key).map((r) => r.model))],
      trend: (avgRecent > prev * 1.15 ? 'UP' : avgRecent < prev * 0.85 ? 'DOWN' : 'FLAT') as 'UP' | 'DOWN' | 'FLAT',
    }
  })
  return {
    periodLabel: `${monthKeys[0]} ~ ${monthKeys[monthKeys.length - 1]}`,
    totalReceived: received,
    completed: inRange.length,
    aiSuccessRate: 96.4,
    aiMatchRate: matchRate,
    approvedCount: inRange.length,
    byPart: countBy(inRange, 'part'),
    byModel: countBy(inRange, 'model'),
    byBranch: countBy(inRange, 'branch'),
    byFactory: countBy(inRange, 'factory'),
    trend,
    recurring,
  }
}

export function dashboardRecords(filter: { dim: 'part' | 'model' | 'branch' | 'factory' | 'month' | 'cause'; value: string }): DefectRecord[] {
  requireRole('QUALITY')
  return allRecords()
    .filter((r) => r[filter.dim] === filter.value)
    .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))
}

/* ---------------- 알림 ---------------- */
export function listNotifications() {
  const u = me()
  return db.notifications.filter((n) => n.roles.includes(u.role)).slice(0, 20)
}
export function readNotification(id: string) {
  const n = db.notifications.find((x) => x.id === id)
  if (n) n.read = true
  persist()
}
export function readAllNotifications() {
  const u = me()
  db.notifications.filter((n) => n.roles.includes(u.role)).forEach((n) => (n.read = true))
  persist()
}
