/* =========================================================================
 * 어댑터 변환 확인용 샘플 — 백엔드 docs/API.md 예시 값 + openapi.json 스키마로 만든 응답
 * (API.md 의 예시는 요청 본문 위주라, 응답 필드는 OpenAPI 스키마 필수 필드를 채워 구성했다)
 *
 * 사용: 개발 서버 콘솔에서
 *   const s = await import('/src/api/adapters/__samples__.ts'); s.runAllSamples()
 * 각 sample* 함수는 변환 결과를 돌려주고, runAllSamples 는 기대값과 다르면 콘솔에 오류를 남긴다.
 * 앱 코드에서는 import 하지 않는다 (번들에 포함되지 않음).
 * ========================================================================= */
import { toRepairStatus, toBeRepairStatus } from './status'
import { toProductInfo, toRepair, toRepairDetail, toPhotoRequest } from './repair'
import { toDiagnosis, splitSteps } from './diagnosis'
import { toRepairReport, toBeContent } from './report'
import { toPart, toPurchaseOrders, toOrderItem, toProcurementDrafts } from './parts'
import { toDefectDashboard, dashboardRange } from './dashboard'
import type { BeOrder, BePart, BeProcurement, BeProduct, BeRepair, BeRepairDetail, BeReport, BeStock, BeFactory, BeTask, BeToolExecution } from './types'

const T = '2026-10-20T09:00:00Z'

/* ---------- 원본 샘플 ---------- */
export const SAMPLE_PRODUCT: BeProduct = {
  id: '1',
  serial_number: 'ROBOT-SEOUL-001', // API.md: GET /api/products?serialNumber=ROBOT-SEOUL-001
  model_id: '1',
  model_code: 'RC-A100',
  model_name: '로봇청소기 A100',
  manufactured_on: '2025-03-14',
  information: { firmware: '1.2.3' },
  components: [{ id: '1', part_id: '1', slot_code: 'MAIN_MOTOR', factory_id: '1', factory_name: '구미 제2공장', region: '경북' }],
  compatibleParts: [],
}

export const SAMPLE_REPAIR: BeRepair = {
  id: '101',
  case_number: 'RC-20261020-0001',
  center_id: '1',
  product_id: '1',
  technician_id: '7',
  symptom: '바퀴가 움직이지 않음', // API.md: POST /api/repairs data.symptoms
  error_codes: ['E01', 'E02'],
  firmware_version: '1.2.3',
  user_input: { technicianNote: '기사 원문', photoKinds: ['PCB', 'MOTOR'], urgency: 'HIGH' },
  product_snapshot: { serial_number: 'ROBOT-SEOUL-001', model_code: 'RC-A100', model_name: '로봇청소기 A100' },
  status: 'DIAGNOSING',
  procurement_status: 'NOT_STARTED',
  created_at: T,
  closed_at: null,
  version: 1,
}

export const SAMPLE_TASK: BeTask = {
  id: '1',
  case_id: '101',
  status: 'WAITING_INPUT',
  input_revision: 1,
  photo_request_count: 1,
  stage: 'MOTOR_ANALYSIS',
  error_code: null,
  error_message: null,
  result: {
    summary: '모터 하우징 변형 의심',
    modelVersion: 'gpt-x',
    repairMethod: '1. 하단 연결부 확인\n2. 모터 어셈블리 교체',
    candidates: [
      { rank: 2, cause: '휠 센서 접촉 불량', confidence: 0.21, explanation: '펄스 누락 일부' },
      { rank: 1, cause: '모터 하우징 변형', confidence: 0.87, explanation: '하단 연결부 변형 탐지' },
    ],
    recommendedParts: [{ partId: '1', quantity: 1 }],
    evidence: [
      { type: 'IMAGE', attachmentId: '2', annotation: { label: '하단 연결부 변형', x: 47, y: 70, w: 15, h: 13, severity: 'HIGH' } },
      { type: 'MANUAL', citation: 'RC-A100 서비스 매뉴얼 7장' },
    ],
  },
  created_at: T,
  updated_at: T,
  finished_at: null,
}

