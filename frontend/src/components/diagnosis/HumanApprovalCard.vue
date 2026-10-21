<script setup lang="ts">
/* =========================================================================
 * HumanApprovalCard — 모든 승인 영역이 공유하는 단일 컴포넌트
 * 반드시 표시: AI 제안 내용 · 판단 근거 · 신뢰도 · 데이터 출처 · 승인 · 반려 ·
 *            수정 의견 입력 · 재분석 요청 · 승인자와 승인 시각
 * 사용처: 진단 확인(기사) / 수리 결과 승인(본사) / 발주 승인(본사 품질 담당자)
 * ========================================================================= */
import { computed, ref, watch } from 'vue'
import type { ApprovalAction } from '@/types/approval'
import { CircleCheck, CircleX, RotateCw, ShieldCheck, Hourglass, UserCheck, CircleAlert, Lock } from 'lucide-vue-next'
import AiBadge from '@/components/common/AiBadge.vue'
import ConfidenceBar from '@/components/common/ConfidenceBar.vue'
import DataSourceList from '@/components/common/DataSourceList.vue'
import { DECISION_META, ROLE_LABEL } from '@/constants/status'
import type { DataSource, Decision } from '@/types'
import { formatDateTime } from '@/utils/format'


const props = withDefaults(
  defineProps<{
    title: string
    /** AI 가 제안한 내용 */
    suggestion: string
    evidence: string[]
    confidence?: number
    sources: DataSource[]
    sourceIds?: string[]
    decision: Decision
    /** 기본: 승인 · 반려 · 재분석 요청. 부모가 추가 버튼을 넘길 수 있음 */
    actions?: ApprovalAction[]
    canDecide?: boolean
    disabledReason?: string
    busy?: boolean
    commentLabel?: string
    commentPlaceholder?: string
  }>(),
  {
    canDecide: true,
    commentLabel: '수정 의견 · 처리 사유',
    commentPlaceholder: '확인한 내용, 수정이 필요한 부분, 반려 사유 등을 적어 주세요.',
  },
)
const emit = defineEmits<{ action: [key: string, comment: string] }>()

const DEFAULT_ACTIONS: ApprovalAction[] = [
  { key: 'approve', label: '승인', variant: 'success', icon: CircleCheck },
  { key: 'reanalyze', label: '재분석 요청', variant: 'ai', icon: RotateCw, requiresComment: true },
  { key: 'reject', label: '반려', variant: 'danger', icon: CircleX, requiresComment: true },
]
const list = computed(() => props.actions ?? DEFAULT_ACTIONS)
const comment = ref('')
const missing = ref<string | null>(null)
const pendingKey = ref<string | null>(null)
const decided = computed(() => props.decision.state !== 'PENDING')
const meta = computed(() => DECISION_META[props.decision.state])

watch(comment, () => (missing.value = null))
watch(
  () => props.busy,
  (b) => {
    if (!b) pendingKey.value = null
  },
)

function run(a: ApprovalAction) {
  if (a.requiresComment && !comment.value.trim()) {
    missing.value = `"${a.label}" 을(를) 하려면 사유를 입력해야 합니다.`
    document.getElementById('approval-comment')?.focus()
    return
  }
  pendingKey.value = a.key
  emit('action', a.key, comment.value.trim())
}
const btnClass = (v: ApprovalAction['variant']) => ({ success: 'btn-success', danger: 'btn-danger', ai: 'btn-ai', primary: 'btn-primary', default: '' })[v]
</script>

