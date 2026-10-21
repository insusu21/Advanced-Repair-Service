import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  tone: 'success' | 'danger' | 'info' | 'warning'
  message: string
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  let seq = 0
  function push(message: string, tone: Toast['tone'] = 'info', ms = 4000) {
    const id = ++seq
    toasts.value.push({ id, tone, message })
    setTimeout(() => dismiss(id), ms)
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }
  return {
    toasts,
    dismiss,
    success: (m: string) => push(m, 'success'),
    error: (m: string) => push(m, 'danger', 6000),
    info: (m: string) => push(m, 'info'),
    warning: (m: string) => push(m, 'warning'),
  }
})
