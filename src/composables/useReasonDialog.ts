/* 사유 입력 모달 상태 (재분석 요청 · 본사 검토 요청 · 반려 등) */
import { reactive } from 'vue'

export function useReasonDialog<K extends string>() {
  const state = reactive({ open: false, kind: '' as K | '', title: '', label: '', placeholder: '', text: '', error: '' })
  function open(kind: K, title: string, label: string, placeholder = '') {
    Object.assign(state, { open: true, kind, title, label, placeholder, text: '', error: '' })
  }
  function close() {
    state.open = false
  }
  function validate(min = 2) {
    if (state.text.trim().length < min) {
      state.error = `${state.label}을(를) 입력해 주세요.`
      return false
    }
    return true
  }
  return { state, open, close, validate }
}
