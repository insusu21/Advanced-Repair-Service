<script setup lang="ts">
/* =========================================================================
 * AI 진단 결과 화면 (서비스 핵심 화면) — '핵심 요약 + 펼쳐 보기'
 *  상단: 한눈에 보기(원인·AI 판단 점수·긴급도·승인 상태·권장 조치·필요 부품·판단 근거) + 처리 버튼
 *  세부: 접이식 섹션 — 원인 후보 · 부위별 분석 · 사진 이상 영역 · 에러코드 · 점검/수리 방법·부품 ·
 *        유사 사례 · 데이터 출처 · 처리 이력 (명세서 항목이라 삭제하지 않고 접어 둔다)
 *  처리: 진단 내용 확인 / 본사 검토 요청 / 진단 반려
 * ========================================================================= */
import { computed, nextTick, onMounted, reactive, ref, watchEffect } from 'vue'
import {
  CircleCheck, RotateCw, Building2, CircleX, FileCode2, History, ClipboardList,
  Package, ArrowRight, BookOpen, Layers, ListOrdered, ScanSearch, Cpu, Lock, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-vue-next'
import RepairFlowNav from '@/components/repair/RepairFlowNav.vue'
import RepairSummaryCard from '@/components/repair/RepairSummaryCard.vue'
import SameSerialHistory from '@/components/repair/SameSerialHistory.vue'
import DiagnosisGlanceCard, { type GlancePart } from '@/components/diagnosis/DiagnosisGlanceCard.vue'
import DiagnosisEvidenceCard from '@/components/diagnosis/DiagnosisEvidenceCard.vue'
import AgentAnalysisCard from '@/components/diagnosis/AgentAnalysisCard.vue'
import AnnotatedImage from '@/components/diagnosis/AnnotatedImage.vue'
import ApprovalHistoryTimeline from '@/components/review/ApprovalHistoryTimeline.vue'
import CollapsibleSection from '@/components/common/CollapsibleSection.vue'
import DataSourceList from '@/components/common/DataSourceList.vue'
import StateView from '@/components/common/StateView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import BaseModal from '@/components/common/BaseModal.vue'
import { useRepairPage } from '@/composables/useRepairPage'
import { provideCollapsibleGroup, writeOpen } from '@/composables/useCollapsibleGroup'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useOrderStore } from '@/stores/orders'
import { toErrorMessage } from '@/api'
import { FEATURES } from '@/api/features'
import { formatDate, formatRelative, reportTitle } from '@/utils/format'
import type { ImageAnnotation, RepairImage } from '@/types'

const { store, repair, diagnosis, versions, loading, diagLoading, error, submitting, reload } = useRepairPage({ diagnosis: true, live: true })
const auth = useAuthStore()
const toast = useToastStore()
const orders = useOrderStore()
const showAllCases = ref(false)

// 브라우저 탭에서도 시리얼이 아닌 수리 ID 로 구분되도록
watchEffect(() => {
  if (repair.value) document.title = `${reportTitle(repair.value)} · RobotCare AI`
})

