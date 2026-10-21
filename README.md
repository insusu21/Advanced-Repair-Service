# 로봇청소기 고장 진단·수리 지원 AI Agent (SKALA 6팀 통합본)

기사 접수(사진) → Spring → Kafka → LangGraph 에이전트(PCB·기계·RAG MCP + GPT) → Spring → 프론트 진단 화면 → 진단 확인 → 수리 리포트 → 종결까지 돈다.
팀원 코드를 합치면서 고친 것: **[개조내역.md](개조내역.md)**

## Agent 담당 범위와 현재 구현

이 작업은 `agent/feat/harness-hardening` 브랜치에서 관리한다. 새 작업은 최신 `dev`에서 영역/타입/작업명 형식으로 브랜치를 만들고, 작업 브랜치를 push한 뒤 `dev` 대상으로 PR을 생성한다.

| 항목 | 현재 구현 |
|---|---|
| 오케스트레이션 | 스켈레톤 StateGraph 유지. 사진 분류 → 소견 처리 → 필요한 사진 MCP 병렬 호출 → RAG → 판단 → 리포트 또는 추가 자료 요청 |
| MCP 선택 | PCB/MOTOR 사진 구분을 사용하고 GENERAL은 분류한다. 텍스트 단서로 사진 MCP를 강제 선택하지 않는다 |
| RAG 입력 | 기사 소견·PCB 라벨·기계 표면 결함 라벨 전달. 자동차 찌그러짐 라벨은 검색 입력에서 제외 |
| 오류 처리 | 사진별 오류를 수집하며 나머지 분석 계속. 보조 해석·검색 실패는 근거 제한 안내. 추가 자료 요청은 작업 전체 최대 3회 |
| 상태 저장 | SQLite inbox/outbox로 요청·결과·이벤트 영속화. 완료된 중복 이벤트는 저장 결과 사용. 추가 자료는 새 이벤트로 재분석하며 LangGraph checkpointer는 사용하지 않음 |
| 승인 | Agent는 `recommendedParts`에 부품 ID·수량을 제시. 재고 조회·발주 승인·처리는 Spring 담당 |
| 프롬프트 | 기존 사진 분류·소견 분리·리포트 프롬프트 파일과 manifest 버전·해시 관리 |
| 실행 제어 | 이벤트별 20 super-step·노드 실행 20회·1,800초. 같은 도구와 같은 입력의 시도는 재시도 포함 3회. 사람의 추가 자료 대기 시간은 제외 |
| 문맥 제어 | MCP 응답·이벤트 크기 제한, 리포트 근거 축약, 직접 LLM 호출 토큰 예산·사용량 기록, 자유 텍스트 패턴 마스킹. 적용 누락은 아래 표 참고 |
| 관측 | 구조화 로그 및 LangSmith. 진단 이벤트별 trace 생성, 보고서에 trace_id 저장 |

### 보완 범위

| 항목 | 현황 |
|---|---|
| 선택 근거 로그 | `classify_photos`·`pick_mcps`의 선택/미선택 이유를 별도 로그·trace 메타데이터로 남기는 기능은 미구현 |
| 사례 번역 | 프롬프트 파일 분리, 호출 전 입력 보호·토큰 예산 예약 미적용. 예외를 원문 반환으로 처리하므로 재시도·제한 예외 정책 보완 필요 |
| 소견 분리 | 호출 전 토큰 예약·출력 마스킹은 적용. 입력 원문의 마스킹·길이 축약은 미적용 |
| 원격 MCP 내부 관측 | 별도 MCP 서버 내부 LLM·임베딩 사용량과 Agent trace 연결은 미구현 |

낮은 확신·근거 충돌의 종합 판단과 최종 미해결 상세 결과의 화면 연동은 현재 Agent 작업 범위에서 제외한다. 교재의 checkpointer·Agent 승인 interrupt 방식 대신 SQLite 재분석·Spring 승인 구조를 사용하므로, 교재 항목 전체 완료로 간주하지 않는다.

### 리포트와 검증 범위

