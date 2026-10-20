/* AI 진단 변환: 백엔드 Task(+result) · ToolExecution → 프론트 Diagnosis
 * 백엔드에 없는 필드(에러코드 해석·유사 사례·점검 순서)는 빈 배열로 두고, 화면은 데이터가 없으면 해당 카드를 숨긴다. */
import type { AgentResult, AgentType, AgentVerdict, DataSource, Decision, Diagnosis, ImageAnnotation, Part, Urgency } from '@/types'
import type { BeEvidence, BeTask, BeToolExecution } from './types'

/** 0~1 이면 % 로, 이미 0~100 이면 그대로 */
const pct = (v: number) => Math.round(v <= 1 ? v * 100 : v)

/** "1. 커넥터 재체결\n2. 교체" 같은 문자열 → 단계 배열 */
export function splitSteps(s: string | undefined): string[] {
  return (s ?? '')
    .split(/\r?\n|(?:^|\s)(?=\d+[.)]\s)/)
    .map((x) => x.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
}

const EVIDENCE_TYPE: Record<string, DataSource['type']> = {
  IMAGE: 'IMAGE',
  PHOTO: 'IMAGE',
  MANUAL: 'MANUAL',
  DOCUMENT: 'MANUAL',
  REPAIR_DB: 'REPAIR_DB',
  CASE: 'REPAIR_DB',
  LOG: 'SENSOR_LOG',
  SENSOR_LOG: 'SENSOR_LOG',
  ERROR_CODE: 'ERROR_CODE_TABLE',
}
function toSource(e: BeEvidence, i: number): DataSource {
  const type = EVIDENCE_TYPE[e.type?.toUpperCase()] ?? (e.attachmentId ? 'IMAGE' : 'MANUAL')
  return { id: `E${i + 1}`, type, title: e.citation || (e.attachmentId ? `첨부 사진 #${e.attachmentId}` : e.type), ref: e.attachmentId ? `attachment ${e.attachmentId}` : e.type }
}

/** evidence.annotation({label,x,y,w,h,severity} 형태일 때) → 사진 위 이상 영역 */
function toAnnotation(e: BeEvidence): ImageAnnotation | null {
  const a = e.annotation
  if (!a || !e.attachmentId) return null
  const n = (k: string) => (typeof a[k] === 'number' ? (a[k] as number) : NaN)
  const [x, y, w, h] = ['x', 'y', 'w', 'h'].map(n)
  if ([x, y, w, h].some(Number.isNaN)) return null
  const sev = String(a.severity ?? 'MEDIUM').toUpperCase()
  return { imageId: e.attachmentId, label: String(a.label ?? e.citation ?? '이상 영역'), x, y, w, h, severity: sev === 'HIGH' || sev === 'LOW' ? sev : 'MEDIUM' }
}

/** agent_type 문자열에서 PCB/MOTOR/SW 추출 (예: "pcb_agent", "MOTOR") */
function agentOf(t: string): AgentType | null {
  const u = t.toUpperCase()
  if (u.includes('PCB')) return 'PCB'
  if (u.includes('MOTOR')) return 'MOTOR'
  if (u.includes('SW') || u.includes('SOFTWARE') || u.includes('LOG')) return 'SW'
  return null
}

/** 도구 실행 이력 → Agent 별 결과. output_payload 는 정해진 스키마가 없어 흔한 키(verdict/summary/findings/confidence)만 읽는다 */
export function toAgents(tools: BeToolExecution[], annotations: ImageAnnotation[] = []): AgentResult[] {
  const byAgent = new Map<AgentType, BeToolExecution[]>()
  for (const t of tools) {
    const a = agentOf(t.agent_type)
    if (a) byAgent.set(a, [...(byAgent.get(a) ?? []), t])
  }
  return [...byAgent.entries()].map(([agent, runs]) => {
    const last = runs[runs.length - 1]
    const out = (last.output_payload ?? {}) as Record<string, unknown>
    const v = String(out.verdict ?? '').toUpperCase()
    const verdict: AgentVerdict = (['NORMAL', 'ABNORMAL', 'SUSPICIOUS', 'SKIPPED'] as const).find((x) => x === v) ?? (last.status === 'FAILED' ? 'SKIPPED' : 'SUSPICIOUS')
    const dur = last.finished_at ? (new Date(last.finished_at).getTime() - new Date(last.started_at).getTime()) / 1000 : 0
    return {
      agent,
      verdict,
      summary: String(out.summary ?? last.error_message ?? `${last.tool_name} 실행 ${runs.length}회`),
      findings: Array.isArray(out.findings) ? out.findings.map(String) : runs.map((r) => `${r.tool_name} · ${r.status}`),
      confidence: typeof out.confidence === 'number' ? pct(out.confidence) : 0,
      annotations,
      sourceIds: [],
      durationSec: Math.max(0, Math.round(dur)),
    }
  })
}

export function toDiagnosis(
  task: BeTask,
  ctx: { parts: Part[]; tools?: BeToolExecution[]; urgency: Urgency; decision: Decision },
): Diagnosis | null {
  const res = task.result
  const candidates = task.candidates?.length ? task.candidates : (res?.candidates ?? [])
  if (!res && !candidates.length) return null
  const evidence = (task.evidence?.length ? task.evidence : res?.evidence) ?? []
  const recommended = (task.recommendedParts?.length ? task.recommendedParts : res?.recommendedParts) ?? []
  const sources = evidence.map(toSource)
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank)
  const annotations = evidence.map(toAnnotation).filter((x): x is ImageAnnotation => !!x)
  return {
    id: task.id,
    repairId: Number(task.case_id),
    version: task.input_revision,
    origin: 'AI',
    generatedAt: task.finished_at ?? task.updated_at,
    topCause: sorted[0]?.cause ?? res?.summary ?? '-',
    confidence: sorted[0] ? pct(sorted[0].confidence) : 0,
    urgency: ctx.urgency,
    candidates: sorted.map((c) => ({
      rank: c.rank,
      cause: c.cause,
      confidence: pct(c.confidence),
      evidence: c.explanation ? [c.explanation] : [],
      // 후보별 근거 연결 정보가 없어 1순위에만 전체 출처를 붙인다
      sourceIds: c.rank === sorted[0]?.rank ? sources.map((s) => s.id) : [],
    })),
    agents: toAgents(ctx.tools ?? [], annotations),
    errorCodes: [],
    similarCases: [],
    similarCaseCount: 0,
    inspectionSteps: [],
    repairMethod: splitSteps(res?.repairMethod),
    parts: recommended.map((p) => {
      const part = ctx.parts.find((x) => x.id === p.partId)
      return { partId: p.partId, partName: part?.name ?? `부품 #${p.partId}`, partNo: part?.partNo ?? '-', quantity: p.quantity, reason: res?.summary ?? '' }
    }),
    sources,
    technicianDecision: ctx.decision,
  }
}
