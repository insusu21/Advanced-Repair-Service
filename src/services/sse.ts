/* =========================================================================
 * SSE 연결 모듈
 * - 실서버: EventSource(`/api/repairs/{id}/events?token=...`) + 지수 백오프 재연결
 *   (EventSource 는 헤더를 못 붙이므로 토큰은 쿼리 또는 쿠키로 전달)
 * - Mock: 브라우저 내부 이벤트 버스 구독
 * 화면은 이 모듈만 사용하므로 Mock ↔ 실서버 전환 시 화면 코드 변경이 없다.
 * ========================================================================= */
import { API_BASE, TOKEN_KEY, USE_MOCK } from '@/api/http'
import { on } from '@/mocks/db'
import type { RepairEvent } from '@/types'

export type SseState = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'

export interface SseHandlers {
  onEvent: (e: RepairEvent) => void
  onState?: (s: SseState) => void
}

export interface SseConnection {
  close: () => void
}

const MAX_RETRY = 6

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

  let es: EventSource | null = null
  let retry = 0
  let closed = false
  let timer: number | undefined

  const open = () => {
    const token = sessionStorage.getItem(TOKEN_KEY) ?? ''
    h.onState?.(retry === 0 ? 'connecting' : 'reconnecting')
    es = new EventSource(`${API_BASE}/repairs/${repairId}/events?token=${encodeURIComponent(token)}`)
    es.onopen = () => {
      retry = 0
      h.onState?.('open')
    }
    // 서버는 기본 message 또는 event: status 로 전송할 수 있음
    const handle = (msg: MessageEvent<string>) => {
      try {
        h.onEvent(JSON.parse(msg.data) as RepairEvent)
      } catch {
        /* 잘못된 이벤트는 무시 */
      }
    }
    es.onmessage = handle
    es.addEventListener('status', handle as EventListener)
    es.onerror = () => {
      es?.close()
      if (closed) return
      if (retry >= MAX_RETRY) {
        h.onState?.('error')
        return
      }
      const delay = Math.min(30_000, 1000 * 2 ** retry) // 1s,2s,4s ... 최대 30s
      retry += 1
      h.onState?.('reconnecting')
      timer = window.setTimeout(open, delay)
    }
  }
  open()

  return {
    close() {
      closed = true
      window.clearTimeout(timer)
      es?.close()
      h.onState?.('closed')
    },
  }
}

/** 모든 수리 건의 상태 변경을 받는 전역 스트림 (목록 화면 실시간 갱신용) */
export function connectAllEvents(onEvent: (e: RepairEvent) => void): SseConnection {
  if (USE_MOCK) {
    const off = on('*', onEvent)
    return { close: off }
  }
  const token = sessionStorage.getItem(TOKEN_KEY) ?? ''
  const es = new EventSource(`${API_BASE}/repairs/events?token=${encodeURIComponent(token)}`)
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data) as RepairEvent)
    } catch {
      /* noop */
    }
  }
  return { close: () => es.close() }
}
