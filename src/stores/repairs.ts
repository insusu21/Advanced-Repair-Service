/* 수리 목록 스토어 — 목록·필터·요약 카운트 + 전역 SSE 로 실시간 반영 */
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { repairApi, toErrorMessage } from '@/api'
import { connectAllEvents, type SseConnection } from '@/services/sse'
import type { Repair, RepairEvent, RepairQuery, RepairSummaryCounts } from '@/types'

const EMPTY_COUNTS: RepairSummaryCounts = { needPhoto: 0, technicianReview: 0, hqApproval: 0, completed: 0, analyzing: 0, manualReview: 0 }

export const useRepairListStore = defineStore('repairList', () => {
  const items = ref<Repair[]>([])
  const counts = ref<RepairSummaryCounts>({ ...EMPTY_COUNTS })
  const query = reactive<RepairQuery>({ status: 'ALL', keyword: '', sort: 'receivedAt_desc' })
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loadedAt = ref<string | null>(null)
  let stream: SseConnection | null = null
  let refreshTimer: number | undefined

  async function fetch() {
    loading.value = true
    error.value = null
    try {
      const res = await repairApi.list({ ...query })
      items.value = res.items
      counts.value = res.counts
      loadedAt.value = new Date().toISOString()
    } catch (e) {
      error.value = toErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  function applyEvent(e: RepairEvent) {
    const it = items.value.find((r) => r.id === e.repairId)
    if (!it) return
    const statusChanged = it.status !== e.status
    it.status = e.status
    it.progress = e.progress
    it.progressMessage = e.message
    // 상태가 바뀌면 카운트 재조회 (디바운스)
    if (statusChanged) {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => void silentRefresh(), 600)
    }
  }

  async function silentRefresh() {
    try {
      const res = await repairApi.list({ ...query })
      items.value = res.items
      counts.value = res.counts
    } catch {
      /* 백그라운드 갱신 실패는 무시 */
    }
  }

  function startLive() {
    if (stream) return
    stream = connectAllEvents(applyEvent)
  }
  function stopLive() {
    stream?.close()
    stream = null
  }

  function resetQuery() {
    Object.assign(query, { status: 'ALL', keyword: '', sort: 'receivedAt_desc', model: undefined })
  }

  return { items, counts, query, loading, error, loadedAt, fetch, startLive, stopLive, resetQuery }
})
