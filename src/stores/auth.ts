import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '@/api'
import { TOKEN_KEY } from '@/api/http'
import type { Role, User } from '@/types'

const USER_KEY = 'robotcare-user'

function readUser(): User | null {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) ?? 'null') as User | null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(readUser())
  const token = ref<string | null>(sessionStorage.getItem(TOKEN_KEY))
  authApi.restore(user.value)

  const isLoggedIn = computed(() => !!user.value && !!token.value)
  const role = computed<Role | null>(() => user.value?.role ?? null)

  async function login(employeeId: string, password: string) {
    const res = await authApi.login({ employeeId, password })
    user.value = res.user
    token.value = res.token
    sessionStorage.setItem(TOKEN_KEY, res.token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(res.user))
    return res.user
  }

  async function logout() {
    await authApi.logout()
    user.value = null
    token.value = null
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  }

  const hasRole = (...roles: Role[]) => !!role.value && roles.includes(role.value)

  return { user, token, isLoggedIn, role, login, logout, hasRole }
})
