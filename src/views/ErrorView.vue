<script setup lang="ts">
import { House, Lock, MapPinOff } from 'lucide-vue-next'
defineProps<{ code: 403 | 404 }>()
</script>

<template>
  <div class="page">
    <section class="card err">
      <component :is="code === 403 ? Lock : MapPinOff" :size="56" />
      <h1>{{ code === 403 ? '이 화면을 볼 권한이 없습니다' : '페이지를 찾을 수 없습니다' }}</h1>
      <p class="muted">{{ code === 403 ? '사용자 역할에 맞는 메뉴만 이용할 수 있습니다. 필요하면 관리자에게 권한을 요청하세요.' : '주소가 바뀌었거나 삭제된 화면입니다.' }}</p>
      <RouterLink to="/" class="btn btn-primary btn-lg"><House :size="20" /> 홈으로</RouterLink>
    </section>
  </div>
</template>

<style scoped>
.err {
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 64px 24px;
  text-align: center;
  color: var(--text-2);
}
h1 {
  color: var(--text);
  font-size: var(--fs-xl);
}
</style>
