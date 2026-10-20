/* 접이식 섹션 묶음: 화면 단위로 펼침 상태를 저장(sessionStorage)하고 "모두 펼치기 / 모두 접기" 를 전달한다 */
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'

export interface CollapsibleGroup {
  /** sessionStorage 키 구분용 화면 이름 */
  scope: string
  /** 모두 펼치기/접기 명령. n 이 바뀔 때마다 각 섹션이 open 값을 따른다 */
  command: Ref<{ open: boolean; n: number }>
}

const KEY: InjectionKey<CollapsibleGroup> = Symbol('collapsible-group')

export function provideCollapsibleGroup(scope: string) {
  const command = ref({ open: false, n: 0 })
  provide(KEY, { scope, command })
  return {
    expandAll: () => (command.value = { open: true, n: command.value.n + 1 }),
    collapseAll: () => (command.value = { open: false, n: command.value.n + 1 }),
  }
}

export function useCollapsibleGroup(): CollapsibleGroup | undefined {
  return inject(KEY, undefined)
}

const storageKey = (scope: string, id: string) => `robotcare-collapse:${scope}:${id}`

export function readOpen(scope: string, id: string): boolean | null {
  try {
    const v = sessionStorage.getItem(storageKey(scope, id))
    return v === null ? null : v === '1'
  } catch {
    return null
  }
}

export function writeOpen(scope: string, id: string, open: boolean) {
  try {
    sessionStorage.setItem(storageKey(scope, id), open ? '1' : '0')
  } catch {
    /* 저장소 사용 불가 시 이번 화면에서만 유지 */
  }
}
