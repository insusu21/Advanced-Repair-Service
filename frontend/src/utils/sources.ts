import type { DataSource } from '@/types'

/** 데이터 출처 → 수집 경로 배지. 매뉴얼·에러코드 문서는 RAG 검색, 고장 DB·기기 로그는 MCP 도구 조회 (사진은 배지 없음) */
const ORIGIN: Partial<Record<DataSource['type'], 'RAG' | 'MCP'>> = {
  MANUAL: 'RAG',
  ERROR_CODE_TABLE: 'RAG',
  REPAIR_DB: 'MCP',
  SENSOR_LOG: 'MCP',
}

export const sourceOrigin = (type: DataSource['type']) => ORIGIN[type]
