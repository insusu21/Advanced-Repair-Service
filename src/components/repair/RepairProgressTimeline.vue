<script setup lang="ts">
/* 단계별 분석 타임라인 — SSE 이벤트로 각 단계 상태가 실시간으로 바뀐다 */
import { CircleCheck, CircleDashed, CircleX, Loader2, SkipForward, Camera } from 'lucide-vue-next'
import { STAGE_META } from '@/constants/status'
import type { AnalysisStageState, StageRunState } from '@/types'
import { formatDateTime } from '@/utils/format'

defineProps<{ stages: AnalysisStageState[] }>()

const STATE: Record<StageRunState, { label: string; tone: string; icon: unknown }> = {
  PENDING: { label: '대기', tone: 'neutral', icon: CircleDashed },
  RUNNING: { label: '분석 중', tone: 'ai', icon: Loader2 },
  DONE: { label: '완료', tone: 'success', icon: CircleCheck },
  SKIPPED: { label: '건너뜀', tone: 'neutral', icon: SkipForward },
  FAILED: { label: '실패', tone: 'danger', icon: CircleX },
  WAITING_INPUT: { label: '추가 정보 필요', tone: 'warning', icon: Camera },
}
</script>

<template>
  <ol class="tl">
    <li v-for="s in stages" :key="s.stage" :class="`st-${STATE[s.state].tone}`" :aria-current="s.state === 'RUNNING' ? 'step' : undefined">
      <span class="ic"><component :is="STATE[s.state].icon" :size="22" :class="{ spin: s.state === 'RUNNING' }" aria-hidden="true" /></span>
      <div class="body">
        <div class="row between">
          <strong>{{ STAGE_META[s.stage].label }}</strong>
          <span class="badge" :class="`tone-${STATE[s.state].tone}`">{{ STATE[s.state].label }}</span>
        </div>
        <span class="agent faint">{{ STAGE_META[s.stage].agent }} · {{ s.message ?? STAGE_META[s.stage].description }}</span>
        <span v-if="s.finishedAt" class="faint">{{ formatDateTime(s.finishedAt) }}</span>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.tl {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 12px;
  position: relative;
  padding-bottom: 18px;
}
li:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 38px;
  bottom: 2px;
  width: 2px;
  background: var(--border);
}
li.st-success:not(:last-child)::before {
  background: var(--success-border);
}
.ic {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--neutral-bg);
  color: var(--text-3);
}
.st-success .ic { background: var(--success-bg); color: var(--success); }
.st-ai .ic { background: var(--ai-bg); color: var(--ai); box-shadow: 0 0 0 4px rgba(91, 63, 214, 0.12); }
.st-danger .ic { background: var(--danger-bg); color: var(--danger); }
.st-warning .ic { background: var(--warning-bg); color: var(--warning); }
.body {
  display: grid;
  gap: 2px;
  padding-top: 6px;
}
.st-ai .body strong {
  color: var(--ai);
}
</style>
