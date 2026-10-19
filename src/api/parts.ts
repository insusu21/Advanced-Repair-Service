import { http, mockDelay, USE_MOCK } from './http'
import * as mock from '@/mocks/handlers'
import type { Part, PurchaseOrder } from '@/types'
import type { CreateOrderRequest, OrderDecisionRequest } from '@/types/api'

export const partApi = {
  /** GET /api/parts */
  async list(): Promise<Part[]> {
    if (USE_MOCK) return mockDelay(() => mock.listParts())
    return (await http.get<Part[]>('/parts')).data
  },
  /** GET /api/parts/{partId}/inventory */
  async inventory(partId: string): Promise<Part> {
    if (USE_MOCK) return mockDelay(() => mock.getPartInventory(partId))
    return (await http.get<Part>(`/parts/${partId}/inventory`)).data
  },
  /** GET /api/repairs/{id}/orders — AI 발주안 + 요청된 발주 */
  async repairOrders(repairId: number): Promise<PurchaseOrder[]> {
    if (USE_MOCK) return mockDelay(() => mock.listRepairOrders(repairId))
    return (await http.get<PurchaseOrder[]>(`/repairs/${repairId}/orders`)).data
  },
  /** GET /api/orders */
  async orders(): Promise<PurchaseOrder[]> {
    if (USE_MOCK) return mockDelay(() => mock.listOrders())
    return (await http.get<PurchaseOrder[]>('/orders')).data
  },
  /** POST /api/repairs/{id}/orders — 사람이 확인한 발주 요청 등록 */
  async createOrder(repairId: number, req: CreateOrderRequest): Promise<PurchaseOrder> {
    if (USE_MOCK) return mockDelay(() => mock.createOrder(repairId, req), 500)
    return (await http.post<PurchaseOrder>(`/repairs/${repairId}/orders`, req)).data
  },
  /** POST /api/orders/{id}/decision — 부품 담당자 승인·반려 */
  async decide(orderId: string, req: OrderDecisionRequest): Promise<PurchaseOrder> {
    if (USE_MOCK) return mockDelay(() => mock.decideOrder(orderId, req), 500)
    return (await http.post<PurchaseOrder>(`/orders/${orderId}/decision`, req)).data
  },
}
