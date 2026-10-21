# 로봇청소기 고장 진단·수리 지원 AI Agent (SKALA 6팀 통합본)

기사 접수(사진) → Spring → Kafka → LangGraph 에이전트(PCB·기계·RAG MCP + GPT) → Spring → 프론트 진단 화면 → 진단 확인 → 수리 리포트 → 종결까지 돈다.
팀원 코드를 합치면서 고친 것: **[개조내역.md](개조내역.md)**

## 구성
| 폴더 | 내용 | 포트 |
|---|---|---|
| `backend/` | Spring Boot (Java 21) + Postgres 17 + Kafka (`backend/compose.yaml`) | 8080 / 5432 / 9092 |
| `frontend/` | Vue 3 + Vite | 5173 |
| `worker/` | LangGraph 에이전트 워커 | — |
| `mcp_servers/mechanical` | 기계(모터) 결함 검출 MCP | 9104 |
| `mcp_servers/pcb` | PCB 결함 검출 MCP (워커가 stdio로 실행) | — |
| `Rag_mcp/` | 관찰 정규화·PCB 해석·손상 해석·RAG 검색 MCP 4개 | 8011~8014 |
| `integration/` | 시연 스크립트, 사진 요청 대역, 시연 사진 | — |

## 준비 (처음 한 번)
필요: Docker Desktop, JDK 21, uv, Node 20+
```bash
./setup.sh
```
- `.env`: `OPENAI_API_KEY` 입력
- `backend/.env`: `DB_PASSWORD`, `INTERNAL_SERVICE_TOKEN`(32자 이상), `DEV_PASSWORD`(12자 이상) 입력
- RAG 인덱스: `cd Rag_mcp && uv run --env-file ../.env repair-mcp index`

## 실행 (터미널 7개, 모두 레포 루트에서 시작)
```bash
# 1. DB·Kafka
cd backend && set -a && . ./.env && set +a && docker compose up -d --wait

# 2. Spring (dev, 가짜 AI 끔)
cd backend && set -a && . ./.env && set +a && ./gradlew bootRun --args='--app.mock-ai.enabled=false'

# 3. 기계 MCP
cd mcp_servers/mechanical && uv run python server.py

# 4. Rag_mcp 4개
cd Rag_mcp && for s in observation:8011 pcb:8012 damage:8013 rag:8014; do \
  uv run --env-file ../.env repair-mcp serve ${s%%:*} --transport http --port ${s##*:} & done; wait

# 5. 에이전트 워커 (DEMO_FORCE_PHOTO=1: 첫 진단은 무조건 추가 사진 요청, 시연용)
set -a && . backend/.env && set +a && DEMO_FORCE_PHOTO=1 env -u OPENAI_API_KEY uv run --env-file .env python -m worker.main

# 6. 프론트 → 브라우저 http://localhost:5173
cd frontend && VITE_USE_MOCK=false VITE_API_BASE_URL= VITE_API_PROXY_TARGET=http://localhost:8080 npx vite --port 5173

# 7. 사진 요청 대역 (요청 후 60초 동안 아무도 안 올리면 지정 사진 제출)
cd integration && python3 auto_photo.py
```

## 로그인
계정 `tech1`, `tech2`(기사), `quality`(본사). 비밀번호는 처음엔 `DEV_PASSWORD`다. `1234`로 바꾸려면 Spring을 한 번 띄운 뒤:
```bash
cd backend && docker compose exec postgres psql -U repair -d repair -c \
 "CREATE EXTENSION IF NOT EXISTS pgcrypto; UPDATE app_user SET password_hash=crypt('1234', gen_salt('bf',12)) WHERE email IN ('tech1','tech2','quality')"
```
`integration/demo.py`, `auto_photo.py`는 `LOGIN_PASSWORD`(기본 `1234`)로 로그인한다.

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
- 이미지 분석 오류가 남으면 다른 사진에서 검출했더라도 추가 자료를 요청한다. 초기 입력 제외 작업 전체 최대 3회이며, 3차 재분석이 성공하면 정상 완료한다. 계속 미해결이면 `INCONCLUSIVE_AFTER_THIRD_PHOTO`로 종료한다.
- 추가 요청 부위는 PCB/MOTOR/GENERAL로 지정한다. 서버 오류가 사진 문제라는 뜻은 아니며 서비스 복구도 필요할 수 있다는 안내를 포함한다.
- `PHOTO_REQUESTED`와 최종 미해결 `DIAGNOSIS_FAILED`에 `summary`, `analysisResults`를 추가해 수집 결과·오류 상태를 보존하고 JSON/Markdown으로 저장한다. 기존 이벤트 종류·필수 필드는 유지한다.
- Spring은 추가 요청의 description을 전달한다. 최종 FAILED 상세 summary/analysisResults는 현재 진단 결과 API·화면에서 표시하지 않으므로 별도 백엔드/프론트 연동이 필요하다. Agent 파일·수신 이벤트에는 남는다.
- 보조 해석·RAG 오류는 기존대로 근거 제한 안내 후 진행한다. 실행 예산 초과, 잘못된 입력·사진 다운로드/무결성 오류, 리포트 LLM 오류는 기존 실패 처리 정책을 유지한다.
- 정상 이미지 결과의 충분성 판단은 기존 검출 유무 방식이다. 낮은 확신·근거 충돌을 종합 판단하는 정책은 이번 변경에 포함하지 않았다.

검증: 사진별 오류 격리, 입력별 MCP 선택, 분류 실패, 서로 다른 사진으로 3회 재입력,
마지막 회차 복구/미해결, 중복 이벤트, JSON 계약 및 리포트 저장을 모의 MCP/LLM으로 테스트했다.
