<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; height?: number }>(), { lines: 3, height: 18 })
</script>
<template>
  <div class="sk" aria-hidden="true">
    <div v-for="i in lines" :key="i" class="skeleton" :style="{ height: `${height}px`, width: `${i === lines ? 60 : 100 - i * 4}%` }" />
  </div>
</template>
<style scoped>
.sk {
  display: grid;
  gap: 10px;
}
</style>
