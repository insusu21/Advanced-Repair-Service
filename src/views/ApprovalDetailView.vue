<script setup lang="ts">
/* 본사 승인 검토 — AI 진단 vs 기사 확인 결과 비교, 차이 강조, 승인·반려·수정 요청·재분석 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { CircleCheck, CircleX, MessageSquareWarning, RotateCw, Send, History, GitCompare, Images, Hand, ArrowLeft } from 'lucide-vue-next'
import RepairSummaryCard from '@/components/repair/RepairSummaryCard.vue'
import HumanApprovalCard from '@/components/diagnosis/HumanApprovalCard.vue'
import ApprovalHistoryTimeline from '@/components/review/ApprovalHistoryTimeline.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import StateView from '@/components/common/StateView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useRepairPage } from '@/composables/useRepairPage'
import { useToastStore } from '@/stores/toast'
import { toErrorMessage } from '@/api'
import type { ApprovalAction } from '@/types/approval'
import type { DataSource, Decision } from '@/types'

const { store, repair, diagnosis, loading, error, submitting, photoRequests, reload } = useRepairPage({ diagnosis: true })
const toast = useToastStore()
const router = useRouter()

const review = computed(() => repair.value?.technicianReview)
const isManual = computed(() => repair.value?.status === 'MANUAL_REVIEW')

/* AI vs 기사 비교 행 */
const rows = computed(() => {
  const d = diagnosis.value
  const r = review.value
  if (!r) return []
  const aiParts = d?.parts.map((p) => `${p.partName} × ${p.quantity}`).join(', ') || '없음'
  const realParts = r.replacedParts.map((p) => `${p.partName} × ${p.quantity}`).join(', ') || '없음'
  const norm = (s: string) => s.replace(/\s|\(.*?\)/g, '')
  return [
    { k: '고장 원인', ai: d?.topCause ?? 'AI 진단 없음', human: r.actualCause, diff: !d || !norm(r.actualCause).includes(norm(d.topCause)) },
    { k: '교체 부품', ai: aiParts, human: realParts, diff: norm(aiParts) !== norm(realParts) },
    { k: '수리 방법', ai: d?.repairMethod[0] ?? '-', human: r.repairMethod, diff: r.aiMatch !== 'MATCH' },
  ]
})
const diffCount = computed(() => rows.value.filter((x) => x.diff).length)

const REVIEW_ACTIONS: ApprovalAction[] = [
  { key: 'approve', label: '승인 · DB 반영', variant: 'success', icon: CircleCheck },
  { key: 'change', label: '수정 요청', variant: 'default', icon: MessageSquareWarning, requiresComment: true },
  { key: 'reanalyze', label: '재분석 요청', variant: 'ai', icon: RotateCw, requiresComment: true },
  { key: 'reject', label: '반려', variant: 'danger', icon: CircleX, requiresComment: true },
]
const MANUAL_ACTIONS: ApprovalAction[] = [
  { key: 'return', label: '수동 진단 회신 (기사에게)', variant: 'primary', icon: Send, requiresComment: true },
  { key: 'reanalyze', label: '재분석 요청', variant: 'ai', icon: RotateCw, requiresComment: true },
]

const decision = computed<Decision>(() => (isManual.value ? { state: 'PENDING' } : (review.value?.hqDecision ?? { state: 'PENDING' })))
const sources = computed<DataSource[]>(() => [
  ...(diagnosis.value?.sources ?? []),
  ...(review.value ? [{ id: 'TECH', type: 'IMAGE' as const, title: `기사 점검 결과 · 사진 ${review.value.afterImages.length + review.value.beforeImages.length}장`, ref: `${review.value.submittedBy} 제출` }] : []),
])
const suggestion = computed(() =>
  isManual.value
    ? diagnosis.value
      ? `AI 초안: ${diagnosis.value.topCause} (${diagnosis.value.confidence}%) — 기사가 본사 검토 요청`
      : 'AI 판독 불가 — 사진 추가 요청 한도 초과 또는 분석 실패'
    : `실제 원인 "${review.value?.actualCause}" 를 고장 DB 에 등록`,
)
const evidence = computed(() => {
  if (isManual.value) {
    const req = [...(repair.value?.history ?? [])].reverse().find((h) => h.action === 'HQ_REVIEW_REQUESTED' || h.target === 'PHOTO')
    return [req?.comment ?? '검토 요청 사유 없음', `추가 사진 요청 ${repair.value?.photoRequestCount ?? 0}회`, ...(diagnosis.value?.candidates[0]?.evidence ?? [])]
  }
  return [
    `기사 판단: AI 진단 ${{ MATCH: '일치', PARTIAL: '일부 일치', MISMATCH: '불일치' }[review.value?.aiMatch ?? 'MATCH']}`,
    ...(diagnosis.value?.candidates[0]?.evidence.slice(0, 2) ?? []),
    `비교 항목 중 차이 ${diffCount.value}건`,
  ]
})

async function onAction(key: string, comment: string) {
  try {
    switch (key) {
      case 'approve':
        await store.decide({ target: 'TECH_REVIEW', action: 'APPROVE', comment })
        toast.success('승인했습니다. 고장 DB 와 품질 대시보드에 반영됩니다.')
        break
      case 'change':
        await store.decide({ target: 'TECH_REVIEW', action: 'REQUEST_CHANGE', comment })
        toast.info('기사에게 수정을 요청했습니다.')
        break
      case 'reject':
        await store.decide({ target: 'TECH_REVIEW', action: 'REJECT', comment })
        toast.warning('반려했습니다. 고장 DB 에 반영되지 않습니다.')
        break
      case 'reanalyze':
        await store.requestReanalysis({ reason: comment })
        toast.info('AI 재분석을 요청했습니다.')
        break
      case 'return':
        await store.decide({ target: 'MANUAL_REVIEW', action: 'RETURN_TO_TECHNICIAN', comment })
        toast.success('기사에게 수동 진단 결과를 회신했습니다.')
        break
    }
    if (key !== 'approve') void router.push('/approvals')
  } catch (e) {
    toast.error(toErrorMessage(e))
  }
}
</script>

