<script setup lang="ts">
/* 사진 업로드: 드래그·선택·카메라 촬영 / 미리보기 / 삭제 / 재업로드 / 형식·용량 검증
 * qualityTarget: 올린 사진마다 품질 검사 API 결과(검사 중 → 통과 / 문제 있음)를 표시.
 *   FEATURES.photoQualityCheck 가 꺼져 있으면(실서버) 검사 없이 업로드만 한다. */
import { computed, reactive, ref, watch } from 'vue'
import { Camera, ImagePlus, RefreshCw, Trash2, CircleAlert, CircleCheck, Loader2, TriangleAlert } from 'lucide-vue-next'
import type { UploadItem } from '@/types/upload'
import type { PhotoQualityResult } from '@/types'
import { checkPhotoQuality, type PhotoQualityTarget } from '@/api'
import { FEATURES } from '@/api/features'
import { PHOTO_ISSUE_MESSAGE } from '@/constants/status'
import { compressImage, uid } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    modelValue: UploadItem[]
    label: string
    description?: string
    required?: boolean
    max?: number
    invalid?: boolean
    exampleSrc?: string
    /** 지정하면 이 부위 기준으로 품질 검사 */
    qualityTarget?: PhotoQualityTarget
  }>(),
  { max: 1 },
)
const emit = defineEmits<{
  'update:modelValue': [UploadItem[]]
  /** 검사 중 · 문제 있는 사진 수 (부모의 경고·확인용) */
  quality: [summary: { checking: number; problems: number }]
}>()

const MAX_MB = 15
const input = ref<HTMLInputElement | null>(null)
const replaceId = ref<string | null>(null)
const dragging = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)

async function toItems(files: FileList | File[]): Promise<UploadItem[]> {
  const out: UploadItem[] = []
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('image/')) {
      error.value = `${f.name}: 이미지 파일(JPG, PNG, HEIC)만 올릴 수 있습니다.`
      continue
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      error.value = `${f.name}: ${MAX_MB}MB 이하 사진만 올릴 수 있습니다.`
      continue
    }
    out.push({ id: uid('up'), file: f, dataUrl: await compressImage(f), name: f.name, size: f.size })
  }
  return out
}

