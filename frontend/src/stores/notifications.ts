import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { notificationApi } from '@/api'
import type { Notification } from '@/types'

export const useNotificationStore = defineStore('notifications', () => {
  const items = ref<Notification[]>([])
  const unread = computed(() => items.value.filter((n) => !n.read).length)
  let timer: number | undefined

  async function fetch() {
    try {
      items.value = await notificationApi.list()
    } catch {
      /* 알림 실패는 업무를 막지 않음 */
    }
  }
  function startPolling() {
    void fetch()
    window.clearInterval(timer)
    timer = window.setInterval(fetch, 10_000)
  }
  function stopPolling() {
    window.clearInterval(timer)
  }
  async function read(id: string) {
    await notificationApi.read(id)
    const n = items.value.find((x) => x.id === id)
    if (n) n.read = true
  }
  async function readAll() {
    await notificationApi.readAll()
    items.value.forEach((n) => (n.read = true))
  }
  return { items, unread, fetch, startPolling, stopPolling, read, readAll }
})
