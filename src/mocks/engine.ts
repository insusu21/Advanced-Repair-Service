/* =========================================================================
 * Mock AI 분석 파이프라인
 * 실제 백엔드의 오케스트레이터 동작을 흉내 내어 단계별 이벤트(SSE 와 동일 스키마)를 발생시킨다.
 * ========================================================================= */
import type { AnalysisStage, Repair, RepairEvent, RepairStatus, StageRunState } from '@/types'
import { MAX_PHOTO_REQUESTS, STAGE_META, STAGE_ORDER } from '@/constants/status'
import { buildDiagnosis, type DiagnosisTemplateKey } from './data'
import { db, emit, persist } from './db'
import { uid } from '@/utils/format'

const running = new Set<number>()

/** 단계별 메시지 · 진행률 */
const PLAN: Record<AnalysisStage, { progress: number; running: string; done: string; ms: number }> = {
  QUEUED: { progress: 5, running: '분석 대기열에 등록했습니다.', done: '대기열 등록 완료', ms: 900 },
  ORCHESTRATION: { progress: 15, running: '증상과 에러 코드로 필요한 분석을 선택하고 있습니다.', done: '분석 계획 수립 완료', ms: 1400 },
  PCB_ANALYSIS: { progress: 35, running: 'PCB 사진을 분석하고 있습니다.', done: 'PCB 분석 완료', ms: 2200 },
  MOTOR_ANALYSIS: { progress: 55, running: '모터 사진에서 변형·이물을 확인하고 있습니다.', done: '모터 분석 완료', ms: 2400 },
  SW_ANALYSIS: { progress: 70, running: '에러 코드와 센서 로그를 해석하고 있습니다.', done: 'SW 분석 완료', ms: 1600 },
  SIMILAR_CASE_SEARCH: { progress: 85, running: '사내 고장 DB 에서 유사 사례를 찾고 있습니다.', done: '유사 사례 12건 확인', ms: 1500 },
  SYNTHESIS: { progress: 96, running: '각 Agent 결과를 종합해 원인 후보를 정리하고 있습니다.', done: '결과 종합 완료', ms: 1600 },
}

function find(id: number) {
  return db.repairs.find((r) => r.id === id)
}

function setStage(r: Repair, stage: AnalysisStage, state: StageRunState, message?: string) {
  const s = r.stages.find((x) => x.stage === stage)
  if (!s) return
  s.state = state
  s.message = message
  if (state === 'RUNNING') s.startedAt = new Date().toISOString()
  if (state === 'DONE' || state === 'SKIPPED' || state === 'FAILED') s.finishedAt = new Date().toISOString()
}

function push(r: Repair, status: RepairStatus, message: string, progress: number, stage?: AnalysisStage, stageState?: StageRunState, extra: Partial<RepairEvent> = {}) {
  r.status = status
  r.progress = progress
  r.progressMessage = message
  r.updatedAt = new Date().toISOString()
  persist()
  emit({ repairId: r.id, status, stage, stageState, message, progress, at: r.updatedAt, ...extra })
}

