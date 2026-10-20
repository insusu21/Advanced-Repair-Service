<script setup lang="ts">
/* =========================================================================
 * AI 진단 결과 화면 (서비스 핵심 화면)
 *  상단: 가장 가능성 높은 원인 · 신뢰도 · 승인 상태 · 긴급도 · 분석 완료 시각
 *  세부: 원인 후보 · Agent 별 결과 · 사진 이상 영역 · 에러코드 · 유사 사례 · 출처 · 점검 순서 · 수리 방법 · 부품
 *  하단: 진단 내용 확인 / 수정 의견 작성 / 추가 분석 요청 / 본사 검토 요청 / 진단 반려
 * ========================================================================= */
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import {
  CircleCheck, MessageSquarePlus, RotateCw, Building2, CircleX, FileCode2, History, ClipboardList, Wrench,
  Package, ArrowRight, BookOpen, Layers, Sparkles, ChevronDown,
} from 'lucide-vue-next'
import RepairFlowNav from '@/components/repair/RepairFlowNav.vue'
import RepairSummaryCard from '@/components/repair/RepairSummaryCard.vue'
import SameSerialHistory from '@/components/repair/SameSerialHistory.vue'
import DiagnosisSummaryCard from '@/components/diagnosis/DiagnosisSummaryCard.vue'
import DiagnosisEvidenceCard from '@/components/diagnosis/DiagnosisEvidenceCard.vue'
import AgentAnalysisCard from '@/components/diagnosis/AgentAnalysisCard.vue'
import HumanApprovalCard from '@/components/diagnosis/HumanApprovalCard.vue'
import ApprovalHistoryTimeline from '@/components/review/ApprovalHistoryTimeline.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import DataSourceList from '@/components/common/DataSourceList.vue'
import StateView from '@/components/common/StateView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useRepairPage } from '@/composables/useRepairPage'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { toErrorMessage } from '@/api'
import { formatDate, reportTitle } from '@/utils/format'
import type { ApprovalAction } from '@/types/approval'

const { store, repair, diagnosis, versions, loading, diagLoading, error, submitting, reload } = useRepairPage({ diagnosis: true, live: true })
const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()
const showAllCases = ref(false)

// 브라우저 탭에서도 시리얼이 아닌 수리 ID 로 구분되도록
watchEffect(() => {
  if (repair.value) document.title = `${reportTitle(repair.value)} · RobotCare AI`
})
const approvalEl = ref<HTMLElement | null>(null)

const isTech = computed(() => auth.role === 'TECHNICIAN')
const canDecide = computed(() => isTech.value && repair.value?.status === 'DIAGNOSIS_COMPLETED')
const disabledReason = computed(() => {
  if (!isTech.value) return '진단 확인은 담당 서비스센터 기사만 할 수 있습니다. (조회 전용)'
  if (repair.value?.status !== 'DIAGNOSIS_COMPLETED') return '이미 처리되었거나 진단 확인 단계가 아닙니다.'
  return undefined
})

const ACTIONS: ApprovalAction[] = [
  { key: 'approve', label: '진단 내용 확인', variant: 'success', icon: CircleCheck, hint: '이 진단을 기준으로 점검·수리를 진행합니다' },
  { key: 'comment', label: '수정 의견 작성', variant: 'default', icon: MessageSquarePlus, requiresComment: true, hint: '상태는 그대로 두고 의견만 이력에 남깁니다' },
  { key: 'reanalyze', label: '추가 분석 요청', variant: 'ai', icon: RotateCw, requiresComment: true },
  { key: 'hq', label: '본사 검토 요청', variant: 'default', icon: Building2, requiresComment: true },
  { key: 'reject', label: '진단 반려', variant: 'danger', icon: CircleX, requiresComment: true, hint: 'AI 진단을 쓰지 않고 직접 점검합니다' },
]

const top = computed(() => diagnosis.value?.candidates[0])
const agentOrder = { MOTOR: 0, PCB: 1, SW: 2 }
const agents = computed(() => [...(diagnosis.value?.agents ?? [])].sort((a, b) => agentOrder[a.agent] - agentOrder[b.agent]))
const cases = computed(() => (showAllCases.value ? diagnosis.value?.similarCases : diagnosis.value?.similarCases.slice(0, 3)) ?? [])