<template>
  <div class="page">
    <RouterLink to="/approvals" class="btn btn-ghost back"><ArrowLeft :size="18" /> 승인 대기 목록</RouterLink>
    <div v-if="loading && !repair" class="stack"><SkeletonBlock :lines="2" :height="60" /><SkeletonBlock :lines="8" :height="36" /></div>
    <StateView v-else-if="error && !repair" state="error" :message="error" @retry="reload" />

    <template v-else-if="repair">
      <RepairSummaryCard :repair="repair" />

      <div v-if="isManual" class="callout tone-danger">
        <Hand :size="22" />
        <div><strong>수동 검토 요청 건입니다.</strong> AI 결과만으로 판단하기 어려워 품질 담당자의 직접 진단이 필요합니다. 사진과 이력을 확인한 뒤 기사에게 진단 내용을 회신해 주세요.</div>
      </div>

      <!-- 비교 -->
      <section v-if="review" class="card">
        <div class="card-head">
          <h2><GitCompare :size="22" /> AI 진단 vs 기사 확인 결과</h2>
          <span class="badge" :class="diffCount ? 'tone-danger' : 'tone-success'">
            <component :is="diffCount ? CircleX : CircleCheck" :size="15" /> 차이 {{ diffCount }}건
          </span>
        </div>
        <div class="table-wrap">
          <table class="table cmp">
            <thead>
              <tr>
                <th scope="col">항목</th>
                <th scope="col"><AiBadge compact label="AI 진단 (초안)" /></th>
                <th scope="col"><AiBadge kind="human" label="기사 확인 (실제)" /></th>
                <th scope="col">비교</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.k" :class="{ diff: r.diff }">
                <th scope="row">{{ r.k }}</th>
                <td class="ai">{{ r.ai }}</td>
                <td class="hu">{{ r.human }}</td>
                <td>
                  <span v-if="r.diff" class="badge tone-danger"><CircleX :size="14" /> 다름</span>
                  <span v-else class="badge tone-success"><CircleCheck :size="14" /> 같음</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card-body">
          <p class="lbl">기사 코멘트</p>
          <blockquote class="quote">{{ review.comment || '코멘트 없음' }}</blockquote>
        </div>
      </section>

      <!-- 사진 -->
      <section class="card">
        <div class="card-head"><h3><Images :size="20" /> 사진</h3></div>
        <div class="card-body photos">
          <figure v-for="img in [...repair.images, ...(review?.beforeImages ?? []), ...(review?.afterImages ?? [])]" :key="img.id">
            <img :src="img.url" :alt="img.kind" loading="lazy" />
            <figcaption class="faint">{{ { PRODUCT: '제품 전체', MOTOR: '모터', PCB: 'PCB', ADDITIONAL: `추가${img.note ? ` · ${img.note}` : ''}`, BEFORE: '수리 전', AFTER: '수리 후' }[img.kind] }}</figcaption>
          </figure>
        </div>
        <div v-if="isManual && photoRequests.length" class="card-body">
          <p class="lbl">AI 추가 사진 요청 이력</p>
          <ul>
            <li v-for="p in photoRequests" :key="p.id">{{ p.requestNo }}회차 · {{ p.target }} — {{ p.reason }} <span class="faint">({{ p.resolved ? '등록됨' : '미등록' }})</span></li>
          </ul>
        </div>
      </section>

      <HumanApprovalCard
        :title="isManual ? '수동 검토 처리' : '수리 결과 승인'"
        :suggestion="suggestion"
        :evidence="evidence"
        :confidence="diagnosis?.confidence"
        :sources="sources"
        :decision="decision"
        :actions="isManual ? MANUAL_ACTIONS : REVIEW_ACTIONS"
        :can-decide="isManual || repair.status === 'HQ_APPROVAL'"
        disabled-reason="이미 처리된 건입니다."
        :busy="submitting"
        :comment-label="isManual ? '수동 진단 내용 (기사에게 전달)' : '승인 의견 · 수정 요청 · 반려 사유'"
        :comment-placeholder="isManual ? '예) 모터 하단 연결부 균열 확인됨. 모터 어셈블리(RM-MT-103) 교체 후 결과 입력 바랍니다.' : '반려·수정 요청 시 사유는 필수입니다.'"
        @action="onAction"
      />

      <section class="card">
        <div class="card-head"><h3><History :size="20" /> 승인 이력</h3></div>
        <div class="card-body"><ApprovalHistoryTimeline :records="repair.history" /></div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.back {
  justify-self: start;
}
.cmp th[scope='row'] {
  width: 120px;
  background: var(--surface-2);
}
.cmp td.ai {
  color: var(--ai);
  background: var(--ai-bg);
}
.cmp td.hu {
  font-weight: 700;
}
.cmp tr.diff td.hu {
  background: var(--danger-bg);
  box-shadow: inset 4px 0 0 var(--danger);
}
.lbl {
  font-weight: 700;
  color: var(--text-2);
  font-size: var(--fs-sm);
  margin-bottom: 6px;
}
.quote {
  margin: 0;
  padding: 14px 18px;
  border-left: 4px solid var(--success);
  background: var(--human-bg);
  border-radius: 0 var(--radius) var(--radius) 0;
  white-space: pre-wrap;
}
.photos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.photos figure {
  margin: 0;
}
.photos img {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
</style>
