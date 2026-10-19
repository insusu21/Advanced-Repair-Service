<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{ open: boolean; title: string; width?: number }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(
  () => props.open,
  async (v) => {
    if (v) {
      document.addEventListener('keydown', onKey)
      await nextTick()
      panel.value?.querySelector<HTMLElement>('textarea, input, select, button.btn')?.focus()
    } else document.removeEventListener('keydown', onKey)
  },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="backdrop" @mousedown.self="emit('close')">
        <div ref="panel" class="modal card" role="dialog" aria-modal="true" :aria-label="title" :style="{ maxWidth: `${width ?? 560}px` }">
          <div class="card-head">
            <h2>{{ title }}</h2>
            <button class="btn btn-ghost btn-sm" type="button" aria-label="닫기" @click="emit('close')"><X :size="20" /></button>
          </div>
          <div class="card-body"><slot /></div>
          <div v-if="$slots.footer" class="foot"><slot name="footer" /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 29, 66, 0.45);
  display: grid;
  place-items: center;
  z-index: 90;
  padding: 16px;
}
.modal {
  width: 100%;
  box-shadow: var(--shadow-lg);
  max-height: calc(100vh - 32px);
  overflow: auto;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 20px;
  flex-wrap: wrap;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