/* ---------- 접이식 섹션 ---------- */
const { expandAll, collapseAll } = provideCollapsibleGroup('diagnosis')
/** 기본은 모두 접힘. 진단 확인 전에는 원인 후보만 펼침 (한 번 열고 닫으면 그 상태를 기억) */
const beforeDecision = computed(() => repair.value?.status === 'DIAGNOSIS_COMPLETED')
const sourcesKey = ref(0)
async function showSources() {
  // 출처 섹션을 펼친 상태로 다시 그린 뒤 그 위치로 이동
  writeOpen('diagnosis', 'sources', true)
  sourcesKey.value++
  await nextTick()
  document.getElementById('sec-sources')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ---------- 처리 권한 ---------- */
const isTech = computed(() => auth.role === 'TECHNICIAN')
const canDecide = computed(() => FEATURES.diagnosisDecision && isTech.value && repair.value?.status === 'DIAGNOSIS_COMPLETED')
const disabledReason = computed(() => {
  if (!FEATURES.diagnosisDecision) return '진단 확인·반려 처리는 아직 백엔드에서 지원하지 않습니다. (조회 전용)'
  if (!isTech.value) return '진단 확인은 담당 서비스센터 기사만 할 수 있습니다. (조회 전용)'
  if (repair.value?.status !== 'DIAGNOSIS_COMPLETED') return '이미 처리되었거나 진단 확인 단계가 아닙니다.'
  return undefined
})
const pending = computed(() => diagnosis.value?.technicianDecision.state === 'PENDING')

/* ---------- 처리 버튼 · 사유 모달 ---------- */
// [통합] '수정 의견 작성'(상태 변화 없음)·'추가 분석 요청'(재진단 API 없음) 버튼 삭제.
//        남은 3개는 모두 바로 보이게 두고 '더 보기' 메뉴는 없앰
type ActionKey = 'approve' | 'hq' | 'reject'
const ACTIONS: Record<ActionKey, { label: string; icon: unknown; btn: string; needsReason: boolean; reasonLabel: string; hint: string; placeholder: string }> = {
  approve: { label: '진단 내용 확인', icon: CircleCheck, btn: 'btn-success', needsReason: false, reasonLabel: '확인 메모 (선택)', hint: '이 진단을 기준으로 점검·수리를 진행합니다.', placeholder: '예) 하단 연결부 들뜸 육안 확인' },
  hq: { label: '본사 검토 요청', icon: Building2, btn: '', needsReason: true, reasonLabel: '본사 검토 요청 사유', hint: '본사 품질 담당자가 직접 진단합니다.', placeholder: '예) 사진으로 판단이 어려워 본사 확인이 필요합니다.' },
  reject: { label: '진단 반려', icon: CircleX, btn: 'btn-danger', needsReason: true, reasonLabel: '반려 사유', hint: 'AI 진단을 쓰지 않고 직접 점검합니다.', placeholder: '예) 실제 점검 결과 모터는 정상, 배터리 커넥터 산화 확인' },
}
const PRIMARY: ActionKey[] = ['approve', 'hq', 'reject']

const dlg = reactive({ open: false, key: 'approve' as ActionKey, text: '', error: '' })
function openAction(key: ActionKey) {
  Object.assign(dlg, { open: true, key, text: '', error: '' })
}
async function confirmAction() {
  const a = ACTIONS[dlg.key]
  const comment = dlg.text.trim()
  if (a.needsReason && comment.length < 2) {
    dlg.error = '사유를 입력해 주세요.'
    return
  }
  try {
    switch (dlg.key) {
      case 'approve':
        await store.decide({ target: 'DIAGNOSIS', action: 'APPROVE', comment, diagnosisVersion: diagnosis.value?.version })
        toast.success('진단 내용을 확인했습니다. 필요 부품을 확인해 주세요.')
        break
      case 'hq':
        await store.decide({ target: 'DIAGNOSIS', action: 'REQUEST_HQ_REVIEW', comment })
        toast.info('본사 품질 담당자에게 검토를 요청했습니다.')
        break
      case 'reject':
        await store.decide({ target: 'DIAGNOSIS', action: 'REJECT', comment })
        toast.warning('AI 진단을 반려했습니다. 직접 점검 후 수리 리포트를 작성해 주세요.')
        break
    }
    dlg.open = false
  } catch (e) {
    dlg.error = toErrorMessage(e)
  }
}

onMounted(() => void orders.fetchParts())

/* ---------- 요약 데이터 ---------- */
const agentOrder = { MOTOR: 0, PCB: 1 }
const agents = computed(() => [...(diagnosis.value?.agents ?? [])].sort((a, b) => agentOrder[a.agent] - agentOrder[b.agent]))
const cases = computed(() => (showAllCases.value ? diagnosis.value?.similarCases : diagnosis.value?.similarCases.slice(0, 3)) ?? [])

/** 필요 부품 1줄 + 재고 상태 (전체 창고 재고 합계 기준) */
const glanceParts = computed<GlancePart[]>(() =>
  (diagnosis.value?.parts ?? []).map((p) => {
    const part = orders.partById(p.partId)
    const total = part?.stocks.reduce((a, s) => a + s.quantity, 0)
    return { name: p.partName, quantity: p.quantity, inStock: total === undefined ? null : total >= p.quantity }
  }),
)

/** 사진 이상 영역: Agent 결과의 표시를 사진별로 모음 */
const annotatedImages = computed(() => {
  const byImage = new Map<string, ImageAnnotation[]>()
  for (const a of agents.value) for (const an of a.annotations) byImage.set(an.imageId, [...(byImage.get(an.imageId) ?? []), an])
  return [...byImage.entries()]
    .map(([id, anns]) => ({ image: repair.value?.images.find((i) => i.id === id), anns }))
    .filter((x): x is { image: RepairImage; anns: ImageAnnotation[] } => !!x.image)
})
const annotationCount = computed(() => annotatedImages.value.reduce((n, x) => n + x.anns.length, 0))

const VERDICT_WORD = { ABNORMAL: '이상', SUSPICIOUS: '의심', NORMAL: '정상', SKIPPED: '제외' } as const
const summaries = computed(() => {
  const d = diagnosis.value
  if (!d) return null
  const v = (k: keyof typeof VERDICT_WORD) => agents.value.filter((a) => a.verdict === k).length
  const steps = [d.inspectionSteps.length && `점검 ${d.inspectionSteps.length}단계`, d.repairMethod.length && `수리 ${d.repairMethod.length}단계`].filter(Boolean)
  const last = repair.value?.history[repair.value.history.length - 1]
  return {
    // 판단 점수는 확률이 아니라 후보끼리 비교한 점수
    candidates: d.candidates.map((c) => `${c.confidence}점`).join(' · '),
    agents: (Object.keys(VERDICT_WORD) as (keyof typeof VERDICT_WORD)[]).filter((k) => v(k)).map((k) => `${VERDICT_WORD[k]} ${v(k)}`).join(' · '),
    images: `표시 ${annotationCount.value}곳`,
    codes: d.errorCodes.map((e) => e.code).join(', '),
    steps: [...steps, d.parts.length && `부품 ${d.parts.length}종`].filter(Boolean).join(' · '),
    cases: `${d.similarCaseCount || d.similarCases.length}건`,
    sources: `${d.sources.length}개`,
    history: last ? `${last.actor} · ${last.comment ?? ''} (${formatRelative(last.at)})` : '',
  }
})
</script>

<template>
  <div class="page">
    <div v-if="loading && !repair" class="stack"><SkeletonBlock :lines="2" :height="60" /><SkeletonBlock :lines="8" :height="36" /></div>
    <StateView v-else-if="error && !repair" state="error" :message="error" @retry="reload" />

    <template v-else-if="repair">
      <RepairFlowNav :repair="repair" />
      <div class="page-head">
        <div>
          <h1>{{ reportTitle(repair) }}</h1>
          <p class="sub">시리얼 <span class="mono">{{ repair.product.serialNumber }}</span> · 접수번호 <span class="mono">{{ repair.receiptNo }}</span></p>
        </div>
      </div>
      <RepairSummaryCard :repair="repair" compact />
      <SameSerialHistory :serial="repair.product.serialNumber" :exclude-id="repair.id" />

      <div v-if="diagLoading && !diagnosis" class="card card-pad"><SkeletonBlock :lines="6" :height="28" /></div>

      <!-- 진단 없음 -->
      <section v-else-if="!diagnosis" class="card">
        <StateView
          :state="repair.status === 'MANUAL_REVIEW' ? 'empty' : 'loading'"
          :title="repair.status === 'MANUAL_REVIEW' ? 'AI 진단 없이 본사 수동 검토 중입니다' : '아직 AI 진단이 완료되지 않았습니다'"
          :message="repair.status === 'MANUAL_REVIEW' ? '품질 담당자의 수동 진단 회신을 기다리고 있습니다.' : '분석이 끝나면 이 화면에 AI 초안이 표시됩니다.'"
        >
          <RouterLink :to="`/repairs/${repair.id}/progress`" class="btn">진행 상황 보기</RouterLink>
        </StateView>
      </section>

      <template v-else-if="summaries">
        <!-- 재분석 중 안내 -->
        <div v-if="['QUEUED', 'ANALYZING'].includes(repair.status)" class="callout tone-ai">
          <RotateCw :size="20" class="spin" />
          <div class="grow"><strong>재분석이 진행 중입니다.</strong> 아래는 이전 버전(v{{ diagnosis.version }}) 결과입니다.</div>
          <RouterLink :to="`/repairs/${repair.id}/progress`" class="btn btn-sm">진행 보기</RouterLink>
        </div>

        <!-- [1] 한눈에 보기 -->
        <DiagnosisGlanceCard :diagnosis="diagnosis" :version-count="versions.length" :parts="glanceParts" @show-sources="showSources" />

        <!-- 처리 버튼 (승인 대기 중일 때만) -->
        <div v-if="pending" class="actions card" role="group" aria-label="진단 결과 처리">
          <template v-if="canDecide">
            <button v-for="k in PRIMARY" :key="k" type="button" class="btn btn-lg" :class="ACTIONS[k].btn" :disabled="submitting" @click="openAction(k)">
              <component :is="ACTIONS[k].icon" :size="20" /> {{ ACTIONS[k].label }}
            </button>
          </template>
          <p v-else class="locked"><Lock :size="18" /> {{ disabledReason }}</p>
        </div>

        <!-- 확인 후 다음 단계 -->
        <div v-if="diagnosis.technicianDecision.state === 'APPROVED' && isTech && repair.status === 'TECHNICIAN_REVIEW'" class="callout tone-success next">
          <CircleCheck :size="24" />
          <div class="grow"><strong>다음 단계</strong> 필요 부품의 재고를 확인하고, 수리를 마친 뒤 실제 결과를 입력해 주세요.</div>
          <RouterLink :to="`/repairs/${repair.id}/parts`" class="btn btn-lg"><Package :size="20" /> 부품 확인 · 발주</RouterLink>
          <RouterLink :to="`/repairs/${repair.id}/review`" class="btn btn-primary btn-lg">수리 리포트 작성 <ArrowRight :size="20" /></RouterLink>
        </div>

        <!-- [2] 세부 내용 (접이식) — 데이터가 없는 섹션은 숨김 -->
        <div class="row between details-head">
          <h2 class="sec">세부 내용</h2>
          <div class="row">
            <button type="button" class="btn btn-sm btn-ghost" @click="expandAll"><ChevronsUpDown :size="16" /> 모두 펼치기</button>
            <button type="button" class="btn btn-sm btn-ghost" @click="collapseAll"><ChevronsDownUp :size="16" /> 모두 접기</button>
          </div>
        </div>

        <div class="stack sections">
          <CollapsibleSection v-if="diagnosis.candidates.length" id="candidates" title="원인 후보 순위" :summary="summaries.candidates" :icon="ListOrdered" :default-open="beforeDecision">
            <DiagnosisEvidenceCard :candidates="diagnosis.candidates" :sources="diagnosis.sources" bare />
          </CollapsibleSection>

          <CollapsibleSection v-if="agents.length" id="agents" title="부위별 분석 (PCB · 기계)" :summary="summaries.agents" :icon="Cpu">
            <div class="agents">
              <AgentAnalysisCard v-for="a in agents" :key="a.agent" :result="a" :images="repair.images" :sources="diagnosis.sources" hide-image />
            </div>
          </CollapsibleSection>

          <CollapsibleSection v-if="annotatedImages.length" id="images" title="사진 이상 영역" :summary="summaries.images" :icon="ScanSearch">
            <div class="images">
              <AnnotatedImage v-for="x in annotatedImages" :key="x.image.id" :image="x.image" :annotations="x.anns" :title="`${x.image.name} · 이상 영역`" />
            </div>
          </CollapsibleSection>

          <CollapsibleSection v-if="diagnosis.errorCodes.length" id="codes" title="에러 코드 분석" :summary="summaries.codes" :icon="FileCode2">
            <div class="stack">
              <div v-for="ec in diagnosis.errorCodes" :key="ec.code" class="ec">
                <span class="badge tone-info mono code">{{ ec.code }}</span>
                <div class="stack" style="gap: 6px">
                  <strong>{{ ec.meaning }}</strong>
                  <p>{{ ec.interpretation }}</p>
                  <div class="row"><span class="faint">관련 부품</span><span v-for="p in ec.relatedParts" :key="p" class="badge tone-neutral">{{ p }}</span></div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            v-if="diagnosis.inspectionSteps.length || diagnosis.repairMethod.length || diagnosis.parts.length"
            id="steps"
            title="점검 순서 · 수리 방법"
            :summary="summaries.steps"
            :icon="ClipboardList"
          >
            <div class="steps-grid">
              <div v-if="diagnosis.inspectionSteps.length">
                <h4 class="sub-h">권장 점검 순서</h4>
                <ol class="steps"><li v-for="s in diagnosis.inspectionSteps" :key="s">{{ s }}</li></ol>
              </div>
              <div v-if="diagnosis.repairMethod.length">
                <h4 class="sub-h">권장 수리 방법</h4>
                <ol class="steps"><li v-for="s in diagnosis.repairMethod" :key="s">{{ s }}</li></ol>
              </div>
            </div>
            <div v-if="diagnosis.parts.length" class="parts-block">
              <h4 class="sub-h">필요한 교체 부품</h4>
              <div class="parts">
                <div v-for="(p, i) in diagnosis.parts" :key="p.partId" class="part">
                  <div class="row between">
                    <strong>{{ p.partName }} <span class="mono faint">{{ p.partNo }}</span></strong>
                    <span class="row">
                      <span class="badge tone-neutral">{{ p.quantity }}개</span>
                      <span v-if="glanceParts[i]?.inStock === true" class="badge tone-success">재고 있음</span>
                      <span v-else-if="glanceParts[i]?.inStock === false" class="badge tone-warning">발주 필요</span>
                    </span>
                  </div>
                  <p v-if="p.reason" class="faint">{{ p.reason }}</p>
                </div>
              </div>
              <RouterLink v-if="diagnosis.technicianDecision.state === 'APPROVED'" :to="`/repairs/${repair.id}/parts`" class="btn">재고 · 발주 확인 <ArrowRight :size="18" /></RouterLink>
              <p v-else class="faint">진단을 확인하면 재고 조회와 발주 요청을 할 수 있습니다.</p>
            </div>
          </CollapsibleSection>

          <CollapsibleSection v-if="diagnosis.similarCases.length" id="cases" title="유사 수리 사례" :summary="summaries.cases" :icon="Layers">
            <ul class="cases">
              <li v-for="c in cases" :key="c.receiptNo">
                <div class="row between">
                  <span class="mono">{{ c.receiptNo }}</span>
                  <span class="badge tone-ai">유사도 {{ c.similarity }}%</span>
                </div>
                <strong>{{ c.cause }}</strong>
                <span class="faint">{{ c.model }} · {{ c.resolution }} · {{ formatDate(c.closedAt) }}</span>
              </li>
            </ul>
            <button v-if="diagnosis.similarCases.length > 3" class="btn btn-ghost btn-block" type="button" @click="showAllCases = !showAllCases">
              {{ showAllCases ? '접기' : `더 보기 (${diagnosis.similarCases.length - 3})` }}
            </button>
          </CollapsibleSection>

          <div v-if="diagnosis.sources.length" id="sec-sources" class="anchor">
            <CollapsibleSection :key="sourcesKey" id="sources" title="참고 매뉴얼 · 데이터 출처" :summary="summaries.sources" :icon="BookOpen">
              <DataSourceList :sources="diagnosis.sources" />
            </CollapsibleSection>
          </div>

          <CollapsibleSection v-if="repair.history.length || versions.length > 1" id="history" title="처리 이력" :summary="summaries.history" :icon="History">
            <div v-if="versions.length > 1" class="versions">
              <h4 class="sub-h">이전 진단 버전 ({{ versions.length - 1 }})</h4>
              <ul>
                <li v-for="v in versions.slice(0, -1).reverse()" :key="v.id" class="row between">
                  <span><b>v{{ v.version }}</b> · {{ v.topCause }} (판단 점수 {{ v.confidence }}점)</span>
                  <span class="faint">{{ v.technicianDecision.state === 'REANALYSIS_REQUESTED' ? `재분석 요청: ${v.technicianDecision.comment}` : v.technicianDecision.state }}</span>
                </li>
              </ul>
            </div>
            <ApprovalHistoryTimeline :records="repair.history" />
          </CollapsibleSection>
        </div>
      </template>
    </template>

    <!-- 처리 확인 · 사유 입력 모달 -->
    <BaseModal :open="dlg.open" :title="ACTIONS[dlg.key].label" :width="560" @close="dlg.open = false">
      <div class="stack">
        <p class="muted">{{ ACTIONS[dlg.key].hint }}</p>
        <p v-if="diagnosis" class="dlg-sugg"><b>AI 제안</b> {{ diagnosis.topCause }} (판단 점수 {{ diagnosis.confidence }}점)<template v-if="diagnosis.repairMethod[0]"> → {{ diagnosis.repairMethod[0] }}</template></p>
        <div class="field">
          <label for="dlg-text" :class="{ req: ACTIONS[dlg.key].needsReason }">{{ ACTIONS[dlg.key].reasonLabel }}</label>
          <textarea id="dlg-text" v-model="dlg.text" class="textarea" :class="{ invalid: dlg.error }" :placeholder="ACTIONS[dlg.key].placeholder" maxlength="1000" :aria-invalid="!!dlg.error" @input="dlg.error = ''" />
          <p v-if="dlg.error" class="error-text" role="alert">{{ dlg.error }}</p>
        </div>
      </div>
      <template #footer>
        <button class="btn" type="button" :disabled="submitting" @click="dlg.open = false">취소</button>
        <button class="btn" :class="ACTIONS[dlg.key].btn || 'btn-primary'" type="button" :disabled="submitting" @click="confirmAction">
          <component :is="ACTIONS[dlg.key].icon" :size="18" /> {{ submitting ? '처리 중…' : ACTIONS[dlg.key].label }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.grow {
  flex: 1 1 280px;
}
.next {
  align-items: center;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}
.locked {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-weight: 600;
}
.details-head {
  margin-top: 4px;
}
.sec {
  font-size: var(--fs-lg);
}
.sections {
  gap: 10px;
}
.agents {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
.images {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}
.ec {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
}
.code {
  font-size: var(--fs-lg);
  padding: 6px 12px;
}
.sub-h {
  font-size: var(--fs-md);
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--text-2);
}
.steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
.steps {
  margin: 0;
  padding-left: 28px;
  display: grid;
  gap: 8px;
}
.steps li::marker {
  font-weight: 800;
  color: var(--ai);
}
.parts-block {
  display: grid;
  gap: 10px;
  margin-top: 16px;
  justify-items: start;
}
.parts {
  display: grid;
  gap: 8px;
  width: 100%;
}
.part {
  display: grid;
  gap: 4px;
  padding: 10px 14px;
  border: 1px dashed var(--ai-border);
  border-radius: var(--radius);
  background: var(--ai-bg);
}
.cases {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cases li {
  display: grid;
  gap: 2px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.cases li:last-child {
  border-bottom: 0;
}
.anchor {
  scroll-margin-top: calc(var(--topbar-h) + 16px);
}
.versions {
  margin-bottom: 16px;
}
.versions ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.dlg-sugg {
  padding: 10px 14px;
  border: 1px dashed var(--ai-border);
  border-radius: var(--radius);
  background: var(--ai-bg);
}
@media (max-width: 640px) {
  .actions .btn {
    flex: 1 1 100%;
    justify-content: center;
  }
}
</style>
