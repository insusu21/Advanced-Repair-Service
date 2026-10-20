<script setup lang="ts">
/* 신규 수리 접수 — 3단계 스텝 폼 (제품 정보 → 증상·에러코드 → 사진·최종 확인) */
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Search, Send, X, Loader2, ScanLine, Pencil } from 'lucide-vue-next'
import StepIndicator from '@/components/repair/StepIndicator.vue'
import ImageUploader from '@/components/repair/ImageUploader.vue'
import SameSerialHistory from '@/components/repair/SameSerialHistory.vue'
import { repairApi, toErrorMessage } from '@/api'
import { useToastStore } from '@/stores/toast'
import { PHOTO_KIND_LABEL, PHOTO_LIMIT } from '@/constants/status'
import type { PhotoKind, ProductInfo, Urgency } from '@/types'
import type { UploadItem } from '@/types/upload'
import { formatDate, repairId } from '@/utils/format'

const router = useRouter()
const toast = useToastStore()
const STEPS = ['제품 정보', '증상 및 에러 코드', '사진 등록 및 최종 확인']
const step = ref(0)

const form = reactive({
  serial: '',
  product: null as ProductInfo | null,
  symptom: '',
  errorCodes: [] as string[],
  noErrorCode: false,
  urgency: 'MEDIUM' as Urgency,
  technicianNote: '',
})
/** 접수 사진 2종: PCB · 기계·찌그러짐(모터·외관 변형 등). 칸별 5장, 전체 10장 */
const PHOTO_KINDS = ['PCB', 'MECHANICAL'] as const
const photos = reactive<Record<(typeof PHOTO_KINDS)[number], UploadItem[]>>({ PCB: [], MECHANICAL: [] })
const touched = reactive({ s1: false, s2: false, s3: false })
const totalPhotos = computed(() => photos.PCB.length + photos.MECHANICAL.length)

/* ---------- 1단계: 시리얼 → 제품 자동 조회 ---------- */
const lookup = reactive({ loading: false, error: null as string | null })
async function findProduct() {
  const s = form.serial.trim().toUpperCase()
  form.serial = s
  form.product = null
  lookup.error = null
  if (!/^RC\d{10}$/.test(s)) {
    lookup.error = '시리얼 번호는 RC 로 시작하는 12자리입니다. (예: RC2026000187)'
    return
  }
  lookup.loading = true
  try {
    form.product = await repairApi.lookupProduct(s)
  } catch (e) {
    lookup.error = toErrorMessage(e)
  } finally {
    lookup.loading = false
  }
}
watch(
  () => form.serial,
  (v) => {
    if (form.product && v.trim().toUpperCase() !== form.product.serialNumber) form.product = null
    if (/^RC\d{10}$/i.test(v.trim()) && !lookup.loading && !form.product) void findProduct()
  },
)

/* ---------- 2단계: 증상·에러코드 ---------- */
const codeInput = ref('')
const codeError = ref<string | null>(null)
const SYMPTOMS = ['청소 중 큰 소음', '주행 중 멈춤', '한쪽으로만 회전', '충전 안 됨', '전원 안 켜짐', '흡입력 약함', '물걸레 작동 안 함']
const COMMON_CODES = ['E103', 'E105', 'E210', 'E302', 'E401', 'E501']
function addCode(c?: string) {
  const v = (c ?? codeInput.value).trim().toUpperCase()
  codeError.value = null
  if (!v) return
  if (!/^E\d{3}$/.test(v)) {
    codeError.value = '에러 코드는 E + 숫자 3자리입니다. (예: E103)'
    return
  }
  if (!form.errorCodes.includes(v)) form.errorCodes.push(v)
  form.noErrorCode = false
  codeInput.value = ''
}
function addSymptom(s: string) {
  form.symptom = form.symptom.trim() ? `${form.symptom.trim()}, ${s}` : s
}
watch(() => form.noErrorCode, (v) => v && (form.errorCodes = []))

