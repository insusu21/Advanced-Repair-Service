<script setup lang="ts">
/* 수리 건별 필요 부품 · 재고 · 발주 요청 (기사) */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, Info, Plus } from 'lucide-vue-next'
import RepairFlowNav from '@/components/repair/RepairFlowNav.vue'
import PartInventoryCard from '@/components/parts/PartInventoryCard.vue'
import PurchaseApprovalCard from '@/components/parts/PurchaseApprovalCard.vue'
import StateView from '@/components/common/StateView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useRepairDetailStore } from '@/stores/repairDetail'
import { useOrderStore } from '@/stores/orders'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { toErrorMessage } from '@/api'
import type { PurchaseOrder } from '@/types'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const detail = useRepairDetailStore()
const orders = useOrderStore()
const auth = useAuthStore()
const toast = useToastStore()
const extraPart = ref('')

async function load() {
  await detail.load(id.value)
  await detail.loadDiagnosis(id.value)
  await orders.fetchForRepair(id.value)
}
onMounted(load)

const confirmed = computed(() => detail.diagnosis?.technicianDecision.state === 'APPROVED')
const neededPartIds = computed(() => [...new Set([...(detail.diagnosis?.parts.map((p) => p.partId) ?? []), ...orders.repairOrders.map((o) => o.partId)])])
const compatible = computed(() => orders.parts.filter((p) => detail.repair && p.compatibleModels.includes(detail.repair.product.model) && !neededPartIds.value.includes(p.id)))

async function request(o: PurchaseOrder, payload: { quantity: number; fromWarehouse: string; comment: string }) {
  try {
    await orders.request(id.value, { draftOrderId: o.id, partId: o.partId, ...payload })
    toast.success(`${o.partName} 발주 요청을 등록했습니다. 부품 담당자 승인을 기다립니다.`)
  } catch (e) {
    toast.error(toErrorMessage(e))
  }
}
async function addManual() {
  const p = orders.partById(extraPart.value)
  if (!p) return
  const best = [...p.stocks].sort((a, b) => b.quantity - a.quantity)[0]
  try {
    // 기사가 직접 고른 부품: AI 발주안이 아니므로 바로 "요청" 이 아닌 초안 카드를 만든 뒤 확인을 거친다
    orders.repairOrders.push({
      id: `local-${p.id}`,
      repairId: id.value,
      receiptNo: detail.repair?.receiptNo ?? '',
      partId: p.id,
      partNo: p.partNo,
      partName: p.name,
      quantity: 1,
      fromWarehouse: best?.warehouse ?? '',
      aiReason: '기사가 직접 추가한 부품입니다 (AI 추천 아님).',
      aiConfidence: 0,
      sourceIds: [],
      status: 'AI_DRAFT',
      decision: { state: 'PENDING' },
      createdAt: new Date().toISOString(),
    })
    extraPart.value = ''
  } catch (e) {
    toast.error(toErrorMessage(e))
  }
}
async function requestAny(o: PurchaseOrder, payload: { quantity: number; fromWarehouse: string; comment: string }) {
  if (o.id.startsWith('local-')) {
    try {
      const created = await orders.request(id.value, { partId: o.partId, ...payload })
      orders.repairOrders = orders.repairOrders.filter((x) => x.id !== o.id && x.id !== created.id).concat(created)
      toast.success(`${o.partName} 발주 요청을 등록했습니다.`)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  } else await request(o, payload)
}
</script>

<template>
  <div class="page">
    <div v-if="detail.loading && !detail.repair" class="stack"><SkeletonBlock :lines="2" :height="60" /></div>
    <StateView v-else-if="detail.error && !detail.repair" state="error" :message="detail.error" @retry="load" />

    <template v-else-if="detail.repair">
      <RepairFlowNav :repair="detail.repair" />
      <div class="page-head">
        <div>
          <h1>필요 부품 · 발주 요청</h1>
          <p class="sub">{{ detail.repair.receiptNo }} · {{ detail.repair.product.modelName }}</p>
        </div>
        <RouterLink v-if="auth.role === 'TECHNICIAN' && detail.repair.status === 'TECHNICIAN_REVIEW'" :to="`/repairs/${id}/review`" class="btn btn-primary btn-lg">수리 결과 입력 <ArrowRight :size="20" /></RouterLink>
      </div>

      <div class="callout tone-info">
        <Info :size="22" />
        <div><strong>AI 는 발주안을 제안만 합니다.</strong> 기사님이 수량·창고를 확인하고 “발주 요청 등록”을 눌러야 요청되며, 부품 담당자가 승인해야 출고됩니다.</div>
      </div>

      <section v-if="!confirmed && detail.diagnosis?.technicianDecision.state !== 'REJECTED'" class="card">
        <StateView state="empty" title="진단을 먼저 확인해 주세요" message="AI 진단 내용을 확인하면 필요 부품의 발주안이 만들어집니다.">
          <RouterLink :to="`/repairs/${id}/diagnosis`" class="btn btn-primary">진단 결과로 이동</RouterLink>
        </StateView>
      </section>

      <template v-else>
        <div v-if="orders.loading && !orders.repairOrders.length" class="card card-pad"><SkeletonBlock :lines="5" :height="32" /></div>
        <template v-else>
          <h2 class="sec">발주안 · 발주 요청</h2>
          <StateView v-if="!orders.repairOrders.length" state="empty" title="AI 가 추천한 교체 부품이 없습니다" message="필요한 부품이 있으면 아래에서 직접 추가하세요." compact />
          <div class="stack">
            <PurchaseApprovalCard
              v-for="o in orders.repairOrders"
              :key="o.id"
              :order="o"
              :part="orders.partById(o.partId)"
              :role="auth.role"
              :busy="orders.submittingId === o.id || orders.submittingId === o.partId"
              @request="requestAny(o, $event)"
            />
          </div>

          <div v-if="auth.role === 'TECHNICIAN'" class="card card-pad row add">
            <label for="extra" class="label">다른 부품 직접 추가</label>
            <select id="extra" v-model="extraPart" class="select">
              <option value="">호환 부품 선택</option>
              <option v-for="p in compatible" :key="p.id" :value="p.id">{{ p.name }} ({{ p.partNo }})</option>
            </select>
            <button type="button" class="btn" :disabled="!extraPart" @click="addManual"><Plus :size="18" /> 추가</button>
          </div>

          <h2 class="sec">재고 · 생산 공장</h2>
          <div class="grid-2">
            <template v-for="pid in neededPartIds" :key="pid">
              <PartInventoryCard v-if="orders.partById(pid)" :part="orders.partById(pid)!" />
            </template>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.sec {
  font-size: var(--fs-lg);
  margin-top: 8px;
}
.add {
  flex-wrap: wrap;
}
.add .select {
  flex: 1 1 280px;
  width: auto;
}
</style>
