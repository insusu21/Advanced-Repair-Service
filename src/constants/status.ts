import type { Component } from 'vue'
import {
  FilePen,
  Inbox,
  ListOrdered,
  Loader,
  Camera,
  Sparkles,
  UserCheck,
  CircleCheck,
  CircleX,
  Hand,
  Archive,
} from 'lucide-vue-next'
import type { AiAcceptance, AnalysisStage, FaultArea, RepairOutcome, RepairStatus, ReportStatus, Role, Urgency, OrderStatus, DecisionState, StatusGroupKey } from '@/types'

/** 색상만으로 상태를 구분하지 않도록 label + icon + tone 을 함께 정의 */
export type Tone = 'neutral' | 'info' | 'ai' | 'warning' | 'success' | 'danger'

export interface StatusMeta {
  label: string
  description: string
  tone: Tone
  icon: Component
}

export const STATUS_META: Record<RepairStatus, StatusMeta> = {
  DRAFT: { label: '임시 저장', description: '접수 작성 중', tone: 'neutral', icon: FilePen },
  RECEIVED: { label: '접수 완료', description: '진단 대기열 등록 전', tone: 'info', icon: Inbox },
  QUEUED: { label: '분석 대기', description: 'AI 분석 순서를 기다리는 중', tone: 'info', icon: ListOrdered },
  ANALYZING: { label: 'AI 분석 중', description: '전문 Agent 가 분석 중', tone: 'ai', icon: Loader },
  ADDITIONAL_INFO_NEEDED: { label: '추가 사진 필요', description: 'AI 가 추가 사진을 요청함', tone: 'warning', icon: Camera },
  DIAGNOSIS_COMPLETED: { label: '진단 초안 도착', description: '기사 확인이 필요한 AI 초안', tone: 'ai', icon: Sparkles },
  TECHNICIAN_REVIEW: { label: '기사 수리·리포트 작성', description: '진단 확인 후 수리하고 리포트를 확정할 차례', tone: 'warning', icon: UserCheck },
  APPROVED: { label: '승인 완료', description: '고장 DB·대시보드 반영됨', tone: 'success', icon: CircleCheck },
  REJECTED: { label: '반려', description: '반려되어 반영되지 않음', tone: 'danger', icon: CircleX },
  MANUAL_REVIEW: { label: '본사 수동 검토', description: '사람이 직접 진단하는 건', tone: 'danger', icon: Hand },
  CLOSED: { label: '리포트 확정', description: '기사가 리포트를 확정해 고장 DB·대시보드에 반영됨', tone: 'success', icon: Archive },
}

export const STATUS_ORDER: RepairStatus[] = [
  'DRAFT',
  'RECEIVED',
  'QUEUED',
  'ANALYZING',
  'ADDITIONAL_INFO_NEEDED',
  'DIAGNOSIS_COMPLETED',
  'TECHNICIAN_REVIEW',
  'APPROVED',
  'REJECTED',
  'MANUAL_REVIEW',
  'CLOSED',
]

/** 수리 목록 상태 필터의 그룹 (표시 순서용). 개별 상태는 모두 그대로 노출한다 */
export const STATUS_GROUPS: { key: StatusGroupKey; label: string; statuses: RepairStatus[] }[] = [
  { key: 'AI_ANALYSIS', label: 'AI 분석', statuses: ['RECEIVED', 'QUEUED', 'ANALYZING'] },
  { key: 'TECHNICIAN', label: '기사 처리', statuses: ['ADDITIONAL_INFO_NEEDED', 'DIAGNOSIS_COMPLETED', 'TECHNICIAN_REVIEW', 'REJECTED'] },
  { key: 'HQ', label: '본사 검토', statuses: ['MANUAL_REVIEW'] },
  { key: 'DONE', label: '완료', statuses: ['APPROVED', 'CLOSED'] },
]

/** 진단 진행 화면에서 "분석 중" 으로 다루는 상태 */
export const IN_PROGRESS_STATUSES: RepairStatus[] = ['RECEIVED', 'QUEUED', 'ANALYZING', 'ADDITIONAL_INFO_NEEDED']

