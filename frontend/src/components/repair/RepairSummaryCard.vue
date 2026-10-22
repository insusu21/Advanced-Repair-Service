<script setup lang="ts">
import RepairStatusBadge from '@/components/common/RepairStatusBadge.vue'
import { formatDateTime, repairId } from '@/utils/format'
import type { Repair } from '@/types'

defineProps<{ repair: Repair; compact?: boolean }>()
</script>

<template>
  <section class="card summary" aria-label="접수 정보 요약">
    <div class="top">
      <div>
        <div class="row">
          <span class="mono rno">수리 ID {{ repairId(repair.id) }}</span>
          <RepairStatusBadge :status="repair.status" :failed="!!repair.analysisError" />
        </div>
        <h2>{{ repair.product.modelName }}</h2>
      </div>
      <slot name="actions" />
    </div>
    <dl class="kv cols" :class="{ compact }">
      <div><dt>시리얼 번호</dt><dd class="mono">{{ repair.product.serialNumber }}</dd></div>
      <div><dt>에러 코드</dt><dd>{{ repair.errorCodes.length ? repair.errorCodes.join(', ') : '없음' }}</dd></div>
      <div><dt>접수번호</dt><dd class="mono">{{ repair.receiptNo }}</dd></div>
      <div><dt>접수일</dt><dd>{{ formatDateTime(repair.receivedAt) }}</dd></div>
      <div><dt>담당 기사</dt><dd>{{ repair.technician }} · {{ repair.branch }}</dd></div>
      <div v-if="!compact"><dt>생산 공장</dt><dd>{{ repair.product.factory }}</dd></div>
      <div v-if="!compact"><dt>펌웨어</dt><dd>{{ repair.product.firmware }}</dd></div>
      <div class="wide"><dt>고장 증상</dt><dd>{{ repair.symptom }}</dd></div>
      <div v-if="repair.technicianNote" class="wide"><dt>기사 소견</dt><dd class="pre">{{ repair.technicianNote }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.summary {
  padding: 18px 22px;
  display: grid;
  gap: 14px;
}
.top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.rno {
  font-weight: 700;
  color: var(--navy-700);
}
h2 {
  font-size: var(--fs-xl);
  margin-top: 6px;
}
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px 20px;
}
.cols > div {
  display: grid;
  gap: 2px;
}
.cols dt {
  font-size: var(--fs-sm);
}
.wide {
  grid-column: 1 / -1;
}
.pre {
  white-space: pre-wrap;
}
</style>
