<script setup lang="ts">
/* 수리 건별 필요 부품 · 재고 · 발주 요청 (기사)
 * AI 추천 부품마다 전체 창고 재고를 확인해 재고로 수리 가능 / 재고 부족 · 발주 필요로 분기한다 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, Info, Plus, Warehouse } from 'lucide-vue-next'
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
import { repairId } from '@/utils/format'
import type { Part, PurchaseOrder } from '@/types'

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
    toast.success(`${o.partName} 발주 요청을 등록했습니다. 본사 품질 담당자 승인을 기다립니다.`)
  } catch (e) {
    toast.error(toErrorMessage(e))
  }
}
/** 화면에서만 쓰는 발주 초안 카드 (요청 등록 전 확인용). 등록 시 서버에 새 발주로 만들어진다 */
function addLocalDraft(p: Part, quantity: number, reason: string) {
  if (orders.repairOrders.some((o) => o.partId === p.id)) return
  const best = [...p.stocks].sort((a, b) => b.quantity - a.quantity)[0]
  orders.repairOrders.push({
    id: `local-${p.id}`,
    repairId: id.value,
    receiptNo: detail.repair?.receiptNo ?? '',
    partId: p.id,
    partNo: p.partNo,
    partName: p.name,
    quantity,
    fromWarehouse: best?.warehouse ?? '',
    aiReason: reason,
    aiConfidence: 0,
    sourceIds: [],
    status: 'AI_DRAFT',
    decision: { state: 'PENDING' },
    createdAt: new Date().toISOString(),
  })
}
// 기사가 직접 고른 부품: AI 발주안이 아니므로 바로 "요청" 이 아닌 초안 카드를 만든 뒤 확인을 거친다
function addManual() {
  const p = orders.partById(extraPart.value)
  if (!p) return
  addLocalDraft(p, 1, '기사가 직접 추가한 부품입니다 (AI 추천 아님).')
  extraPart.value = ''
}

/* ---------- AI 추천 부품별 재고 분기 ---------- */
const totalStock = (p?: Part) => p?.stocks.reduce((a, s) => a + s.quantity, 0) ?? 0
/** 재고가 충분해 발주 없이 수리 가능한 추천 부품 (발주 카드가 아직 없는 것만) */
const inStock = computed(() =>
  confirmed.value
    ? (detail.diagnosis?.parts ?? [])
        .map((rec) => ({ rec, part: orders.partById(rec.partId) }))
        .filter((x): x is { rec: typeof x.rec; part: Part } => !!x.part && totalStock(x.part) >= x.rec.quantity && !orders.repairOrders.some((o) => o.partId === x.rec.partId))
    : [],
)
function forceOrder(x: (typeof inStock.value)[number]) {
  addLocalDraft(x.part, x.rec.quantity, `${x.rec.reason}. 창고 재고(${totalStock(x.part)}개)가 있지만 기사 판단으로 발주를 요청합니다.`)
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
          <p class="sub">수리 ID {{ repairId(detail.repair.id) }} · {{ detail.repair.product.modelName }} · 시리얼 {{ detail.repair.product.serialNumber }}</p>
        </div>
        <RouterLink v-if="auth.role === 'TECHNICIAN' && detail.repair.status === 'TECHNICIAN_REVIEW'" :to="`/repairs/${id}/review`" class="btn btn-primary btn-lg">수리 리포트 작성 <ArrowRight :size="20" /></RouterLink>
      </div>

      <div class="callout tone-info">
        <Info :size="22" />
        <div><strong>AI 는 발주안을 제안만 합니다.</strong> 기사님이 수량·창고를 확인하고 “발주 요청 등록”을 눌러야 요청되며, 본사 품질 담당자가 승인해야 출고됩니다.</div>
      </div>

      <section v-if="!confirmed && detail.diagnosis?.technicianDecision.state !== 'REJECTED'" class="card">
        <StateView state="empty" title="진단을 먼저 확인해 주세요" message="AI 진단 내용을 확인하면 필요 부품의 발주안이 만들어집니다.">
          <RouterLink :to="`/repairs/${id}/diagnosis`" class="btn btn-primary">진단 결과로 이동</RouterLink>
        </StateView>
      </section>

      <template v-else>
        <div v-if="orders.loading && !orders.repairOrders.length" class="card card-pad"><SkeletonBlock :lines="5" :height="32" /></div>
        <template v-else>
          <template v-if="inStock.length">
            <h2 class="sec">재고로 수리 가능</h2>
            <article v-for="x in inStock" :key="x.rec.partId" class="card in-stock">
              <div class="card-body stack">
                <div class="callout tone-success">
                  <Warehouse :size="22" />
                  <div>
                    <strong>창고 재고로 수리 가능 · {{ x.rec.partName }}</strong> <span class="mono faint">{{ x.rec.partNo }}</span>
                    필요 {{ x.rec.quantity }}개 / 전체 재고 {{ totalStock(x.part) }}개 — 발주하지 않고 창고에서 바로 가져다 쓸 수 있습니다.
                  </div>
                </div>
                <table class="table locs">
                  <caption class="sr-only">{{ x.rec.partName }} 창고별 재고</caption>
                  <thead><tr><th>창고</th><th>위치</th><th>수량</th></tr></thead>
                  <tbody>
                    <tr v-for="s in x.part.stocks.filter((s) => s.quantity > 0)" :key="s.warehouse">
                      <td>{{ s.warehouse }}</td>
                      <td class="mono">{{ s.location }}</td>
                      <td><strong>{{ s.quantity }}개</strong></td>
                    </tr>
                  </tbody>
                </table>
                <p class="faint">AI 추천 이유: {{ x.rec.reason }}</p>
                <button v-if="auth.role === 'TECHNICIAN'" type="button" class="link-btn" @click="forceOrder(x)">그래도 발주 요청하기</button>
              </div>
            </article>
          </template>

          <h2 class="sec">발주안 · 발주 요청</h2>
          <StateView v-if="!orders.repairOrders.length" state="empty" :title="inStock.length ? '발주가 필요한 부품이 없습니다' : 'AI 가 추천한 교체 부품이 없습니다'" message="필요한 부품이 있으면 아래에서 직접 추가하세요." compact />
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
.in-stock {
  border-left: 4px solid var(--success);
}
.locs {
  max-width: 560px;
}
.link-btn {
  justify-self: start;
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--text-2);
  font-size: var(--fs-sm);
  text-decoration: underline;
  cursor: pointer;
}
.link-btn:hover {
  color: var(--navy-800);
}
.add .select {
  flex: 1 1 280px;
  width: auto;
}
</style>
