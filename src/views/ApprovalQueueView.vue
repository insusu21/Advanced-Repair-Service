<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, CircleCheck, CircleAlert, CircleX, Hand, RefreshCw } from 'lucide-vue-next'
import StateView from '@/components/common/StateView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import RepairStatusBadge from '@/components/common/RepairStatusBadge.vue'
import { repairApi, toErrorMessage } from '@/api'
import type { Repair } from '@/types'
import { formatDateTime, formatRelative } from '@/utils/format'

const router = useRouter()
const items = ref<Repair[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const tab = ref<'HQ_APPROVAL' | 'MANUAL_REVIEW'>('HQ_APPROVAL')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await repairApi.approvalQueue()
  } catch (e) {
    error.value = toErrorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const list = computed(() => items.value.filter((r) => r.status === tab.value))
const count = (s: Repair['status']) => items.value.filter((r) => r.status === s).length
const MATCH = {
  MATCH: { l: '일치', tone: 'success', icon: CircleCheck },
  PARTIAL: { l: '일부 일치', tone: 'warning', icon: CircleAlert },
  MISMATCH: { l: '불일치', tone: 'danger', icon: CircleX },
} as const
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>승인 대기</h1>
        <p class="sub">승인한 결과만 사내 고장 DB 와 품질 대시보드에 반영됩니다. 오래 기다린 건부터 표시합니다.</p>
      </div>
      <button class="btn" type="button" :disabled="loading" @click="load"><RefreshCw :size="18" :class="{ spin: loading }" /> 새로고침</button>
    </div>

    <div class="tabs" role="tablist">
      <button type="button" role="tab" class="tab" :aria-selected="tab === 'HQ_APPROVAL'" @click="tab = 'HQ_APPROVAL'">수리 결과 승인 <span class="badge tone-warning">{{ count('HQ_APPROVAL') }}</span></button>
      <button type="button" role="tab" class="tab" :aria-selected="tab === 'MANUAL_REVIEW'" @click="tab = 'MANUAL_REVIEW'"><Hand :size="18" /> 수동 검토 요청 <span class="badge tone-danger">{{ count('MANUAL_REVIEW') }}</span></button>
    </div>

    <section class="card">
      <div v-if="loading && !items.length" class="card-body"><SkeletonBlock :lines="5" :height="44" /></div>
      <StateView v-else-if="error" state="error" :message="error" @retry="load" />
      <StateView v-else-if="!list.length" state="empty" :title="tab === 'HQ_APPROVAL' ? '승인을 기다리는 수리 결과가 없습니다' : '수동 검토 요청이 없습니다'" />
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>접수번호</th>
              <th>모델</th>
              <th>AI 진단 원인</th>
              <th v-if="tab === 'HQ_APPROVAL'">기사 확인 원인</th>
              <th v-if="tab === 'HQ_APPROVAL'">AI 일치</th>
              <th v-else>상태</th>
              <th>담당 기사</th>
              <th>대기</th>
              <th><span class="sr-only">열기</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in list" :key="r.id" class="clickable" tabindex="0" @click="router.push(`/approvals/${r.id}`)" @keydown.enter="router.push(`/approvals/${r.id}`)">
              <td class="mono rno">{{ r.receiptNo }}</td>
              <td><strong>{{ r.product.model }}</strong></td>
              <td><span class="ai-cell">{{ r.aiTopCause ?? 'AI 진단 없음' }}</span></td>
              <template v-if="tab === 'HQ_APPROVAL' && r.technicianReview">
                <td><strong>{{ r.technicianReview.actualCause }}</strong></td>
                <td>
                  <span class="badge" :class="`tone-${MATCH[r.technicianReview.aiMatch].tone}`">
                    <component :is="MATCH[r.technicianReview.aiMatch].icon" :size="15" /> {{ MATCH[r.technicianReview.aiMatch].l }}
                  </span>
                </td>
              </template>
              <td v-else><RepairStatusBadge :status="r.status" /></td>
              <td>{{ r.technician }}<div class="faint">{{ r.branch }}</div></td>
              <td class="nowrap">{{ formatRelative(r.updatedAt) }}<div class="faint">{{ formatDateTime(r.updatedAt) }}</div></td>
              <td><ChevronRight :size="20" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 6px;
  border-bottom: 2px solid var(--border);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 18px;
  border: 0;
  background: transparent;
  font-weight: 700;
  color: var(--text-2);
  cursor: pointer;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
}
.tab[aria-selected='true'] {
  color: var(--navy-900);
  border-bottom-color: var(--navy-800);
}
.rno {
  font-weight: 700;
  color: var(--navy-700);
}
.ai-cell {
  color: var(--ai);
  border-bottom: 1px dashed var(--ai-border);
}
.nowrap {
  white-space: nowrap;
}
</style>
