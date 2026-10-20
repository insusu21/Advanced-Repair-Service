import { clearCsrf, http, mockDelay, refreshCsrf, USE_MOCK } from './http'
import * as mock from '@/mocks/handlers'
import type { LoginRequest, MeResponse } from '@/types/api'
import type { User } from '@/types'

/** GET /api/auth/me 응답 → 화면용 User */
function toUser(me: MeResponse): User {
  return {
    id: me.id,
    email: me.email,
    employeeId: me.email,
    name: me.name,
    role: me.role,
    centerId: me.centerId,
    branch: me.centerId ? `서비스센터 #${me.centerId}` : '본사',
  }
}

export const authApi = {
  /**
   * 로그인
   *  Mock: 사번·비밀번호 확인
   *  실서버: ① GET /auth/csrf → ② POST /auth/login (form-urlencoded, CSRF 헤더) → ③ CSRF 재조회 → ④ GET /auth/me
   */
  async login(req: LoginRequest): Promise<User> {
    if (USE_MOCK) return (await mockDelay(() => mock.login(req), 500)).user
    await refreshCsrf()
    await http.post('/auth/login', new URLSearchParams({ username: req.username.trim(), password: req.password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      skipAuthExpired: true,
    })
    // 로그인하면 세션이 바뀌므로 CSRF 토큰도 새로 받는다
    await refreshCsrf()
    return this.me() as Promise<User>
  },

  /** GET /api/auth/me — 세션이 없으면(401) null */
  async me(): Promise<User | null> {
    if (USE_MOCK) return null
    try {
      return toUser((await http.get<MeResponse>('/auth/me', { skipAuthExpired: true })).data)
    } catch (e) {
      if ((e as { status?: number }).status === 401) return null
      throw e
    }
  },

  /** Mock 모드에서 새로고침 후 세션 복원 */
  restore(user: User | null) {
    if (USE_MOCK) mock.setMockUser(user)
  },

  /** POST /api/auth/logout (CSRF 헤더 자동 첨부) */
  async logout() {
    if (USE_MOCK) return mock.setMockUser(null)
    await http.post('/auth/logout', null, { skipAuthExpired: true }).catch(() => undefined)
    clearCsrf()
  },
}
