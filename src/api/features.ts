/* 실서버(백엔드 API v2)에 아직 없는 기능 목록. Mock 모드에서는 모두 켜져 있다.
 * 화면은 이 값으로 버튼·카드를 숨기거나 "준비 중" 을 표시한다. 백엔드가 지원하면 여기만 바꾸면 된다. */
import { USE_MOCK } from './http'

export const FEATURES = {
  /** 기사의 진단 확인·반려·본사 검토 요청, 본사 수동 진단 회신 (진단 결정 API 없음) */
  diagnosisDecision: USE_MOCK,
  /** 추가 분석(재진단) 요청 — 백엔드: "종료 후 재진단 API는 아직 제공하지 않는다" */
  reanalysis: USE_MOCK,
  /** 수리 전·후 사진 업로드 (첨부 API 는 추가 사진 요청(requestId) 전용) */
  reportPhotos: USE_MOCK,
  /** 추가 자료를 설명만으로 제출 (실서버는 사진 1장 이상 필요) */
  additionalNoteOnly: USE_MOCK,
  /** 대시보드: 모델별 · AI 진단 성공률/일치율 · 드릴다운 · 반복 고장 추세 */
  dashboardExtras: USE_MOCK,
  /** 알림 API */
  notifications: USE_MOCK,
} as const
