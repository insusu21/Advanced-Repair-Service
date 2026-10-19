import type { Component } from 'vue'
import {
  FilePen,
  Inbox,
  ListOrdered,
  Loader,
  Camera,
  Sparkles,
  UserCheck,
  Building2,
  CircleCheck,
  CircleX,
  Hand,
  Archive,
} from 'lucide-vue-next'
import type { AnalysisStage, RepairStatus, Role, Urgency, OrderStatus, DecisionState } from '@/types'

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
  TECHNICIAN_REVIEW: { label: '기사 검토·수리 중', description: '기사가 진단을 확인하고 수리 진행', tone: 'warning', icon: UserCheck },
  HQ_APPROVAL: { label: '본사 승인 대기', description: '품질 담당자 승인 대기', tone: 'warning', icon: Building2 },
  APPROVED: { label: '승인 완료', description: '고장 DB·대시보드 반영됨', tone: 'success', icon: CircleCheck },
  REJECTED: { label: '반려', description: '반려되어 반영되지 않음', tone: 'danger', icon: CircleX },
  MANUAL_REVIEW: { label: '본사 수동 검토', description: '사람이 직접 진단하는 건', tone: 'danger', icon: Hand },
  CLOSED: { label: '종결', description: '처리 종료', tone: 'neutral', icon: Archive },
}

export const STATUS_ORDER: RepairStatus[] = [
  'DRAFT',
  'RECEIVED',
  'QUEUED',
  'ANALYZING',
  'ADDITIONAL_INFO_NEEDED',
  'DIAGNOSIS_COMPLETED',
  'TECHNICIAN_REVIEW',
  'HQ_APPROVAL',
  'APPROVED',
  'REJECTED',
  'MANUAL_REVIEW',
  'CLOSED',
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
  QUALITY: '본사 품질 담당자',
  PARTS: '부품 담당자',
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
  PENDING: { label: '사람 확인 대기', tone: 'warning' },
  APPROVED: { label: '사람 확인 완료', tone: 'success' },
  REJECTED: { label: '반려됨', tone: 'danger' },
  CHANGE_REQUESTED: { label: '수정 요청됨', tone: 'warning' },
  REANALYSIS_REQUESTED: { label: '재분석 요청됨', tone: 'info' },
}

export const MAX_PHOTO_REQUESTS = 3