export const SAMPLE_DETAIL: BeRepairDetail = {
  ...SAMPLE_REPAIR,
  status: 'WAITING_INPUT',
  attachments: [
    { id: '1', request_id: null, kind: 'IMAGE', target: 'GENERAL', original_name: 'pcb.jpg', mime_type: 'image/jpeg', byte_size: 1000, created_at: T },
    { id: '2', request_id: null, kind: 'IMAGE', target: 'GENERAL', original_name: 'motor.jpg', mime_type: 'image/jpeg', byte_size: 1000, created_at: T },
    { id: '3', request_id: '1', kind: 'IMAGE', target: 'GENERAL', original_name: 'wheel.jpg', mime_type: 'image/jpeg', byte_size: 1000, created_at: T },
  ],
  tasks: [SAMPLE_TASK],
  // API.md SSE 예시: PHOTO_REQUESTED {requestId:"1", round:1, bodyPart:"wheel", description:"하부 사진 요청"}
  photoRequests: [{ id: '1', job_id: '1', round_no: 1, instruction: '하부 사진 요청', target: 'wheel', status: 'OPEN', created_at: T, submitted_at: null }],
  reports: [],
  orders: [],
}

export const SAMPLE_TOOLS: BeToolExecution[] = [
  { id: '1', job_id: '1', agent_type: 'MOTOR_AGENT', tool_name: 'image_inspect', model_version: null, status: 'SUCCEEDED', output_payload: { verdict: 'ABNORMAL', summary: '하우징 변형', confidence: 0.87 }, error_message: null, started_at: T, finished_at: '2026-10-20T09:00:12Z' },
  { id: '2', job_id: '1', agent_type: 'pcb_agent', tool_name: 'image_inspect', model_version: null, status: 'SUCCEEDED', output_payload: { verdict: 'NORMAL' }, error_message: null, started_at: T, finished_at: T },
]

// API.md: 초안 version=0→1/revision=1, 확정 → version=2, 수정 초안 version=3/revision=2 에서도 confirmed_revision=1 유지
export const SAMPLE_REPORT: BeReport = {
  id: '5',
  case_id: '101',
  author_id: '7',
  outcome: 'FIXED',
  confirmed_at: T,
  version: 3,
  latest_revision: 2,
  confirmed_revision: 1,
  created_at: T,
  revisions: [
    {
      report_id: '5',
      revision: 1,
      author_id: '7',
      created_at: T,
      confirmed_at: T,
      content: { actualCause: '모터 고장', faults: [{ area: 'MOTOR', componentId: '1', partId: '1' }], actualAction: '모터 교체', technicianOpinion: '재현 완료', repairSuccessful: true, aiAcceptance: 'PARTIAL', outcome: 'FIXED' },
    },
    {
      report_id: '5',
      revision: 2,
      author_id: '7',
      created_at: '2026-10-21T09:00:00Z',
      confirmed_at: null,
      content: { actualCause: '모터 하우징 변형', faults: [{ area: 'MOTOR', partId: '1' }], actualAction: '모터 어셈블리 교체', technicianOpinion: '원인 정정', repairSuccessful: true, aiAcceptance: 'ACCEPTED' },
    },
  ],
  comments: [],
}

export const SAMPLE_PART: BePart = { id: '1', part_number: 'RM-MT-103', name: '모터 어셈블리', category: 'MOTOR' }
export const SAMPLE_STOCKS: BeStock[] = [
  { warehouse_id: '1', part_id: '1', on_hand: 9, reserved: 2, available: 7, warehouse_name: '수원 창고', region: '경기', address: '수원시 B동', phone: '031-000-0000' },
]
export const SAMPLE_FACTORIES: BeFactory[] = [{ id: '3', name: '구미 제2공장', country: 'KR', region: '경북', address: '구미시', phone: '054-470-2103', lead_days: 5 }]

