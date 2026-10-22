# 로봇청소기 고장 진단·수리 지원 AI Agent (SKALA 6팀 통합본)

기사 접수(사진) → Spring → Kafka → LangGraph 에이전트(PCB·기계·RAG MCP + GPT) → Spring → 프론트 진단 화면 → 진단 확인 → 부품 재고·발주 → 수리 리포트 → 종결까지 돈다.
> **브랜치:** `dev` = 홍은비 에이전트(`agent/feat/harness-hardening`) 원본 그대로 + 백엔드·프론트·MCP를 붙인 것. 제출본(부품 확인 Agent·사례 저장 추가)은 `main`.

팀원 코드를 합치면서 고친 것: **[docs/개조내역.md](docs/개조내역.md)** · 진행 상황: **[docs/진행사항.md](docs/진행사항.md)** · 에이전트 상세(하네스·LangSmith·오류 처리): **[worker/AGENT.md](worker/AGENT.md)**

## 빠른 실행 (처음 받는 사람)
필요: macOS/Linux, Docker Desktop(켜 둔 상태), JDK 21, [uv](https://docs.astral.sh/uv/), Node 20+, git
```bash
git clone https://github.com/skala-ai-agent-team6/Final_Robot-Vacuum-Repair-Agent.git
cd Final_Robot-Vacuum-Repair-Agent
./setup.sh          # 1. 처음 한 번: 파이썬·프론트 패키지 설치, .env 템플릿 생성
# 2. 레포 맨 위 .env 파일을 열어 OPENAI_API_KEY= 뒤에 키를 넣는다 (다른 값은 비워 둔다)
./run.sh            # 3. 전부 띄움 (처음엔 RAG 인덱스 생성으로 1~2분 더 걸림)
```
4. 브라우저에서 http://localhost:5173 → 아래 계정으로 로그인
5. 끝나면 `./stop.sh` (DB 데이터는 남는다)

| 아이디 | 비밀번호 | 역할 | 쓰는 화면 |
|---|---|---|---|
| `tech1` | `1234` | 수리 기사 (1번 센터) | 접수·진단·리포트 |
| `tech2` | `1234` | 수리 기사 (2번 센터) | 접수·진단·리포트 |
| `quality` | `1234` | 본사 품질관리자 | 발주 승인(`/order-approvals`)·본사 검토 |

- 비밀번호 `1234`는 로컬 시연용(dev 프로필)이다.
- 키가 없으면 워커 로그(`logs/worker.log`)에 `GPT 꺼짐: 규칙으로 대신`이 나오고 규칙으로만 돈다.
- 다시 켤 때는 `./run.sh`만 하면 된다. `포트 사용 중`이 나오면 `./stop.sh` 후 다시.

## 시연 순서 (사진 3장, `source/`)
| 사진 | 파일 | 언제 올리나 |
|---|---|---|
| <img src="source/01_pcb.jpg" width="200"> | `source/01_pcb.jpg` | 접수할 때 **PCB** 사진 (결함 검출됨) |
| <img src="source/32_mech_photo_request.jpg" width="200"> | `source/32_mech_photo_request.jpg` | 접수할 때 **기계** 사진 (결함 안 보임 → 추가 사진 요청) |
| <img src="source/09_mech_extra.jpg" width="200"> | `source/09_mech_extra.jpg` | 에이전트가 **추가 사진**을 요청하면 올림 (결함 검출됨) |

1. `tech1` 로그인 → 접수 화면에서 예시 시리얼 `RC2026000187` 조회 → 사진 01(PCB)·32(기계) 첨부 → 접수
2. 진행 화면 → 추가 사진 요청 → 사진 09 제출 (60초 안에 안 올리면 `auto_photo.py`가 09를 대신 올린다)
3. 진단 결과 → 진단 확인 → 부품 페이지에서 재고·발주 초안 확인
4. `quality` 로그인 → `/order-approvals`에서 발주 승인
5. `tech1`로 리포트 저장·확정 → 종결

- 화면 없이 API로 시험: `python3 integration/demo.py complete`(01+09, 바로 진단) 또는 `photo`(32 → 추가 사진 요청)
- 첫 진단은 무조건 추가 사진을 요청한다(시연용). 끄려면 `DEMO_FORCE_PHOTO=0 ./run.sh`

## 폴더
| 폴더 | 내용 | 포트 |
|---|---|---|
| `backend/` | Spring Boot (Java 21) + Postgres 17 + Kafka (`backend/compose.yaml`) | 8080 / 5432 / 9092 |
| `frontend/` | Vue 3 + Vite | 5173 |
| `worker/` | LangGraph 에이전트 워커 (`prompts/` 프롬프트, `tests/` 시험, `contract/` Kafka 계약) | — |
| `mcp_servers/mechanical` | 기계(모터) 결함 검출 MCP | 9104 |
| `mcp_servers/pcb` | PCB 결함 검출 MCP (워커가 stdio로 실행) | — |
| `mcp_servers/business` | 업무 MCP: 재고·공장·발주 (우리 DB를 읽음) | 8015 |
| `worker/business_gateway.py` | Spring의 재고 요청을 업무 MCP 호출로 바꾸는 중계 | 8089 |
| `Rag_mcp/` | 관찰 정규화·PCB 해석·손상 해석·RAG 검색 MCP 4개 | 8011~8014 |
| `integration/` | API 시연 스크립트(`demo.py`), 추가 사진 대역(`auto_photo.py`) | — |
| `source/` | 시연 사진 3장 | — |
| `docs/` | 진행사항·개조내역 | — |
| `run.sh` / `stop.sh` / `setup.sh` | 실행 / 종료 / 처음 설치 | — |

## 실행 참고
- `backend/.env`는 비워 둬도 된다. 비면 로컬 기본값을 쓴다. 워커는 `.env` 값을 셸보다 먼저 쓰니 `.env`에 다른 주소·토큰은 넣지 않는다.
- 로그: `logs/` (spring, worker, mech, rag-*, business-mcp, business, front, auto_photo)
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

## 시험
```bash
uv run pytest          # 에이전트 (127개, 약 50초)
cd backend && ./gradlew test
```

## 시연 사진 출처
| 파일 | 원본 | 작성자 | 라이선스 |
|---|---|---|---|
| `01_pcb.jpg` | 팀 시험 사진 | SKALA 6팀 | — |
| `09_mech_extra.jpg` | [Roomba wheelencoder 2](https://commons.wikimedia.org/wiki/File:Roomba_wheelencoder_2.jpg) | Adam Mayer | CC BY-SA 2.0 |
| `32_mech_photo_request.jpg` | [iRobot Roomba bottom view](https://commons.wikimedia.org/wiki/File:IRobot-Roomba-Bottom-view-01.jpg) | CEphoto, Uwe Aranas | CC BY-SA 4.0 |

이전 버전(사진 33장, 원본 레포 패치 포함)은 태그 `before-submit`에 있다: `git checkout before-submit`
