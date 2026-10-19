<script setup lang="ts">
/* 기사 확인 및 수리 결과 입력 — 사람이 입력한 "실제 결과" 가 본사 승인 후 고장 DB 에 반영된다 */
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CircleCheck, CircleAlert, CircleX, Plus, Trash2, Send, Sparkles, MessageSquareWarning, History, Building2, Package, PencilLine } from 'lucide-vue-next'
import RepairFlowNav from '@/components/repair/RepairFlowNav.vue'
import RepairSummaryCard from '@/components/repair/RepairSummaryCard.vue'
import ImageUploader from '@/components/repair/ImageUploader.vue'
import TechnicianCommentForm from '@/components/review/TechnicianCommentForm.vue'
import ApprovalHistoryTimeline from '@/components/review/ApprovalHistoryTimeline.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import ConfidenceBar from '@/components/common/ConfidenceBar.vue'
import StateView from '@/components/common/StateView.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import BaseModal from '@/components/common/BaseModal.vue'
import { useRepairPage } from '@/composables/useRepairPage'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { DECISION_META, ROLE_LABEL } from '@/constants/status'
import { PARTS } from '@/mocks/data'
import { toErrorMessage } from '@/api'
import { formatDateTime } from '@/utils/format'
import type { AiMatch } from '@/types'
import type { UploadItem } from '@/types/upload'

const { store, repair, diagnosis, loading, error, submitting, reload } = useRepairPage({ diagnosis: true })
const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()

const editable = computed(() => auth.role === 'TECHNICIAN' && repair.value?.status === 'TECHNICIAN_REVIEW')
const review = computed(() => repair.value?.technicianReview)
const aiRejected = computed(() => diagnosis.value?.technicianDecision.state === 'REJECTED')
const hqChange = computed(() => (review.value?.hqDecision.state === 'CHANGE_REQUESTED' ? review.value.hqDecision : null))
const manualReply = computed(() => [...(repair.value?.history ?? [])].reverse().find((h) => h.actorRole === 'QUALITY' && h.action === 'CHANGE_REQUESTED' && h.target === 'DIAGNOSIS'))

/* ---------- 폼 ---------- */
const form = reactive({
  aiMatch: '' as AiMatch | '',
  causeMode: 'candidate' as 'candidate' | 'custom',
  causeCandidate: '',
  causeCustom: '',
  noParts: false,
  parts: [] as { partNo: string; quantity: number }[],
  repairMethod: '',
  comment: '',
})
const before = ref<UploadItem[]>([])
const after = ref<UploadItem[]>([])
const touched = ref(false)
const confirmOpen = ref(false)
const methodFromAi = ref(false)

// 기존 입력(본사 수정 요청 시) 또는 AI 제안으로 초기값 구성 — AI 값은 "불러오기" 버튼으로만 채움
watch(
  [repair, diagnosis],
  () => {
    if (!repair.value || form.aiMatch) return
    const rv = repair.value.technicianReview
    if (rv) {
      form.aiMatch = rv.aiMatch
      const isCand = diagnosis.value?.candidates.some((c) => c.cause === rv.actualCause)
      form.causeMode = isCand ? 'candidate' : 'custom'
      form.causeCandidate = isCand ? rv.actualCause : ''
      form.causeCustom = isCand ? '' : rv.actualCause
      form.parts = rv.replacedParts.map((p) => ({ partNo: p.partNo, quantity: p.quantity }))
      form.noParts = !rv.replacedParts.length
      form.repairMethod = rv.repairMethod
      form.comment = rv.comment
    } else if (aiRejected.value) {
      form.aiMatch = 'MISMATCH'
      form.causeMode = 'custom'
    }
  },
  { immediate: true },
)
watch(() => form.noParts, (v) => v && (form.parts = []))

const actualCause = computed(() => (form.causeMode === 'candidate' ? form.causeCandidate : form.causeCustom).trim())
const errs = computed(() => ({
  aiMatch: !form.aiMatch ? 'AI 진단이 맞았는지 선택해 주세요.' : null,
  cause: !actualCause.value ? '실제 고장 원인을 선택하거나 입력해 주세요.' : null,
  parts: !form.noParts && !form.parts.filter((p) => p.partNo).length ? '교체한 부품을 추가하거나 "교체 부품 없음"을 선택해 주세요.' : null,
  method: form.repairMethod.trim().length < 5 ? '실제 수리 방법을 5자 이상 입력해 주세요.' : null,
  after: !after.value.length ? '수리 후 사진을 1장 이상 등록해 주세요.' : null,
  comment: form.aiMatch && form.aiMatch !== 'MATCH' && form.comment.trim().length < 5 ? 'AI 진단과 다른 경우, 다른 점을 코멘트에 적어 주세요.' : null,
}))
const valid = computed(() => Object.values(errs.value).every((v) => !v))

