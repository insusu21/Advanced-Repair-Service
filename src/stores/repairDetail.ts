/* =========================================================================
 * 수리 상세 스토어 — 한 건의 접수·진행(SSE)·AI 진단·사람 결정을 관리
 * 사람 결정(승인/반려/재분석)은 반드시 서버 응답을 받은 뒤에만 화면 상태를 바꾼다.
 * (낙관적 업데이트 금지 → "AI 결과가 자동 확정"되는 착시를 막음)
 * ========================================================================= */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repairApi, toErrorMessage } from '@/api'
import { connectRepairEvents, type RepairEventName, type SseConnection, type SseState } from '@/services/sse'
import type { Diagnosis, PhotoRequest, Repair, RepairEvent } from '@/types'
import type { AdditionalInfoRequest, ApprovalRequest, ReanalysisRequest, SaveReportDraftRequest, UploadImageRequest } from '@/types/api'

export const useRepairDetailStore = defineStore('repairDetail', () => {
  const repair = ref<Repair | null>(null)
  const diagnosis = ref<Diagnosis | null>(null)
  const versions = ref<Diagnosis[]>([])
  const photoRequests = ref<PhotoRequest[]>([])
  const loading = ref(false)
  const diagLoading = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const sseState = ref<SseState>('closed')
  const lastEvent = ref<RepairEvent | null>(null)
  const eventLog = ref<RepairEvent[]>([])
  let conn: SseConnection | null = null

  const activePhotoRequest = computed(() => photoRequests.value.find((p) => !p.resolved) ?? null)

  async function load(id: number) {
    if (repair.value?.id !== id) {
      repair.value = null
      diagnosis.value = null
      versions.value = []
      photoRequests.value = []
      eventLog.value = []
    }
    loading.value = true
    error.value = null
    try {
      const [r, pr] = await Promise.all([repairApi.get(id), repairApi.photoRequests(id)])
      repair.value = r
      photoRequests.value = pr
    } catch (e) {
      error.value = toErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  async function loadDiagnosis(id: number) {
    diagLoading.value = true
    try {
      const res = await repairApi.diagnosis(id)
      diagnosis.value = res.current
      versions.value = res.versions
    } catch (e) {
      error.value = toErrorMessage(e)
    } finally {
      diagLoading.value = false
    }
  }

  function applyEvent(e: RepairEvent) {
    lastEvent.value = e
    eventLog.value = [e, ...eventLog.value].slice(0, 30)
    const r = repair.value
    if (!r || r.id !== e.repairId) return
    r.status = e.status
    r.progress = e.progress
    r.progressMessage = e.message
    if (e.stage && e.stageState) {
      const s = r.stages.find((x) => x.stage === e.stage)
      if (s) {
        s.state = e.stageState
        s.message = e.message
      }
    }
    if (e.stageState === 'FAILED') r.analysisError = e.message
    // 분석 완료 이벤트 → 새 AI 초안 조회
    if (e.status === 'DIAGNOSIS_COMPLETED' && e.progress === 100) void loadDiagnosis(r.id)
    if (e.photoRequest) {
      photoRequests.value = [...photoRequests.value.filter((p) => p.id !== e.photoRequest!.id), e.photoRequest]
      r.photoRequestCount = e.photoRequest.requestNo
    }
  }

  /* 실서버 SSE: payload 는 쓰지 않고 상세를 다시 조회. 연달아 오는 이벤트는 300ms 모아서 한 번만 조회 */
  const DIAGNOSIS_EVENTS: RepairEventName[] = ['DIAGNOSIS_COMPLETED', 'DIAGNOSIS_FAILED', 'DIAGNOSIS_RESUMED']
  let refetchTimer: number | undefined
  let refetchDiagnosis = false
  function onServerChange(id: number, name: RepairEventName) {
    if (DIAGNOSIS_EVENTS.includes(name)) refetchDiagnosis = true
    window.clearTimeout(refetchTimer)
    refetchTimer = window.setTimeout(async () => {
      const withDiag = refetchDiagnosis
      refetchDiagnosis = false
      await load(id)
      if (withDiag) await loadDiagnosis(id)
    }, 300)
  }

  function subscribe(id: number) {
    unsubscribe()
    conn = connectRepairEvents(id, {
      onEvent: applyEvent,
      onChange: (name) => onServerChange(id, name),
      onState: (s) => (sseState.value = s),
    })
  }
  function unsubscribe() {
    window.clearTimeout(refetchTimer)
    conn?.close()
    conn = null
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    submitting.value = true
    try {
      return await fn()
    } finally {
      submitting.value = false
    }
  }

  const decide = (req: ApprovalRequest) =>
    run(async () => {
      repair.value = await repairApi.approval(repair.value!.id, req)
      await loadDiagnosis(repair.value.id)
    })

  const requestReanalysis = (req: ReanalysisRequest) =>
    run(async () => {
      repair.value = await repairApi.reanalysis(repair.value!.id, req)
    })

  const addPhotos = (req: AdditionalInfoRequest) =>
    run(async () => {
      repair.value = await repairApi.uploadAdditional(repair.value!.id, req)
      photoRequests.value = await repairApi.photoRequests(repair.value.id)
    })

  /** 수리 전·후 사진 업로드 (기존 이미지 API, kind BEFORE/AFTER). 올라간 사진은 repair.images 에 붙는다 */
  const uploadReportPhotos = (photos: UploadImageRequest[]) =>
    run(async () => {
      const id = repair.value!.id
      const imgs = []
      for (const p of photos) imgs.push(await repairApi.uploadImage(id, p))
      repair.value = { ...repair.value!, images: [...repair.value!.images, ...imgs] }
    })

  /** 리포트 초안 저장 */
  const saveReportDraft = (req: SaveReportDraftRequest) =>
    run(async () => {
      repair.value = await repairApi.saveReportDraft(repair.value!.id, req)
    })

  /** 리포트 확정 (저장된 초안의 version 기준) */
  const confirmReport = (version: number) =>
    run(async () => {
      repair.value = await repairApi.confirmReport(repair.value!.id, { version })
    })

  return {
    repair,
    diagnosis,
    versions,
    photoRequests,
    activePhotoRequest,
    loading,
    diagLoading,
    submitting,
    error,
    sseState,
    lastEvent,
    eventLog,
    load,
    loadDiagnosis,
    subscribe,
    unsubscribe,
    decide,
    requestReanalysis,
    addPhotos,
    uploadReportPhotos,
    saveReportDraft,
    confirmReport,
  }
})
