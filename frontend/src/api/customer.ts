/* 소비자용 수리 진행 조회 (로그인 없음)
 *  접수번호 + 휴대폰 번호 뒷자리 4개. 어느 값이 틀렸는지는 알려 주지 않는다.
 *  응답에는 기사가 확정한 내용만 쉬운 말로 담는다 (AI 초안·점수·부품번호·재고 없음).
 *  실서버: 아직 API 없음 → FEATURES.customerReport 가 false 면 화면에서 준비 중 안내 (경로는 백엔드 확정 후 맞출 것)
 *  ※ 실서버는 뒷자리 4자리 대입을 막도록 조회 횟수 제한이 꼭 필요하다 */
import { ApiError, http, mockDelay, USE_MOCK } from './http'
import { FEATURES } from './features'
import * as mock from '@/mocks/handlers'
import type { CustomerReport } from '@/types'

export const CUSTOMER_NOT_FOUND = '접수 정보를 찾을 수 없어요. 접수번호를 다시 확인해 주세요.'

export async function getCustomerReport(receiptNo: string, phoneLast4: string): Promise<CustomerReport> {
  try {
    if (USE_MOCK) return await mockDelay(() => mock.getCustomerReport(receiptNo, phoneLast4), 600)
    if (!FEATURES.customerReport) throw new ApiError(501, '수리 진행 조회는 아직 준비 중이에요.', 'NOT_SUPPORTED')
    // 개인정보가 URL·로그에 남지 않도록 POST 본문으로 보낸다
    // 공개 화면: 401 이 와도 기사용 로그인 화면으로 보내지 않음
    return (await http.post<CustomerReport>('/public/repair-status', { receiptNo, phoneLast4 }, { skipAuthExpired: true })).data
  } catch (e) {
    // 없음·불일치·형식 오류는 모두 같은 문구로 (어떤 값이 틀렸는지 노출하지 않음)
    if (e instanceof ApiError && [400, 401, 403, 404, 422].includes(e.status)) throw new ApiError(404, CUSTOMER_NOT_FOUND, 'NOT_FOUND')
    throw e
  }
}
