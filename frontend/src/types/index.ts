/* =========================================================================
 * RobotCare AI 도메인 타입
 * 핵심 원칙: AI 산출물은 항상 `origin: 'AI'` + `decision` 을 가진 "초안"이며,
 * 사람의 결정(Decision)이 기록되기 전까지는 확정 데이터로 취급하지 않는다.
 * ========================================================================= */

/** 백엔드 Role enum 과 동일 */
export type Role = 'TECHNICIAN' | 'QUALITY_MANAGER'

export interface User {
  /** 로그인 식별자 — Mock: 사번, 실서버: 이메일 */
  employeeId: string
  name: string
  role: Role
  branch: string // 소속 (서비스센터 / 본사)
  /** 실서버 GET /api/auth/me 값 (bigint 십진수 문자열) */
  id?: string
  email?: string
  centerId?: string | null
}

export type RepairStatus =
  | 'DRAFT'
  | 'RECEIVED'
  | 'QUEUED'
  | 'ANALYZING'
  | 'ADDITIONAL_INFO_NEEDED'
  | 'DIAGNOSIS_COMPLETED'
  | 'TECHNICIAN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'MANUAL_REVIEW'
  | 'CLOSED'
  /** 실서버 전용: 접수 취소 */
  | 'CANCELLED'

/** 접수 사진은 PCB · MOTOR(모터·외관 변형 등) 2종 */
// [통합] MECHANICAL → MOTOR: 백엔드 DB(attachment.target)·에이전트가 MOTOR를 쓴다
export type PhotoKind = 'PCB' | 'MOTOR' | 'ADDITIONAL' | 'BEFORE' | 'AFTER'

export interface RepairImage {
  id: string
  kind: PhotoKind
  url: string
  name: string
  uploadedAt: string
  note?: string
}

export interface ProductInfo {
  /** 실서버 product.id (접수 시 productId 로 전송) */
  id?: string
  serialNumber: string
  model: string
  modelName: string
  manufacturedAt: string
  factory: string
  warrantyUntil: string
  firmware: string
}

export interface Repair {
  id: number
  receiptNo: string
  product: ProductInfo
  symptom: string
  /** 기사 소견 (접수 시 선택 입력, AI 분석에 함께 사용) */
  technicianNote?: string
  errorCodes: string[]
  branch: string
  technician: string
  technicianId: string
  receivedAt: string
  updatedAt: string
  status: RepairStatus
  urgency: Urgency
  images: RepairImage[]
  photoRequestCount: number
  /** 진단 진행 중의 단계 상태 (SSE 로 갱신) */
  stages: AnalysisStageState[]
  progress: number
  progressMessage?: string
  /** 분석 실패 사유 (있으면 진단 진행 화면에 실패 배너 표시) */
  analysisError?: string
  /** 진단/검토/발주/본사 결정의 전체 이력 */
  history: ApprovalRecord[]
  /** 기사 수리 리포트 (초안 → 확정). 확정본만 고장 DB·대시보드에 반영 */
  report?: RepairReport
  /** 목록 응답용 요약: 최신 AI 진단 원인 */
  aiTopCause?: string
  /** 데모 시나리오 제어용 (Mock 전용) */
  mockScenario?: 'NORMAL' | 'NEED_PHOTO' | 'FAIL'
}

export type Urgency = 'HIGH' | 'MEDIUM' | 'LOW'

/* ---------------- 진단 진행 (SSE) ---------------- */

export type AnalysisStage =
  | 'QUEUED'
  | 'ORCHESTRATION'
  | 'PCB_ANALYSIS'
  | 'MOTOR_ANALYSIS'
  | 'SW_ANALYSIS'
  | 'SIMILAR_CASE_SEARCH'
  | 'SYNTHESIS'

export type StageRunState = 'PENDING' | 'RUNNING' | 'DONE' | 'SKIPPED' | 'FAILED' | 'WAITING_INPUT'

export interface AnalysisStageState {
  stage: AnalysisStage
  state: StageRunState
  message?: string
  startedAt?: string
  finishedAt?: string
}

/** 백엔드 SSE `GET /api/repairs/{id}/events` 로 수신하는 이벤트 */
export interface RepairEvent {
  repairId: number
  status: RepairStatus
  stage?: AnalysisStage
  stageState?: StageRunState
  message: string
  progress: number
  at?: string
  photoRequest?: PhotoRequest
}

/* ---------------- 추가 사진 요청 ---------------- */

export interface PhotoRequest {
  id: string
  target: string // 촬영 부위
  reason: string // 필요 이유
  guide: string // 올바른 촬영 방법
  requestNo: number // 몇 번째 요청인지
  maxRequests: number // 최대 요청 횟수 (3)
  requestedBy: string // 요청한 Agent
  requestedAt: string
  resolved: boolean
}

