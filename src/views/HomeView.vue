<script setup lang="ts">
/* 홈 = 마이페이지 겸 오늘의 업무 목록. 역할별로 "지금 처리해야 할 일" 을 먼저 보여준다. */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Camera, UserCheck, Building2, CircleCheck, PlusCircle, Hand, Loader, Package, BarChart3, ArrowRight } from 'lucide-vue-next'
import StatCard from '@/components/common/StatCard.vue'
import StateView from '@/components/common/StateView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import RepairTable from '@/components/repair/RepairTable.vue'
import RepairStatusBadge from '@/components/common/RepairStatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useRepairListStore } from '@/stores/repairs'
import { useOrderStore } from '@/stores/orders'
import { ROLE_LABEL } from '@/constants/status'
import { nextAction, repairLink } from '@/utils/repairFlow'
import { formatRelative, repairId } from '@/utils/format'
import type { RepairStatus } from '@/types'

const auth = useAuthStore()
const list = useRepairListStore()
const orders = useOrderStore()
const router = useRouter()

const isTech = computed(() => auth.role === 'TECHNICIAN')
const isQuality = computed(() => auth.role === 'QUALITY')
const isParts = computed(() => auth.role === 'PARTS')

onMounted(() => {
  if (!isParts.value) {
    list.resetQuery()
    void list.fetch()
    list.startLive()
  } else {
    void orders.fetchAll()
  }
})
onBeforeUnmount(() => list.stopLive())

const ACTION_STATUSES: RepairStatus[] = isTech.value
  ? ['ADDITIONAL_INFO_NEEDED', 'DIAGNOSIS_COMPLETED', 'TECHNICIAN_REVIEW', 'REJECTED']
  : ['HQ_APPROVAL', 'MANUAL_REVIEW']
const todo = computed(() => list.items.filter((r) => ACTION_STATUSES.includes(r.status) || (isTech.value && r.analysisError)))
const recent = computed(() => list.items.slice(0, 6))

