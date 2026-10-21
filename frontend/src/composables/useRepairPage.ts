/* 수리 상세 화면 공통: 라우트 id → 상세 로드 + SSE 구독 + 언마운트 시 해제 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRepairDetailStore } from '@/stores/repairDetail'

export function useRepairPage(opts: { live?: boolean; diagnosis?: boolean } = {}) {
  const route = useRoute()
  const store = useRepairDetailStore()
  const id = computed(() => Number(route.params.id))
  const refs = storeToRefs(store)

  async function reload() {
    await store.load(id.value)
    if (opts.diagnosis) await store.loadDiagnosis(id.value)
  }

  onMounted(async () => {
    await reload()
    if (opts.live) store.subscribe(id.value)
  })
  onBeforeUnmount(() => {
    if (opts.live) store.unsubscribe()
  })

  return { id, store, reload, ...refs }
}
