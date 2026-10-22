<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CircleAlert, LogIn, Wrench, Building2, Eye, EyeOff } from 'lucide-vue-next'
import AppLogo from '@/components/common/AppLogo.vue'
import { useAuthStore } from '@/stores/auth'
import { toErrorMessage, USE_MOCK } from '@/api'
import type { Role } from '@/types'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = reactive({ employeeId: '', password: '' })
const errors = reactive<{ employeeId?: string; password?: string }>({})
const error = ref<string | null>(null)
const loading = ref(false)
const showPw = ref(false)

const DEMO: { id: string; role: Role; label: string; desc: string; icon: unknown }[] = [
  { id: 'T1001', role: 'TECHNICIAN', label: '서비스센터 기사', desc: '접수 · 사진 · 진단 확인 · 발주 요청 · 리포트 확정', icon: Wrench },
  { id: 'Q2001', role: 'QUALITY_MANAGER', label: '본사 품질 담당자', desc: '발주 승인 · 고장 통계', icon: Building2 },
]

/** 로그인 식별자: Mock 은 데모 사번, 실서버는 아이디(tech1·quality 형식, 이메일 아님) */
const idLabel = USE_MOCK ? '사번' : '아이디'
/** 조사: 받침 있는 '사번' → 과/을, 받침 없는 '아이디' → 와/를 */
const idWa = USE_MOCK ? '사번과' : '아이디와'
const idEul = USE_MOCK ? '사번을' : '아이디를'

function validate() {
  const v = form.employeeId.trim()
  // [통합] 이메일 형식 검사 제거: 백엔드 dev 계정 아이디가 tech1·tech2·quality(이메일 아님)라 로그인이 막혔다. 틀린 값은 서버가 401로 거른다
  errors.employeeId = !v ? `${idEul} 입력해 주세요.` : undefined
  errors.password = form.password ? undefined : '비밀번호를 입력해 주세요.'
  return !errors.employeeId && !errors.password
}

