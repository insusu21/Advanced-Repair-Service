/* =========================================================================
 * RobotCare AI 도메인 타입
 * 핵심 원칙: AI 산출물은 항상 `origin: 'AI'` + `decision` 을 가진 "초안"이며,
 * 사람의 결정(Decision)이 기록되기 전까지는 확정 데이터로 취급하지 않는다.
 * ========================================================================= */

export type Role = 'TECHNICIAN' | 'QUALITY' | 'PARTS'

export interface User {
  employeeId: string
  name: string
  role: Role
  branch: string // 소속 (서비스센터 지점 / 본사 / 부품팀)
}

export type RepairStatus =
  | 'DRAFT'
  | 'RECEIVED'
  | 'QUEUED'
  | 'ANALYZING'
  | 'ADDITIONAL_INFO_NEEDED'
  | 'DIAGNOSIS_COMPLETED'
  | 'TECHNICIAN_REVIEW'
  | 'HQ_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'MANUAL_REVIEW'
  | 'CLOSED'

export type PhotoKind = 'PRODUCT' | 'MOTOR' | 'PCB' | 'ADDITIONAL' | 'BEFORE' | 'AFTER'

export interface RepairImage {
  id: string
  kind: PhotoKind
  url: string
  name: string
  uploadedAt: string
  note?: string
}

export interface ProductInfo {
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
  /** 기사가 입력한 실제 수리 결과 (사람 입력 = 확정 후보) */
  technicianReview?: TechnicianReview
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

/* ---------------- 기사 확인 / 수리 결과 ---------------- */

export type AiMatch = 'MATCH' | 'PARTIAL' | 'MISMATCH'

export interface TechnicianReview {
  aiMatch: AiMatch
  actualCause: string
  replacedParts: { partNo: string; partName: string; quantity: number }[]
  repairMethod: string
  comment: string
  beforeImages: RepairImage[]
  afterImages: RepairImage[]
  submittedBy: string
  submittedAt: string
  hqDecision: Decision
}

/* ---------------- 부품 / 발주 ---------------- */

export interface WarehouseStock {
  warehouse: string
  location: string // 랙 위치
  quantity: number
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
}

export type OrderStatus = 'AI_DRAFT' | 'REQUESTED' | 'APPROVED' | 'REJECTED'

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
  decision: Decision // 부품 담당자 결정
  createdAt: string
}

/* ---------------- 승인 이력 ---------------- */

export type ApprovalTarget = 'DIAGNOSIS' | 'TECH_REVIEW' | 'ORDER' | 'PHOTO' | 'SYSTEM'
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
}

/* ---------------- 공통 ---------------- */

export interface Page<T> {
  items: T[]
  total: number
}

export interface RepairQuery {
  status?: RepairStatus | 'ALL'
  keyword?: string
  sort?: 'receivedAt_desc' | 'receivedAt_asc' | 'urgency'
  part?: string
  model?: string
  branch?: string
  factory?: string
}

export interface RepairSummaryCounts {
  needPhoto: number
  technicianReview: number
  hqApproval: number
  completed: number
  analyzing: number
  manualReview: number
}

export interface Notification {
  id: string
  title: string
  body: string
  at: string
  read: boolean
  link?: string
  roles: Role[]
}
