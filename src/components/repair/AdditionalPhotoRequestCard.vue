<script setup lang="ts">
/* AI 추가 사진 요청 카드 — 부위·이유·촬영 방법·요청 횟수 + 추가 사진·추가 설명 (둘 중 하나 이상) */
import { computed, ref } from 'vue'
import { Camera, Send, TriangleAlert } from 'lucide-vue-next'
import ImageUploader from './ImageUploader.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import { FEATURES } from '@/api/features'
import type { PhotoRequest } from '@/types'
import type { UploadItem } from '@/types/upload'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{ request: PhotoRequest; busy?: boolean; readonly?: boolean }>()
const emit = defineEmits<{ submit: [{ photos: UploadItem[]; note: string }] }>()
const photos = ref<UploadItem[]>([])
const note = ref('')
// 실서버는 사진 1장 이상 필요 (설명만 제출은 아직 미지원)
const canSubmit = computed(() => photos.value.length > 0 || (FEATURES.additionalNoteOnly && note.value.trim().length > 0))
const remaining = computed(() => props.request.maxRequests - props.request.requestNo)
</script>

<template>
  <section class="card photo-req" aria-labelledby="req-title">
    <div class="card-head">
      <h3 id="req-title"><Camera :size="22" /> 추가 사진 요청</h3>
      <div class="row">
        <AiBadge compact :label="`${request.requestedBy} 요청`" />
        <span class="badge tone-warning">요청 {{ request.requestNo }} / {{ request.maxRequests }}회</span>
      </div>
    </div>
    <div class="card-body stack">
      <p class="lead"><strong>{{ request.target }}</strong> 사진이 필요합니다.</p>
      <dl class="kv">
        <dt>필요한 이유</dt>
        <dd>{{ request.reason }}</dd>
        <dt>촬영 방법</dt>
        <dd>{{ request.guide }}</dd>
        <dt>요청 시각</dt>
        <dd>{{ formatDateTime(request.requestedAt) }}</dd>
      </dl>

      <div class="callout" :class="remaining <= 0 ? 'tone-danger' : 'tone-warning'">
        <TriangleAlert :size="20" />
        <div>
          <strong v-if="remaining > 0">추가 요청이 {{ remaining }}회 더 발생하면 본사 수동 검토로 전환됩니다.</strong>
          <strong v-else>마지막 요청입니다.</strong>
          이 사진으로도 판독이 어려우면 최대 {{ request.maxRequests }}회 초과 시 본사 품질 담당자가 직접 진단합니다.
        </div>
      </div>

      <template v-if="!readonly">
        <ImageUploader v-model="photos" :label="`${request.target} 사진`" :max="3" example-src="/mock/motor-joint.svg" />
        <div class="field">
          <label :for="`note-${request.id}`">추가 설명 <span class="faint">(선택)</span></label>
          <textarea :id="`note-${request.id}`" v-model="note" class="textarea" maxlength="1000" placeholder="사진으로 보이지 않는 점이나 직접 확인한 상태를 적어 주세요. 예) 연결부를 손으로 눌러 보니 유격이 있음" />
          <p class="help">{{ FEATURES.additionalNoteOnly ? '사진이나 설명 중 하나는 있어야 제출할 수 있습니다.' : '사진을 1장 이상 올려야 제출할 수 있습니다. 설명은 함께 전달됩니다.' }}</p>
        </div>
        <div class="row" style="justify-content: flex-end">
          <button class="btn btn-primary btn-lg" type="button" :disabled="!canSubmit || busy" @click="emit('submit', { photos, note: note.trim() })">
            <Send :size="20" /> {{ busy ? '제출 중…' : '추가 자료 제출하고 분석 계속' }}
          </button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.photo-req {
  border: 2px solid var(--warning-border);
}
.photo-req .card-head {
  background: var(--warning-bg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.lead {
  font-size: var(--fs-lg);
}
</style>
