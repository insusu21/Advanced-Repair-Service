<script setup lang="ts">
/* 분석 진행 타임라인 — 고정 3단계(접수·대기열 → 분석 진행 → 결과 종합)
 * '분석 진행' 아래에는 실제로 실행된 도구가 도착한 순서대로 들여쓰기 목록으로 붙는다 (SSE 로 실시간 추가·갱신) */
import { CircleCheck, CircleDashed, CircleX, Loader2, SkipForward, Camera } from 'lucide-vue-next'
import { STAGE_META } from '@/constants/status'
import type { AnalysisStageState, AnalysisToolRun, StageRunState } from '@/types'
import { formatDateTime } from '@/utils/format'

defineProps<{ stages: AnalysisStageState[]; tools?: AnalysisToolRun[] }>()

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
        <span class="agent faint">{{ s.message ?? STAGE_META[s.stage].description }}</span>
        <span v-if="s.finishedAt" class="faint">{{ formatDateTime(s.finishedAt) }}</span>

        <!-- 분석 진행: 실행된 도구 (도착 순서) -->
        <template v-if="s.stage === 'ANALYSIS' && s.state !== 'PENDING'">
          <ul v-if="tools?.length" class="tools" aria-label="실행된 분석 도구">
            <li v-for="t in tools" :key="t.id" :class="`tt-${STATE[t.state].tone}`">
              <component :is="STATE[t.state].icon" :size="18" :class="{ spin: t.state === 'RUNNING' }" aria-hidden="true" class="tic" />
              <span class="tname">{{ t.label }}</span>
              <span class="badge sm" :class="`tone-${STATE[t.state].tone}`">{{ STATE[t.state].label }}</span>
              <span v-if="t.message" class="tmsg faint">{{ t.message }}</span>
            </li>
          </ul>
          <p v-else class="tools-empty faint"><Loader2 :size="16" class="spin" aria-hidden="true" /> 분석 도구를 준비하고 있습니다</p>
        </template>
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
.tools {
  list-style: none;
  margin: 8px 0 0;
  padding: 4px 0 0 14px;
  border-left: 2px dashed var(--border-strong);
  display: grid;
  gap: 6px;
}
.tools li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.tic {
  color: var(--text-3);
}
.tt-success .tic { color: var(--success); }
.tt-ai .tic { color: var(--ai); }
.tt-danger .tic { color: var(--danger); }
.tt-warning .tic { color: var(--warning); }
.tname {
  font-weight: 600;
}
.tmsg {
  grid-column: 2 / -1;
  font-size: var(--fs-sm);
}
.badge.sm {
  font-size: var(--fs-xs);
  padding: 1px 8px;
}
.tools-empty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
</style>
