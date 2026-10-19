<script setup lang="ts">
/* AI 추가 사진 요청 카드 — 부위·이유·촬영 방법·요청 횟수 + 사진 추가 */
import { computed, ref } from 'vue'
import { Camera, Send, TriangleAlert } from 'lucide-vue-next'
import ImageUploader from './ImageUploader.vue'
import AiBadge from '@/components/common/AiBadge.vue'
import type { PhotoRequest } from '@/types'
import type { UploadItem } from '@/types/upload'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{ request: PhotoRequest; busy?: boolean; readonly?: boolean }>()
const emit = defineEmits<{ submit: [UploadItem[]] }>()
const photos = ref<UploadItem[]>([])
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
        <ImageUploader v-model="photos" :label="`${request.target} 사진`" required :max="3" example-src="/mock/motor-joint.svg" />
        <div class="row" style="justify-content: flex-end">
          <button class="btn btn-primary btn-lg" type="button" :disabled="!photos.length || busy" @click="emit('submit', photos)">
            <Send :size="20" /> {{ busy ? '등록 중…' : `사진 ${photos.length}장 추가하고 분석 계속` }}
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
