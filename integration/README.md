# 로컬 통합 (백엔드 ↔ 에이전트) — 2026-10-20

기사 접수(사진 2장) → Spring → Kafka → 에이전트(PCB·기계·RAG MCP + GPT) → Kafka → Spring 저장 → 진단 완료까지 실제로 돈다.
프론트(최세민 실서버 모드)도 붙였다(2026-10-21). **팀 레포에는 push하지 않았다.** 고친 내용은 `patches/`에 있다.

## 결과
| 시나리오 | 흐름 | 결과 |
|---|---|---|
| `python3 demo.py complete` (접수 7) | 결함 사진 2장 → 바로 진단 | SUCCEEDED · 후보 PCB 홀 누락 0.63 → 모터 부품 결함 0.57 (점수순) |
| `python3 demo.py photo` (접수 8) | 결함 안 보이는 기계 사진 → **추가 사진 요청** → `auto_photo.py`가 지정 사진 제출 → 재개 | SUCCEEDED · 사진 요청 1회 · 입력 2차 · 모터 스크래치 0.90 |

### 첫 시험 (repairId=4)
- 접수 QUEUED → 진단 SUCCEEDED (약 7초) → 접수 DIAGNOSED, 조달 PENDING
- 에이전트가 Spring `/internal/attachments/{id}`에서 실제 사진을 받아 분석 (예시 사진 대체 0회)
- 도구 이력(Spring DB): PCB pcb-detector · MOTOR mechanical-mcp · RAG(표시는 mock, 실제는 Rag_mcp)
- 에이전트 리포트 md: `agent-server/.local/reports/task-1_고장리포트.md`

## 구성
| 구성 | 위치 | 포트 |
|---|---|---|
| Postgres 17 (통합 전용) | docker `integ-postgres` | 5434 |
| Kafka 4.1.1 (통합 전용) | docker `integ-kafka` | 9096 |
| Spring (dev, mock AI 끔) | `backend` 브랜치 `local/integration` | 8080 |
| 에이전트 워커 | `agent-server` 브랜치 `feat/skeleton-merge` | — |
| 기계 MCP | `skeleton-agent/mcp_servers/mechanical` | 9104 |
| PCB MCP (stdio) | `MCP_Error_check/pcb_agent` | — |
| RAG MCP | `Rag_mcp` (`repair-mcp serve rag`) | 8014 |
| 프론트 (Vite, 실서버 모드) | `frontend` 브랜치 `local/integration` | 5173 |

## 다시 띄우기
```bash
S=<scratch>/integ                      # 임시 비밀값 파일 위치 (git 밖)
umask 077; { echo "export DB_PASSWORD=$(openssl rand -hex 16)"; echo "export INTERNAL_SERVICE_TOKEN=$(openssl rand -hex 24)"; echo "export DEV_PASSWORD=$(openssl rand -hex 8)"; } > $S/local.secrets
set -a; . $S/local.secrets; set +a
docker run -d --name integ-postgres -p 127.0.0.1:5434:5432 -e POSTGRES_DB=repair -e POSTGRES_USER=repair -e POSTGRES_PASSWORD="$DB_PASSWORD" postgres:17-alpine
# Kafka: apache/kafka:4.1.1, EXTERNAL 리스너 9096 (backend compose.yaml과 같은 설정)

cd backend   # 터미널 1
SPRING_PROFILES_ACTIVE=dev DB_URL=jdbc:postgresql://localhost:5434/repair KAFKA_BOOTSTRAP_SERVERS=localhost:9096 \
  ./gradlew bootRun --args='--app.mock-ai.enabled=false'

cd agent-server   # 터미널 2 (기계 MCP 9104, RAG 8014 먼저)
KAFKA_BOOTSTRAP_SERVERS=localhost:9096 SPRING_BASE_URL=http://localhost:8080 AGENT_TOOL_MODE=live \
  PCB_MCP_SCRIPT=../../MCP_Error_check/pcb_agent/mcp_server.py PCB_MCP_PYTHON=../../MCP_Error_check/pcb_agent/.venv/bin/python \
  env -u OPENAI_API_KEY uv run --env-file ../../.env --extra pcb --extra live python -m app.kafka_worker

python3 integration/auto_photo.py   # 터미널 3: 프론트 대역 (요청 후 60초 동안 아무도 안 올리면 지정 사진 제출)

cd frontend && npm ci   # 터미널 5: 브라우저 http://localhost:5173 (tech1·tech2·quality / 1234)
VITE_USE_MOCK=false VITE_API_BASE_URL= VITE_API_PROXY_TARGET=http://localhost:8080 npx vite
python3 integration/demo.py photo  # 터미널 4: complete | photo (같은 셸에 local.secrets 적용 후)
```

