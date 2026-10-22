<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheck, CircleX, CircleHelp, SkipForward, Cpu, Cog, Clock } from 'lucide-vue-next'
import { TOOL_KIND_LABEL } from '@/constants/status'
import ConfidenceBar from '@/components/common/ConfidenceBar.vue'
import DataSourceList from '@/components/common/DataSourceList.vue'
import AnnotatedImage from './AnnotatedImage.vue'
import type { AgentResult, DataSource, RepairImage } from '@/types'

/** hideImage: 사진 이상 영역을 화면의 별도 섹션에서 모아 보여 줄 때 카드 안 사진을 숨김 */
const props = defineProps<{ result: AgentResult; images: RepairImage[]; sources: DataSource[]; hideImage?: boolean }>()

/** 부위별 분석 카드: PCB · 기계(MOTOR). SW 분석은 없음 */
const AGENT = { PCB: { label: TOOL_KIND_LABEL.PCB, icon: Cpu }, MOTOR: { label: TOOL_KIND_LABEL.MOTOR, icon: Cog } }
const VERDICT = {
  NORMAL: { label: '이상 없음', tone: 'success', icon: CircleCheck },
  ABNORMAL: { label: '이상 탐지', tone: 'danger', icon: CircleX },
  SUSPICIOUS: { label: '의심', tone: 'warning', icon: CircleHelp },
  SKIPPED: { label: '분석 제외', tone: 'neutral', icon: SkipForward },
} as const

const annotatedImage = computed(() => {
  const id = props.result.annotations[0]?.imageId
  return id ? props.images.find((i) => i.id === id) : undefined
})
const anns = computed(() => props.result.annotations.filter((a) => a.imageId === annotatedImage.value?.id))
</script>

<template>
  <article class="agent card" :class="`v-${result.verdict}`">
    <header class="ah">
      <span class="name"><component :is="AGENT[result.agent].icon" :size="22" /> {{ AGENT[result.agent].label }}</span>
      <span class="badge" :class="`tone-${VERDICT[result.verdict].tone}`">
        <component :is="VERDICT[result.verdict].icon" :size="15" /> {{ VERDICT[result.verdict].label }}
      </span>
    </header>
    <div class="ab">
      <p class="summary">{{ result.summary }}</p>
      <ul class="findings">
        <li v-for="f in result.findings" :key="f">{{ f }}</li>
      </ul>
      <AnnotatedImage v-if="annotatedImage && !hideImage" :image="annotatedImage" :annotations="anns" :title="`${AGENT[result.agent].label} · 이상 영역`" />
      <ConfidenceBar :value="result.confidence" label="부위 분석 점수" size="sm" />
      <div class="foot">
        <DataSourceList :sources="sources" :ids="result.sourceIds" inline />
        <span class="faint"><Clock :size="13" /> {{ result.durationSec }}초</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.agent {
  display: flex;
  flex-direction: column;
  border-top: 4px solid var(--border-strong);
}
.v-ABNORMAL {
  border-top-color: var(--danger);
}
.v-NORMAL {
  border-top-color: var(--success);
}
.v-SUSPICIOUS {
  border-top-color: #e08a00;
}
.ah {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 14px 18px 0;
}
.name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: var(--fs-lg);
}
.ab {
  padding: 12px 18px 16px;
  display: grid;
  gap: 12px;
}
.summary {
  font-weight: 700;
  font-size: var(--fs-lg);
}
.findings {
  margin: 0;
  padding-left: 20px;
  color: var(--text-2);
  display: grid;
  gap: 2px;
}
.foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.foot .faint {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
</style>
