<script setup lang="ts">
/* 진단 '한눈에 보기' — 항상 펼쳐진 핵심 요약
 *  AI 초안(원인·신뢰도·긴급도·권장 조치·필요 부품·판단 근거·출처) | 사람의 결정(승인 상태·승인자·시각)
 *  화면에서 AI 초안 배지는 이 카드에만 한 번 표시한다. */
import { computed } from 'vue'
import { Clock, Gauge, Wrench, Package, ListChecks, BookOpen, UserCheck, UserX, Hourglass } from 'lucide-vue-next'
import AiBadge from '@/components/common/AiBadge.vue'
import ConfidenceBar from '@/components/common/ConfidenceBar.vue'
import { DECISION_META, ROLE_LABEL, URGENCY_META } from '@/constants/status'
import type { Diagnosis } from '@/types'
import { formatDateTime } from '@/utils/format'

export interface GlancePart {
  name: string
  quantity: number
  /** true 재고 있음 · false 발주 필요 · null 재고 정보 없음 */
  inStock: boolean | null
}

const props = defineProps<{ diagnosis: Diagnosis; versionCount: number; parts: GlancePart[] }>()
defineEmits<{ 'show-sources': [] }>()

const top = computed(() => props.diagnosis.candidates[0])
const evidence = computed(() => top.value?.evidence.slice(0, 3) ?? [])
const action = computed(() => props.diagnosis.repairMethod[0] ?? props.diagnosis.inspectionSteps[0])
const dec = computed(() => props.diagnosis.technicianDecision)
const decMeta = computed(() => DECISION_META[dec.value.state])
const decIcon = computed(() => (dec.value.state === 'APPROVED' ? UserCheck : dec.value.state === 'PENDING' ? Hourglass : UserX))
</script>

<template>
  <section class="glance card" aria-labelledby="glance-title">
    <!-- AI 초안 -->
    <div class="ai-zone ai">
      <div class="row between">
        <AiBadge />
        <span class="faint"><Clock :size="14" /> {{ formatDateTime(diagnosis.generatedAt) }} · v{{ diagnosis.version }}<template v-if="versionCount > 1"> (재분석 {{ versionCount - 1 }}회)</template></span>
      </div>
      <p class="eyebrow">가장 가능성 높은 원인</p>
      <h2 id="glance-title" class="cause">{{ diagnosis.topCause }}</h2>
      <div class="meta">
        <ConfidenceBar :value="diagnosis.confidence" label="AI 신뢰도" class="conf" />
        <span class="m"><Gauge :size="16" /> 긴급도 <span class="badge" :class="`tone-${URGENCY_META[diagnosis.urgency].tone}`">{{ URGENCY_META[diagnosis.urgency].label }}</span></span>
      </div>

      <dl class="lines">
        <div v-if="action">
          <dt><Wrench :size="16" /> 권장 조치</dt>
          <dd>{{ action }}</dd>
        </div>
        <div v-if="parts.length">
          <dt><Package :size="16" /> 필요 부품</dt>
          <dd class="parts">
            <span v-for="p in parts" :key="p.name" class="part">
              {{ p.name }} × {{ p.quantity }}
              <span v-if="p.inStock === true" class="badge tone-success sm">재고 있음</span>
              <span v-else-if="p.inStock === false" class="badge tone-warning sm">발주 필요</span>
            </span>
          </dd>
        </div>
        <div v-if="evidence.length">
          <dt><ListChecks :size="16" /> 판단 근거</dt>
          <dd>
            <ul class="ev">
              <li v-for="e in evidence" :key="e">{{ e }}</li>
            </ul>
          </dd>
        </div>
      </dl>
      <button v-if="diagnosis.sources.length" type="button" class="src-link" @click="$emit('show-sources')">
        <BookOpen :size="15" /> 데이터 출처 {{ diagnosis.sources.length }}개 보기
      </button>
    </div>

    <!-- 사람의 결정 -->
    <div class="decision" :class="dec.state === 'APPROVED' ? 'human-zone' : dec.state === 'PENDING' ? 'pending' : 'rejected'">
      <p class="eyebrow">승인 상태</p>
      <span class="badge big" :class="`tone-${decMeta.tone}`"><component :is="decIcon" :size="18" /> {{ decMeta.label }}</span>
      <dl v-if="dec.state !== 'PENDING'" class="kv who">
        <dt>승인자</dt>
        <dd>{{ dec.decidedBy ?? '-' }}<span v-if="dec.decidedByRole" class="faint"> · {{ ROLE_LABEL[dec.decidedByRole] }}</span></dd>
        <dt>승인 시각</dt>
        <dd>{{ formatDateTime(dec.decidedAt) }}</dd>
        <template v-if="dec.comment">
          <dt>의견</dt>
          <dd class="cm">{{ dec.comment }}</dd>
        </template>
      </dl>
      <p v-else class="muted">아직 관리자가 확인하지 않은 AI 초안입니다.</p>
    </div>
  </section>
</template>

<style scoped>
.glance {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  gap: 12px;
  padding: 12px;
}
.ai {
  padding: 18px 22px;
  display: grid;
  gap: 8px;
  align-content: start;
}
.ai .faint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.eyebrow {
  font-size: var(--fs-sm);
  color: var(--text-2);
  font-weight: 700;
}
.cause {
  font-size: var(--fs-2xl);
  font-weight: 800;
  color: var(--navy-900);
  line-height: 1.25;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px 24px;
}
.conf {
  flex: 1 1 260px;
  max-width: 420px;
}
.m {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-weight: 600;
  font-size: var(--fs-sm);
}
.lines {
  display: grid;
  gap: 8px;
  margin: 8px 0 0;
}
.lines > div {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  gap: 10px;
}
.lines dt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: var(--fs-sm);
  color: var(--text-2);
  align-self: start;
  padding-top: 2px;
}
.lines dd {
  margin: 0;
}
.parts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.part {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.sm {
  font-size: var(--fs-xs);
  padding: 1px 8px;
}
.ev {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 2px;
}
.src-link {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--navy-700);
  font-weight: 600;
  font-size: var(--fs-sm);
  text-decoration: underline;
  cursor: pointer;
}
.decision {
  padding: 18px 20px;
  display: grid;
  gap: 10px;
  align-content: start;
  border-radius: var(--radius-lg);
}
.decision.pending {
  border: 2px solid var(--warning-border);
  background: var(--warning-bg);
}
.decision.rejected {
  border: 2px solid var(--danger-border);
  background: var(--danger-bg);
}
.big {
  font-size: var(--fs-md);
  padding: 6px 12px;
  justify-self: start;
}
.who {
  font-size: var(--fs-sm);
}
.cm {
  font-style: italic;
  color: var(--text-2);
}
/* 태블릿 이하: 한 줄(세로)로 */
@media (max-width: 1024px) {
  .glance {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .lines > div {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
