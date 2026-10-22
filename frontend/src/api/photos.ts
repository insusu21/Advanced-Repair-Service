/* 접수 사진 품질 검사
 *  Mock: 파일 이름에 blur / glare / far / wrong 이 들어가면 해당 문제, 아니면 통과 (0.8초 지연)
 *  실서버: 아직 API 없음 → FEATURES.photoQualityCheck 가 false 면 화면에서 검사 단계를 건너뛴다 */
import { ApiError, http, mockDelay, USE_MOCK } from './http'
import { FEATURES } from './features'
import type { PhotoQualityIssue, PhotoQualityResult } from '@/types'

/** 검사 대상 부위 (접수 사진 칸) */
export type PhotoQualityTarget = 'PCB' | 'MOTOR'

const MOCK_RULES: [RegExp, PhotoQualityIssue][] = [
  [/blur/i, 'BLUR'],
  [/glare/i, 'GLARE'],
  [/far/i, 'TOO_FAR'],
  [/wrong/i, 'WRONG_PART'],
]

function mockCheck(file: File): PhotoQualityResult {
  const issues = MOCK_RULES.filter(([re]) => re.test(file.name)).map(([, code]) => code)
  return { ok: !issues.length, issues, score: issues.length ? 0.42 : 0.93 }
}

export async function checkPhotoQuality(file: File, target: PhotoQualityTarget): Promise<PhotoQualityResult> {
  if (USE_MOCK) return mockDelay(() => mockCheck(file), 800)
  if (!FEATURES.photoQualityCheck) throw new ApiError(501, '사진 품질 검사는 아직 백엔드에서 지원하지 않습니다.', 'NOT_SUPPORTED')
  // 백엔드 API 가 생기면 FEATURES.photoQualityCheck 만 켜면 된다. (경로·필드 이름은 백엔드 확정 후 맞출 것)
  const f = new FormData()
  f.append('file', file)
  f.append('target', target)
  return (await http.post<PhotoQualityResult>('/photos/quality-check', f)).data
}
