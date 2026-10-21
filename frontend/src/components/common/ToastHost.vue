<script setup lang="ts">
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-vue-next'
import { useToastStore } from '@/stores/toast'

const store = useToastStore()
const icons = { success: CircleCheck, danger: CircleX, info: Info, warning: TriangleAlert }
</script>

<template>
  <div class="host" aria-live="assertive">
    <TransitionGroup name="t">
      <div v-for="t in store.toasts" :key="t.id" class="toast callout" :class="`tone-${t.tone}`" role="status">
        <component :is="icons[t.tone]" :size="22" />
        <span class="msg">{{ t.message }}</span>
        <button class="close" type="button" aria-label="닫기" @click="store.dismiss(t.id)"><X :size="18" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.host {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 100;
  display: grid;
  gap: 10px;
  width: min(440px, calc(100vw - 40px));
}
.toast {
  box-shadow: var(--shadow-lg);
  font-weight: 600;
  align-items: center;
}
.msg {
  flex: 1;
}
.close {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 6px;
  color: inherit;
}
.t-enter-active,
.t-leave-active {
  transition: all 0.2s;
}
.t-enter-from,
.t-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
