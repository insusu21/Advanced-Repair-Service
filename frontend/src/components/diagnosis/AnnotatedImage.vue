<script setup lang="ts">
/* 사진 위 이상 영역 표시 — 좌표는 이미지 대비 % (해상도 무관) */
import { ref } from 'vue'
import { Eye, EyeOff, Maximize2 } from 'lucide-vue-next'
import BaseModal from '@/components/common/BaseModal.vue'
import type { ImageAnnotation, RepairImage } from '@/types'

const props = defineProps<{ image: RepairImage; annotations: ImageAnnotation[]; title?: string }>()
const show = ref(true)
const zoom = ref(false)
const SEV = { HIGH: '이상', MEDIUM: '확인 필요', LOW: '정상' }
void props
</script>

<template>
  <figure class="ann">
    <div class="frame">
      <img :src="image.url" :alt="title ?? image.name" />
      <template v-if="show">
        <div
          v-for="(a, i) in annotations"
          :key="i"
          class="box"
          :class="`sev-${a.severity}`"
          :style="{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }"
        >
          <span class="tag">{{ i + 1 }}</span>
        </div>
      </template>
      <span class="ai-mark">AI 표시</span>
    </div>
    <figcaption>
      <ol v-if="annotations.length" class="legend">
        <li v-for="(a, i) in annotations" :key="i" :class="`sev-${a.severity}`">
          <span class="n">{{ i + 1 }}</span> {{ a.label }} <span class="sv">({{ SEV[a.severity] }})</span>
        </li>
      </ol>
      <span v-else class="faint">표시된 이상 영역 없음</span>
      <span class="row tools">
        <button v-if="annotations.length" type="button" class="btn btn-sm btn-ghost" @click="show = !show">
          <component :is="show ? EyeOff : Eye" :size="16" /> {{ show ? '표시 숨기기' : '표시 보기' }}
        </button>
        <button type="button" class="btn btn-sm btn-ghost" @click="zoom = true"><Maximize2 :size="16" /> 크게 보기</button>
      </span>
    </figcaption>
    <BaseModal :open="zoom" :title="title ?? '사진 크게 보기'" :width="1000" @close="zoom = false">
      <div class="frame big">
        <img :src="image.url" :alt="title ?? image.name" />
        <div v-for="(a, i) in annotations" :key="i" class="box" :class="`sev-${a.severity}`" :style="{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }">
          <span class="tag">{{ i + 1 }} {{ a.label }}</span>
        </div>
      </div>
    </BaseModal>
  </figure>
</template>

<style scoped>
.ann {
  margin: 0;
  display: grid;
  gap: 8px;
}
.frame {
  position: relative;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
  background: #000;
}
.frame img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: var(--surface-2);
}
.big img {
  aspect-ratio: auto;
}
.box {
  position: absolute;
  border: 3px solid var(--danger);
  border-radius: 6px;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7);
}
.box.sev-MEDIUM {
  border-color: #e08a00;
  border-style: dashed;
}
.box.sev-LOW {
  border-color: var(--success);
  border-style: dotted;
}
.tag {
  position: absolute;
  top: -14px;
  left: -3px;
  background: var(--danger);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  padding: 1px 7px;
  border-radius: 4px;
  white-space: nowrap;
}
.sev-MEDIUM .tag {
  background: #c27a1a;
}
.sev-LOW .tag {
  background: var(--success);
}
.ai-mark {
  position: absolute;
  right: 8px;
  bottom: 8px;
  background: var(--ai);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
figcaption {
  display: grid;
  gap: 6px;
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: var(--fs-sm);
  font-weight: 600;
}
.legend .n {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: var(--danger);
  color: #fff;
  font-size: 12px;
}
.legend .sev-MEDIUM .n {
  background: #c27a1a;
}
.legend .sev-LOW .n {
  background: var(--success);
}
.sv {
  color: var(--text-3);
  font-weight: 500;
}
.tools {
  gap: 4px;
}
</style>
