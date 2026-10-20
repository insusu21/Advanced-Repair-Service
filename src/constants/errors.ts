/* 백엔드 오류 응답 { code, status } → 화면 문구 (백엔드 docs/API.md "오류" 정책 기준) */

export const ERROR_MESSAGES: Record<string, string> = {
  // 400
  INVALID_INPUT: '입력값을 다시 확인해 주세요.',
  INVALID_ID: '잘못된 번호로 요청했습니다. 목록에서 다시 선택해 주세요.',
  FILE_TYPE: '올릴 수 없는 파일 형식입니다. PNG·JPEG 사진, PDF, 텍스트 파일만 올릴 수 있습니다.',
  SERIAL_REQUIRED: '시리얼 번호를 입력해 주세요.',
  SSE_CURSOR: '실시간 연결 위치가 올바르지 않습니다. 화면을 새로고침해 주세요.',
  FAULT_PART_CATEGORY: '선택한 부품이 고장 부위(PCB·모터)와 맞지 않습니다.',
  // 401
  UNAUTHENTICATED: '로그인이 필요합니다. 다시 로그인해 주세요.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
  // 403
  FORBIDDEN: '이 작업을 할 권한이 없습니다.',
  FORBIDDEN_OR_CSRF: '보안 확인이 만료되었거나 권한이 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.',
  // 404
  NOT_FOUND: '요청한 정보를 찾을 수 없습니다.',
  // 409
  REPORT_VERSION: '다른 곳에서 리포트가 먼저 수정되었습니다. 최신 내용을 불러온 뒤 다시 시도해 주세요.',
  ORDER_STATE: '발주 상태가 바뀌어 이 처리를 할 수 없습니다. 목록을 새로고침해 주세요.',
  INSUFFICIENT_STOCK: '창고 재고가 부족합니다. 수량이나 출고 창고를 바꾸거나 공장 발주로 요청해 주세요.',
  IDEMPOTENCY_KEY_REUSED: '이미 처리된 요청과 내용이 다릅니다. 화면을 새로고침한 뒤 다시 시도해 주세요.',
}

/** code 가 표에 없을 때 HTTP 상태로 고르는 기본 문구 */
function byStatus(status: number): string {
  if (status === 0) return '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.'
  if (status === 401) return ERROR_MESSAGES.UNAUTHENTICATED
  if (status === 403) return ERROR_MESSAGES.FORBIDDEN
  if (status === 404) return ERROR_MESSAGES.NOT_FOUND
  if (status === 409) return '다른 작업과 충돌했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.'
  if (status >= 500) return '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  return '요청을 처리하지 못했습니다.'
}

export function errorMessage(code: string | undefined, status: number): string {
  return (code && ERROR_MESSAGES[code]) || byStatus(status)
}
