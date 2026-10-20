/* REST 요청/응답 DTO */
import type { PhotoKind, ProductInfo, ReportContent, Role, Urgency, User } from './index'

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
  /** 기사 소견 (선택, 최대 1000자) */
  technicianNote?: string
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

/** POST /api/repairs/{id}/additional-images — 추가 자료 (사진 또는 설명 중 하나 이상) */
export interface AdditionalInfoRequest {
  photos: UploadImageRequest[]
  note?: string
  photoRequestId?: string
}

/** POST /api/repairs/{id}/approval */
export type ApprovalTargetDto = 'DIAGNOSIS' | 'MANUAL_REVIEW'
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

/** PUT /api/repairs/{id}/report — 리포트 초안 저장
 *  version: 클라이언트가 마지막으로 받은 report.version (처음 저장이면 null). 다르면 409 REPORT_VERSION */
export interface SaveReportDraftRequest {
  version: number | null
  content: ReportContent
}

/** POST /api/repairs/{id}/report/confirm — 저장된 초안을 확정 (고장 DB·대시보드 반영) */
export interface ConfirmReportRequest {
  version: number
}

/** POST /api/repairs/{id}/orders */
export interface CreateOrderRequest {
  draftOrderId?: string
  partId: string
  quantity: number
  fromWarehouse: string
  comment?: string
}

/** POST /api/orders/{id}/decision (본사 품질 담당자) */
export interface OrderDecisionRequest {
  action: 'APPROVE' | 'REJECT'
  comment?: string
}

export interface SessionUser extends User {
  roleLabel?: string
}

export type { Role }