async function submit() {
  error.value = null
  if (!validate()) return
  loading.value = true
  try {
    await auth.login(form.employeeId, form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    void router.replace(redirect)
  } catch (e) {
    error.value = toErrorMessage(e)
  } finally {
    loading.value = false
  }
}

function fill(id: string) {
  form.employeeId = id
  form.password = '1234'
  void submit()
}
</script>

<template>
  <div class="login">
    <section class="intro">
      <span class="glow g1" aria-hidden="true" />
      <span class="glow g2" aria-hidden="true" />
      <div class="brand"><AppLogo /></div>
      <h1>로봇청소기 고장 진단<br />업무 지원 시스템</h1>
      <ol class="flow">
        <li><span>1</span>접수 · 사진 등록</li>
        <li><span>2</span>AI Agent 분석</li>
        <li><span>3</span>기사 확인 · 승인</li>
        <li><span>4</span>부품 조회 · 발주</li>
        <li><span>5</span>수리 리포트 확정</li>
      </ol>
      <p class="rule">AI가 만든 결과는 모두 <b>초안</b>입니다. 담당 기사가 확정한 수리 리포트만 고장 데이터베이스에 반영됩니다.</p>
    </section>

    <section class="panel">
      <form class="card form" novalidate @submit.prevent="submit">
        <h2>로그인</h2>
        <p class="muted">{{ idWa }} 비밀번호를 입력하세요. 역할에 맞는 화면으로 이동합니다.</p>

        <div v-if="error" class="callout tone-danger" role="alert"><CircleAlert :size="20" /> {{ error }}</div>

        <div class="field">
          <label for="eid" class="req">{{ idLabel }}</label>
          <input
            id="eid"
            v-model="form.employeeId"
            class="input"
            :class="{ invalid: errors.employeeId }"
            type="text"
            autocomplete="username"
            :placeholder="USE_MOCK ? '예) T1001' : '예) tech1'"
            :aria-invalid="!!errors.employeeId"
          />
          <p v-if="errors.employeeId" class="error-text">{{ errors.employeeId }}</p>
        </div>
        <div class="field">
          <label for="pw" class="req">비밀번호</label>
          <div class="pw">
            <input id="pw" v-model="form.password" :type="showPw ? 'text' : 'password'" class="input" :class="{ invalid: errors.password }" autocomplete="current-password" :aria-invalid="!!errors.password" />
            <button type="button" class="btn btn-ghost eye" :aria-label="showPw ? '비밀번호 숨기기' : '비밀번호 보기'" @click="showPw = !showPw">
              <component :is="showPw ? EyeOff : Eye" :size="20" />
            </button>
          </div>
          <p v-if="errors.password" class="error-text">{{ errors.password }}</p>
        </div>
        <button type="submit" class="btn btn-primary btn-lg btn-block" :disabled="loading">
          <LogIn :size="20" /> {{ loading ? '로그인 중…' : '로그인' }}
        </button>

        <div v-if="USE_MOCK" class="demo">
          <p class="faint">데모 계정으로 바로 들어가기 (비밀번호 1234)</p>
          <div class="roles">
            <button v-for="d in DEMO" :key="d.id" type="button" class="role" :disabled="loading" @click="fill(d.id)">
              <component :is="d.icon" :size="24" />
              <span>
                <strong>{{ d.label }}</strong>
                <small>{{ d.id }} · {{ d.desc }}</small>
              </span>
            </button>
          </div>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
}
.intro {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background: #fff;
  color: var(--text-2);
  padding: 56px 64px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  justify-content: center;
}
/* 그라데이션 빛 (블러 처리된 원) */
.glow {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  background: var(--gradient);
  filter: blur(80px);
  opacity: 0.55;
  pointer-events: none;
}
.g1 {
  width: 520px;
  height: 520px;
  top: -160px;
  right: -140px;
}
.g2 {
  width: 380px;
  height: 380px;
  bottom: -140px;
  left: -100px;
  opacity: 0.35;
}
.brand {
  display: flex;
  align-items: center;
}
h1 {
  color: var(--ink);
  font-size: 3.4rem;
  font-weight: 200;
  line-height: 1.18;
  letter-spacing: -0.04em;
}
.flow {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
  font-size: var(--fs-lg);
}
.flow li {
  display: flex;
  align-items: center;
  gap: 14px;
}
.flow span {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--blue-100);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: var(--fs-sm);
}
.flow li {
  color: var(--ink);
}
.rule {
  max-width: 460px;
  padding: 16px 18px;
  border: 1px dashed var(--ai-border);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-2);
}
.rule b {
  color: var(--ai);
}
.panel {
  display: grid;
  place-items: center;
  padding: 32px;
  background: var(--bg);
}
.form {
  width: min(480px, 100%);
  padding: 36px;
  display: grid;
  gap: 18px;
}
h2 {
  font-size: var(--fs-2xl);
  font-weight: 300;
  letter-spacing: -0.03em;
}
.pw {
  position: relative;
}
.pw .input {
  padding-right: 56px;
}
.eye {
  position: absolute;
  right: 2px;
  top: 0;
  padding: 0 12px;
}
.demo {
  border-top: 1px solid var(--border);
  padding-top: 16px;
  display: grid;
  gap: 10px;
}
.roles {
  display: grid;
  gap: 8px;
}
.role {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 60px;
  padding: 10px 16px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  color: var(--primary);
}
.role:hover {
  border-color: var(--primary);
  background: var(--blue-50);
}
.role span {
  display: grid;
  color: var(--text);
}
.role small {
  color: var(--text-3);
  font-size: var(--fs-xs);
}
@media (max-width: 960px) {
  .login {
    grid-template-columns: 1fr;
  }
  .intro {
    padding: 32px 24px;
    gap: 20px;
  }
  h1 {
    font-size: 2.4rem;
  }
  .flow {
    display: none;
  }
}
</style>
