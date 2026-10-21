/* 업무 흐름: 상태 → 기사가 지금 가야 할 화면 / 다음 행동 */
import type { Repair, RepairStatus, Role } from '@/types'

export type FlowStep = 'RECEIPT' | 'ANALYSIS' | 'DIAGNOSIS' | 'PARTS' | 'REVIEW' | 'CONFIRM'

export const FLOW_STEPS: { key: FlowStep; label: string; route: (id: number) => string }[] = [
  { key: 'RECEIPT', label: '접수', route: (id) => `/repairs/${id}/progress` },
  { key: 'ANALYSIS', label: 'AI 분석', route: (id) => `/repairs/${id}/progress` },
  { key: 'DIAGNOSIS', label: '진단 확인', route: (id) => `/repairs/${id}/diagnosis` },
  { key: 'PARTS', label: '부품·발주', route: (id) => `/repairs/${id}/diagnosis?page=2` },
  { key: 'REVIEW', label: '수리 리포트', route: (id) => `/repairs/${id}/review` },
  { key: 'CONFIRM', label: '리포트 확정', route: (id) => `/repairs/${id}/review` },
]

export function currentFlowStep(s: RepairStatus): FlowStep {
  switch (s) {
    case 'DRAFT':
      return 'RECEIPT'
    case 'RECEIVED':
    case 'QUEUED':
    case 'ANALYZING':
    case 'ADDITIONAL_INFO_NEEDED':
      return 'ANALYSIS'
    case 'DIAGNOSIS_COMPLETED':
    case 'MANUAL_REVIEW':
      return 'DIAGNOSIS'
    case 'TECHNICIAN_REVIEW':
      return 'REVIEW'
    default:
      return 'CONFIRM'
  }
}

/** 목록에서 행을 눌렀을 때 이동할 화면 */
export function repairLink(r: Pick<Repair, 'id' | 'status'>, role: Role | null): string {
  if (role === 'QUALITY_MANAGER' && r.status === 'MANUAL_REVIEW') return `/approvals/${r.id}`
  switch (currentFlowStep(r.status)) {
    case 'RECEIPT':
    case 'ANALYSIS':
      return `/repairs/${r.id}/progress`
    case 'DIAGNOSIS':
      return `/repairs/${r.id}/diagnosis`
    case 'REVIEW':
      return role === 'TECHNICIAN' ? `/repairs/${r.id}/review` : `/repairs/${r.id}/diagnosis`
    default:
      return `/repairs/${r.id}/review`
  }
}

/** 목록에 보여줄 "다음 할 일" */
export function nextAction(r: Repair, role: Role | null): string {
  if (role === 'QUALITY_MANAGER') {
    if (r.status === 'MANUAL_REVIEW') return '수동 진단 회신'
    return '-'
  }
  switch (r.status) {
    case 'ADDITIONAL_INFO_NEEDED':
      return '추가 사진 등록'
    case 'DIAGNOSIS_COMPLETED':
      return 'AI 진단 초안 확인'
    case 'TECHNICIAN_REVIEW':
      return r.report?.status === 'DRAFT' ? '리포트 확정' : '부품 확인 · 리포트 작성'
    case 'REJECTED':
      return '반려 사유 확인'
    case 'ANALYZING':
    case 'QUEUED':
    case 'RECEIVED':
      return r.analysisError ? '분석 실패 · 재분석 요청' : 'AI 분석 대기'
    case 'MANUAL_REVIEW':
      return '본사 수동 검토 대기'
    default:
      return '-'
  }
}
