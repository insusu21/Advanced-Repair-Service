import { http, mockDelay, USE_MOCK } from './http'
import * as mock from '@/mocks/handlers'
import type { LoginRequest, LoginResponse } from '@/types/api'
import type { User } from '@/types'

export const authApi = {
  /** POST /api/auth/login */
  async login(req: LoginRequest): Promise<LoginResponse> {
    if (USE_MOCK) return mockDelay(() => mock.login(req), 500)
    return (await http.post<LoginResponse>('/auth/login', req)).data
  },
  /** Mock 모드에서 새로고침 후 세션 복원 */
  restore(user: User | null) {
    if (USE_MOCK) mock.setMockUser(user)
  },
  async logout() {
    if (USE_MOCK) return mock.setMockUser(null)
    await http.post('/auth/logout').catch(() => undefined)
  },
}
