import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 백엔드가 준비되면 .env.development 의 VITE_USE_MOCK=false 로 바꾸고
// VITE_API_PROXY_TARGET 에 백엔드 주소를 넣으면 /api 요청이 프록시됩니다.
export default defineConfig(({ mode }) => {
  const target = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080'
  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
    define: { __APP_MODE__: JSON.stringify(mode) },
  }
})