function addPart(partNo = '') {
  form.noParts = false
  form.parts.push({ partNo, quantity: 1 })
}
function loadAiMethod() {
  if (!diagnosis.value) return
  form.repairMethod = diagnosis.value.repairMethod.join('\n')
  methodFromAi.value = true
}
function loadAiParts() {
  if (!diagnosis.value) return
  form.noParts = false
  form.parts = diagnosis.value.parts.map((p) => ({ partNo: p.partNo, quantity: p.quantity }))
}

function openConfirm() {
  touched.value = true
  if (!valid.value) {
    toast.warning('빠진 항목을 확인해 주세요.')
    setTimeout(() => document.querySelector<HTMLElement>('.error-text')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    return
  }
  confirmOpen.value = true
}
async function submit() {
  try {
    await store.submitReview({
      aiMatch: form.aiMatch as AiMatch,
      actualCause: actualCause.value,
      replacedParts: form.parts.filter((p) => p.partNo).map((p) => ({ ...p, partName: PARTS.find((x) => x.partNo === p.partNo)?.name ?? p.partNo })),
      repairMethod: form.repairMethod.trim(),
      comment: form.comment.trim(),
      beforeImages: before.value.map((i) => ({ kind: 'BEFORE', file: i.file, dataUrl: i.dataUrl })),
      afterImages: after.value.map((i) => ({ kind: 'AFTER', file: i.file, dataUrl: i.dataUrl })),
    })
    confirmOpen.value = false
    toast.success('본사 승인을 요청했습니다.')
    void router.push('/')
  } catch (e) {
    toast.error(toErrorMessage(e))
  }
}
const MATCH = [
  { v: 'MATCH', l: '맞음', d: 'AI 진단 원인과 실제 원인이 같음', icon: CircleCheck },
  { v: 'PARTIAL', l: '일부 맞음', d: '원인은 비슷하나 부품·범위가 다름', icon: CircleAlert },
  { v: 'MISMATCH', l: '틀림', d: '실제 원인이 다름', icon: CircleX },
] as const
const partOptions = computed(() => PARTS.filter((p) => !repair.value || p.compatibleModels.includes(repair.value.product.model)))
</script>

<template>
  <div class="page">
    <div v-if="loading && !repair" class="stack"><SkeletonBlock :lines="2" :height="60" /><SkeletonBlock :lines="8" :height="36" /></div>
    <StateView v-else-if="error && !repair" state="error" :message="error" @retry="reload" />

    <template v-else-if="repair">
      <RepairFlowNav :repair="repair" />
      <RepairSummaryCard :repair="repair" compact />

      <!-- 본사 요청 / 상태 안내 -->
      <div v-if="hqChange && editable" class="callout tone-warning" role="alert">
        <MessageSquareWarning :size="22" />
        <div><strong>본사 수정 요청 · {{ hqChange.decidedBy }} ({{ formatDateTime(hqChange.decidedAt) }})</strong>{{ hqChange.comment }}</div>
      </div>
      <div v-if="manualReply && editable && !review" class="callout tone-info">
        <Building2 :size="22" />
        <div><strong>본사 수동 진단 회신 · {{ manualReply.actor }}</strong>{{ manualReply.comment }}</div>
      </div>
      <div v-if="aiRejected && editable" class="callout tone-danger">
        <CircleX :size="22" />
        <div><strong>AI 진단을 반려한 건입니다.</strong> 직접 점검한 실제 결과를 입력해 주세요. (반려 사유: {{ diagnosis?.technicianDecision.comment }})</div>
      </div>

      <!-- ===== 입력 폼 ===== -->
      <div v-if="editable" class="layout">
        <form class="stack" novalidate @submit.prevent="openConfirm">
          <section class="card card-pad stack human-edge">
            <div class="row between">
              <h2 class="section-title">1. AI 진단이 맞았나요?</h2>
              <AiBadge kind="human" label="기사 입력" />
            </div>
            <div class="choice-group" role="radiogroup" aria-label="AI 진단 일치 여부">
              <button v-for="m in MATCH" :key="m.v" type="button" class="choice match" :class="`m-${m.v}`" role="radio" :aria-checked="form.aiMatch === m.v" @click="form.aiMatch = m.v">
                <component :is="m.icon" :size="24" />
                <span><strong>{{ m.l }}</strong><small>{{ m.d }}</small></span>
              </button>
            </div>
            <p v-if="touched && errs.aiMatch" class="error-text"><CircleAlert :size="16" /> {{ errs.aiMatch }}</p>
          </section>

          <section class="card card-pad stack human-edge">
            <h2 class="section-title">2. 실제 고장 원인</h2>
            <div class="choice-group" role="radiogroup" aria-label="원인 입력 방식">
              <button type="button" class="choice" role="radio" :aria-checked="form.causeMode === 'candidate'" :disabled="!diagnosis" @click="form.causeMode = 'candidate'">AI 후보 중에서 선택</button>
              <button type="button" class="choice" role="radio" :aria-checked="form.causeMode === 'custom'" @click="form.causeMode = 'custom'"><PencilLine :size="18" /> 직접 입력</button>
            </div>
            <div v-if="form.causeMode === 'candidate' && diagnosis" class="field">
              <label for="cause-sel" class="req">원인 선택</label>
              <select id="cause-sel" v-model="form.causeCandidate" class="select" :class="{ invalid: touched && errs.cause }">
                <option value="" disabled>원인을 선택하세요</option>
                <option v-for="c in diagnosis.candidates" :key="c.rank" :value="c.cause">{{ c.rank }}순위 · {{ c.cause }} (AI {{ c.confidence }}%)</option>
              </select>
            </div>
            <div v-else class="field">
              <label for="cause-in" class="req">원인 입력</label>
              <input id="cause-in" v-model="form.causeCustom" class="input" :class="{ invalid: touched && errs.cause }" placeholder="예) 배터리 커넥터 산화로 인한 순간 전원 차단" />
            </div>
            <p v-if="touched && errs.cause" class="error-text"><CircleAlert :size="16" /> {{ errs.cause }}</p>
          </section>

          <section class="card card-pad stack human-edge">
            <div class="row between">
              <h2 class="section-title">3. 실제 교체 부품</h2>
              <button v-if="diagnosis?.parts.length" type="button" class="btn btn-sm btn-ai" @click="loadAiParts"><Sparkles :size="16" /> AI 추천 부품 불러오기</button>
            </div>
            <div v-for="(p, i) in form.parts" :key="i" class="part-row">
              <div class="field">
                <label :for="`p-${i}`" class="sr-only">부품</label>
                <select :id="`p-${i}`" v-model="p.partNo" class="select">
                  <option value="" disabled>부품 선택</option>
                  <option v-for="o in partOptions" :key="o.partNo" :value="o.partNo">{{ o.name }} ({{ o.partNo }})</option>
                </select>
              </div>
              <div class="field qty">
                <label :for="`q-${i}`" class="sr-only">수량</label>
                <input :id="`q-${i}`" v-model.number="p.quantity" type="number" min="1" class="input" inputmode="numeric" />
              </div>
              <button type="button" class="btn btn-danger" :aria-label="`${i + 1}번째 부품 삭제`" @click="form.parts.splice(i, 1)"><Trash2 :size="18" /></button>
            </div>
            <div class="row">
              <button type="button" class="btn" @click="addPart()"><Plus :size="18" /> 부품 추가</button>
              <label class="check"><input v-model="form.noParts" type="checkbox" /> 교체 부품 없음</label>
            </div>
            <p v-if="touched && errs.parts" class="error-text"><CircleAlert :size="16" /> {{ errs.parts }}</p>
            <RouterLink :to="`/repairs/${repair.id}/parts`" class="faint link"><Package :size="14" /> 재고·발주 확인하기</RouterLink>
          </section>

          <section class="card card-pad stack human-edge">
            <div class="row between">
              <h2 class="section-title">4. 실제 수리 방법</h2>
              <button v-if="diagnosis" type="button" class="btn btn-sm btn-ai" @click="loadAiMethod"><Sparkles :size="16" /> AI 권장 방법 불러오기</button>
            </div>
            <div class="field">
              <label for="method" class="req">수리 방법</label>
              <textarea id="method" v-model="form.repairMethod" class="textarea" :class="{ invalid: touched && errs.method }" placeholder="실제로 수행한 작업을 순서대로 적어 주세요." @input="methodFromAi = false" />
              <p v-if="methodFromAi" class="help"><Sparkles :size="13" /> AI 권장 내용을 불러왔습니다. 실제 수행한 내용과 다르면 반드시 고쳐 주세요.</p>
              <p v-if="touched && errs.method" class="error-text"><CircleAlert :size="16" /> {{ errs.method }}</p>
            </div>
          </section>

          <section class="card card-pad stack human-edge">
            <h2 class="section-title">5. 기사 코멘트</h2>
            <TechnicianCommentForm v-model="form.comment" :required="!!form.aiMatch && form.aiMatch !== 'MATCH'" :invalid="touched && !!errs.comment" />
            <p v-if="touched && errs.comment" class="error-text"><CircleAlert :size="16" /> {{ errs.comment }}</p>
          </section>

          <section class="card card-pad stack human-edge">
            <h2 class="section-title">6. 수리 전 · 후 사진</h2>
            <div class="grid-2">
              <ImageUploader v-model="before" label="수리 전 사진" description="고장 부위가 보이게 (선택)" :max="3" />
              <ImageUploader v-model="after" label="수리 후 사진" description="교체·수리한 부위가 보이게" required :max="3" :invalid="touched" example-src="/mock/repair-after.svg" />
            </div>
            <p v-if="touched && errs.after" class="error-text"><CircleAlert :size="16" /> {{ errs.after }}</p>
          </section>

          <div class="submit card">
            <p class="faint">제출하면 본사 품질 담당자가 검토합니다. 승인된 결과만 고장 DB·품질 대시보드에 반영됩니다.</p>
            <button type="submit" class="btn btn-primary btn-lg" :disabled="submitting"><Send :size="20" /> 본사 승인 요청</button>
          </div>
        </form>

        <!-- 참고: AI 진단 (읽기 전용) -->
        <aside class="ref">
          <section v-if="diagnosis" class="ai-zone card-pad stack sticky">
            <AiBadge label="참고용 AI 진단 (확정 아님)" />
            <p class="faint">v{{ diagnosis.version }} · {{ formatDateTime(diagnosis.generatedAt) }}</p>
            <h3>{{ diagnosis.topCause }}</h3>
            <ConfidenceBar :value="diagnosis.confidence" label="AI 신뢰도" />
            <div>
              <p class="lbl">원인 후보</p>
              <ol class="mini">
                <li v-for="c in diagnosis.candidates" :key="c.rank">{{ c.cause }} <span class="faint">{{ c.confidence }}%</span></li>
              </ol>
            </div>
            <div>
              <p class="lbl">추천 부품</p>
              <ul class="mini">
                <li v-for="p in diagnosis.parts" :key="p.partNo">{{ p.partName }} ({{ p.partNo }}) × {{ p.quantity }}</li>
              </ul>
            </div>
            <RouterLink :to="`/repairs/${repair.id}/diagnosis`" class="btn btn-sm">진단 상세 보기</RouterLink>
          </section>
          <section v-else class="card card-pad faint">AI 진단 없이 진행하는 건입니다.</section>
        </aside>
      </div>

      <!-- ===== 읽기 전용 ===== -->
      <template v-else>
        <section v-if="review" class="card">
          <div class="card-head">
            <h2>기사 수리 결과</h2>
            <span class="badge" :class="`tone-${DECISION_META[review.hqDecision.state].tone}`">본사 {{ DECISION_META[review.hqDecision.state].label }}</span>
          </div>
          <div class="card-body ro">
            <dl class="kv">
              <dt>AI 진단 일치</dt>
              <dd>{{ { MATCH: '맞음', PARTIAL: '일부 맞음', MISMATCH: '틀림' }[review.aiMatch] }}</dd>
              <dt>실제 원인</dt>
              <dd>{{ review.actualCause }}</dd>
              <dt>교체 부품</dt>
              <dd>{{ review.replacedParts.length ? review.replacedParts.map((p) => `${p.partName} (${p.partNo}) × ${p.quantity}`).join(', ') : '없음' }}</dd>
              <dt>수리 방법</dt>
              <dd class="pre">{{ review.repairMethod }}</dd>
              <dt>기사 코멘트</dt>
              <dd class="pre">{{ review.comment || '-' }}</dd>
              <dt>제출</dt>
              <dd>{{ review.submittedBy }} · {{ formatDateTime(review.submittedAt) }}</dd>
            </dl>
            <div class="photos">
              <figure v-for="img in [...review.beforeImages, ...review.afterImages]" :key="img.id">
                <img :src="img.url" :alt="img.kind === 'BEFORE' ? '수리 전' : '수리 후'" />
                <figcaption class="faint">{{ img.kind === 'BEFORE' ? '수리 전' : '수리 후' }}</figcaption>
              </figure>
            </div>
          </div>
          <div v-if="review.hqDecision.state !== 'PENDING'" class="card-body">
            <div class="decided" :class="review.hqDecision.state === 'APPROVED' ? 'human-zone' : 'neg'">
              <AiBadge v-if="review.hqDecision.state === 'APPROVED'" kind="human" label="본사 승인 · 고장 DB 반영됨" />
              <strong v-else>본사 {{ DECISION_META[review.hqDecision.state].label }}</strong>
              <dl class="kv">
                <dt>승인자</dt>
                <dd>{{ review.hqDecision.decidedBy }} · {{ review.hqDecision.decidedByRole ? ROLE_LABEL[review.hqDecision.decidedByRole] : '' }}</dd>
                <dt>처리 시각</dt>
                <dd>{{ formatDateTime(review.hqDecision.decidedAt) }}</dd>
                <dt>의견</dt>
                <dd>{{ review.hqDecision.comment || '-' }}</dd>
              </dl>
            </div>
          </div>
        </section>
        <section v-else class="card">
          <StateView state="empty" title="아직 입력된 수리 결과가 없습니다" :message="auth.role === 'TECHNICIAN' ? '진단 확인 후 수리 결과를 입력할 수 있습니다.' : '담당 기사가 수리 결과를 입력하면 표시됩니다.'">
            <RouterLink :to="`/repairs/${repair.id}/diagnosis`" class="btn">진단 결과 보기</RouterLink>
          </StateView>
        </section>
        <section class="card">
          <div class="card-head"><h3><History :size="20" /> 처리 이력</h3></div>
          <div class="card-body"><ApprovalHistoryTimeline :records="repair.history" /></div>
        </section>
      </template>
    </template>

    <BaseModal :open="confirmOpen" title="본사 승인 요청 전 확인" :width="620" @close="confirmOpen = false">
      <dl class="kv">
        <dt>AI 진단 일치</dt>
        <dd>{{ MATCH.find((m) => m.v === form.aiMatch)?.l }}</dd>
        <dt>실제 원인</dt>
        <dd>{{ actualCause }}</dd>
        <dt>교체 부품</dt>
        <dd>{{ form.noParts ? '없음' : form.parts.map((p) => `${p.partNo} × ${p.quantity}`).join(', ') }}</dd>
        <dt>사진</dt>
        <dd>수리 전 {{ before.length }}장 · 수리 후 {{ after.length }}장</dd>
      </dl>
      <p class="callout tone-info" style="margin-top: 16px"><Building2 :size="20" /> 제출 후에는 본사 승인 또는 수정 요청 전까지 내용을 바꿀 수 없습니다.</p>
      <template #footer>
        <button class="btn" type="button" @click="confirmOpen = false">다시 확인</button>
        <button class="btn btn-primary" type="button" :disabled="submitting" @click="submit"><Send :size="18" /> {{ submitting ? '요청 중…' : '본사 승인 요청' }}</button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
}
.human-edge {
  border-left: 4px solid var(--success);
}
.match {
  min-height: 72px;
}
.match span {
  display: grid;
}
.match small {
  font-weight: 500;
  color: var(--text-3);
}
.m-MATCH[aria-checked='true'] { border-color: var(--success); background: var(--success-bg); color: var(--success); }
.m-PARTIAL[aria-checked='true'] { border-color: #e08a00; background: var(--warning-bg); color: var(--warning); }
.m-MISMATCH[aria-checked='true'] { border-color: var(--danger); background: var(--danger-bg); color: var(--danger); }
.part-row {
  display: grid;
  grid-template-columns: 1fr 110px auto;
  gap: 8px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}
.check input {
  width: 22px;
  height: 22px;
  accent-color: var(--navy-800);
}
.link {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.submit {
  position: sticky;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  box-shadow: var(--shadow-lg);
  flex-wrap: wrap;
}
.sticky {
  position: sticky;
  top: calc(var(--topbar-h) + 16px);
}
.lbl {
  font-weight: 700;
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.mini {
  margin: 4px 0 0;
  padding-left: 20px;
}
.ro {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 20px;
}
.pre {
  white-space: pre-wrap;
}
.photos {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.photos figure {
  margin: 0;
}
.photos img {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  aspect-ratio: 4/3;
  object-fit: cover;
  width: 100%;
}
.decided {
  padding: 14px 18px;
  display: grid;
  gap: 8px;
}
.decided.neg {
  border: 2px solid var(--danger-border);
  background: var(--danger-bg);
  border-radius: var(--radius-lg);
}
@media (max-width: 1180px) {
  .layout,
  .ro {
    grid-template-columns: 1fr;
  }
  .ref {
    order: -1;
  }
  .sticky {
    position: static;
  }
}
</style>
