<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { BarChart3, ClipboardCheck, House, List, Package, PlusCircle } from 'lucide-vue-next'
import AppLogo from '@/components/common/AppLogo.vue'
import { useAuthStore } from '@/stores/auth'
import { useRepairListStore } from '@/stores/repairs'
import { useOrderStore } from '@/stores/orders'
import type { Role } from '@/types'

defineEmits<{ navigate: [] }>()
const auth = useAuthStore()
const route = useRoute()
const list = useRepairListStore()
const orders = useOrderStore()

onMounted(() => {
  if (auth.role === 'TECHNICIAN' && !list.loadedAt) void list.fetch()
  if (auth.role === 'QUALITY_MANAGER' && !orders.orders.length && !orders.loading) void orders.fetchAll()
})

const items = computed(() => {
  const all: { key: string; label: string; to: string; icon: unknown; roles: Role[]; count?: number }[] = [
    { key: 'home', label: '홈', to: '/', icon: House, roles: ['TECHNICIAN', 'QUALITY_MANAGER'] },
    { key: 'repair-new', label: '수리 접수', to: '/repairs/new', icon: PlusCircle, roles: ['TECHNICIAN'] },
    { key: 'repairs', label: '수리 목록', to: '/repairs', icon: List, roles: ['TECHNICIAN', 'QUALITY_MANAGER'], count: auth.role === 'TECHNICIAN' ? list.counts.needPhoto + list.counts.technicianReview + list.counts.reportPending : undefined },
    { key: 'order-approvals', label: '발주 승인 대기', to: '/order-approvals', icon: ClipboardCheck, roles: ['QUALITY_MANAGER'], count: orders.pendingApproval.length },
    { key: 'parts', label: '부품 및 발주', to: '/parts', icon: Package, roles: ['TECHNICIAN', 'QUALITY_MANAGER'] },
    { key: 'dashboard', label: '품질 대시보드', to: '/dashboard', icon: BarChart3, roles: ['QUALITY_MANAGER'] },
  ]
  return all.filter((i) => auth.hasRole(...i.roles))
})
</script>

<template>
  <aside class="sidebar" aria-label="주 메뉴">
    <RouterLink to="/" class="brand" @click="$emit('navigate')">
      <AppLogo />
      <small>고장 진단 지원 시스템</small>
    </RouterLink>
    <nav>
      <RouterLink
        v-for="i in items"
        :key="i.key"
        :to="i.to"
        class="nav-item"
        :class="{ active: route.meta.nav === i.key }"
        :aria-current="route.meta.nav === i.key ? 'page' : undefined"
        @click="$emit('navigate')"
      >
        <component :is="i.icon" :size="22" aria-hidden="true" />
        <span>{{ i.label }}</span>
        <span v-if="i.count" class="count" :aria-label="`처리 필요 ${i.count}건`">{{ i.count }}</span>
      </RouterLink>
    </nav>
    <div class="foot">
      <p>AI 결과는 초안입니다.<br />기사가 확정한 리포트만 반영됩니다.</p>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  background: var(--surface);
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  gap: 18px;
  overflow-y: auto;
  border-right: 1px solid var(--border);
}
.brand {
  display: grid;
  justify-items: start;
  gap: 8px;
  text-decoration: none;
  padding: 4px 10px 16px;
  border-bottom: 1px solid var(--border);
}
.brand small {
  color: var(--text-3);
  font-size: var(--fs-xs);
}
nav {
  display: grid;
  gap: 4px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 16px;
  border-radius: var(--radius-pill);
  color: var(--text-2);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--fs-md);
}
.nav-item:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.nav-item.active {
  background: var(--blue-50);
  color: var(--primary);
}
.count {
  margin-left: auto;
  min-width: 26px;
  height: 26px;
  padding: 0 7px;
  border-radius: 999px;
  background: #f0a33a;
  color: #2a1700;
  font-size: var(--fs-xs);
  font-weight: 800;
  display: grid;
  place-items: center;
}
.foot {
  margin-top: auto;
  font-size: var(--fs-xs);
  color: var(--text-3);
  padding: 12px 10px 4px;
  border-top: 1px solid var(--border);
  line-height: 1.6;
}
</style>
