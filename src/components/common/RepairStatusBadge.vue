<script setup lang="ts">
import { computed } from 'vue'
import { STATUS_META } from '@/constants/status'
import type { RepairStatus } from '@/types'

const props = defineProps<{ status: RepairStatus; failed?: boolean; size?: 'md' | 'lg' }>()
const meta = computed(() =>
  props.failed && ['QUEUED', 'ANALYZING', 'RECEIVED'].includes(props.status)
    ? { ...STATUS_META.REJECTED, label: '분석 실패', description: 'AI 분석 실패 · 재분석 필요' }
    : STATUS_META[props.status],
)
</script>

<template>
  <!-- 색상 + 아이콘 + 텍스트를 함께 사용 (색만으로 상태 구분 금지) -->
  <span class="badge" :class="[`tone-${meta.tone}`, size === 'lg' && 'lg']" :title="meta.description">
    <component :is="meta.icon" :size="size === 'lg' ? 18 : 15" :class="{ spin: status === 'ANALYZING' && !failed }" aria-hidden="true" />
    {{ meta.label }}
  </span>
</template>

<style scoped>
.lg {
  font-size: var(--fs-md);
  padding: 6px 14px;
}
</style>