// API.md: POST /api/repairs/{id}/orders {"items":[{"partId":"1","quantity":2,"source":"WAREHOUSE","warehouseId":"1"}]}
export const SAMPLE_ORDER: BeOrder = {
  id: '9',
  case_id: '101',
  requested_by: '7',
  status: 'PENDING',
  decided_by: null,
  decided_at: null,
  decision_note: null,
  created_at: T,
  version: 1,
  items: [{ id: '11', order_id: '9', part_id: '1', quantity: 2, source: 'WAREHOUSE', warehouse_id: '1', factory_id: null }],
}

export const SAMPLE_PROCUREMENT: BeProcurement = {
  status: 'SUCCEEDED',
  snapshots: [{ id: '1', case_id: '101', created_at: T, body: { items: [{ partId: '1', quantity: 1, reason: '하우징 변형은 어셈블리 교체' }] } }],
  orders: [],
}

/* ---------- 변환 함수 (하나씩) ---------- */
const parts = () => [toPart(SAMPLE_PART, SAMPLE_STOCKS, SAMPLE_FACTORIES)]

export const sampleStatus = () => ({
  diagnosingQueued: toRepairStatus('DIAGNOSING', 'QUEUED'),
  diagnosingRunning: toRepairStatus('DIAGNOSING', 'RUNNING'),
  repairing: toRepairStatus('REPAIRING'),
  back: toBeRepairStatus('ADDITIONAL_INFO_NEEDED'),
  noBackend: toBeRepairStatus('APPROVED'),
})
export const sampleProduct = () => toProductInfo(SAMPLE_PRODUCT)
export const sampleRepair = () => toRepair(SAMPLE_REPAIR)
export const sampleRepairDetail = () => toRepairDetail(SAMPLE_DETAIL)
export const samplePhotoRequest = () => toPhotoRequest(SAMPLE_DETAIL.photoRequests[0])
export const sampleDiagnosis = () => toDiagnosis(SAMPLE_TASK, { parts: parts(), tools: SAMPLE_TOOLS, urgency: 'HIGH', decision: { state: 'PENDING' } })
export const sampleReport = () => toRepairReport(SAMPLE_REPORT)
export const sampleReportContent = () => toBeContent(toRepairReport(SAMPLE_REPORT).content)
export const samplePart = () => parts()[0]
export const sampleOrders = () => toPurchaseOrders(SAMPLE_ORDER, parts())
export const sampleOrderItem = () => ({
  warehouse: toOrderItem({ partId: '1', quantity: 2, fromWarehouse: '수원 창고' }, parts()[0]),
  factory: toOrderItem({ partId: '1', quantity: 20, fromWarehouse: '수원 창고' }, parts()[0]),
})
export const sampleProcurementDrafts = () => toProcurementDrafts(SAMPLE_PROCUREMENT, 101, parts())
export const sampleDashboard = () =>
  toDefectDashboard(
    {
      PERIOD: [{ dimension: '2026-09', count: 3 }, { dimension: '2026-10', count: 5 }],
      PART: [{ dimension: '모터 어셈블리', count: 6 }, { dimension: '메인 PCB', count: 2 }],
      CENTER: [{ dimension: '1', count: 8 }],
      FACTORY: [{ dimension: '구미 제2공장', count: 6 }, { dimension: 'UNKNOWN', count: 2 }],
      AREA: [{ dimension: 'MOTOR', count: 6 }, { dimension: 'SW', count: 2 }],
    },
    { ...dashboardRange(6, new Date('2026-10-20')), totalReceived: 30 },
  )

