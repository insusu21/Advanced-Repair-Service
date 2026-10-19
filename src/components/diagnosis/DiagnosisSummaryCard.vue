<script setup lang="ts">
/* 진단 상단 요약 — AI 초안(보라 점선) / 사람 결정 결과(초록·빨강) 를 나란히 보여 혼동 방지 */
import { computed } from 'vue'
import { Clock, Gauge, Layers, UserCheck, UserX, Hourglass } from 'lucide-vue-next'
import AiBadge from '@/components/common/AiBadge.vue'
import ConfidenceBar from '@/components/common/ConfidenceBar.vue'
import { DECISION_META, URGENCY_META } from '@/constants/status'
import type { Diagnosis } from '@/types'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{ diagnosis: Diagnosis; versionCount: number }>()
const dec = computed(() => props.diagnosis.technicianDecision)
const decMeta = computed(() => DECISION_META[dec.value.state])
const decIcon = computed(() => (dec.value.state === 'APPROVED' ? UserCheck : dec.value.state === 'PENDING' ? Hourglass : UserX))
</script>

<template>
  <section class="sum" aria-label="AI 진단 요약">
    <div class="ai-zone ai">
      <div class="row between">
        <AiBadge />
        <span class="faint">진단 버전 v{{ diagnosis.version }}<template v-if="versionCount > 1"> (재분석 {{ versionCount - 1 }}회)</template></span>
      </div>
      <p class="eyebrow">가장 가능성이 높은 고장 원인</p>
      <h2 class="cause">{{ diagnosis.topCause }}</h2>
      <div class="meta">
        <div class="m conf"><ConfidenceBar :value="diagnosis.confidence" label="AI 신뢰도" size="lg" /></div>
        <div class="m">
          <span class="ml"><Gauge :size="16" /> 긴급도</span>
          <span class="badge" :class="`tone-${URGENCY_META[diagnosis.urgency].tone}`">{{ URGENCY_META[diagnosis.urgency].label }}</span>
        </div>
        <div class="m">
          <span class="ml"><Clock :size="16" /> 분석 완료</span>
          <strong>{{ formatDateTime(diagnosis.generatedAt) }}</strong>
        </div>
        <div class="m">
          <span class="ml"><Layers :size="16" /> 유사 사례</span>
          <strong>{{ diagnosis.similarCaseCount }}건</strong>
        </div>
      </div>
    </div>

    <div class="decision" :class="dec.state === 'APPROVED' ? 'human-zone' : dec.state === 'PENDING' ? 'pending' : 'rejected'">
      <p class="eyebrow">현재 승인 상태</p>
      <span class="badge big" :class="`tone-${decMeta.tone}`"><component :is="decIcon" :size="20" /> {{ decMeta.label }}</span>
      <template v-if="dec.state !== 'PENDING'">
        <dl class="kv">
          <dt>처리자</dt>
          <dd>{{ dec.decidedBy }}</dd>
          <dt>처리 시각</dt>
          <dd>{{ formatDateTime(dec.decidedAt) }}</dd>
        </dl>
        <p v-if="dec.comment" class="cm">“{{ dec.comment }}”</p>
      </template>
      <p v-else class="muted">아직 사람이 확인하지 않은 AI 초안입니다. 아래 내용을 검토한 뒤 처리해 주세요.</p>
    </div>
  </section>
</template>

<style scoped>
.sum {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(260px, 1fr);
  gap: 16px;
}
.ai {
  padding: 20px 24px;
  display: grid;
  gap: 8px;
}
.eyebrow {
  font-size: var(--fs-sm);
  color: var(--text-2);
  font-weight: 700;
  margin-top: 4px;
}
.cause {
  font-size: var(--fs-2xl);
  font-weight: 800;
  color: var(--navy-900);
}
.meta {
  display: grid;
  grid-template-columns: 1.6fr repeat(3, 1fr);
  gap: 16px;
  margin-top: 8px;
  align-items: end;
}
.m {
  display: grid;
  gap: 6px;
  justify-items: start;
}
.ml {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-weight: 600;
  font-size: var(--fs-sm);
}
.conf {
  justify-items: stretch;
}
.decision {
  padding: 20px 22px;
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
  font-size: var(--fs-lg);
  padding: 8px 14px;
  justify-self: start;
}
.cm {
  font-style: italic;
  color: var(--text-2);
}
@media (max-width: 1180px) {
  .sum {
    grid-template-columns: 1fr;
  }
  .meta {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