<template>
  <section class="card approval" :class="{ decided }" aria-labelledby="approval-title">
    <div class="card-head">
      <h3 id="approval-title"><ShieldCheck :size="22" /> {{ title }}</h3>
      <span class="badge" :class="`tone-${meta.tone}`">
        <component :is="decided ? UserCheck : Hourglass" :size="15" /> {{ meta.label }}
      </span>
    </div>

    <div class="cols">
      <!-- 좌: AI 제안 (초안) -->
      <div class="ai-zone left">
        <AiBadge />
        <div>
          <p class="lbl">AI 가 제안한 내용</p>
          <p class="sugg">{{ suggestion }}</p>
          <slot name="suggestion" />
        </div>
        <div>
          <p class="lbl">판단 근거</p>
          <ul class="ev">
            <li v-for="e in evidence" :key="e">{{ e }}</li>
          </ul>
        </div>
        <ConfidenceBar v-if="confidence !== undefined" :value="confidence" label="신뢰도" />
        <div>
          <p class="lbl">데이터 출처</p>
          <DataSourceList :sources="sources" :ids="sourceIds" />
          <p v-if="!sources.length" class="faint">출처 없음 (직접 입력)</p>
        </div>
      </div>

      <!-- 우: 사람의 결정 -->
      <div class="right">
        <div v-if="decided" class="result" :class="decision.state === 'APPROVED' ? 'human-zone' : 'neg'">
          <AiBadge v-if="decision.state === 'APPROVED'" kind="human" />
          <strong class="rt">{{ meta.label }}</strong>
          <dl class="kv">
            <dt>승인자</dt>
            <dd>{{ decision.decidedBy }}<span v-if="decision.decidedByRole" class="faint"> · {{ ROLE_LABEL[decision.decidedByRole] }}</span></dd>
            <dt>처리 시각</dt>
            <dd>{{ formatDateTime(decision.decidedAt) }}</dd>
            <template v-if="decision.comment">
              <dt>의견</dt>
              <dd class="cm">{{ decision.comment }}</dd>
            </template>
          </dl>
        </div>

        <template v-if="!decided || $slots.after">
          <slot name="after" />
        </template>

        <div v-if="!decided" class="form">
          <div class="field">
            <label for="approval-comment" class="label">{{ commentLabel }}</label>
            <textarea
              id="approval-comment"
              v-model="comment"
              class="textarea"
              :class="{ invalid: missing }"
              :placeholder="commentPlaceholder"
              :disabled="!canDecide || busy"
              :aria-invalid="!!missing"
            />
            <p v-if="missing" class="error-text" role="alert"><CircleAlert :size="16" /> {{ missing }}</p>
          </div>

          <div v-if="canDecide" class="acts">
            <button
              v-for="a in list"
              :key="a.key"
              type="button"
              class="btn btn-lg"
              :class="btnClass(a.variant)"
              :disabled="busy"
              :title="a.hint"
              @click="run(a)"
            >
              <component :is="a.icon" v-if="a.icon && !(busy && pendingKey === a.key)" :size="20" />
              <RotateCw v-else-if="busy && pendingKey === a.key" :size="20" class="spin" />
              {{ a.label }}
              <span v-if="a.requiresComment" class="need">사유 필수</span>
            </button>
          </div>
          <p v-else class="callout tone-neutral"><Lock :size="18" /> {{ disabledReason ?? '처리 권한이 없습니다.' }}</p>

          <dl class="kv stamp">
            <dt>승인자</dt>
            <dd class="faint">처리 시 자동 기록</dd>
            <dt>승인 시각</dt>
            <dd class="faint">처리 시 자동 기록</dd>
          </dl>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.approval {
  border: 2px solid var(--navy-700);
  box-shadow: var(--shadow);
}
.approval.decided {
  border-color: var(--border);
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 18px;
  padding: 18px 22px 22px;
}
.left {
  padding: 16px 18px;
  display: grid;
  gap: 14px;
  align-content: start;
}
.lbl {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text-2);
  margin-bottom: 4px;
}
.sugg {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--navy-900);
}
.ev {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 2px;
}
.right {
  display: grid;
  gap: 14px;
  align-content: start;
}
.form {
  display: grid;
  gap: 14px;
}
.acts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.acts .btn {
  justify-content: center;
  flex-wrap: wrap;
  height: auto;
  padding-top: 10px;
  padding-bottom: 10px;
}
.need {
  font-size: var(--fs-xs);
  font-weight: 600;
  opacity: 0.75;
}
.result {
  padding: 16px 18px;
  display: grid;
  gap: 10px;
}
.result.neg {
  border: 2px solid var(--danger-border);
  background: var(--danger-bg);
  border-radius: var(--radius-lg);
}
.rt {
  font-size: var(--fs-lg);
}
.cm {
  white-space: pre-wrap;
}
.stamp {
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: var(--fs-sm);
}
@media (max-width: 1000px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
</style>
