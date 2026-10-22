# 체크포인터·interrupt로 진단 중간 상태 이어가기

## 왜

추가 사진 요청(PHOTO_REQUESTED) 뒤 2차 진단이 **처음부터 다시** 돌았다. 1차에서 쓴 비용(사진 분석·RAG·LLM)이 버려지고, 교재 하네스 8요소 중 `State·Memory`의 체크포인터·interrupt 칸만 미구현으로 남아 있었다.

## 무엇을

- **체크포인터**: 그래프 상태를 작업 단위(`thread_id`)로 `.local/checkpoints.sqlite3`에 영속화. 기존 inbox/outbox SQLite(`STATE_PATH`)와 별도 DB다.
- **interrupt·resume**: 추가 자료 요청 시 `wait_input` 노드에서 `interrupt()`로 멈춘다. 다음 명령이 돌려받은 `checkpoint` 값을 그대로 보내면 `Command(resume=...)`로 **멈춘 지점부터** 이어서 진단한다.
- **findings 리듀서**: `findings`를 누적이 아니라 `(source, 사진/도구)` 키 기준 교체로 바꿨다. 같은 사진 결과가 중복 쌓이지 않고, 1차의 지난 오류도 2차에서 정리된다.
- **증분 분석**: `classify_photos`가 이미 분석한 사진은 건너뛴다. 2차에서는 새로 올라온 사진만 MCP를 부른다.
- **체크포인트 정리**: 작업이 끝나면(`PHOTO_REQUESTED`가 아닌 결과) `adelete_thread`로 지운다. 기다리는 작업의 상태는 남긴다.
- **멈춤 로그 구분**: `interrupt()`가 예외로 올라와 정상 멈춤이 `node.failed` ERROR로 찍히던 문제를 `node.paused`로 분리했다.

## 백엔드 변경 없음

`checkpoint` 필드는 이미 왕복한다. `DiagnosisEvents.java:54,58`이 `diagnosis_job.checkpoint_ref`에 저장하고 `RepairService.java:104`가 다음 명령에 되돌려준다.

## 검증

- `pytest`: **138 passed** (신규 `tests/test_checkpoint.py` 6건, `tests/test_findings_merge.py` 5건)
- **실환경**(실제 PCB·observation·damage·RAG MCP + OpenAI, 사진 입력/Kafka 출력만 로컬):
  - 1차 → `PHOTO_REQUESTED`, `checkpoint` = taskId, 멈춘 상태에 findings 4건 보존
  - 2차 → `DIAGNOSIS_COMPLETED`, 최종 근거 8건, 도구 오류 0건
  - 사진 분석 호출 **2회 = 사진 2장**. 1차 사진을 재개 때 다시 부르지 않음
  - 끝난 뒤 체크포인트 삭제 확인
- 기존 `worker.verify_live --scenario multi-pcb` 회귀 없음 (`DIAGNOSIS_COMPLETED`, 오류 0건)

## 영향

`langgraph-checkpoint-sqlite>=3.1,<4` 의존성이 추가된다(`uv sync` 필요). 체크포인터 없이 그래프를 만들면 기존 경로(`request_photo → END`)로 동작하므로, 테스트·단발 실행은 그대로다.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
