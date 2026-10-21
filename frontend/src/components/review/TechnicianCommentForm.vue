<script setup lang="ts">
/* 기사 코멘트 입력 — 자주 쓰는 문구 버튼으로 타이핑 부담을 줄임 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ modelValue: string; label?: string; maxLength?: number; required?: boolean; invalid?: boolean }>(), {
  label: '기사 코멘트',
  maxLength: 1000,
})
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const QUICK = ['AI 진단대로 확인됨', '사진상 판단과 실제가 다름', '동일 증상 재발 건', '고객 사용 환경 영향(물·이물질)', '추가 점검 필요']
const len = computed(() => props.modelValue.length)

function add(t: string) {
  const v = props.modelValue.trim()
  emit('update:modelValue', v ? `${v}\n${t}` : t)
}
</script>

<template>
  <div class="field">
    <label for="tech-comment" :class="{ req: required }">{{ label }}</label>
    <div class="quick" role="group" aria-label="자주 쓰는 문구">
      <button v-for="q in QUICK" :key="q" type="button" class="btn btn-sm" @click="add(q)">+ {{ q }}</button>
    </div>
    <textarea
      id="tech-comment"
      class="textarea"
      :class="{ invalid }"
      :value="modelValue"
      :maxlength="maxLength"
      placeholder="실제 점검 결과, AI 진단과 다른 점, 다음 수리 시 참고할 내용을 적어 주세요."
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <span class="help" style="text-align: right">{{ len }} / {{ maxLength }}자</span>
  </div>
</template>

<style scoped>
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.quick .btn {
  font-weight: 500;
}
</style>