고친 곳 정리: **`변경메모.md`** (이유 포함)

**로그인 비밀번호**: 로컬 통합 DB에서 세 계정 모두 `1234`로 바꿨다(DB 직접 수정). Spring 시작용 `DEV_PASSWORD`(12자 이상)는 처음 계정 만들 때만 쓰인다.

## 패치 (`patches/`)
| 파일 | 대상 | 내용 |
|---|---|---|
| `backend-0001-사진target저장.patch` | backend (박시현) | 접수 `POST /api/repairs?targets=PCB&targets=MECHANICAL`, 추가 사진 `?target=`. DB 규칙에 맞게 MECHANICAL → MOTOR로 저장. 없으면 기존처럼 GENERAL |
| `agent-server-0001-skeleton통합.patch` | agent-server (홍은비) | Kafka 워커·실제 도구·GPT 리포트·md (홍은비 파일은 hook 2곳만) |
| `agent-server-0002-MOTOR-target-MECHANICAL.patch` | agent-server | (0003에서 되돌림) MOTOR → MECHANICAL 변환 |
| `backend-0002-API.patch` | backend | 진단 확인·반려 API `POST /api/repairs/{id}/approval` 추가 |
| `frontend-0002-API.patch` | frontend | 진단 확인 연결, 쓸모없는 버튼 삭제, 수정 이유 주석 |
| `agent-server-0004-.patch` | agent-server | 수정 이유 주석 |
| `frontend-0001-MOTOR-target-v2.patch` | frontend (최세민) | 사진 종류 MECHANICAL → MOTOR, 접수·추가 사진에 target 전송, 진단 화면이 에이전트 v2 필드(후보 코드·근거, 박스, 유사사례, 점검·수리 순서, 출처) 사용. 후보를 result.candidates에서 읽게 수정(정규화 테이블은 이름이 달라 원인이 비던 문제) |
| `agent-server-0003-MOTOR.patch` | agent-server | MOTOR 통일, 사진 요청 열기, 점수순·원인 코드명·리포트 새 필드 (홍은비 파일 수정 포함) |

## 프론트 대역 (`auto_photo.py`)
프론트에 추가 사진 화면이 생기기 전 임시 장치. WAITING_INPUT 접수를 찾아 요청 부위에 맞는 지정 사진(`designated/PCB.jpg`, `designated/MOTOR.jpg`, GENERAL이면 둘 다)을 Spring API로 올리고 재개한다. 실제 프론트가 할 호출과 같다.

## 정리한 것 (2026-10-20 저녁)
- **사진 종류 이름 = 백엔드 기준** `PCB` / `MOTOR` / `SW` / `GENERAL`. 에이전트 전체를 MOTOR로 통일 (변환 코드 삭제). Spring은 프론트의 옛 이름 MECHANICAL도 MOTOR로 받아 준다.
- **추가 사진 요청 열림**: 에이전트가 PHOTO_REQUESTED(requestKey·round·bodyPart·description·checkpoint)를 내고, DIAGNOSIS_RESUMED로 재개.
- **리포트 출력 = 데이터 정의 화면 형식**: 후보 점수순, `cause`(사람 말) + `causeCode`(PCB_MISSING_HOLE), `scoreKind`, `evidenceNotes`, `sourceIds`, `topCause`, `urgency`, `agents[]`(박스 좌표 0~1), `similarCases[]`(한국어 요지), `inspectionSteps`, `repairSteps`, `sources[]`. 기존 필드는 그대로.

## 남은 것
1. **프론트 화면 확인** — 연결·변환은 프록시 경유로 검증했지만 브라우저로 화면을 직접 본 건 아니다. 진단 확인·재진단·대시보드 일부는 백엔드 API가 없어 프론트가 숨김(`src/api/features.ts`).
2. **사례 번역 문장**에 "과거 유사 사례에서는…" 꾸밈말이 아직 붙는다. 사례 기반 후보(배터리 등)는 GPT가 판단할 때만 생긴다.
3. **에러코드 해석**(`errorCodes[]`)은 출처(에러코드표)가 없어 빈 배열.
4. **business-mcp** — Spring dev는 MockBusinessMcp 사용 중. 실제 business-mcp는 도구 이름과 DB 직접 접속 문제.
5. 홍은비 코드 변경점(models·workflow·backend_v2·테스트 3개)은 patches/agent-server-0003에 모았다. 홍은비 확인 필요.