- 리포트: `worker/reports/task-{taskId}_revision-{inputRevision}_고장리포트.md` 및 같은 이름의 `.json`.
- JSON에는 `command`, `result`, `execution`이 저장된다. 결과 파일은 Git에 포함하지 않으며 실행 후 생성된다.
- 정상 완료·추가 자료 요청·최종 미해결 결과 모두 로컬 리포트를 생성한다. 파일 생성과 Spring 화면 표시 여부는 별도다.
- 2026-10-21 Agent 테스트 127개 통과를 확인했다. 모의 MCP·LLM 및 로컬 이벤트 기반 회귀 검증이며, 현재 통합본 전체의 실제 서비스 검증을 대신하지 않는다.
- LangSmith 합성 연결 테스트에서 루트·그래프·노드·도구가 동일 trace로 원격 저장되는 것을 확인했다. 실제 진단 호출의 지속적인 전송·토큰 기록 검증과는 구분한다.

## 구성
| 폴더 | 내용 | 포트 |
|---|---|---|
| `backend/` | Spring Boot (Java 21) + Postgres 17 + Kafka (`backend/compose.yaml`) | 8080 / 5432 / 9092 |
| `frontend/` | Vue 3 + Vite | 5173 |
| `worker/` | LangGraph 에이전트 워커 | — |
| `mcp_servers/mechanical` | 기계(모터) 결함 검출 MCP | 9104 |
| `mcp_servers/pcb` | PCB 결함 검출 MCP (워커가 stdio로 실행) | — |
| `mcp_servers/business` | 업무 MCP: 재고·공장·발주 (우리 DB를 읽음) | 8015 |
| `worker/business_gateway.py` | Spring의 재고 요청을 업무 MCP 호출로 바꾸는 중계 | 8089 |
| `Rag_mcp/` | 관찰 정규화·PCB 해석·손상 해석·RAG 검색 MCP 4개 | 8011~8014 |
| `integration/` | 시연 스크립트, 사진 요청 대역, 시연 사진 | — |

## 준비 (처음 한 번)
필요: Docker Desktop, JDK 21, uv, Node 20+
```bash
./setup.sh
```
- 루트 `.env`에 `OPENAI_API_KEY`를 설정한다. LangSmith 설정도 같은 파일에 넣을 수 있다. 워커는 `.env`의 비어 있지 않은 값을 셸 환경변수보다 우선하므로, 서버 주소·내부 토큰을 추가할 때는 `run.sh` 및 Spring 설정과 일치시킨다.
- `backend/.env`는 비워 둬도 된다. 비면 로컬 기본값을 쓴다.

## 실행
```bash
./run.sh     # 전부 띄움 (처음엔 RAG 인덱스 생성으로 1~2분 더 걸림)
./stop.sh    # 전부 끔 (DB 데이터는 남음)
```
- 브라우저 http://localhost:5173 → 기사 `tech1` / `1234`, 본사 `quality` / `1234`
- 로그: `logs/` (spring, worker, mech, rag-*, business-mcp, business, front, auto_photo)
- 첫 진단은 무조건 추가 사진을 요청한다(시연용). 끄려면 `DEMO_FORCE_PHOTO=0 ./run.sh`
- 사진을 60초 안에 안 올리면 `auto_photo.py`가 지정 사진을 대신 올린다.
- 5432·9092를 다른 Postgres/Kafka가 쓰고 있으면 1단계에서 멈춘다. 그 프로그램을 끄고 다시 실행한다.
  (예: `brew services stop postgresql@17`, `docker stop <kafka 컨테이너>`)
- 예전 DB를 쓰면 비밀번호가 예전 값일 수 있다. `cd backend && docker compose down -v` 후 다시 `./run.sh` 하면 새로 만든다(데이터 삭제).

## 업무 MCP (재고·발주) 보기
흐름: 진단 완료 → Spring `ProcurementWorker`(2초마다) → 게이트웨이 8089 `inventory.lookup` → 업무 MCP 8015 `get_part_availability` → Spring이 재고 스냅샷 저장·발주 초안 생성 → 프론트

