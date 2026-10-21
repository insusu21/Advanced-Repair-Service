<script setup lang="ts">
import type { Component } from 'vue'
import type { Tone } from '@/constants/status'

defineProps<{ label: string; value: number | string; icon: Component; tone?: Tone; hint?: string; active?: boolean }>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button type="button" class="stat card" :class="[`tone-${tone ?? 'neutral'}`, { active }]" :aria-pressed="active" @click="$emit('select')">
    <span class="ic"><component :is="icon" :size="24" aria-hidden="true" /></span>
    <span class="txt">
      <span class="lbl">{{ label }}</span>
      <span class="val">{{ value }}<small>건</small></span>
      <span v-if="hint" class="hint">{{ hint }}</span>
    </span>
  </button>
</template>

<style scoped>
.stat {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  text-align: left;
  cursor: pointer;
  background: var(--surface);
  color: var(--text);
  border-width: 1px;
  min-height: 96px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.stat:hover {
  border-color: var(--navy-600);
}
.stat.active {
  box-shadow: inset 0 0 0 2px var(--navy-700);
  border-color: var(--navy-700);
}
.ic {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid;
  flex: none;
}
.tone-neutral .ic { color: var(--neutral); background: var(--neutral-bg); border-color: var(--neutral-border); }
.tone-info .ic { color: var(--info); background: var(--info-bg); border-color: var(--info-border); }
.tone-ai .ic { color: var(--ai); background: var(--ai-bg); border-color: var(--ai-border); }
.tone-warning .ic { color: var(--warning); background: var(--warning-bg); border-color: var(--warning-border); }
.tone-success .ic { color: var(--success); background: var(--success-bg); border-color: var(--success-border); }
.tone-danger .ic { color: var(--danger); background: var(--danger-bg); border-color: var(--danger-border); }
.txt {
  display: grid;
}
.lbl {
  color: var(--text-2);
  font-weight: 600;
}
.val {
  font-size: var(--fs-2xl);
  font-weight: 800;
  line-height: 1.15;
}
.val small {
  font-size: var(--fs-sm);
  font-weight: 600;
  margin-left: 3px;
  color: var(--text-2);
}
.hint {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
</style>
