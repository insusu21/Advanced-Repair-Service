import { http, mockDelay, USE_MOCK } from './http'
import * as mock from '@/mocks/handlers'
import type { Diagnosis, Page, PhotoRequest, ProductInfo, Repair, RepairImage, RepairQuery, RepairStatusCounts, RepairSummaryCounts } from '@/types'
import type {
  AdditionalInfoRequest,
  ApprovalRequest,
  ConfirmReportRequest,
  CreateRepairRequest,
  ReanalysisRequest,
  SaveReportDraftRequest,
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

  /** POST /api/repairs/{id}/additional-images — 추가 사진(0장 이상) + 추가 설명 (multipart: files, note, photoRequestId) */
  async uploadAdditional(id: number, req: AdditionalInfoRequest): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.uploadAdditionalImages(id, req), 600)
    const f = new FormData()
    req.photos.forEach((r) => f.append('files', r.file))
    if (req.note?.trim()) f.append('note', req.note.trim())
    if (req.photoRequestId) f.append('photoRequestId', req.photoRequestId)
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

  /** PUT /api/repairs/{id}/report — 리포트 초안 저장 (version 불일치 시 409 REPORT_VERSION) */
  async saveReportDraft(id: number, req: SaveReportDraftRequest): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.saveReportDraft(id, req), 400)
    return (await http.put<Repair>(`/repairs/${id}/report`, req)).data
  },

  /** POST /api/repairs/{id}/report/confirm — 리포트 확정 → 고장 DB·대시보드 반영, 상태 CLOSED */
  async confirmReport(id: number, req: ConfirmReportRequest): Promise<Repair> {
    if (USE_MOCK) return mockDelay(() => mock.confirmReport(id, req), 500)
    return (await http.post<Repair>(`/repairs/${id}/report/confirm`, req)).data
  },
}
