<script setup lang="ts">
/* 로고 자리 (임시). 실제 로고가 정해지면 이 파일만 바꾸면 로그인·사이드바 등 모든 곳에 반영된다 */
withDefaults(defineProps<{ label?: string }>(), { label: 'RobotCare AI' })
</script>

<template>
  <span class="app-logo" role="img" :aria-label="label">LOGO</span>
</template>

<style scoped>
.app-logo {
  display: inline-grid;
  place-items: center;
  width: 120px;
  height: 32px;
  flex: none;
  border: 1.5px dashed #b6c0cf;
  border-radius: 8px;
  color: #9aa5b5;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.2em;
  user-select: none;
}
</style>