/* ---------------- AI 진단 결과 ---------------- */

export type DecisionState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGE_REQUESTED' | 'REANALYSIS_REQUESTED'

/** 모든 승인 영역이 공유하는 "사람의 결정" */
export interface Decision {
  state: DecisionState
  decidedBy?: string
  decidedByRole?: Role
  decidedAt?: string
  comment?: string
}

export interface DataSource {
  id: string
  type: 'MANUAL' | 'REPAIR_DB' | 'SENSOR_LOG' | 'IMAGE' | 'ERROR_CODE_TABLE'
  title: string
  ref: string // 문서 번호, 페이지, 로그 키 등
}

export interface CauseCandidate {
  rank: number
  cause: string
  part?: string
  confidence: number // 0~100
  evidence: string[]
  sourceIds: string[]
}

export type AgentType = 'PCB' | 'MOTOR' | 'SW'
export type AgentVerdict = 'NORMAL' | 'ABNORMAL' | 'SUSPICIOUS' | 'SKIPPED'

export interface ImageAnnotation {
  imageId: string
  label: string
  /** 이미지 대비 % 좌표 (0~100) */
  x: number
  y: number
  w: number
  h: number
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface AgentResult {
  agent: AgentType
  verdict: AgentVerdict
  summary: string
  findings: string[]
  confidence: number
  annotations: ImageAnnotation[]
  sourceIds: string[]
  durationSec: number
}

export interface ErrorCodeAnalysis {
  code: string
  meaning: string
  relatedParts: string[]
  interpretation: string
}

export interface SimilarCase {
  receiptNo: string
  model: string
  cause: string
  resolution: string
  similarity: number
  closedAt: string
}

export interface PartRecommendation {
  partId: string
  partName: string
  partNo: string
  quantity: number
  reason: string
}

export interface Diagnosis {
  id: string
  repairId: number
  version: number // 재분석마다 증가
  origin: 'AI'
  generatedAt: string
  topCause: string
  confidence: number
  urgency: Urgency
  candidates: CauseCandidate[]
  agents: AgentResult[]
  errorCodes: ErrorCodeAnalysis[]
  similarCases: SimilarCase[]
  similarCaseCount: number
  inspectionSteps: string[]
  repairMethod: string[]
  parts: PartRecommendation[]
  sources: DataSource[]
  /** 기사의 결정 */
  technicianDecision: Decision
}

/* ---------------- 수리 리포트 (백엔드 ReportContent 와 동일 구조) ---------------- */

export type FaultArea = 'PCB' | 'MOTOR' | 'SW' | 'OTHER'
export type RepairOutcome = 'FIXED' | 'NOT_FIXED' | 'NO_FAULT_FOUND'
/** AI 진단 수용 여부. AI 진단이 없던 건은 NOT_AVAILABLE */
export type AiAcceptance = 'ACCEPTED' | 'PARTIAL' | 'REJECTED' | 'NOT_AVAILABLE'

export interface ReportFault {
  area: FaultArea
  partId?: string
}

export interface ReportContent {
  actualCause: string
  actualAction: string
  technicianOpinion: string
  /** 고장 없음(NO_FAULT_FOUND)이면 빈 배열 */
  faults: ReportFault[]
  repairSuccessful: boolean
  outcome: RepairOutcome
  aiAcceptance: AiAcceptance
}

export type ReportStatus = 'DRAFT' | 'CONFIRMED'

/** 확정 이력 한 줄 (revision 별 확정자·시각) */
export interface ReportConfirmation {
  revision: number
  confirmedBy: string
  confirmedAt: string
}

export interface RepairReport {
  repairId: number
  /** 낙관적 잠금 버전. 저장·확정마다 +1, 요청 version 과 다르면 409 REPORT_VERSION */
  version: number
  /** 내용 개정 번호. 확정 후 다시 수정하면 +1 된 새 초안이 된다 */
  revision: number
  status: ReportStatus
  content: ReportContent
  createdBy: string
  updatedBy: string
  updatedAt: string
  /** 현재 revision 이 확정된 경우에만 값이 있음 */
  confirmedBy?: string
  confirmedAt?: string
  /** 지금까지 확정된 revision 목록 (오래된 순) */
  confirmations: ReportConfirmation[]
}

/* ---------------- 부품 / 발주 ---------------- */

export interface WarehouseStock {
  warehouse: string
  location: string // 랙 위치 (실서버: 창고 주소)
  /** 출고 가능 수량 (실서버: available = on_hand - reserved) */
  quantity: number
  /** 실서버 warehouse_id (발주 source=WAREHOUSE 일 때 전송) */
  warehouseId?: string
  phone?: string | null
}

export interface Part {
  id: string
  name: string
  partNo: string
  compatibleModels: string[]
  stocks: WarehouseStock[]
  factory: string
  factoryContact: { manager: string; phone: string; email: string }
  leadTimeDays: number
  unitPrice: number
  /** 실서버: PCB | MOTOR | OTHER */
  category?: 'PCB' | 'MOTOR' | 'OTHER'
  /** 실서버 공급 공장 factory_id (발주 source=FACTORY 일 때 전송) */
  factoryId?: string
}

/** 실서버 발주 상태 PENDING→REQUESTED, APPROVED, ORDERED(출고), RECEIVED(수령), REJECTED, CANCELLED */
export type OrderStatus = 'AI_DRAFT' | 'REQUESTED' | 'APPROVED' | 'ORDERED' | 'RECEIVED' | 'REJECTED' | 'CANCELLED'

export interface PurchaseOrder {
  id: string
  repairId: number
  receiptNo: string
  partId: string
  partNo: string
  partName: string
  quantity: number
  fromWarehouse: string
  aiReason: string
  aiConfidence: number
  sourceIds: string[]
  status: OrderStatus
  requestedBy?: string
  requestedAt?: string
  requestComment?: string
  decision: Decision // 본사 품질 담당자 결정
  createdAt: string
}

/* ---------------- 승인 이력 ---------------- */

export type ApprovalTarget = 'DIAGNOSIS' | 'REPORT' | 'ORDER' | 'PHOTO' | 'SYSTEM'
export type ApprovalAction =
  | 'CREATED'
  | 'AI_GENERATED'
  | 'CONFIRMED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGE_REQUESTED'
  | 'REANALYSIS_REQUESTED'
  | 'HQ_REVIEW_REQUESTED'
  | 'SUBMITTED'
  | 'DRAFT_SAVED'
  | 'PHOTO_ADDED'
  | 'ORDER_REQUESTED'
  | 'COMMENTED'

export interface ApprovalRecord {
  id: string
  target: ApprovalTarget
  action: ApprovalAction
  actor: string // 'AI Orchestrator' 또는 사람 이름
  actorRole: Role | 'AI'
  at: string
  comment?: string
}

/* ---------------- 대시보드 ---------------- */

export interface DashboardFilter {
  from: string
  to: string
}

export interface CountItem {
  key: string
  label: string
  count: number
}

export interface DefectDashboard {
  periodLabel: string
  totalReceived: number
  completed: number
  aiSuccessRate: number // AI 진단 성공(결과 생성) 비율
  aiMatchRate: number // AI 진단 vs 실제 원인 일치율 (승인 데이터 기준)
  approvedCount: number
  byPart: CountItem[]
  byModel: CountItem[]
  byBranch: CountItem[]
  byFactory: CountItem[]
  trend: { month: string; received: number; defects: number }[]
  recurring: { type: string; count: number; models: string[]; trend: 'UP' | 'FLAT' | 'DOWN' }[]
  /** 실서버: 고장 부위(PCB·MOTOR·SW·OTHER)별 건수 (groupBy=AREA) */
  byArea?: CountItem[]
}

/* ---------------- 공통 ---------------- */

export interface Page<T> {
  items: T[]
  total: number
}

/** 상태 필터 그룹 (표시 순서·일괄 필터용) */
export type StatusGroupKey = 'AI_ANALYSIS' | 'TECHNICIAN' | 'HQ' | 'DONE'

export interface RepairQuery {
  status?: RepairStatus | 'ALL'
  /** 그룹 단위 필터. status 와 함께 쓰지 않는다 */
  group?: StatusGroupKey
  keyword?: string
  sort?: 'receivedAt_desc' | 'receivedAt_asc' | 'urgency'
  part?: string
  model?: string
  branch?: string
  factory?: string
}

export interface RepairSummaryCounts {
  needPhoto: number
  /** 진단 초안 확인 대기 (DIAGNOSIS_COMPLETED) */
  technicianReview: number
  /** 진단 확인 후 리포트 확정 전 (TECHNICIAN_REVIEW) */
  reportPending: number
  completed: number
  analyzing: number
  manualReview: number
}

/** 상태별 건수 (상태 필터 적용 전 · 검색어/모델 필터 적용 후) */
export type RepairStatusCounts = Partial<Record<RepairStatus, number>>

export interface Notification {
  id: string
  title: string
  body: string
  at: string
  read: boolean
  link?: string
  roles: Role[]
}