| 단계 | 코드 |
|---|---|
| Spring이 부름 | `backend/src/main/java/com/skala/backend/repair/ProcurementWorker.java` (`mcp.lookup`) |
| Spring 쪽 연결 | `backend/.../repair/BusinessMcp.java` (`realmcp` 프로필이면 실제, 아니면 가짜) |
| 중계 | `worker/business_gateway.py` (`lookup`) |
| 업무 MCP | `mcp_servers/business/server.py` (`get_part_availability`), DB 연결 `db.py` |
| 프론트 | `frontend/src/api/parts.ts` → `PartsOrderView.vue`·`components/parts/PartsOrderPage.vue` |

확인 순서 (`./run.sh` 뒤):
1. 도구 목록: `cd mcp_servers/business && MCP_URL=http://127.0.0.1:8015/mcp uv run python client.py`
2. 중계 직접 호출:
   ```bash
   curl -s -X POST localhost:8089/rpc -H "Authorization: Bearer local-dev-business-token" -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":"t","method":"tools/call","params":{"name":"inventory.lookup","arguments":{"partIds":["1","3"]}}}'
   ```
3. 화면: 접수 → 진단 완료 → 진단 결과의 부품 페이지 (`/repairs/{id}/diagnosis?page=2`)에서 재고·발주 확인. 기존 `/repairs/{id}/parts`는 이 페이지로 이동한다. 전체 부품·발주는 `/parts`, 본사 승인 대기는 `/order-approvals`에서 확인한다.
4. 로그: `tail -f logs/business-mcp.log` (요청마다 `POST /mcp`)
5. DB: `select * from stock_snapshot order by id desc;` / `select * from purchase_order order by id desc;`

- 가짜 재고로 돌리려면 `REAL_BUSINESS_MCP=0 ./run.sh`
- `.env`에 `BUSINESS_MCP_URL`이 있으면 로컬 대신 그 주소(ngrok)를 쓴다

## 시연
- 접수 화면 예시 시리얼 `RC2026000187` 조회 → 사진 첨부(`integration/시연사진/`) → 접수
- 진행 화면 → 추가 사진 요청 → 사진 제출(또는 대역) → 진단 결과 → 진단 확인 → 리포트 저장·확정 → 종결
- 화면 없이 API로 시험: `python3 integration/demo.py complete` 또는 `photo`
- 사진 파일 이름에 실제 검출 결과가 있다. `결함없음_사진요청용` 사진은 추가 사진 요청 흐름용이다.

## 시험
```bash
uv run pytest          # 에이전트
cd backend && ./gradlew test
```

## 시연 사진 출처
01~04는 팀 시험 사진. 05~24는 위키미디어 공용 사진(900px 축소본)이며 원본·작성자·라이선스는 아래와 같다.

