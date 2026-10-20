<script setup lang="ts">
/* AI 초안 / 사람 확정 구분 라벨 — 모든 AI 산출물에 반드시 표시 */
import { Sparkles, UserCheck } from 'lucide-vue-next'

withDefaults(defineProps<{ kind?: 'ai' | 'human'; label?: string; compact?: boolean }>(), { kind: 'ai' })
</script>

<template>
  <span v-if="kind === 'ai'" class="badge tone-ai ai-badge" role="note">
    <Sparkles :size="15" aria-hidden="true" />
    {{ label ?? (compact ? 'AI 초안' : 'AI 분석 결과 · 확인 필요') }}
  </span>
  <span v-else class="badge tone-success" role="note">
    <UserCheck :size="15" aria-hidden="true" />
    {{ label ?? '관리자 확정' }}
  </span>
</template>

<style scoped>
.ai-badge {
  border-style: dashed;
}
</style>