async function onAction(key: string, comment: string) {
  try {
    switch (key) {
      case 'approve':
        await store.decide({ target: 'DIAGNOSIS', action: 'APPROVE', comment, diagnosisVersion: diagnosis.value?.version })
        toast.success('진단 내용을 확인했습니다. 필요 부품을 확인해 주세요.')
        break
      case 'comment':
        await store.decide({ target: 'DIAGNOSIS', action: 'COMMENT', comment })
        toast.info('수정 의견을 이력에 남겼습니다.')
        break
      case 'reanalyze':
        await store.requestReanalysis({ reason: comment })
        toast.info('추가 분석을 요청했습니다. 진행 화면으로 이동합니다.')
        void router.push(`/repairs/${repair.value!.id}/progress`)
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
  } catch (e) {
    toast.error(toErrorMessage(e))
  }
}
const scrollToApproval = () => approvalEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

      <template v-else>
        <!-- 재분석 중 안내 -->
        <div v-if="['QUEUED', 'ANALYZING'].includes(repair.status)" class="callout tone-ai">
          <RotateCw :size="20" class="spin" />
          <div class="grow"><strong>재분석이 진행 중입니다.</strong> 아래는 이전 버전(v{{ diagnosis.version }}) 결과입니다.</div>
          <RouterLink :to="`/repairs/${repair.id}/progress`" class="btn btn-sm">진행 보기</RouterLink>
        </div>

        <DiagnosisSummaryCard :diagnosis="diagnosis" :version-count="versions.length" />

        <!-- 확인 후 다음 단계 -->
        <div v-if="diagnosis.technicianDecision.state === 'APPROVED' && isTech && repair.status === 'TECHNICIAN_REVIEW'" class="callout tone-success next">
          <CircleCheck :size="24" />
          <div class="grow"><strong>다음 단계</strong> 필요 부품의 재고를 확인하고, 수리를 마친 뒤 실제 결과를 입력해 주세요.</div>
          <RouterLink :to="`/repairs/${repair.id}/parts`" class="btn btn-lg"><Package :size="20" /> 부품 확인 · 발주</RouterLink>
          <RouterLink :to="`/repairs/${repair.id}/review`" class="btn btn-primary btn-lg">수리 리포트 작성 <ArrowRight :size="20" /></RouterLink>
        </div>
        <div v-else-if="canDecide" class="sticky-cta">
          <span><Sparkles :size="18" /> 이 진단은 아직 <b>AI 초안</b>입니다. 내용을 확인한 뒤 처리해 주세요.</span>
          <button type="button" class="btn btn-primary" @click="scrollToApproval">처리하러 가기 <ChevronDown :size="18" /></button>
        </div>

        <div class="layout">
          <div class="main stack">
            <DiagnosisEvidenceCard :candidates="diagnosis.candidates" :sources="diagnosis.sources" />

            <section>
              <div class="row between sec-h">
                <h3 class="sec">PCB · 모터 · SW 개별 분석 결과</h3>
                <AiBadge compact />
              </div>
              <div class="agents">
                <AgentAnalysisCard v-for="a in agents" :key="a.agent" :result="a" :images="repair.images" :sources="diagnosis.sources" />
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <h3><FileCode2 :size="20" /> 에러 코드 분석</h3>
                <AiBadge compact />
              </div>
              <div class="card-body stack">
                <p v-if="!diagnosis.errorCodes.length" class="faint">입력된 에러 코드가 없습니다.</p>
                <div v-for="ec in diagnosis.errorCodes" :key="ec.code" class="ec">
                  <span class="badge tone-info mono code">{{ ec.code }}</span>
                  <div class="stack" style="gap: 6px">
                    <strong>{{ ec.meaning }}</strong>
                    <p>{{ ec.interpretation }}</p>
                    <div class="row"><span class="faint">관련 부품</span><span v-for="p in ec.relatedParts" :key="p" class="badge tone-neutral">{{ p }}</span></div>
                  </div>
                </div>
              </div>
            </section>

            <div class="grid-2">
              <section class="card">
                <div class="card-head">
                  <h3><ClipboardList :size="20" /> 권장 점검 순서</h3>
                  <AiBadge compact />
                </div>
                <ol class="steps card-body">
                  <li v-for="s in diagnosis.inspectionSteps" :key="s">{{ s }}</li>
                </ol>
              </section>
              <section class="card">
                <div class="card-head">
                  <h3><Wrench :size="20" /> 권장 수리 방법</h3>
                  <AiBadge compact />
                </div>
                <ol class="steps card-body">
                  <li v-for="s in diagnosis.repairMethod" :key="s">{{ s }}</li>
                </ol>
              </section>
            </div>
          </div>

          <aside class="side stack">
            <section class="card">
              <div class="card-head">
                <h3><Package :size="20" /> 필요한 교체 부품</h3>
                <AiBadge compact />
              </div>
              <div class="card-body stack">
                <div v-for="p in diagnosis.parts" :key="p.partId" class="part">
                  <div class="row between">
                    <strong>{{ p.partName }}</strong>
                    <span class="badge tone-neutral">{{ p.quantity }}개</span>
                  </div>
                  <span class="mono faint">{{ p.partNo }}</span>
                  <p class="faint">{{ p.reason }}</p>
                </div>
                <RouterLink v-if="diagnosis.technicianDecision.state === 'APPROVED'" :to="`/repairs/${repair.id}/parts`" class="btn btn-block">재고 · 발주 확인 <ArrowRight :size="18" /></RouterLink>
                <p v-else class="faint">진단을 확인하면 재고 조회와 발주 요청을 할 수 있습니다.</p>
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <h3><Layers :size="20" /> 유사 수리 사례</h3>
                <span class="badge tone-neutral">{{ diagnosis.similarCaseCount }}건</span>
              </div>
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
            </section>

            <section class="card">
              <div class="card-head"><h3><BookOpen :size="20" /> 참고 매뉴얼 · 데이터 출처</h3></div>
              <div class="card-body"><DataSourceList :sources="diagnosis.sources" /></div>
            </section>
          </aside>
        </div>

        <!-- 하단 처리 영역 -->
        <div ref="approvalEl" class="anchor">
          <HumanApprovalCard
            title="진단 결과 처리"
            :suggestion="`${diagnosis.topCause} → ${diagnosis.repairMethod[0] ?? ''}`"
            :evidence="top?.evidence ?? []"
            :confidence="diagnosis.confidence"
            :sources="diagnosis.sources"
            :source-ids="top?.sourceIds"
            :decision="diagnosis.technicianDecision"
            :actions="ACTIONS"
            :can-decide="canDecide"
            :disabled-reason="disabledReason"
            :busy="submitting"
            comment-label="기사 의견 (수정 의견 · 요청 · 반려 사유)"
            @action="onAction"
          />
        </div>

        <details v-if="versions.length > 1" class="card versions">
          <summary class="card-head"><h3><History :size="20" /> 이전 진단 버전 ({{ versions.length - 1 }})</h3></summary>
          <ul class="card-body stack">
            <li v-for="v in versions.slice(0, -1).reverse()" :key="v.id" class="row between">
              <span><b>v{{ v.version }}</b> · {{ v.topCause }} ({{ v.confidence }}%)</span>
              <span class="faint">{{ v.technicianDecision.state === 'REANALYSIS_REQUESTED' ? `재분석 요청: ${v.technicianDecision.comment}` : v.technicianDecision.state }}</span>
            </li>
          </ul>
        </details>

        <section class="card">
          <div class="card-head"><h3><History :size="20" /> 처리 이력</h3></div>
          <div class="card-body"><ApprovalHistoryTimeline :records="repair.history" /></div>
        </section>
      </template>
    </template>
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
.sticky-cta {
  position: sticky;
  top: calc(var(--topbar-h) + 8px);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 10px 18px;
  border-radius: var(--radius-lg);
  background: var(--ai);
  color: #fff;
  box-shadow: var(--shadow);
  flex-wrap: wrap;
}
.sticky-cta span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.sticky-cta .btn-primary {
  background: #fff;
  color: var(--ai);
  border-color: #fff;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: start;
}
.sec-h {
  margin-bottom: 10px;
}
.sec {
  font-size: var(--fs-lg);
}
.agents {
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
.steps {
  margin: 0;
  padding-left: 44px;
  display: grid;
  gap: 8px;
}
.steps li {
  padding-left: 4px;
}
.steps li::marker {
  font-weight: 800;
  color: var(--ai);
}
.part {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px dashed var(--ai-border);
  border-radius: var(--radius);
  background: var(--ai-bg);
}
.cases {
  list-style: none;
  margin: 0;
  padding: 6px 22px 6px;
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
.versions summary {
  cursor: pointer;
  list-style: none;
}
.versions ul {
  list-style: none;
  margin: 0;
}
@media (max-width: 1180px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