/* ---------- 기대값 확인 ---------- */
export function runAllSamples(): boolean {
  const checks: [string, boolean][] = []
  const ok = (name: string, cond: boolean) => checks.push([name, cond])

  const st = sampleStatus()
  ok('DIAGNOSING+QUEUED → QUEUED', st.diagnosingQueued === 'QUEUED')
  ok('DIAGNOSING → ANALYZING', st.diagnosingRunning === 'ANALYZING')
  ok('REPAIRING → TECHNICIAN_REVIEW', st.repairing === 'TECHNICIAN_REVIEW')
  ok('역변환 ADDITIONAL_INFO_NEEDED → WAITING_INPUT', st.back === 'WAITING_INPUT')
  ok('APPROVED 는 백엔드 없음', st.noBackend === null)

  ok('제품 id·모델', sampleProduct().id === '1' && sampleProduct().model === 'RC-A100' && sampleProduct().firmware === '1.2.3')
  const r = sampleRepair()
  ok('접수 id 숫자 변환', r.id === 101 && r.urgency === 'HIGH' && r.technicianNote === '기사 원문')
  const d = sampleRepairDetail()
  ok('상세 상태 WAITING_INPUT → ADDITIONAL_INFO_NEEDED', d.status === 'ADDITIONAL_INFO_NEEDED')
  ok('사진 종류 photoKinds 순서 + 추가 사진', d.images.map((i) => i.kind).join() === 'PCB,MOTOR,ADDITIONAL')
  ok('진행 단계 MOTOR_ANALYSIS 대기', d.stages.find((s) => s.stage === 'MOTOR_ANALYSIS')?.state === 'WAITING_INPUT')
  ok('추가 사진 요청 round_no → requestNo', samplePhotoRequest().requestNo === 1 && samplePhotoRequest().target === 'wheel')

  const dg = sampleDiagnosis()!
  ok('진단 1순위 정렬·신뢰도 %', dg.topCause === '모터 하우징 변형' && dg.confidence === 87)
  ok('수리 방법 문자열 → 단계', dg.repairMethod.length === 2 && splitSteps('a\nb').length === 2)
  ok('권장 부품 이름 연결', dg.parts[0]?.partName === '모터 어셈블리')
  ok('Agent 매핑 (MOTOR·PCB)', dg.agents.map((a) => a.agent).sort().join() === 'MOTOR,PCB' && dg.agents.find((a) => a.agent === 'MOTOR')?.verdict === 'ABNORMAL')
  ok('없는 필드는 빈 배열', !dg.errorCodes.length && !dg.similarCases.length && !dg.inspectionSteps.length)

  const rep = sampleReport()
  ok('리포트 수정 초안 r2 (확정본 r1 유지)', rep.revision === 2 && rep.status === 'DRAFT' && rep.version === 3)
  ok('확정 이력 r1', rep.confirmations.length === 1 && rep.confirmations[0].revision === 1)
  ok('outcome 생략 → repairSuccessful 로 FIXED', rep.content.outcome === 'FIXED')
  ok('리포트 저장 본문 partId', sampleReportContent().faults[0].partId === '1')

  const p = samplePart()
  ok('부품 재고 available·창고 id', p.stocks[0].quantity === 7 && p.stocks[0].warehouseId === '1' && p.factoryId === '3' && p.leadTimeDays === 5)
  const o = sampleOrders()
  ok('발주 PENDING → REQUESTED, 카드 id', o[0].status === 'REQUESTED' && o[0].id === '9#11' && o[0].fromWarehouse === '수원 창고')
  const it = sampleOrderItem()
  ok('재고 충분 → WAREHOUSE', it.warehouse.source === 'WAREHOUSE' && 'warehouseId' in it.warehouse)
  ok('재고 부족 → FACTORY + factoryId', it.factory.source === 'FACTORY' && 'factoryId' in it.factory)
  ok('조달 스냅샷 → AI_DRAFT', sampleProcurementDrafts()[0]?.status === 'AI_DRAFT')

  const db = sampleDashboard()
  ok('대시보드 확정 건수 합계', db.approvedCount === 8 && db.trend.length === 2)
  ok('없는 지표는 NaN·빈 배열', Number.isNaN(db.aiMatchRate) && !db.byModel.length)
  ok('부위 라벨', db.byArea?.[0]?.label === '모터')

  const failed = checks.filter(([, c]) => !c)
  console.table(checks.map(([name, pass]) => ({ name, pass })))
  if (failed.length) console.error('[adapter samples] 실패', failed.map(([n]) => n))
  return !failed.length
}
