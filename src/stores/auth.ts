import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '@/api'
import { readToken, TOKEN_KEY } from '@/api/http'
import type { Role, User } from '@/types'

const USER_KEY = 'robotcare-user'

function readUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as User | null
  } catch {
    return null
  }
}

/** 로그인 정보 저장·삭제. 저장소 사용 불가(사생활 보호 모드 등) 시 현재 탭에서만 유지 */
function saveSession(token: string, user: User) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* noop */
  }
}
function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    /* noop */
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(readUser())
  const token = ref<string | null>(readToken())
  authApi.restore(user.value)

  const isLoggedIn = computed(() => !!user.value && !!token.value)
  const role = computed<Role | null>(() => user.value?.role ?? null)

  async function login(employeeId: string, password: string) {
    const res = await authApi.login({ employeeId, password })
    user.value = res.user
    token.value = res.token
    saveSession(res.token, res.user)
    return res.user
  }

  async function logout() {
    await authApi.logout()
    user.value = null
    token.value = null
    clearSession()
  }

  const hasRole = (...roles: Role[]) => !!role.value && roles.includes(role.value)

  return { user, token, isLoggedIn, role, login, logout, hasRole }
})
