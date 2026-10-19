import { http, mockDelay, USE_MOCK } from './http'
import * as mock from '@/mocks/handlers'
import type { DefectDashboard, Notification } from '@/types'
import type { DefectRecord } from '@/mocks/data'

export type DrillDim = 'part' | 'model' | 'branch' | 'factory' | 'month' | 'cause'
export type { DefectRecord }

export const dashboardApi = {
  /** GET /api/dashboard/defects?months=6 */
  async defects(months = 6): Promise<DefectDashboard> {
    if (USE_MOCK) return mockDelay(() => mock.dashboard(months), 600)
    return (await http.get<DefectDashboard>('/dashboard/defects', { params: { months } })).data
  },
  /** GET /api/dashboard/defects/records?dim=part&value=모터 어셈블리 — 그래프 클릭 시 관련 수리 목록 */
  async records(dim: DrillDim, value: string): Promise<DefectRecord[]> {
    if (USE_MOCK) return mockDelay(() => mock.dashboardRecords({ dim, value }))
    return (await http.get<DefectRecord[]>('/dashboard/defects/records', { params: { dim, value } })).data
  },
}

export const notificationApi = {
  async list(): Promise<Notification[]> {
    if (USE_MOCK) return mockDelay(() => mock.listNotifications(), 200)
    return (await http.get<Notification[]>('/notifications')).data
  },
  async read(id: string) {
    if (USE_MOCK) return mockDelay(() => mock.readNotification(id), 50)
    await http.post(`/notifications/${id}/read`)
  },
  async readAll() {
    if (USE_MOCK) return mockDelay(() => mock.readAllNotifications(), 50)
    await http.post('/notifications/read-all')
  },
}