async function onFiles(files: FileList | null) {
  if (!files?.length) return
  error.value = null
  busy.value = true
  try {
    const items = await toItems(files)
    if (!items.length) return
    if (replaceId.value) {
      emit('update:modelValue', props.modelValue.map((x) => (x.id === replaceId.value ? items[0] : x)))
    } else {
      const merged = [...props.modelValue, ...items]
      if (merged.length > props.max) error.value = `최대 ${props.max}장까지 등록할 수 있습니다. 앞의 ${props.max}장만 저장했습니다.`
      emit('update:modelValue', merged.slice(0, props.max))
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '사진을 읽지 못했습니다.'
  } finally {
    busy.value = false
    replaceId.value = null
    if (input.value) input.value.value = ''
  }
}

/* ---------- 품질 검사 (사진 id 별) ---------- */
type QState = 'checking' | 'error' | PhotoQualityResult
const quality = reactive<Record<string, QState>>({})
const checking = computed(() => !!props.qualityTarget && FEATURES.photoQualityCheck)
watch(
  () => props.modelValue,
  (items) => {
    if (!checking.value || !props.qualityTarget) return
    const target = props.qualityTarget
    for (const it of items) {
      if (quality[it.id]) continue
      quality[it.id] = 'checking'
      checkPhotoQuality(it.file, target)
        .then((q) => (quality[it.id] = q))
        // 검사 실패는 사진 문제로 보지 않는다 (그대로 진행 가능)
        .catch(() => (quality[it.id] = 'error'))
    }
  },
  { immediate: true },
)
const qOf = (id: string) => quality[id]
const problemOf = (id: string) => {
  const q = quality[id]
  return typeof q === 'object' && !q.ok ? q : null
}
const summary = computed(() => ({
  checking: props.modelValue.filter((it) => checking.value && (!quality[it.id] || quality[it.id] === 'checking')).length,
  problems: props.modelValue.filter((it) => problemOf(it.id)).length,
}))
watch(summary, (v) => emit('quality', v), { immediate: true, deep: true })

function pick(replace?: string) {
  replaceId.value = replace ?? null
  input.value?.click()
}
function remove(id: string) {
  emit('update:modelValue', props.modelValue.filter((x) => x.id !== id))
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void onFiles(e.dataTransfer?.files ?? null)
}
</script>

<template>
  <div class="uploader" :class="{ invalid: invalid && !modelValue.length }">
    <div class="head">
      <span class="label" :class="{ req: required }">{{ label }}</span>
      <span v-if="modelValue.length" class="badge tone-success"><CircleCheck :size="14" /> 등록됨<template v-if="max > 1"> {{ modelValue.length }}장</template></span>
      <span v-else-if="required" class="badge tone-warning"><CircleAlert :size="14" /> 필수</span>
    </div>
    <p v-if="description" class="faint">{{ description }}</p>

    <input ref="input" type="file" accept="image/*" :multiple="max > 1 && !replaceId" class="sr-only" :aria-label="`${label} 파일 선택`" @change="onFiles(($event.target as HTMLInputElement).files)" />

    <div class="grid">
      <figure v-for="it in modelValue" :key="it.id" class="thumb">
        <img :src="it.dataUrl" :alt="`${label} 미리보기`" />
        <figcaption>
          <span class="nm" :title="it.name">{{ it.name }}</span>
          <div v-if="checking" class="qc" aria-live="polite">
            <span v-if="!qOf(it.id) || qOf(it.id) === 'checking'" class="badge tone-neutral"><Loader2 :size="14" class="spin" /> 사진 검사 중…</span>
            <span v-else-if="qOf(it.id) === 'error'" class="faint">검사하지 못했어요 · 그대로 진행할 수 있어요</span>
            <div v-else-if="problemOf(it.id)" class="problem">
              <strong><TriangleAlert :size="16" /> 문제 있음</strong>
              <ul>
                <li v-for="q in problemOf(it.id)!.issues" :key="q">{{ PHOTO_ISSUE_MESSAGE[q] }}</li>
              </ul>
              <button type="button" class="btn btn-sm retake" @click="pick(it.id)"><Camera :size="16" /> 다시 찍기</button>
              <figure v-if="exampleSrc" class="good">
                <img :src="exampleSrc" alt="잘 찍은 예시 사진" />
                <figcaption>이렇게 찍어 주세요</figcaption>
              </figure>
            </div>
            <span v-else class="badge tone-success"><CircleCheck :size="14" /> 통과</span>
          </div>
          <span class="acts">
            <button v-if="!problemOf(it.id)" type="button" class="btn btn-sm" @click="pick(it.id)"><RefreshCw :size="16" /> 다시 올리기</button>
            <button type="button" class="btn btn-sm btn-danger" :aria-label="`${it.name} 삭제`" @click="remove(it.id)"><Trash2 :size="16" /> 삭제</button>
          </span>
        </figcaption>
      </figure>

      <button
        v-if="modelValue.length < max"
        type="button"
        class="drop"
        :class="{ dragging }"
        :disabled="busy"
        @click="pick()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <ImagePlus v-if="!busy" :size="34" aria-hidden="true" />
        <RefreshCw v-else :size="30" class="spin" aria-hidden="true" />
        <strong>{{ busy ? '사진 처리 중…' : '사진 선택 또는 끌어 놓기' }}</strong>
        <span class="faint"><Camera :size="14" /> 태블릿에서는 바로 촬영할 수 있습니다</span>
      </button>

      <figure v-if="exampleSrc && !modelValue.length" class="example">
        <img :src="exampleSrc" alt="촬영 예시" />
        <figcaption class="faint">촬영 예시</figcaption>
      </figure>
    </div>
    <p v-if="error" class="error-text" role="alert"><CircleAlert :size="16" /> {{ error }}</p>
  </div>
</template>

<style scoped>
.uploader {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.uploader.invalid {
  border-color: var(--danger);
  background: #fffafa;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.thumb,
.example {
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface-2);
}
.thumb img,
.example img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.example {
  opacity: 0.75;
  border-style: dashed;
}
.example figcaption {
  padding: 6px 10px;
}
.thumb figcaption {
  display: grid;
  gap: 8px;
  padding: 10px;
}
.nm {
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qc .badge {
  font-size: var(--fs-xs);
}
.problem {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-sm);
  background: var(--warning-bg);
  color: var(--warning);
  font-size: var(--fs-sm);
}
.problem strong {
  display: flex;
  align-items: center;
  gap: 4px;
}
.problem ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 2px;
  color: var(--text);
}
.retake {
  justify-self: start;
  border-color: var(--warning);
  color: var(--warning);
}
.good {
  margin: 0;
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: var(--fs-xs);
}
.good img {
  width: 72px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--success-border);
}
.acts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.drop {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  min-height: 210px;
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
  cursor: pointer;
  color: var(--navy-700);
  padding: 16px;
}
.drop:hover,
.drop.dragging {
  border-color: var(--navy-600);
  background: var(--navy-50);
}
.drop .faint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
