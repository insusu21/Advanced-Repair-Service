<script setup lang="ts">
/* 원인 후보 순위 + 각 후보의 신뢰도 · 판단 근거 · 데이터 출처 */
import { ListOrdered } from 'lucide-vue-next'
import AiBadge from '@/components/common/AiBadge.vue'
import ConfidenceBar from '@/components/common/ConfidenceBar.vue'
import DataSourceList from '@/components/common/DataSourceList.vue'
import type { CauseCandidate, DataSource } from '@/types'

defineProps<{ candidates: CauseCandidate[]; sources: DataSource[] }>()
</script>

<template>
  <section class="card">
    <div class="card-head">
      <h3><ListOrdered :size="22" /> 원인 후보 순위</h3>
      <AiBadge compact />
    </div>
    <ol class="cands">
      <li v-for="c in candidates" :key="c.rank" :class="{ top: c.rank === 1 }">
        <span class="rank" :aria-label="`${c.rank}순위`">{{ c.rank }}</span>
        <div class="main">
          <div class="head">
            <div>
              <strong class="cause">{{ c.cause }}</strong>
              <span v-if="c.part" class="faint"> · 관련 부품: {{ c.part }}</span>
            </div>
            <ConfidenceBar :value="c.confidence" class="cb" />
          </div>
          <div class="ev">
            <span class="evl">판단 근거</span>
            <ul>
              <li v-for="e in c.evidence" :key="e">{{ e }}</li>
            </ul>
          </div>
          <DataSourceList :sources="sources" :ids="c.sourceIds" inline />
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.cands {
  list-style: none;
  margin: 0;
  padding: 8px 22px 18px;
  display: grid;
  gap: 4px;
}
.cands > li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.cands > li:last-child {
  border-bottom: 0;
}
.rank {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: var(--fs-lg);
  background: var(--neutral-bg);
  color: var(--text-2);
}
.top .rank {
  background: var(--ai);
  color: #fff;
}
.main {
  display: grid;
  gap: 10px;
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.cause {
  font-size: var(--fs-lg);
}
.cb {
  width: 260px;
}
.ev {
  display: grid;
  gap: 4px;
}
.evl {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text-2);
}
.ev ul {
  margin: 0;
  padding-left: 20px;
}
</style>
