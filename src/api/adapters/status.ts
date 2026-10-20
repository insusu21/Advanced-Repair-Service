/* 접수 상태 매핑: 백엔드 8개 상태 ↔ 프론트 표시 상태 */
import type { RepairStatus } from '@/types'
import type { BeRepairStatus, BeTaskStatus } from './types'

/** 백엔드 접수 상태(+진단 작업 상태) → 프론트 표시 상태 */
export function toRepairStatus(s: BeRepairStatus, taskStatus?: BeTaskStatus | null): RepairStatus {
  switch (s) {
    case 'RECEIVED':
      return 'RECEIVED'
    case 'DIAGNOSING':
      return taskStatus === 'QUEUED' ? 'QUEUED' : 'ANALYZING'
    case 'WAITING_INPUT':
      return 'ADDITIONAL_INFO_NEEDED'
    case 'DIAGNOSED':
      return 'DIAGNOSIS_COMPLETED'
    case 'MANUAL_REVIEW':
      return 'MANUAL_REVIEW'
    case 'REPAIRING':
      return 'TECHNICIAN_REVIEW'
    case 'CLOSED':
      return 'CLOSED'
    case 'CANCELLED':
      return 'CANCELLED'
  }
}

/** 목록 필터용 역변환. 백엔드에 대응 상태가 없으면 null (DRAFT·APPROVED·REJECTED 는 실서버에 없음) */
export function toBeRepairStatus(s: RepairStatus): BeRepairStatus | null {
  switch (s) {
    case 'RECEIVED':
      return 'RECEIVED'
    case 'QUEUED':
    case 'ANALYZING':
      return 'DIAGNOSING'
    case 'ADDITIONAL_INFO_NEEDED':
      return 'WAITING_INPUT'
    case 'DIAGNOSIS_COMPLETED':
      return 'DIAGNOSED'
    case 'MANUAL_REVIEW':
      return 'MANUAL_REVIEW'
    case 'TECHNICIAN_REVIEW':
      return 'REPAIRING'
    case 'CLOSED':
      return 'CLOSED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return null
  }
}