/* ---------- 검증 ---------- */
const errs = computed(() => ({
  product: !form.product ? '시리얼 번호로 제품 정보를 조회해 주세요.' : null,
  symptom: form.symptom.trim().length < 5 ? '고장 증상을 5자 이상 입력해 주세요.' : null,
  codes: !form.noErrorCode && !form.errorCodes.length ? '에러 코드를 추가하거나 "에러 코드 없음"을 선택해 주세요.' : null,
  photos: PHOTO_KINDS.filter((k) => !photos[k].length),
  photoTotal: totalPhotos.value > PHOTO_LIMIT.total ? `사진은 전체 ${PHOTO_LIMIT.total}장까지 등록할 수 있습니다. (현재 ${totalPhotos.value}장)` : null,
  note: form.technicianNote.length > 1000 ? '기사 소견은 1000자까지 입력할 수 있습니다.' : null,
}))
const stepValid = computed(() => [!errs.value.product, !errs.value.symptom && !errs.value.codes && !errs.value.note, !errs.value.photos.length && !errs.value.photoTotal])

function next() {
  const k = (['s1', 's2', 's3'] as const)[step.value]
  touched[k] = true
  if (!stepValid.value[step.value]) {
    document.querySelector<HTMLElement>('[aria-invalid="true"], .invalid')?.focus()
    return
  }
  step.value = Math.min(2, step.value + 1)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function prev() {
  step.value = Math.max(0, step.value - 1)
}

/* ---------- 제출: 접수 생성 → 사진 업로드 → 진단 요청 ---------- */
const submit = reactive({ running: false, phase: '' as '' | 'create' | 'upload' | 'request' | 'done', uploaded: 0, error: null as string | null, repairId: null as number | null })

async function doSubmit() {
  touched.s3 = true
  if (!stepValid.value[2] || !form.product) return
  submit.running = true
  submit.error = null
  try {
    if (!submit.repairId) {
      submit.phase = 'create'
      const r = await repairApi.create({ product: form.product, symptom: form.symptom.trim(), technicianNote: form.technicianNote.trim() || undefined, errorCodes: form.errorCodes, urgency: form.urgency })
      submit.repairId = r.id
    }
    submit.phase = 'upload'
    submit.uploaded = 0
    // 재시도 시에도 같은 접수 건에 업로드 (중복 접수 방지)
    for (const kind of PHOTO_KINDS) {
      for (const p of photos[kind]) {
        await repairApi.uploadImage(submit.repairId, { kind: kind as PhotoKind, file: p.file, dataUrl: p.dataUrl })
        submit.uploaded++
      }
    }
    submit.phase = 'request'
    await repairApi.submit(submit.repairId)
    submit.phase = 'done'
    dirty.value = false
    toast.success(`수리 ID ${repairId(submit.repairId)} 로 접수되었습니다. AI 분석을 시작합니다.`)
    void router.replace(`/repairs/${submit.repairId}/progress`)
  } catch (e) {
    submit.error = toErrorMessage(e)
  } finally {
    submit.running = false
  }
}

/* ---------- 작성 중 이탈 방지 ---------- */
const dirty = ref(false)
watch([form, photos], () => (dirty.value = true), { deep: true })
onBeforeRouteLeave(() => (!dirty.value || submit.phase === 'done' ? true : window.confirm('작성 중인 접수 내용이 사라집니다. 나가시겠습니까?')))
</script>

<template>
  <div class="page narrow">
    <div class="page-head">
      <div>
        <h1>신규 수리 접수</h1>
        <p class="sub">필수 정보를 입력하면 AI 가 PCB·모터·소프트웨어 분석을 자동으로 시작합니다.</p>
      </div>
    </div>

    <StepIndicator :steps="STEPS" :current="step" />

    <!-- ========== 1단계 ========== -->
    <section v-show="step === 0" class="card card-pad stack" aria-labelledby="s1">
      <h2 id="s1" class="section-title">1단계 · 제품 정보</h2>
      <div class="field">
        <label for="serial" class="req">시리얼 번호</label>
        <div class="row nowrap">
          <div class="sw">
            <ScanLine :size="20" class="si" aria-hidden="true" />
            <input
              id="serial"
              v-model="form.serial"
              class="input mono big"
              :class="{ invalid: (touched.s1 && errs.product) || lookup.error }"
              placeholder="RC2026000187"
              autocomplete="off"
              maxlength="12"
              :aria-invalid="!!lookup.error || (touched.s1 && !!errs.product)"
              aria-describedby="serial-help"
              @keydown.enter.prevent="findProduct"
            />
          </div>
          <button class="btn btn-lg" type="button" :disabled="lookup.loading" @click="findProduct">
            <Loader2 v-if="lookup.loading" :size="20" class="spin" /><Search v-else :size="20" /> 조회
          </button>
        </div>
        <p id="serial-help" class="help">제품 바닥면 라벨의 12자리 번호를 입력하면 자동으로 조회합니다. (데모: RC2026000187)</p>
        <p v-if="lookup.error" class="error-text" role="alert"><CircleAlert :size="16" /> {{ lookup.error }}</p>
        <p v-else-if="touched.s1 && errs.product" class="error-text" role="alert"><CircleAlert :size="16" /> {{ errs.product }}</p>
      </div>

      <div v-if="lookup.loading" class="prod skeleton" style="height: 150px" />
      <div v-else-if="form.product" class="prod card" aria-live="polite">
        <div class="row between">
          <strong class="pn">{{ form.product.modelName }}</strong>
          <span class="badge tone-success"><CircleCheck :size="15" /> 제품 확인됨</span>
        </div>
        <dl class="kv cols">
          <div><dt>모델</dt><dd>{{ form.product.model }}</dd></div>
          <div><dt>생산 공장</dt><dd>{{ form.product.factory }}</dd></div>
          <div><dt>제조일</dt><dd>{{ formatDate(form.product.manufacturedAt) }}</dd></div>
          <div>
            <dt>보증 기간</dt>
            <dd>
              {{ formatDate(form.product.warrantyUntil) }}까지
              <span class="badge" :class="new Date(form.product.warrantyUntil) > new Date() ? 'tone-success' : 'tone-neutral'">{{ new Date(form.product.warrantyUntil) > new Date() ? '보증 중' : '보증 만료' }}</span>
            </dd>
          </div>
          <div><dt>펌웨어</dt><dd>{{ form.product.firmware }}</dd></div>
        </dl>
      </div>
      <SameSerialHistory v-if="form.product" :serial="form.product.serialNumber" compact new-tab />
    </section>

    <!-- ========== 2단계 ========== -->
    <section v-show="step === 1" class="card card-pad stack" aria-labelledby="s2">
      <h2 id="s2" class="section-title">2단계 · 증상 및 에러 코드</h2>
      <div class="field">
        <label for="symptom" class="req">고장 증상</label>
        <div class="quick">
          <button v-for="s in SYMPTOMS" :key="s" type="button" class="btn btn-sm" @click="addSymptom(s)">+ {{ s }}</button>
        </div>
        <textarea id="symptom" v-model="form.symptom" class="textarea" :class="{ invalid: touched.s2 && errs.symptom }" placeholder="고객이 말한 증상과 기사가 확인한 증상을 적어 주세요. 예) 청소 도중 큰 소음이 발생하고 움직임이 멈춤" :aria-invalid="touched.s2 && !!errs.symptom" />
        <p v-if="touched.s2 && errs.symptom" class="error-text"><CircleAlert :size="16" /> {{ errs.symptom }}</p>
      </div>

      <div class="field">
        <label for="code" :class="{ req: !form.noErrorCode }">에러 코드</label>
        <div class="row nowrap">
          <input id="code" v-model="codeInput" class="input mono" placeholder="E103" maxlength="4" :disabled="form.noErrorCode" @keydown.enter.prevent="addCode()" />
          <button type="button" class="btn btn-lg" :disabled="form.noErrorCode" @click="addCode()">추가</button>
        </div>
        <div class="quick">
          <span class="faint">자주 나오는 코드</span>
          <button v-for="c in COMMON_CODES" :key="c" type="button" class="btn btn-sm mono" :disabled="form.noErrorCode || form.errorCodes.includes(c)" @click="addCode(c)">{{ c }}</button>
        </div>
        <div v-if="form.errorCodes.length" class="codes" aria-label="입력한 에러 코드">
          <span v-for="c in form.errorCodes" :key="c" class="badge tone-info code">
            <span class="mono">{{ c }}</span>
            <button type="button" :aria-label="`${c} 삭제`" @click="form.errorCodes = form.errorCodes.filter((x) => x !== c)"><X :size="14" /></button>
          </span>
        </div>
        <label class="check">
          <input v-model="form.noErrorCode" type="checkbox" />
          에러 코드 없음 (표시되지 않음)
        </label>
        <p v-if="codeError" class="error-text"><CircleAlert :size="16" /> {{ codeError }}</p>
        <p v-else-if="touched.s2 && errs.codes" class="error-text"><CircleAlert :size="16" /> {{ errs.codes }}</p>
      </div>

      <div class="field">
        <label for="tech-note">기사 소견 <span class="faint">(선택)</span></label>
        <p class="help">직접 보고 판단한 내용을 자유롭게 적어 주세요. AI 분석에 함께 사용됩니다.</p>
        <textarea id="tech-note" v-model="form.technicianNote" class="textarea" :class="{ invalid: !!errs.note }" maxlength="1000" placeholder="예) 하우징 아래쪽이 눌린 흔적이 있고, 바퀴를 손으로 돌리면 걸리는 느낌이 있음" :aria-invalid="!!errs.note" />
        <p class="faint count">{{ form.technicianNote.length }} / 1000</p>
        <p v-if="errs.note" class="error-text"><CircleAlert :size="16" /> {{ errs.note }}</p>
      </div>

      <div class="field">
        <span class="label">긴급도</span>
        <div class="choice-group" role="radiogroup" aria-label="긴급도">
          <button v-for="u in [{ v: 'HIGH', l: '긴급 · 오늘 처리' }, { v: 'MEDIUM', l: '보통 · 2일 이내' }, { v: 'LOW', l: '낮음 · 일반 처리' }] as const" :key="u.v" type="button" class="choice" role="radio" :aria-checked="form.urgency === u.v" @click="form.urgency = u.v">
            {{ u.l }}
          </button>
        </div>
      </div>
    </section>

    <!-- ========== 3단계 ========== -->
    <section v-show="step === 2" class="stack" aria-labelledby="s3">
      <div class="card card-pad stack">
        <h2 id="s3" class="section-title">3단계 · 사진 등록</h2>
        <p class="muted">밝은 곳에서 초점을 맞춰 찍어 주세요. 사진이 흐리면 AI 가 추가 사진을 요청할 수 있습니다.</p>
        <div class="grid-2">
          <ImageUploader v-model="photos.PCB" label="PCB 사진" description="보드 전체가 정면으로 보이게" required :max="PHOTO_LIMIT.perKind" :invalid="touched.s3 && !photos.PCB.length" example-src="/mock/pcb.svg" />
          <ImageUploader v-model="photos.MECHANICAL" label="기계·찌그러짐 사진" description="모터·하우징·외관 변형 부위가 보이게" required :max="PHOTO_LIMIT.perKind" :invalid="touched.s3 && !photos.MECHANICAL.length" example-src="/mock/motor.svg" />
        </div>
        <p v-if="touched.s3 && errs.photos.length" class="error-text" role="alert">
          <CircleAlert :size="16" /> {{ errs.photos.map((k) => `${PHOTO_KIND_LABEL[k]} 사진`).join(', ') }}을(를) 등록해 주세요.
        </p>
        <p v-if="errs.photoTotal" class="error-text" role="alert"><CircleAlert :size="16" /> {{ errs.photoTotal }}</p>
        <p class="faint">칸별 최대 {{ PHOTO_LIMIT.perKind }}장, 전체 최대 {{ PHOTO_LIMIT.total }}장</p>
      </div>

      <div class="card card-pad stack">
        <h2 class="section-title">최종 확인</h2>
        <dl class="kv review">
          <dt>제품</dt>
          <dd>{{ form.product?.modelName }} <span class="mono faint">({{ form.product?.serialNumber }})</span> <button type="button" class="btn btn-sm btn-ghost" @click="step = 0"><Pencil :size="14" /> 수정</button></dd>
          <dt>증상</dt>
          <dd>{{ form.symptom }} <button type="button" class="btn btn-sm btn-ghost" @click="step = 1"><Pencil :size="14" /> 수정</button></dd>
          <dt>에러 코드</dt>
          <dd>{{ form.errorCodes.length ? form.errorCodes.join(', ') : '없음' }}</dd>
          <dt>긴급도</dt>
          <dd>{{ { HIGH: '긴급', MEDIUM: '보통', LOW: '낮음' }[form.urgency] }}</dd>
          <dt>사진</dt>
          <dd>{{ totalPhotos }}장 (PCB {{ photos.PCB.length }} · 기계·찌그러짐 {{ photos.MECHANICAL.length }})</dd>
          <dt>기사 소견</dt>
          <dd class="pre">{{ form.technicianNote.trim() || '없음' }} <button type="button" class="btn btn-sm btn-ghost" @click="step = 1"><Pencil :size="14" /> 수정</button></dd>
        </dl>
        <p class="callout tone-ai"><ScanLine :size="20" /> 진단 요청 후 오케스트레이터 AI 가 필요한 분석(PCB·모터·SW)을 선택합니다. 결과는 <b>AI 초안</b>으로 표시되며 기사님의 확인이 필요합니다.</p>

        <div v-if="submit.running || submit.error" class="progress" :class="{ err: submit.error }" role="status" aria-live="polite">
          <template v-if="submit.error">
            <CircleAlert :size="20" />
            <span><strong>접수 중 오류가 발생했습니다.</strong> {{ submit.error }} <template v-if="submit.repairId">입력한 내용은 저장되어 있으니 다시 시도해 주세요.</template></span>
          </template>
          <template v-else>
            <Loader2 :size="20" class="spin" />
            <span v-if="submit.phase === 'create'">접수 정보를 저장하고 있습니다…</span>
            <span v-else-if="submit.phase === 'upload'">사진을 올리고 있습니다… ({{ submit.uploaded }}/{{ totalPhotos }})</span>
            <span v-else>AI 진단을 요청하고 있습니다…</span>
          </template>
        </div>
      </div>
    </section>

    <!-- 하단 고정 이동 버튼 -->
    <div class="nav card">
      <button v-if="step > 0" type="button" class="btn btn-lg" :disabled="submit.running" @click="prev"><ArrowLeft :size="20" /> 이전</button>
      <RouterLink v-else to="/" class="btn btn-lg btn-ghost">취소</RouterLink>
      <span class="spacer" />
      <span class="faint">{{ step + 1 }} / 3 단계</span>
      <button v-if="step < 2" type="button" class="btn btn-primary btn-lg" @click="next">다음 <ArrowRight :size="20" /></button>
      <button v-else type="button" class="btn btn-primary btn-lg" :disabled="submit.running" @click="doSubmit">
        <Send :size="20" /> {{ submit.error ? '다시 시도' : '접수하고 AI 진단 요청' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 1100px;
}
.nowrap {
  flex-wrap: nowrap;
}
.sw {
  position: relative;
  flex: 1;
}
.sw .input {
  padding-left: 44px;
}
.si {
  position: absolute;
  left: 14px;
  top: 16px;
  color: var(--text-3);
}
.big {
  font-size: var(--fs-lg);
  letter-spacing: 0.04em;
  min-height: 54px;
}
.prod {
  padding: 18px 20px;
  display: grid;
  gap: 12px;
  background: var(--success-bg);
  border-color: var(--success-border);
}
.pn {
  font-size: var(--fs-lg);
}
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px 20px;
}
.cols > div {
  display: grid;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.quick .btn {
  font-weight: 500;
}
.codes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.code {
  font-size: var(--fs-md);
  padding: 4px 6px 4px 12px;
}
.code button {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
}
.code button:hover {
  background: rgba(0, 0, 0, 0.08);
}
.check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}
.check input {
  width: 22px;
  height: 22px;
  accent-color: var(--navy-800);
}
.review dd {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--info-bg);
  color: var(--info);
  font-weight: 600;
}
.progress.err {
  background: var(--danger-bg);
  color: var(--danger);
}
.nav {
  position: sticky;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  box-shadow: var(--shadow-lg);
  z-index: 10;
}
.pre {
  white-space: pre-wrap;
}
.count {
  text-align: right;
  font-size: var(--fs-xs);
}
</style>
