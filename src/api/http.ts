import axios, { AxiosError } from 'axios'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

/** 화면에서 일관되게 다루는 오류 형식 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const TOKEN_KEY = 'robotcare-token'

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 15_000,
})

http.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ message?: string; code?: string }>) => {
    const status = err.response?.status ?? 0
    const message =
      err.response?.data?.message ??
      (status === 0 ? '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.' : status === 401 ? '로그인이 만료되었습니다.' : status === 403 ? '이 작업을 할 권한이 없습니다.' : '요청을 처리하지 못했습니다.')
    if (status === 401) window.dispatchEvent(new CustomEvent('auth:expired'))
    return Promise.reject(new ApiError(status, message, err.response?.data?.code))
  },
)

/** Mock 응답에 네트워크 지연을 흉내 냄 */
export async function mockDelay<T>(fn: () => T, ms = 350): Promise<T> {
  await new Promise((r) => setTimeout(r, ms + Math.random() * 250))
  const res = fn()
  // 실서버처럼 응답을 "복사본"으로 돌려줌 (Vue Proxy 도 안전하게 직렬화)
  return res === undefined ? res : (JSON.parse(JSON.stringify(res)) as T)
}

export function toErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return '알 수 없는 오류가 발생했습니다.'
}
