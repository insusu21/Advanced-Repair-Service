<script setup lang="ts">
/* 로딩 · 빈 결과 · 오류 상태를 한 곳에서 일관되게 표현 */
import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    state: 'loading' | 'empty' | 'error'
    title?: string
    message?: string
    compact?: boolean
  }>(),
  { compact: false },
)
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="state" :class="[state, { compact }]" :role="state === 'error' ? 'alert' : 'status'" aria-live="polite">
    <Loader2 v-if="state === 'loading'" :size="compact ? 24 : 36" class="spin icon" aria-hidden="true" />
    <Inbox v-else-if="state === 'empty'" :size="compact ? 28 : 40" class="icon" aria-hidden="true" />
    <AlertTriangle v-else :size="compact ? 28 : 40" class="icon" aria-hidden="true" />
    <strong>{{ title ?? (state === 'loading' ? '불러오는 중입니다' : state === 'empty' ? '표시할 내용이 없습니다' : '문제가 발생했습니다') }}</strong>
    <p v-if="message" class="muted">{{ message }}</p>
    <div v-if="state === 'error' || $slots.default" class="actions">
      <button v-if="state === 'error'" class="btn" type="button" @click="$emit('retry')">
        <RotateCw :size="18" /> 다시 시도
      </button>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.state {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 8px;
  padding: 48px 24px;
}
.state.compact {
  padding: 24px 16px;
}
.icon {
  color: var(--text-3);
}
.error .icon {
  color: var(--danger);
}
strong {
  font-size: var(--fs-lg);
}
.compact strong {
  font-size: var(--fs-md);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.actions:empty {
  display: none;
}
</style>
