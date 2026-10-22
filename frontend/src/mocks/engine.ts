/* =========================================================================
 * Mock AI 분석 파이프라인
 * 고정 단계: 접수·대기열(QUEUED) → 분석 진행(ANALYSIS) → 결과 종합(SYNTHESIS)
 * '분석 진행' 안에서는 사진이 있는 부위의 도구만, 순서를 섞어 하나씩 실행한다 (실서버의 도구 실행 이벤트를 흉내).
 *   PCB 사진 → PCB 분석 · 기계 사진 → 기계 분석 · 항상 → 매뉴얼·유사 사례 검색
 * 단계·도구 변화마다 SSE 와 같은 스키마의 이벤트를 발생시킨다.
 * ========================================================================= */
import type { AnalysisStage, AnalysisToolKind, AnalysisToolRun, Repair, RepairEvent, RepairStatus, StageRunState } from '@/types'
import { MAX_PHOTO_REQUESTS, STAGE_ORDER, TOOL_KIND_LABEL } from '@/constants/status'
import { ERROR_MESSAGES } from '@/constants/errors'
import { buildDiagnosis, type DiagnosisTemplateKey } from './data'
import { db, emit, persist } from './db'
import { uid } from '@/utils/format'

const running = new Set<number>()

type ToolKind = Exclude<AnalysisToolKind, 'OTHER'>
const TOOL_PLAN: Record<ToolKind, { running: string; done: string; ms: number }> = {
  PCB: { running: 'PCB 사진의 소손·부식·납땜 상태를 확인하고 있습니다.', done: 'PCB 분석 완료', ms: 2200 },
  MOTOR: { running: '기계 사진에서 변형·이물·연결부 상태를 확인하고 있습니다.', done: '기계 분석 완료', ms: 2400 },
  RAG: { running: '서비스 매뉴얼과 사내 고장 DB 에서 유사 사례를 찾고 있습니다.', done: '유사 사례 12건 · 매뉴얼 3건 확인', ms: 1600 },
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

/** 도구 상태 갱신 (없으면 도착 순서대로 뒤에 추가) */
function setTool(r: Repair, kind: ToolKind, state: StageRunState, message?: string): AnalysisToolRun {
  r.tools ??= []
  let t = r.tools.find((x) => x.kind === kind)
  if (!t) {
    t = { id: `${r.id}-${kind}`, kind, label: TOOL_KIND_LABEL[kind], state }
    r.tools.push(t)
  }
  t.state = state
  t.message = message
  if (state === 'RUNNING') {
    t.startedAt = new Date().toISOString()
    t.finishedAt = undefined
  }
  if (state === 'DONE' || state === 'FAILED') t.finishedAt = new Date().toISOString()
  return { ...t }
}

function push(r: Repair, status: RepairStatus, message: string, progress: number, extra: Partial<RepairEvent> = {}) {
  r.status = status
  r.progress = progress
  r.progressMessage = message
  r.updatedAt = new Date().toISOString()
  persist()
  emit({ repairId: r.id, status, message, progress, at: r.updatedAt, ...extra })
}

function pickTemplate(r: Repair): DiagnosisTemplateKey {
  const s = r.symptom
  if (/충전|전원|재부팅|꺼짐/.test(s)) return 'PCB'
  if (/바퀴|헛돎|한쪽/.test(s)) return 'WHEEL_SENSOR'
  return 'MOTOR_HOUSING'
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const shuffle = <T>(list: T[]) => [...list].sort(() => Math.random() - 0.5)

/** 사진이 있는 부위의 도구만 (+ 매뉴얼·유사 사례 검색은 항상) */
function toolsFor(r: Repair): ToolKind[] {
  const kinds = new Set(r.images.map((i) => i.kind))
  const list: ToolKind[] = ['RAG']
  if (kinds.has('PCB')) list.push('PCB')
  if (kinds.has('MOTOR') || kinds.has('ADDITIONAL')) list.push('MOTOR')
  return list
}

/** 진행 중인 건을 (재)실행. 이미 실행 중이면 무시 */
export async function runAnalysis(repairId: number) {
  if (running.has(repairId)) return
  const r = find(repairId)
  if (!r) return
  if (!['RECEIVED', 'QUEUED', 'ANALYZING'].includes(r.status) || r.analysisError) return
  running.add(repairId)
  try {
    /* 1. 접수·대기열 */
    if (r.stages.find((s) => s.stage === 'QUEUED')?.state !== 'DONE') {
      setStage(r, 'QUEUED', 'RUNNING')
      push(r, 'QUEUED', '분석 대기열에 등록했습니다.', 3, { stage: 'QUEUED', stageState: 'RUNNING' })
      await wait(900)
      if (!find(repairId)) return
      setStage(r, 'QUEUED', 'DONE', '대기열 등록 완료')
      push(r, 'ANALYZING', '대기열 등록 완료', 8, { stage: 'QUEUED', stageState: 'DONE' })
    }

    /* 2. 분석 진행 — 아직 끝나지 않은 도구만, 순서를 섞어 하나씩 */
    setStage(r, 'ANALYSIS', 'RUNNING')
    push(r, 'ANALYZING', '필요한 분석 도구를 실행하고 있습니다.', 10, { stage: 'ANALYSIS', stageState: 'RUNNING' })
    const todo = shuffle(toolsFor(r).filter((k) => r.tools?.find((t) => t.kind === k)?.state !== 'DONE'))
    const total = toolsFor(r).length
    for (const kind of todo) {
      const plan = TOOL_PLAN[kind]
      const done = () => (r.tools ?? []).filter((t) => t.state === 'DONE').length
      push(r, 'ANALYZING', plan.running, 10 + Math.round((done() / total) * 75), { tool: setTool(r, kind, 'RUNNING') })
      await wait(plan.ms)
      if (!find(repairId)) return

      // 시나리오: PCB 분석 실패
      if (r.mockScenario === 'FAIL' && kind === 'PCB') {
        r.analysisError = 'PCB 분석 도구가 사진을 판독하지 못했습니다. (해상도 부족 · 초점 흐림)'
        const tool = setTool(r, 'PCB', 'FAILED', 'PCB 사진 해상도 부족으로 판독 실패')
        setStage(r, 'ANALYSIS', 'FAILED', 'PCB 분석 실패')
        push(r, 'ANALYZING', r.analysisError, r.progress, { stage: 'ANALYSIS', stageState: 'FAILED', tool })
        return
      }
      // 시나리오: 기계 사진 추가 필요
      if (r.mockScenario === 'NEED_PHOTO' && kind === 'MOTOR') {
        requestPhoto(r)
        return
      }

      push(r, 'ANALYZING', plan.done, 10 + Math.round(((done() + 1) / total) * 75), { tool: setTool(r, kind, 'DONE', plan.done) })
      await wait(300)
    }
    setStage(r, 'ANALYSIS', 'DONE', `분석 도구 ${total}개 완료`)
    push(r, 'ANALYZING', '분석 도구 실행 완료', 86, { stage: 'ANALYSIS', stageState: 'DONE' })

    /* 3. 결과 종합 */
    setStage(r, 'SYNTHESIS', 'RUNNING')
    push(r, 'ANALYZING', '분석 결과를 모아 원인 후보와 판단 점수를 정리하고 있습니다.', 90, { stage: 'SYNTHESIS', stageState: 'RUNNING' })
    await wait(1600)
    if (!find(repairId)) return
    setStage(r, 'SYNTHESIS', 'DONE', '결과 종합 완료')

    // 완료 → AI 초안 생성 (확정 아님)
    const list = db.diagnoses[r.id] ?? []
    const version = list.length + 1
    const d = buildDiagnosis(r, pickTemplate(r), version, 0)
    db.diagnoses[r.id] = [...list, d]
    r.urgency = d.urgency
    r.history.push({ id: uid('h'), target: 'DIAGNOSIS', action: 'AI_GENERATED', actor: 'AI Orchestrator', actorRole: 'AI', at: new Date().toISOString(), comment: `AI 진단 초안 v${version} 생성 · 기사 확인 필요` })
    db.notifications.unshift({ id: uid('n'), title: 'AI 진단 초안 도착', body: `수리 #${r.id} (${r.product.model}) 진단 초안을 확인해 주세요.`, at: new Date().toISOString(), read: false, link: `/repairs/${r.id}/diagnosis`, roles: ['TECHNICIAN'] })
    push(r, 'DIAGNOSIS_COMPLETED', 'AI 진단 초안이 생성되었습니다. 기사 확인이 필요합니다.', 100, { stage: 'SYNTHESIS', stageState: 'DONE' })
  } finally {
    running.delete(repairId)
  }
}

function requestPhoto(r: Repair) {
  const nextNo = r.photoRequestCount + 1
  const label = TOOL_KIND_LABEL.MOTOR
  if (nextNo > MAX_PHOTO_REQUESTS) {
    // 3차 추가 분석 후에도 불명확 → 4차 요청 없이 본사 수동 검토
    const msg = ERROR_MESSAGES.INCONCLUSIVE_AFTER_THIRD_PHOTO
    const tool = setTool(r, 'MOTOR', 'FAILED', msg)
    setStage(r, 'ANALYSIS', 'FAILED', msg)
    r.history.push({ id: uid('h'), target: 'PHOTO', action: 'HQ_REVIEW_REQUESTED', actor: 'AI Orchestrator', actorRole: 'AI', at: new Date().toISOString(), comment: msg })
    push(r, 'MANUAL_REVIEW', msg, r.progress, { stage: 'ANALYSIS', stageState: 'FAILED', tool })
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
    requestedBy: label,
    requestedAt: new Date().toISOString(),
    resolved: false,
  }
  db.photoRequests[r.id] = [...(db.photoRequests[r.id] ?? []), req]
  const tool = setTool(r, 'MOTOR', 'WAITING_INPUT', '하단 연결부 판독 불가 · 추가 사진 대기')
  setStage(r, 'ANALYSIS', 'WAITING_INPUT', '기계 분석 · 추가 사진 대기')
  r.history.push({ id: uid('h'), target: 'PHOTO', action: 'COMMENTED', actor: label, actorRole: 'AI', at: req.requestedAt, comment: `추가 사진 요청 ${nextNo}/${MAX_PHOTO_REQUESTS}: ${req.target}` })
  db.notifications.unshift({ id: uid('n'), title: '추가 사진 요청', body: `수리 #${r.id} ${req.target} 사진이 필요합니다.`, at: req.requestedAt, read: false, link: `/repairs/${r.id}/progress`, roles: ['TECHNICIAN'] })
  push(r, 'ADDITIONAL_INFO_NEEDED', `${req.target} 사진이 필요합니다.`, r.progress, { stage: 'ANALYSIS', stageState: 'WAITING_INPUT', tool, photoRequest: req })
}

/**
 * 재분석
 *  'QUEUED'  : 처음부터 (도구 목록 비움)
 *  'ANALYSIS': 추가 자료 제출 후 재개 — 기존 도구 목록은 유지하고, 끝나지 않은 도구만 다시 실행
 */
export function restartAnalysis(r: Repair, from: 'QUEUED' | 'ANALYSIS' = 'QUEUED') {
  const idx = STAGE_ORDER.indexOf(from)
  r.stages = STAGE_ORDER.map((stage, i) => {
    const prev = r.stages.find((s) => s.stage === stage)
    return i < idx && prev ? prev : { stage, state: 'PENDING' as const }
  })
  if (from === 'QUEUED') r.tools = []
  r.analysisError = undefined
  r.status = from === 'QUEUED' ? 'QUEUED' : 'ANALYZING'
  r.progress = from === 'QUEUED' ? 0 : 10
  persist()
  setTimeout(() => void runAnalysis(r.id), 200)
}

/** 앱 시작 시 진행 중이던 건 재개 */
export function resumeAll() {
  db.repairs.filter((r) => ['RECEIVED', 'QUEUED', 'ANALYZING'].includes(r.status) && !r.analysisError).forEach((r) => void runAnalysis(r.id))
}
