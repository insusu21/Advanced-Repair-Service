/* REST 요청/응답 DTO */
import type { AiMatch, PhotoKind, ProductInfo, Role, Urgency, User } from './index'

export interface LoginRequest {
  employeeId: string
  password: string
}
export interface LoginResponse {
  token: string
  user: User
}

/** POST /api/repairs */
export interface CreateRepairRequest {
  product: ProductInfo
  symptom: string
  errorCodes: string[]
  urgency: Urgency
}

/** POST /api/repairs/{id}/images · additional-images (실서버는 multipart/form-data) */
export interface UploadImageRequest {
  kind: PhotoKind
  file: File
  /** Mock 모드에서만 사용: 압축된 dataURL */
  dataUrl?: string
  photoRequestId?: string
}

/** POST /api/repairs/{id}/approval */
export type ApprovalTargetDto = 'DIAGNOSIS' | 'TECH_REVIEW' | 'MANUAL_REVIEW'
export type ApprovalActionDto = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGE' | 'REQUEST_HQ_REVIEW' | 'COMMENT' | 'RETURN_TO_TECHNICIAN'
export interface ApprovalRequest {
  target: ApprovalTargetDto
  action: ApprovalActionDto
  comment?: string
  diagnosisVersion?: number
}

/** POST /api/repairs/{id}/reanalysis */
export interface ReanalysisRequest {
  reason: string
  scope?: ('PCB' | 'MOTOR' | 'SW')[]
}

/** POST /api/repairs/{id}/technician-review */
export interface TechnicianReviewRequest {
  aiMatch: AiMatch
  actualCause: string
  replacedParts: { partNo: string; partName: string; quantity: number }[]
  repairMethod: string
  comment: string
  beforeImages: UploadImageRequest[]
  afterImages: UploadImageRequest[]
}

/** POST /api/repairs/{id}/orders */
export interface CreateOrderRequest {
  draftOrderId?: string
  partId: string
  quantity: number
  fromWarehouse: string
  comment?: string
}

/** POST /api/orders/{id}/decision (부품 담당자) */
export interface OrderDecisionRequest {
  action: 'APPROVE' | 'REJECT'
  comment?: string
}

export interface SessionUser extends User {
  roleLabel?: string
}

export type { Role }
