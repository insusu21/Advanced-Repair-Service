/* 제품 · 접수(목록·상세) · 첨부 · 추가 사진 요청 변환 */
import { API_BASE } from '@/api/http'
import { STAGE_ORDER } from '@/constants/status'
import type { AnalysisStage, AnalysisStageState, PhotoKind, PhotoRequest, ProductInfo, Repair, RepairImage, RepairReport, Urgency } from '@/types'
import { toRepairStatus } from './status'
import type { BeAttachment, BePhotoRequest, BeProduct, BeRepair, BeRepairDetail, BeTask } from './types'

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** 제품 조회 → ProductInfo. 보증 기간·펌웨어는 product.information 에 있을 때만 채운다 */
export function toProductInfo(p: BeProduct): ProductInfo {
  const info = p.information ?? {}
  const factory = p.components?.find((c) => c.factory_name)?.factory_name
  return {
    id: p.id,
    serialNumber: p.serial_number,
    model: p.model_code,
    modelName: p.model_name,
    manufacturedAt: p.manufactured_on ?? '',
    factory: factory ?? '-',
    warrantyUntil: str(info.warrantyUntil) ?? str(info.warranty_until) ?? '',
    firmware: str(info.firmware) ?? str(info.firmwareVersion) ?? str(info.firmware_version) ?? '',
  }
}

/** 접수 당시 제품 스냅샷 → ProductInfo (키 이름이 정해져 있지 않아 snake·camel 둘 다 확인) */
function snapshotProduct(r: BeRepair): ProductInfo {
  const s = r.product_snapshot ?? {}
  return {
    id: r.product_id,
    serialNumber: str(s.serial_number) ?? str(s.serialNumber) ?? '-',
    model: str(s.model_code) ?? str(s.modelCode) ?? str(s.model) ?? '-',
    modelName: str(s.model_name) ?? str(s.modelName) ?? '-',
    manufacturedAt: str(s.manufactured_on) ?? str(s.manufacturedAt) ?? '',
    factory: str(s.factory_name) ?? str(s.factory) ?? '-',
    warrantyUntil: str(s.warranty_until) ?? str(s.warrantyUntil) ?? '',
    firmware: r.firmware_version ?? str(s.firmware) ?? '',
  }
}

const URGENCIES: Urgency[] = ['HIGH', 'MEDIUM', 'LOW']
function userInput(r: BeRepair) {
  const u = r.user_input ?? {}
  const urgency = URGENCIES.includes(u.urgency as Urgency) ? (u.urgency as Urgency) : 'MEDIUM'
  const photoKinds = Array.isArray(u.photoKinds) ? (u.photoKinds as string[]) : []
  return { urgency, technicianNote: str(u.technicianNote) ?? str(u.customerDescription), photoKinds }
}

/** 가장 최근 진단 작업 */
export function latestTask(tasks: BeTask[] | undefined): BeTask | undefined {
  return [...(tasks ?? [])].sort((a, b) => Number(b.id) - Number(a.id))[0]
}

/** 진단 작업 → 진행 단계 표시. 백엔드 stage 가 프론트 단계 이름과 같으면 그 위치를 쓰고, 아니면 상태로 추정 */
function toStages(task: BeTask | undefined): { stages: AnalysisStageState[]; progress: number } {
  if (!task) return { stages: STAGE_ORDER.map((stage) => ({ stage, state: 'PENDING' })), progress: 0 }
  const stage = (task.stage ?? '').toUpperCase() as AnalysisStage
  const known = STAGE_ORDER.indexOf(stage)
  const cur = known >= 0 ? known : task.status === 'QUEUED' ? 0 : 1
  if (task.status === 'SUCCEEDED') return { stages: STAGE_ORDER.map((s) => ({ stage: s, state: 'DONE' })), progress: 100 }
  const curState = task.status === 'FAILED' ? 'FAILED' : task.status === 'WAITING_INPUT' ? 'WAITING_INPUT' : 'RUNNING'
  return {
    stages: STAGE_ORDER.map((s, i) => ({
      stage: s,
      state: i < cur ? 'DONE' : i === cur ? curState : 'PENDING',
      message: i === cur ? (task.error_message ?? undefined) : undefined,
    })),
    progress: Math.round((cur / STAGE_ORDER.length) * 100),
  }
}

/** 첨부 URL — 같은 origin 세션 쿠키로 GET /api/attachments/{id} */
export const attachmentUrl = (id: string) => `${API_BASE}/attachments/${id}`

/** 첨부 → 화면 사진. 최초 접수 사진은 userInput.photoKinds 순서로 PCB/MECHANICAL, 추가 요청 사진은 ADDITIONAL */
export function toImages(atts: BeAttachment[], photoKinds: string[], requests: BePhotoRequest[] = []): RepairImage[] {
  const images = atts.filter((a) => a.kind === 'IMAGE').sort((a, b) => Number(a.id) - Number(b.id))
  let initial = 0
  return images.map((a) => {
    const req = a.request_id ? requests.find((p) => p.id === a.request_id) : undefined
    const kind: PhotoKind = a.request_id ? 'ADDITIONAL' : ((photoKinds[initial++] as PhotoKind) ?? 'MECHANICAL')
    return { id: a.id, kind, url: attachmentUrl(a.id), name: a.original_name, uploadedAt: a.created_at, note: req?.target }
  })
}

/** 추가 사진 요청. 백엔드 instruction 하나를 이유·촬영 방법에 같이 쓴다 (최대 3회) */
export function toPhotoRequest(p: BePhotoRequest): PhotoRequest {
  return {
    id: p.id,
    target: p.target,
    reason: p.instruction,
    guide: p.instruction,
    requestNo: p.round_no,
    maxRequests: 3,
    requestedBy: 'AI 진단',
    requestedAt: p.created_at,
    resolved: p.status !== 'OPEN',
  }
}

/** 목록 항목 → Repair (상세 전용 필드는 비움) */
export function toRepair(r: BeRepair, extra: { task?: BeTask; images?: RepairImage[]; report?: RepairReport } = {}): Repair {
  const ui = userInput(r)
  const { stages, progress } = toStages(extra.task)
  return {
    id: Number(r.id),
    receiptNo: r.case_number,
    product: snapshotProduct(r),
    symptom: r.symptom,
    technicianNote: ui.technicianNote,
    errorCodes: r.error_codes ?? [],
    branch: `서비스센터 #${r.center_id}`,
    technician: `기사 #${r.technician_id}`,
    technicianId: r.technician_id,
    receivedAt: r.created_at,
    updatedAt: extra.task?.updated_at ?? r.closed_at ?? r.created_at,
    status: toRepairStatus(r.status, extra.task?.status),
    urgency: ui.urgency,
    images: extra.images ?? [],
    photoRequestCount: extra.task?.photo_request_count ?? 0,
    stages,
    progress,
    progressMessage: extra.task?.stage ?? undefined,
    analysisError: extra.task?.status === 'FAILED' ? (extra.task.error_message ?? extra.task.error_code ?? 'AI 분석에 실패했습니다.') : undefined,
    history: [],
    report: extra.report,
  }
}

/** 상세 → Repair (리포트 본문은 GET /report 로 따로 받아 넘김) */
export function toRepairDetail(d: BeRepairDetail, report?: RepairReport): Repair {
  const task = latestTask(d.tasks)
  return toRepair(d, { task, images: toImages(d.attachments ?? [], userInput(d).photoKinds, d.photoRequests), report })
}
