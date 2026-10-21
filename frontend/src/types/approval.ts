import type { Component } from 'vue'

export interface ApprovalAction {
  key: string
  label: string
  variant: 'success' | 'danger' | 'ai' | 'default' | 'primary'
  icon?: Component
  /** 의견 입력이 필수인지 */
  requiresComment?: boolean
  hint?: string
}