| 번호 | 원본 | 작성자 | 라이선스 |
|---|---|---|---|
| 05 | [Roomba 805 underside](https://commons.wikimedia.org/wiki/File:Roomba_805_underside.jpg) | Piperpet | CC BY-SA 4.0 |
| 06 | [Roomba e6 underside](https://commons.wikimedia.org/wiki/File:Roomba_e6_underside.jpg) | Piperpet | CC BY-SA 4.0 |
| 07 | [Roomba 595](https://commons.wikimedia.org/wiki/File:Roomba_595.jpg) | Roomba collector12 | CC BY-SA 4.0 |
| 08 | [Roomba wheelencoder](https://commons.wikimedia.org/wiki/File:Roomba_wheelencoder.jpg) | Adam Mayer | CC BY-SA 2.0 |
| 09 | [Roomba wheelencoder 2](https://commons.wikimedia.org/wiki/File:Roomba_wheelencoder_2.jpg) | Adam Mayer | CC BY-SA 2.0 |
| 10 | [Electric motor brushes vacuum](https://commons.wikimedia.org/wiki/File:Electric_motor_brushes_vacuum.jpg) | Dvortygirl | CC BY-SA 3.0 |
| 11 | [Vacuum cleaner electric motor](https://commons.wikimedia.org/wiki/File:Vacuum_cleaner_electric_motor.jpg) | Dvortygirl | CC BY-SA 3.0 |
| 12 | [Staubsaugermotor](https://commons.wikimedia.org/wiki/File:Staubsaugermotor.jpg) | Julian Breuer (Mettness) | CC BY-SA 3.0 |
| 13 | [From vacuum cleaner motor](https://commons.wikimedia.org/wiki/File:From_vacuum_cleaner_motor_(50293813212).jpg) | Daniel Garcia | CC BY-SA 2.0 |
| 14 | [Universal motor commutator](https://commons.wikimedia.org/wiki/File:Universal_motor_commutator.jpg) | Ulfbastel (derived work) | Public domain |
| 15 | [Universalmotor 3](https://commons.wikimedia.org/wiki/File:Universalmotor_3.JPG) | Marrrci | CC BY-SA 3.0 |
| 16 | [Quadshot drone brushless motors](https://commons.wikimedia.org/wiki/File:Quadshot_drone_brushless_motors_(8107827099).jpg) | Ed Schipul | CC BY 2.0 |
| 17 | [Burnt terminals](https://commons.wikimedia.org/wiki/File:Burnt_terminals.JPG) | Dmitry G | Public domain |
| 18 | [LG RoboKing VR5900-series control board](https://commons.wikimedia.org/wiki/File:LG_RoboKing_VR5900-series_control_board.jpg) | ChrisMoran64 | CC BY-SA 4.0 |
| 19 | [Corroded contact pads on a HDD controller PCB](https://commons.wikimedia.org/wiki/File:Corroded_contact_pads_on_a_HDD_controller_PCB_IMG_2283.JPG) | Hans Haase | CC BY-SA 4.0 |
| 20 | [Polysix Battery corroded KLM367A board](https://commons.wikimedia.org/wiki/File:Polysix_Battery_corroded_KLM367A_board_n.jpg) | Untergeek | CC BY-SA 4.0 |
| 21 | [Burnt tantalum capacitor](https://commons.wikimedia.org/wiki/File:Burnt_tantalum_capacitor_(23432017144).jpg) | htomari | CC BY-SA 2.0 |
| 22 | [Burnt tantalum capacitor (2)](https://commons.wikimedia.org/wiki/File:Burnt_tantalum_capacitor_(2)_(23764576950).jpg) | htomari | CC BY-SA 2.0 |
| 23 | [Burnt tantalum capacitor (3)](https://commons.wikimedia.org/wiki/File:Burnt_tantalum_capacitor_(3)_(23432016184).jpg) | htomari | CC BY-SA 2.0 |
| 24 | [OpenRov Circuits électroniques](https://commons.wikimedia.org/wiki/File:OpenRovProjetCh%27tiPlouf2017Circuits_%C3%A9lectroniques.jpg) | Lamiot | CC BY-SA 4.0 |

## LangSmith 실행 추적

`.env`에 다음 값을 설정한 뒤 워커를 재시작한다. API 키는 Git에 올리지 않는다.

```dotenv
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=발급받은_키
LANGSMITH_PROJECT=repair-agent
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

- 기본값은 비활성화(`false`). 활성화했는데 키가 없으면 명시적인 설정 오류로 처리한다.
- 진단 이벤트 한 건마다 `repair.diagnosis` 루트 추적을 생성한다. 그 아래 `repair.graph`, 노드, 도구 시도·재시도와 Agent의 LangChain LLM 호출이 연결된다.
- `thread_id` 메타데이터는 taskId를 사용하므로 추가 자료 제출 전후 실행을 묶어 볼 수 있다. 이것은 관측용 그룹이며 체크포인터 구현이 아니다.
- 로컬 실행 통계와 JSON의 `execution.trace_id`, Markdown의 실행 추적 항목에서 같은 ID를 확인한다.
- SDK 클라이언트에서 입력·출력 본문을 숨긴다. 작업 식별자, 단계·도구 이름, 시간, 오류, LLM 사용량 등 실행 메타데이터는 전송한다. 오류 문자열의 완전한 개인정보 제거는 별도 하네스 보완 범위다.
- Agent가 직접 호출한 LangChain LLM의 토큰 정보는 SDK 자동 추적을 사용한다. 별도 MCP 서버 내부 LLM·임베딩 호출은 이 추적에 포함되지 않는다.
- 사례 번역의 원문 반환 정책은 그대로 유지된다. 번역 예외를 내부에서 처리하므로 해당 실패가 성공 반환으로 보일 수 있으며 Recovery 단계에서 별도 보완한다.

확인: LangSmith의 `repair-agent` 프로젝트 → `repair.diagnosis` → 그래프·노드·도구 및 LLM 하위 실행을 확인한다.
실제 서비스 호출을 통한 원격 추적 검증은 유효한 키와 실행 환경이 필요하다.

검증 명령: `.venv/bin/python -m pytest -q`
공식 문서: https://docs.langchain.com/langsmith/trace-with-langgraph

## 사진 분석 오류와 추가 자료 요청

- 사진 target(PCB/MOTOR)을 기준으로 해당 이미지 MCP만 호출한다. GENERAL은 사진 분류 후 선택한다. 텍스트 단서로 사진 MCP를 강제 호출하지 않는다.
- Agent에 사진 없는 입력이 전달되면 이미지 MCP를 건너뛰고 소견·RAG 경로로 진행한다. 프론트·Spring의 사진 접수 필수 여부는 변경하지 않았다.
- 사진 분류/이미지 MCP 오류는 사진별로 기록하고 다른 사진·병렬 분석을 계속한다. 오류 응답을 정상 또는 검출 없음으로 바꾸지 않는다.
- 이미지 분석 오류가 남으면 0~2차에서는 다른 사진에 검출 결과가 있어도 추가 자료를 요청한다. 초기 접수 제외 작업 전체 최대 3회다. 3차 재분석 후에는 사진 검출, 표준화된 소견 또는 RAG 검색 결과가 하나라도 있으면 남은 근거로 리포트를 작성한다. 사용할 근거가 모두 없으면 `INCONCLUSIVE_AFTER_THIRD_PHOTO`로 종료한다.
- 추가 요청 부위는 PCB/MOTOR/GENERAL로 지정한다. 서버 오류가 사진 문제라는 뜻은 아니며 서비스 복구도 필요할 수 있다는 안내를 포함한다.
- `PHOTO_REQUESTED`와 최종 미해결 `DIAGNOSIS_FAILED`에 `summary`, `analysisResults`를 추가해 수집 결과·오류 상태를 보존하고 JSON/Markdown으로 저장한다. 기존 이벤트 종류·필수 필드는 유지한다.
- Spring은 추가 요청의 description을 전달한다. 최종 FAILED 상세 summary/analysisResults는 현재 진단 결과 API·화면에서 표시하지 않으므로 별도 백엔드/프론트 연동이 필요하다. Agent 파일·수신 이벤트에는 남는다.
- 보조 해석·RAG 오류는 기존대로 근거 제한 안내 후 진행한다. 실행 예산 초과, 잘못된 입력·사진 다운로드/무결성 오류, 리포트 LLM 오류는 기존 실패 처리 정책을 유지한다.
- 이미지 오류가 없고 결함이 검출되면 완료한다. 검출이 없으면 3회까지 추가 자료를 요청하고, 마지막에는 소견·검색 근거로 작성할 수 있다. 사진 근거가 없는 리포트에는 해당 제한을 명시한다. 검색 결과의 존재는 고장 원인 확정을 의미하지 않는다. 낮은 확신·근거 충돌의 종합 판단은 별도 구현하지 않았다.
- 사진 근거 없는 리포트 작성에는 LLM이 필요하다. 키가 없는 규칙 모드의 작성기는 사진 검출을 전제로 하므로 이 경로를 지원하지 않는다.

검증: 사진별 오류 격리, 입력별 MCP 선택, 분류 실패, 서로 다른 사진으로 3회 재입력,
마지막 회차 복구/미해결, 중복 이벤트, JSON 계약 및 리포트 저장을 모의 MCP/LLM으로 테스트했다.
