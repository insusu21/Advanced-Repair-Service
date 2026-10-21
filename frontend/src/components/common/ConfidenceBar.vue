<script setup lang="ts">
import { computed } from 'vue'
import { confidenceLevel } from '@/utils/format'

const props = withDefaults(defineProps<{ value: number; label?: string; size?: 'sm' | 'md' | 'lg'; showLevel?: boolean }>(), {
  size: 'md',
  showLevel: true,
})
const level = computed(() => confidenceLevel(props.value))
</script>

<template>
  <div class="conf" :class="size">
    <div class="top">
      <span v-if="label" class="lbl">{{ label }}</span>
      <span class="val">
        <strong>{{ Math.round(value) }}%</strong>
        <span v-if="showLevel" class="lvl" :class="`t-${level.tone}`">신뢰도 {{ level.label }}</span>
      </span>
    </div>
    <div
      class="track"
      role="meter"
      :aria-valuenow="Math.round(value)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${label ?? 'AI 신뢰도'} ${Math.round(value)}%`"
    >
      <div class="fill" :class="`f-${level.tone}`" :style="{ width: `${Math.max(2, Math.min(100, value))}%` }" />
      <span class="tick" style="left: 60%" aria-hidden="true" />
      <span class="tick" style="left: 80%" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.conf {
  display: grid;
  gap: 6px;
  min-width: 140px;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.lbl {
  font-weight: 600;
}
.val {
  display: inline-flex;
  gap: 8px;
  align-items: baseline;
}
.val strong {
  font-size: 1.05em;
}
.lg .val strong {
  font-size: var(--fs-2xl);
  line-height: 1;
}
.lvl {
  font-size: var(--fs-xs);
  font-weight: 700;
}
.t-success {
  color: var(--success);
}
.t-warning {
  color: var(--warning);
}
.t-danger {
  color: var(--danger);
}
.track {
  position: relative;
  height: 10px;
  background: var(--neutral-bg);
  border-radius: 999px;
  overflow: hidden;
}
.sm .track {
  height: 6px;
}
.lg .track {
  height: 14px;
}
.fill {
  height: 100%;
  border-radius: 999px;
  background: var(--ai);
  transition: width 0.6s ease;
}
/* 신뢰도는 AI 수치이므로 보라를 기본으로, 낮을 때만 경고색 */
.f-warning {
  background: #c27a1a;
}
.f-danger {
  background: var(--danger);
}
.tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.9);
}
</style>
