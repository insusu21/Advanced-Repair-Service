<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, PlusCircle, X, Camera, UserCheck, Building2, CircleCheck, RefreshCw } from 'lucide-vue-next'
import StatCard from '@/components/common/StatCard.vue'
import StateView from '@/components/common/StateView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import RepairTable from '@/components/repair/RepairTable.vue'
import { useRepairListStore } from '@/stores/repairs'
import { useAuthStore } from '@/stores/auth'
import { STATUS_META, STATUS_ORDER } from '@/constants/status'
import { MODELS } from '@/mocks/data'
import { formatRelative } from '@/utils/format'
import type { RepairQuery, RepairStatus } from '@/types'

const store = useRepairListStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const keyword = ref(store.query.keyword ?? '')

const statuses = STATUS_ORDER.filter((s) => s !== 'DRAFT')

function syncFromRoute() {
  const s = route.query.status
  store.query.status = typeof s === 'string' && (STATUS_ORDER as string[]).includes(s) ? (s as RepairStatus) : 'ALL'
  store.query.keyword = typeof route.query.q === 'string' ? route.query.q : ''
  keyword.value = store.query.keyword
}

onMounted(() => {
  syncFromRoute()
  void store.fetch()
  store.startLive()
})
onBeforeUnmount(() => store.stopLive())

// 검색어 입력 디바운스
let t: number | undefined
watch(keyword, (v) => {
  window.clearTimeout(t)
  t = window.setTimeout(() => {
    store.query.keyword = v
    void router.replace({ query: { ...route.query, q: v || undefined } })
    void store.fetch()
  }, 300)
})

function setStatus(s: RepairQuery['status']) {
  store.query.status = s
  void router.replace({ query: { ...route.query, status: s === 'ALL' ? undefined : s } })
  void store.fetch()
}
function onSort() {
  void store.fetch()
}
function clearAll() {
  keyword.value = ''
  store.resetQuery()
  void router.replace({ query: {} })
  void store.fetch()
}
const filtered = computed(() => store.query.status !== 'ALL' || !!store.query.keyword || !!store.query.model)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>수리 목록</h1>
        <p class="sub">
          {{ auth.role === 'TECHNICIAN' ? `${auth.user?.branch} 접수 건` : '전체 서비스센터 접수 건' }}
          <span v-if="store.loadedAt" class="faint"> · {{ formatRelative(store.loadedAt) }} 갱신 · 실시간 반영 중</span>
        </p>
      </div>
      <div class="row">
        <button class="btn" type="button" :disabled="store.loading" @click="store.fetch()"><RefreshCw :size="18" :class="{ spin: store.loading }" /> 새로고침</button>
        <RouterLink v-if="auth.role === 'TECHNICIAN'" to="/repairs/new" class="btn btn-primary"><PlusCircle :size="20" /> 신규 수리 접수</RouterLink>
      </div>
    </div>

    <div class="grid-4">
      <StatCard label="추가 사진 필요" :value="store.counts.needPhoto" :icon="Camera" tone="warning" :active="store.query.status === 'ADDITIONAL_INFO_NEEDED'" @select="setStatus('ADDITIONAL_INFO_NEEDED')" />
      <StatCard label="기사 검토 대기" :value="store.counts.technicianReview" :icon="UserCheck" tone="ai" :active="store.query.status === 'DIAGNOSIS_COMPLETED'" @select="setStatus('DIAGNOSIS_COMPLETED')" />
      <StatCard label="본사 승인 대기" :value="store.counts.hqApproval" :icon="Building2" tone="warning" :active="store.query.status === 'HQ_APPROVAL'" @select="setStatus('HQ_APPROVAL')" />
      <StatCard label="수리 완료" :value="store.counts.completed" :icon="CircleCheck" tone="success" :active="store.query.status === 'APPROVED'" @select="setStatus('APPROVED')" />
    </div>

    <section class="card">
      <div class="filters">
        <div class="search">
          <Search :size="20" class="si" aria-hidden="true" />
          <label for="kw" class="sr-only">검색</label>
          <input id="kw" v-model="keyword" class="input" type="search" placeholder="접수번호 · 시리얼 · 모델 · 증상 · 에러코드 · 기사 이름" />
        </div>
        <div class="field inline">
          <label for="model">모델</label>
          <select id="model" v-model="store.query.model" class="select" @change="store.fetch()">
            <option :value="undefined">전체</option>
            <option v-for="m in Object.keys(MODELS)" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div class="field inline">
          <label for="sort">정렬</label>
          <select id="sort" v-model="store.query.sort" class="select" @change="onSort">
            <option value="receivedAt_desc">최근 접수순</option>
            <option value="receivedAt_asc">오래된 접수순</option>
            <option value="urgency">긴급도순</option>
          </select>
        </div>
        <button v-if="filtered" type="button" class="btn btn-ghost" @click="clearAll"><X :size="18" /> 필터 초기화</button>
      </div>
      <div class="chips" role="radiogroup" aria-label="진단 상태 필터">
        <button type="button" class="chip" role="radio" :aria-checked="store.query.status === 'ALL'" @click="setStatus('ALL')">전체</button>
        <button v-for="s in statuses" :key="s" type="button" class="chip" role="radio" :aria-checked="store.query.status === s" @click="setStatus(s)">
          <component :is="STATUS_META[s].icon" :size="15" /> {{ STATUS_META[s].label }}
        </button>
      </div>

      <div v-if="store.loading && !store.items.length" class="card-body"><SkeletonBlock :lines="6" :height="44" /></div>
      <StateView v-else-if="store.error" state="error" :message="store.error" @retry="store.fetch()" />
      <StateView v-else-if="!store.items.length" state="empty" :title="filtered ? '조건에 맞는 수리 건이 없습니다' : '접수된 수리 건이 없습니다'" :message="filtered ? '검색어나 상태 필터를 바꿔 보세요.' : undefined">
        <button v-if="filtered" class="btn" type="button" @click="clearAll">필터 초기화</button>
        <RouterLink v-else-if="auth.role === 'TECHNICIAN'" to="/repairs/new" class="btn btn-primary">신규 수리 접수</RouterLink>
      </StateView>
      <template v-else>
        <p class="faint count" aria-live="polite">{{ store.items.length }}건</p>
        <RepairTable :items="store.items" :role="auth.role" :class="{ dim: store.loading }" />
      </template>
    </section>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 12px;
  padding: 16px 20px 8px;
  flex-wrap: wrap;
  align-items: flex-end;
}
.search {
  position: relative;
  flex: 1 1 320px;
}
.search .input {
  padding-left: 44px;
}
.si {
  position: absolute;
  left: 14px;
  top: 14px;
  color: var(--text-3);
}
.field.inline {
  grid-template-columns: auto 160px;
  align-items: center;
}
.field.inline label {
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 20px 14px;
  border-bottom: 1px solid var(--border);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  font-weight: 600;
  font-size: var(--fs-sm);
  cursor: pointer;
}
.chip[aria-checked='true'] {
  background: var(--navy-800);
  border-color: var(--navy-800);
  color: #fff;
}
.count {
  padding: 10px 20px 0;
}
.dim {
  opacity: 0.6;
  transition: opacity 0.2s;
}
</style>
