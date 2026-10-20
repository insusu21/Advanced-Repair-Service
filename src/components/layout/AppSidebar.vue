<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { BarChart3, ClipboardCheck, House, List, Package, PlusCircle } from 'lucide-vue-next'
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
      <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#fff" /><circle cx="16" cy="16" r="9" fill="none" stroke="#16285a" stroke-width="2.6" /><circle cx="16" cy="12" r="2.3" fill="#16285a" /></svg>
      <span>
        <strong>RobotCare AI</strong>
        <small>고장 진단 지원 시스템</small>
      </span>
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
  background: var(--navy-900);
  color: #dbe3f4;
  display: flex;
  flex-direction: column;
  padding: 18px 14px;
  gap: 18px;
  overflow-y: auto;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fff;
  text-decoration: none;
  padding: 4px 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.brand strong {
  display: block;
  font-size: var(--fs-lg);
  letter-spacing: -0.01em;
}
.brand small {
  color: #9fb0d4;
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
  padding: 0 14px;
  border-radius: var(--radius);
  color: #c9d3ea;
  text-decoration: none;
  font-weight: 600;
  font-size: var(--fs-md);
}
.nav-item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
}
.nav-item.active {
  background: #fff;
  color: var(--navy-900);
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
  color: #9fb0d4;
  padding: 12px 8px 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  line-height: 1.6;
}
</style>