function goList(status: RepairStatus) {
  void router.push({ path: isQuality.value && (status === 'HQ_APPROVAL' || status === 'MANUAL_REVIEW') ? '/approvals' : '/repairs', query: { status } })
}
const lowStock = computed(() => orders.parts.filter((p) => p.stocks.reduce((a, s) => a + s.quantity, 0) < 3))
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? '좋은 아침입니다' : h < 18 ? '안녕하세요' : '수고 많으셨습니다'
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ greeting }}, {{ auth.user?.name }}님</h1>
        <p class="sub">{{ auth.user?.branch }} · {{ auth.role ? ROLE_LABEL[auth.role] : '' }}</p>
      </div>
      <RouterLink v-if="isTech" to="/repairs/new" class="btn btn-primary btn-lg"><PlusCircle :size="22" /> 신규 수리 접수</RouterLink>
      <RouterLink v-if="isQuality" to="/dashboard" class="btn btn-lg"><BarChart3 :size="22" /> 품질 대시보드</RouterLink>
    </div>

    <!-- ===== 기사 / 품질 ===== -->
    <template v-if="!isParts">
      <div class="grid-4">
        <template v-if="isTech">
          <StatCard label="추가 사진 필요" :value="list.counts.needPhoto" :icon="Camera" tone="warning" hint="AI 가 사진을 더 요청한 건" @select="goList('ADDITIONAL_INFO_NEEDED')" />
          <StatCard label="기사 검토 대기" :value="list.counts.technicianReview" :icon="UserCheck" tone="ai" hint="진단 초안 확인 · 수리 결과 입력" @select="goList('DIAGNOSIS_COMPLETED')" />
          <StatCard label="본사 승인 대기" :value="list.counts.hqApproval" :icon="Building2" tone="warning" @select="goList('HQ_APPROVAL')" />
          <StatCard label="수리 완료" :value="list.counts.completed" :icon="CircleCheck" tone="success" hint="본사 승인 완료" @select="goList('APPROVED')" />
        </template>
        <template v-else>
          <StatCard label="본사 승인 대기" :value="list.counts.hqApproval" :icon="Building2" tone="warning" hint="기사 수리 결과 검토" @select="goList('HQ_APPROVAL')" />
          <StatCard label="수동 검토 요청" :value="list.counts.manualReview" :icon="Hand" tone="danger" hint="AI 판독 불가 · 기사 요청" @select="goList('MANUAL_REVIEW')" />
          <StatCard label="AI 분석 중" :value="list.counts.analyzing" :icon="Loader" tone="ai" @select="goList('ANALYZING')" />
          <StatCard label="승인 완료" :value="list.counts.completed" :icon="CircleCheck" tone="success" hint="고장 DB 반영됨" @select="goList('APPROVED')" />
        </template>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>지금 처리할 일 <span class="badge tone-warning">{{ todo.length }}건</span></h2>
          <RouterLink :to="isQuality ? '/approvals' : '/repairs'" class="btn btn-sm">전체 보기 <ArrowRight :size="16" /></RouterLink>
        </div>
        <div v-if="list.loading && !list.items.length" class="card-body"><SkeletonBlock :lines="4" :height="44" /></div>
        <StateView v-else-if="list.error" state="error" :message="list.error" compact @retry="list.fetch()" />
        <StateView v-else-if="!todo.length" state="empty" title="처리할 일이 없습니다" message="새 건이 들어오면 알림으로 알려 드립니다." compact />
        <ul v-else class="todo">
          <li v-for="r in todo" :key="r.id">
            <RouterLink :to="repairLink(r, auth.role)" class="todo-item">
              <RepairStatusBadge :status="r.status" :failed="!!r.analysisError" />
              <span class="t-main">
                <strong>{{ nextAction(r, auth.role) }}</strong>
                <span class="faint">수리 {{ repairId(r.id) }} · {{ r.product.model }} · {{ r.symptom }}</span>
              </span>
              <span class="faint t-time">{{ formatRelative(r.updatedAt) }}</span>
              <ArrowRight :size="20" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>최근 수리 건</h2>
        </div>
        <div v-if="list.loading && !list.items.length" class="card-body"><SkeletonBlock :lines="5" :height="40" /></div>
        <StateView v-else-if="!recent.length && !list.error" state="empty" title="접수된 수리 건이 없습니다" compact>
          <RouterLink v-if="isTech" to="/repairs/new" class="btn btn-primary"><PlusCircle :size="18" /> 첫 수리 접수하기</RouterLink>
        </StateView>
        <RepairTable v-else :items="recent" :role="auth.role" :show-tech="isQuality" />
      </section>
    </template>

    <!-- ===== 부품 담당자 ===== -->
    <template v-else>
      <div class="grid-3">
        <StatCard label="발주 승인 대기" :value="orders.pendingApproval.length" :icon="Package" tone="warning" @select="router.push('/parts')" />
        <StatCard label="재고 부족 부품" :value="lowStock.length" :icon="Package" tone="danger" hint="전체 창고 합계 3개 미만" @select="router.push('/parts')" />
        <StatCard label="이번 달 승인" :value="orders.orders.filter((o) => o.status === 'APPROVED').length" :icon="CircleCheck" tone="success" @select="router.push('/parts')" />
      </div>
      <section class="card">
        <div class="card-head">
          <h2>승인이 필요한 발주 요청</h2>
          <RouterLink to="/parts" class="btn btn-sm">부품 및 발주로 이동 <ArrowRight :size="16" /></RouterLink>
        </div>
        <div v-if="orders.loading" class="card-body"><SkeletonBlock :lines="3" :height="44" /></div>
        <StateView v-else-if="!orders.pendingApproval.length" state="empty" title="승인 대기 중인 발주가 없습니다" compact />
        <ul v-else class="todo">
          <li v-for="o in orders.pendingApproval" :key="o.id">
            <RouterLink to="/parts" class="todo-item">
              <span class="badge tone-warning">승인 대기</span>
              <span class="t-main">
                <strong>{{ o.partName }} ({{ o.partNo }}) · {{ o.quantity }}개</strong>
                <span class="faint">수리 {{ repairId(o.repairId) }} · {{ o.fromWarehouse }} · 요청 {{ o.requestedBy }}</span>
              </span>
              <span class="faint t-time">{{ formatRelative(o.requestedAt) }}</span>
              <ArrowRight :size="20" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.todo {
  list-style: none;
  margin: 0;
  padding: 6px 10px 10px;
  display: grid;
}
.todo-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 16px;
  padding: 14px 12px;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text);
  min-height: 64px;
}
.todo-item:hover {
  background: var(--navy-50);
}
.todo li + li .todo-item {
  border-top: 1px solid var(--border);
}
.t-main {
  display: grid;
  min-width: 0;
}
.t-main .faint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-time {
  white-space: nowrap;
}
@media (max-width: 700px) {
  .todo-item {
    grid-template-columns: 1fr auto;
  }
  .todo-item > .badge,
  .t-time {
    display: none;
  }
}
</style>
