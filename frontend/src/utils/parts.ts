import type { Part } from '@/types'

/** 모델 호환 여부. 호환 모델 목록이 비어 있으면(실서버: 부품 목록에 호환 정보 없음) 모든 모델에 허용 */
export function isCompatible(part: Part, model: string | undefined): boolean {
  return !part.compatibleModels.length || !model || part.compatibleModels.includes(model)
}
