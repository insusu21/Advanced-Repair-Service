/* 부품·발주 스토어 — AI 발주안(AI_DRAFT)은 사람이 "발주 요청 등록"을 해야만 REQUESTED 가 된다 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { partApi, toErrorMessage } from '@/api'
import type { Part, PurchaseOrder } from '@/types'
import type { CreateOrderRequest, OrderDecisionRequest } from '@/types/api'

export const useOrderStore = defineStore('orders', () => {
  const parts = ref<Part[]>([])
  const orders = ref<PurchaseOrder[]>([])
  const repairOrders = ref<PurchaseOrder[]>([])
  const loading = ref(false)
  const submittingId = ref<string | null>(null)
  const error = ref<string | null>(null)

  const pendingApproval = computed(() => orders.value.filter((o) => o.status === 'REQUESTED'))
  const partById = (id: string) => parts.value.find((p) => p.id === id)

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const [p, o] = await Promise.all([partApi.list(), partApi.orders()])
      parts.value = p
      orders.value = o
    } catch (e) {
      error.value = toErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  /** 부품 목록만 (리포트 화면의 고장 부품 선택용). 이미 받았으면 다시 부르지 않음 */
  async function fetchParts() {
    if (parts.value.length) return
    try {
      parts.value = await partApi.list()
    } catch (e) {
      error.value = toErrorMessage(e)
    }
  }

  async function fetchForRepair(repairId: number) {
    loading.value = true
    error.value = null
    try {
      const [p, o] = await Promise.all([partApi.list(), partApi.repairOrders(repairId)])
      parts.value = p
      repairOrders.value = o
    } catch (e) {
      error.value = toErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  async function request(repairId: number, req: CreateOrderRequest) {
    submittingId.value = req.draftOrderId ?? req.partId
    try {
      const o = await partApi.createOrder(repairId, req)
      repairOrders.value = repairOrders.value.some((x) => x.id === o.id) ? repairOrders.value.map((x) => (x.id === o.id ? o : x)) : [...repairOrders.value, o]
      return o
    } finally {
      submittingId.value = null
    }
  }

  async function decide(orderId: string, req: OrderDecisionRequest) {
    submittingId.value = orderId
    try {
      const o = await partApi.decide(orderId, req)
      orders.value = orders.value.map((x) => (x.id === o.id ? o : x))
      parts.value = await partApi.list()
      return o
    } finally {
      submittingId.value = null
    }
  }

  return { parts, orders, repairOrders, loading, submittingId, error, pendingApproval, partById, fetchAll, fetchParts, fetchForRepair, request, decide }
})