export const STAGE_META: Record<AnalysisStage, { label: string; agent: string; description: string }> = {
  QUEUED: { label: '접수·대기열 등록', agent: 'System', description: '분석 요청을 대기열에 등록합니다' },
  ORCHESTRATION: { label: '분석 계획 수립', agent: 'Orchestrator AI', description: '증상·에러코드로 필요한 분석을 선택합니다' },
  PCB_ANALYSIS: { label: 'PCB 분석', agent: 'PCB Agent', description: 'PCB 사진의 소손·부식·납땜 불량을 확인합니다' },
  MOTOR_ANALYSIS: { label: '모터 분석', agent: 'Motor Agent', description: '모터 외관 변형·이물·연결부 상태를 확인합니다' },
  SW_ANALYSIS: { label: 'SW·로그 분석', agent: 'SW Agent', description: '에러 코드와 센서 로그를 해석합니다' },
  SIMILAR_CASE_SEARCH: { label: '유사 사례 검색', agent: 'Case Agent', description: '사내 고장 DB 에서 유사 수리 건을 찾습니다' },
  SYNTHESIS: { label: '결과 종합', agent: 'Orchestrator AI', description: '각 Agent 결과를 종합해 원인 후보를 만듭니다' },
}

export const STAGE_ORDER: AnalysisStage[] = [
  'QUEUED',
  'ORCHESTRATION',
  'PCB_ANALYSIS',
  'MOTOR_ANALYSIS',
  'SW_ANALYSIS',
  'SIMILAR_CASE_SEARCH',
  'SYNTHESIS',
]

export const ROLE_LABEL: Record<Role, string> = {
  TECHNICIAN: '서비스센터 기사',
  QUALITY_MANAGER: '본사 품질 담당자',
}

export const URGENCY_META: Record<Urgency, { label: string; tone: Tone }> = {
  HIGH: { label: '긴급', tone: 'danger' },
  MEDIUM: { label: '보통', tone: 'warning' },
  LOW: { label: '낮음', tone: 'neutral' },
}

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: Tone }> = {
  AI_DRAFT: { label: 'AI 발주안 (미요청)', tone: 'ai' },
  REQUESTED: { label: '발주 요청됨 · 승인 대기', tone: 'warning' },
  APPROVED: { label: '발주 승인', tone: 'success' },
  REJECTED: { label: '발주 반려', tone: 'danger' },
}

export const DECISION_META: Record<DecisionState, { label: string; tone: Tone }> = {
  PENDING: { label: '관리자 확인 대기', tone: 'warning' },
  APPROVED: { label: '관리자 확인 완료', tone: 'success' },
  REJECTED: { label: '반려됨', tone: 'danger' },
  CHANGE_REQUESTED: { label: '수정 요청됨', tone: 'warning' },
  REANALYSIS_REQUESTED: { label: '재분석 요청됨', tone: 'info' },
}

/* ---------------- 수리 리포트 ---------------- */
export const FAULT_AREA_LABEL: Record<FaultArea, string> = { PCB: 'PCB', MOTOR: '모터', SW: '소프트웨어', OTHER: '기타' }

export const OUTCOME_META: Record<RepairOutcome, { label: string; description: string; tone: Tone }> = {
  FIXED: { label: '수리 완료', description: '고장 부위를 수리·교체해 정상 동작', tone: 'success' },
  NOT_FIXED: { label: '수리 실패', description: '수리했으나 증상이 남음', tone: 'danger' },
  NO_FAULT_FOUND: { label: '고장 없음', description: '점검 결과 이상을 찾지 못함', tone: 'neutral' },
}

export const AI_ACCEPTANCE_META: Record<AiAcceptance, { label: string; description: string; tone: Tone }> = {
  ACCEPTED: { label: '맞음', description: 'AI 진단 원인과 실제 원인이 같음', tone: 'success' },
  PARTIAL: { label: '일부 맞음', description: '원인은 비슷하나 부품·범위가 다름', tone: 'warning' },
  REJECTED: { label: '틀림', description: '실제 원인이 다름', tone: 'danger' },
  NOT_AVAILABLE: { label: 'AI 진단 없음', description: 'AI 진단 없이 진행한 건', tone: 'neutral' },
}

export const REPORT_STATUS_META: Record<ReportStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: '초안', tone: 'warning' },
  CONFIRMED: { label: '확정', tone: 'success' },
}

export const MAX_PHOTO_REQUESTS = 3
