<script setup lang="ts">
import { computed } from 'vue'
import { BookOpen, Database, FileCode2, Image, ScrollText } from 'lucide-vue-next'
import type { DataSource } from '@/types'

const props = defineProps<{ sources: DataSource[]; ids?: string[]; inline?: boolean }>()
const list = computed(() => (props.ids ? props.sources.filter((s) => props.ids!.includes(s.id)) : props.sources))
const icons = { MANUAL: BookOpen, REPAIR_DB: Database, SENSOR_LOG: ScrollText, IMAGE: Image, ERROR_CODE_TABLE: FileCode2 }
const typeLabel = { MANUAL: '매뉴얼', REPAIR_DB: '고장 DB', SENSOR_LOG: '센서 로그', IMAGE: '사진', ERROR_CODE_TABLE: '에러코드표' }
</script>

<template>
  <ul class="sources" :class="{ inline }">
    <li v-for="s in list" :key="s.id">
      <component :is="icons[s.type]" :size="16" aria-hidden="true" />
      <span class="t">[{{ typeLabel[s.type] }}]</span>
      <span class="title">{{ s.title }}</span>
      <span v-if="!inline" class="ref faint">· {{ s.ref }}</span>
    </li>
  </ul>
</template>

<style scoped>
.sources {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.sources.inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: var(--fs-sm);
}
li {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--text-2);
}
.t {
  font-weight: 700;
  color: var(--navy-700);
}
.title {
  color: var(--text);
  font-weight: 600;
}
</style>
