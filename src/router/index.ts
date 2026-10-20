import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'
import AppLayout from '@/components/layout/AppLayout.vue'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    roles?: Role[]
    public?: boolean
    nav?: string
  }
}

const ALL: Role[] = ['TECHNICIAN', 'QUALITY_MANAGER']

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: '로그인' } },
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '홈', roles: ALL, nav: 'home' } },
      { path: 'repairs', name: 'repairs', component: () => import('@/views/RepairListView.vue'), meta: { title: '수리 목록', roles: ['TECHNICIAN', 'QUALITY_MANAGER'], nav: 'repairs' } },
      { path: 'repairs/new', name: 'repair-new', component: () => import('@/views/RepairCreateView.vue'), meta: { title: '신규 수리 접수', roles: ['TECHNICIAN'], nav: 'repair-new' } },
      { path: 'repairs/:id(\\d+)', redirect: (to) => `/repairs/${to.params.id}/diagnosis` },
      { path: 'repairs/:id(\\d+)/progress', name: 'repair-progress', component: () => import('@/views/RepairProgressView.vue'), meta: { title: '진단 진행', roles: ALL, nav: 'repairs' } },
      { path: 'repairs/:id(\\d+)/diagnosis', name: 'repair-diagnosis', component: () => import('@/views/DiagnosisResultView.vue'), meta: { title: 'AI 진단 결과', roles: ALL, nav: 'repairs' } },
      { path: 'repairs/:id(\\d+)/parts', name: 'repair-parts', component: () => import('@/views/RepairPartsView.vue'), meta: { title: '필요 부품 · 발주 요청', roles: ['TECHNICIAN', 'QUALITY_MANAGER'], nav: 'repairs' } },
      { path: 'repairs/:id(\\d+)/review', name: 'repair-review', component: () => import('@/views/TechnicianReviewView.vue'), meta: { title: '수리 리포트', roles: ALL, nav: 'repairs' } },
      { path: 'approvals/:id(\\d+)', name: 'approval-detail', component: () => import('@/views/ApprovalDetailView.vue'), meta: { title: '본사 수동 검토', roles: ['QUALITY_MANAGER'], nav: 'repairs' } },
      { path: 'parts', name: 'parts', component: () => import('@/views/PartsOrderView.vue'), meta: { title: '부품 및 발주', roles: ['TECHNICIAN', 'QUALITY_MANAGER'], nav: 'parts' } },
      { path: 'order-approvals', name: 'order-approvals', component: () => import('@/views/PartsOrderView.vue'), props: { pendingOnly: true }, meta: { title: '발주 승인 대기', roles: ['QUALITY_MANAGER'], nav: 'order-approvals' } },
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '품질 대시보드', roles: ['QUALITY_MANAGER'], nav: 'dashboard' } },
      { path: 'forbidden', name: 'forbidden', component: () => import('@/views/ErrorView.vue'), props: { code: 403 }, meta: { title: '권한 없음', roles: ALL } },
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('@/views/ErrorView.vue'), props: { code: 404 }, meta: { title: '페이지 없음', roles: ALL } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // 실서버: 첫 이동 전에 GET /api/auth/me 로 세션 복원 (Mock 은 즉시 완료)
  await auth.init()
  if (to.meta.public) return auth.isLoggedIn && to.name === 'login' ? { name: 'home' } : true
  if (!auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.meta.roles && !auth.hasRole(...to.meta.roles)) return { name: 'forbidden' }
  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? ''} · RobotCare AI`
})

// 세션 만료(401): 서버 로그아웃 호출 없이 로컬 상태만 비우고 로그인 화면으로
window.addEventListener('auth:expired', () => {
  useAuthStore().clear()
  const cur = router.currentRoute.value
  if (cur.name !== 'login') void router.push({ name: 'login', query: { redirect: cur.fullPath } })
})

export default router