function pickTemplate(r: Repair): DiagnosisTemplateKey {
  const s = r.symptom
  if (/충전|전원|재부팅|꺼짐/.test(s)) return 'PCB'
  if (/바퀴|헛돎|한쪽/.test(s)) return 'WHEEL_SENSOR'
  return 'MOTOR_HOUSING'
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 진행 중인 건을 (재)실행. 이미 실행 중이면 무시 */
export async function runAnalysis(repairId: number) {
  if (running.has(repairId)) return
  const r = find(repairId)
  if (!r) return
  if (!['RECEIVED', 'QUEUED', 'ANALYZING'].includes(r.status) || r.analysisError) return
  running.add(repairId)
  try {
    const skipSw = r.errorCodes.length === 0
    for (const stage of STAGE_ORDER) {
      const st = r.stages.find((x) => x.stage === stage)!
      if (st.state === 'DONE' || st.state === 'SKIPPED') continue
      const plan = PLAN[stage]

      if (stage === 'SW_ANALYSIS' && skipSw) {
        setStage(r, stage, 'SKIPPED', '에러 코드 없음 · 오케스트레이터가 분석 제외')
        push(r, 'ANALYZING', 'SW 분석은 필요하지 않아 건너뜁니다.', plan.progress, stage, 'SKIPPED')
        await wait(500)
        continue
      }

      setStage(r, stage, 'RUNNING')
      push(r, stage === 'QUEUED' ? 'QUEUED' : 'ANALYZING', plan.running, plan.progress - 8, stage, 'RUNNING')
      await wait(plan.ms)
      if (!find(repairId)) return

      // 시나리오: 분석 실패
      if (r.mockScenario === 'FAIL' && stage === 'PCB_ANALYSIS') {
        setStage(r, stage, 'FAILED', 'PCB 사진 해상도 부족으로 판독 실패')
        r.analysisError = 'PCB Agent 가 사진을 판독하지 못했습니다. (해상도 부족 · 초점 흐림)'
        push(r, 'ANALYZING', r.analysisError, plan.progress - 8, stage, 'FAILED')
        return
      }

      // 시나리오: 추가 사진 필요
      if (r.mockScenario === 'NEED_PHOTO' && stage === 'MOTOR_ANALYSIS') {
        requestPhoto(r)
        return
      }

      setStage(r, stage, 'DONE', plan.done)
      push(r, 'ANALYZING', plan.done, plan.progress, stage, 'DONE')
      await wait(300)
    }

    // 완료 → AI 초안 생성 (확정 아님)
    const list = db.diagnoses[r.id] ?? []
    const version = list.length + 1
    const d = buildDiagnosis(r, pickTemplate(r), version, 0)
    db.diagnoses[r.id] = [...list, d]
    r.urgency = d.urgency
    r.history.push({ id: uid('h'), target: 'DIAGNOSIS', action: 'AI_GENERATED', actor: 'AI Orchestrator', actorRole: 'AI', at: new Date().toISOString(), comment: `AI 진단 초안 v${version} 생성 · 기사 확인 필요` })
    db.notifications.unshift({ id: uid('n'), title: 'AI 진단 초안 도착', body: `${r.receiptNo} (${r.product.model}) 진단 초안을 확인해 주세요.`, at: new Date().toISOString(), read: false, link: `/repairs/${r.id}/diagnosis`, roles: ['TECHNICIAN'] })
    push(r, 'DIAGNOSIS_COMPLETED', 'AI 진단 초안이 생성되었습니다. 기사 확인이 필요합니다.', 100)
  } finally {
    running.delete(repairId)
  }
}

function requestPhoto(r: Repair) {
  const nextNo = r.photoRequestCount + 1
  if (nextNo > MAX_PHOTO_REQUESTS) {
    setStage(r, 'MOTOR_ANALYSIS', 'FAILED', '추가 사진 3회 요청 초과')
    r.history.push({ id: uid('h'), target: 'PHOTO', action: 'HQ_REVIEW_REQUESTED', actor: 'AI Orchestrator', actorRole: 'AI', at: new Date().toISOString(), comment: '추가 사진 요청 3회 초과 → 본사 수동 검토 전환' })
    push(r, 'MANUAL_REVIEW', '추가 사진 요청이 3회를 넘어 본사 수동 검토로 전환되었습니다.', r.progress, 'MOTOR_ANALYSIS', 'FAILED')
    return
  }
  r.photoRequestCount = nextNo
  const req = {
    id: uid('PR'),
    target: '모터 하단 연결부',
    reason: '현재 사진에서는 외관 변형 여부를 확인하기 어렵습니다.',
    guide: '연결부가 정면으로 보이도록 촬영해 주세요. 그림자가 지지 않게 측면 조명을 켜고 20cm 거리에서 찍어 주세요.',
    requestNo: nextNo,
    maxRequests: MAX_PHOTO_REQUESTS,
    requestedBy: STAGE_META.MOTOR_ANALYSIS.agent,
    requestedAt: new Date().toISOString(),
    resolved: false,
  }
  db.photoRequests[r.id] = [...(db.photoRequests[r.id] ?? []), req]
  setStage(r, 'MOTOR_ANALYSIS', 'WAITING_INPUT', '하단 연결부 판독 불가 · 추가 사진 대기')
  r.history.push({ id: uid('h'), target: 'PHOTO', action: 'COMMENTED', actor: 'Motor Agent', actorRole: 'AI', at: req.requestedAt, comment: `추가 사진 요청 ${nextNo}/${MAX_PHOTO_REQUESTS}: ${req.target}` })
  db.notifications.unshift({ id: uid('n'), title: '추가 사진 요청', body: `${r.receiptNo} ${req.target} 사진이 필요합니다.`, at: req.requestedAt, read: false, link: `/repairs/${r.id}/progress`, roles: ['TECHNICIAN'] })
  push(r, 'ADDITIONAL_INFO_NEEDED', `${req.target} 사진이 필요합니다.`, 48, 'MOTOR_ANALYSIS', 'WAITING_INPUT', { photoRequest: req })
}

/** 재분석: 단계 초기화 후 다시 실행 */
export function restartAnalysis(r: Repair, fromStage: AnalysisStage = 'QUEUED') {
  const idx = STAGE_ORDER.indexOf(fromStage)
  r.stages = STAGE_ORDER.map((stage, i) => {
    const prev = r.stages.find((s) => s.stage === stage)
    return i < idx && prev ? prev : { stage, state: 'PENDING' as const }
  })
  r.analysisError = undefined
  r.status = 'QUEUED'
  r.progress = idx === 0 ? 0 : PLAN[STAGE_ORDER[idx - 1]].progress
  persist()
  setTimeout(() => void runAnalysis(r.id), 200)
}

/** 앱 시작 시 진행 중이던 건 재개 */
export function resumeAll() {
  db.repairs.filter((r) => ['RECEIVED', 'QUEUED', 'ANALYZING'].includes(r.status) && !r.analysisError).forEach((r) => void runAnalysis(r.id))
}
