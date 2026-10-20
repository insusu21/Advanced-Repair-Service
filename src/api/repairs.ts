import { http, mockDelay, USE_MOCK } from './http'
import * as mock from '@/mocks/handlers'
import type { Diagnosis, Page, PhotoRequest, ProductInfo, Repair, RepairImage, RepairQuery, RepairStatusCounts, RepairSummaryCounts } from '@/types'
import type {
  ApprovalRequest,
  CreateRepairRequest,
  ReanalysisRequest,
  TechnicianReviewRequest,
  UploadImageRequest,
} from '@/types/api'

export type RepairListResponse = Page<Repair> & { counts: RepairSummaryCounts; statusCounts: RepairStatusCounts }
export interface DiagnosisResponse {
  current: Diagnosis | null
  versions: Diagnosis[]
}

function toForm(req: UploadImageRequest) {
  const f = new FormData()
  f.append('kind', req.kind)
  f.append('file', req.file)
  if (req.photoRequestId) f.append('photoRequestId', req.photoRequestId)
  return f
}

export const repairApi = {
  /** GET /api/products/{serial} — 시리얼로 제품 정보 자동 조회 */
  async lookupProduct(serial: string): Promise<ProductInfo> {
    if (USE_MOCK) return mockDelay(() => mock.getProduct(serial), 600)
    return (await http.get<ProductInfo>(`/products/${encodeURIComponent(serial)}`)).data
  },

  /** GET /api/repairs */
  async list(q: RepairQuery = {}): Promise<RepairListResponse> {
    if (USE_MOCK) return mockDelay(() => mock.listRepairs(q))
    return (await http.get<RepairListResponse>('/repairs', { params: q })).data
  },

  /** GET /api/repairs/{id} */
  async get(id: number): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.getRepair(id), 250)
    return (await http.get<Repair>(`/repairs/${id}`)).data
  },

  /** POST /api/repairs (DRAFT 생성) */
  async create(req: CreateRepairRequest): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.createRepair(req))
    return (await http.post<Repair>('/repairs', req)).data
  },

  /** POST /api/repairs/{id}/images (multipart) */
  async uploadImage(id: number, req: UploadImageRequest): Promise<RepairImage> {
    if (USE_MOCK) return mockDelay(() => mock.uploadImage(id, req), 400)
    return (await http.post<RepairImage>(`/repairs/${id}/images`, toForm(req))).data
  },

  /** POST /api/repairs/{id}/submit — 접수 확정 + AI 진단 요청 */
  async submit(id: number): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.submitRepair(id))
    return (await http.post<Repair>(`/repairs/${id}/submit`)).data
  },

  /** GET /api/repairs/{id}/photo-requests */
  async photoRequests(id: number): Promise<PhotoRequest[]> {
    if (USE_MOCK) return mockDelay(() => mock.getPhotoRequests(id), 200)
    return (await http.get<PhotoRequest[]>(`/repairs/${id}/photo-requests`)).data
  },

  /** POST /api/repairs/{id}/additional-images */
  async uploadAdditional(id: number, reqs: UploadImageRequest[]): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.uploadAdditionalImages(id, reqs), 600)
    const f = new FormData()
    reqs.forEach((r) => f.append('files', r.file))
    if (reqs[0]?.photoRequestId) f.append('photoRequestId', reqs[0].photoRequestId)
    return (await http.post<Repair>(`/repairs/${id}/additional-images`, f)).data
  },

  /** GET /api/repairs/{id}/diagnosis */
  async diagnosis(id: number): Promise<DiagnosisResponse> {
    if (USE_MOCK) return mockDelay(() => mock.getDiagnosis(id))
    return (await http.get<DiagnosisResponse>(`/repairs/${id}/diagnosis`)).data
  },

  /** POST /api/repairs/{id}/approval */
  async approval(id: number, req: ApprovalRequest): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.approval(id, req), 500)
    return (await http.post<Repair>(`/repairs/${id}/approval`, req)).data
  },

  /** POST /api/repairs/{id}/reanalysis */
  async reanalysis(id: number, req: ReanalysisRequest): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.reanalysis(id, req), 500)
    return (await http.post<Repair>(`/repairs/${id}/reanalysis`, req)).data
  },

  /** POST /api/repairs/{id}/technician-review (multipart: json + 전·후 사진) */
  async technicianReview(id: number, req: TechnicianReviewRequest): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.technicianReview(id, req), 600)
    const f = new FormData()
    const { beforeImages, afterImages, ...body } = req
    f.append('review', new Blob([JSON.stringify(body)], { type: 'application/json' }))
    beforeImages.forEach((i) => f.append('beforeImages', i.file))
    afterImages.forEach((i) => f.append('afterImages', i.file))
    return (await http.post<Repair>(`/repairs/${id}/technician-review`, f)).data
  },

  /** GET /api/approvals — 본사 승인 대기 (HQ_APPROVAL + MANUAL_REVIEW) */
  async approvalQueue(): Promise<Repair[]> {
    if (USE_MOCK) return mockDelay(() => mock.listApprovalQueue())
    return (await http.get<Repair[]>('/approvals')).data
  },
}
