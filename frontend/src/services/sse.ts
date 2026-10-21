/* =========================================================================
 * SSE 연결 모듈
 * - 실서버: EventSource(`/api/repairs/{id}/events`, { withCredentials: true }) — 세션 쿠키로 인증, URL 에 토큰 없음
 *   이름 있는 이벤트(REPAIR_CREATED …)만 구독하고, payload 는 쓰지 않고 상세를 GET 으로 다시 조회한다 (백엔드 권장).
 *   재연결은 브라우저 기본 동작(Last-Event-ID 자동 전송)에 맡긴다.
 * - Mock: 브라우저 내부 이벤트 버스 구독 (payload 로 바로 화면 갱신)
 * 화면은 이 모듈만 사용하므로 Mock ↔ 실서버 전환 시 화면 코드 변경이 없다.
 * ========================================================================= */
import { API_BASE, USE_MOCK } from '@/api/http'
import { on } from '@/mocks/db'
import type { RepairEvent } from '@/types'

export type SseState = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'

/** 백엔드 outbox 이벤트 이름 (docs/API.md 대시보드·SSE) */
export const REPAIR_EVENT_NAMES = [
  'REPAIR_CREATED',
  'DIAGNOSIS_QUEUED',
  'DIAGNOSIS_STARTED',
  'DIAGNOSIS_PROGRESS',
  /** 분석 도구 하나가 실행·완료됨 → /diagnosis/tools 재조회 */
  'TOOL_EXECUTED',
  'PHOTO_REQUESTED',
  'DIAGNOSIS_RESUMED',
  'DIAGNOSIS_COMPLETED',
  'DIAGNOSIS_FAILED',
  'ORDER_PROPOSED',
  'REPORT_DRAFT_SAVED',
  'REPORT_CONFIRMED',
] as const
export type RepairEventName = (typeof REPAIR_EVENT_NAMES)[number]

export interface SseHandlers {
  /** Mock: 이벤트 payload 로 화면을 바로 갱신 */
  onEvent: (e: RepairEvent) => void
  /** 실서버: 어떤 이벤트가 왔는지만 알림 → 상세를 GET 으로 다시 조회 */
  onChange?: (name: RepairEventName) => void
  onState?: (s: SseState) => void
}

export interface SseConnection {
  close: () => void
}

export function connectRepairEvents(repairId: number, h: SseHandlers): SseConnection {
  if (USE_MOCK) {
    h.onState?.('connecting')
    const t = setTimeout(() => h.onState?.('open'), 150)
    const off = on(repairId, h.onEvent)
    return {
      close() {
        clearTimeout(t)
        off()
        h.onState?.('closed')
      },
    }
  }

  h.onState?.('connecting')
  const es = new EventSource(`${API_BASE}/repairs/${repairId}/events`, { withCredentials: true })
  es.onopen = () => h.onState?.('open')
  // CONNECTING 이면 브라우저가 재연결 중, CLOSED 면 서버가 거부(401/403/404 등)해 재연결을 멈춘 상태
  es.onerror = () => h.onState?.(es.readyState === EventSource.CLOSED ? 'error' : 'reconnecting')
  for (const name of REPAIR_EVENT_NAMES) {
    es.addEventListener(name, () => h.onChange?.(name))
  }

  return {
    close() {
      es.close()
      h.onState?.('closed')
    },
  }
}

/** 모든 수리 건의 상태 변경을 받는 전역 스트림 (목록 화면 실시간 갱신용)
 *  실서버에는 전역 스트림이 없어(접수별 /events 만 제공) 연결하지 않는다. 목록은 새로고침·화면 진입 시 조회한다. */
export function connectAllEvents(onEvent: (e: RepairEvent) => void): SseConnection {
  if (USE_MOCK) {
    const off = on('*', onEvent)
    return { close: off }
  }
  return { close: () => undefined }
}
