# skeleton-agent

로봇청소기 고장 진단 **LangGraph 에이전트 뼈대**.
Spring이 Kafka로 보낸 진단 명령을 받아 → 사진 분류(GPT) → 증상 분리(GPT) → MCP 병렬 호출 → 판단 → 리포트(GPT)를 만들어 Kafka로 돌려준다.

`.env`에 OpenAI 키만 넣으면 이 레포 하나로 바로 돈다 (Kafka, MCP 서버 2개, 예시 사진, PCB 모델 가중치 포함).

## 실행

자세한 순서와 안 될 때 해결법: [코드돌리는 법.md](코드돌리는%20법.md)

준비물: Docker, [uv](https://docs.astral.sh/uv/)

```bash
./setup.sh                      # 처음 한 번: 파이썬 환경 3개 설치 + .env 만들기
# .env 열어서 OPENAI_API_KEY= 뒤에 키 넣기 (없으면 GPT 대신 단어 규칙으로 돈다)

docker compose up -d            # Kafka (localhost:9092)
```

터미널 3개:
```bash
# 1. 기계 MCP 서버 (처음엔 Hugging Face에서 모델을 받아 조금 걸림)
cd mcp_servers/mechanical && uv run python server.py

# 2. 에이전트 워커
uv run python -m worker.main     # "대기 중 ... (GPT 켜짐)" 나오면 준비 끝

# 3. 시험: Spring인 척 명령 1개 보내고 결과를 계약(JSON Schema)으로 검사
uv run python -m worker.send_test
```

결과:
- 터미널 3: 진행 이벤트 #1~#8 + 최종 리포트 JSON + `계약 검사 통과`
- 리포트 파일: `worker/reports/task-900_고장리포트.md` (VS Code에서 `Cmd+Shift+V`로 사진까지 보기)

## 폴더

```
skeleton-agent/
├── worker/                 에이전트 (읽는 순서: main → graph → tools)
│   ├── main.py             Kafka 입구·출구. 명령 받기 → 그래프 → 결과 보내기 → commit
│   ├── graph.py            진단 흐름 (LangGraph 노드·연결)
│   ├── tools.py            팔다리: 사진 받기, MCP 호출, GPT 호출
│   ├── report.py           결과를 고장리포트.md로 저장
│   ├── config.py           주소·토픽·횟수 설정, .env 읽기
│   ├── send_test.py        Spring 없이 시험
│   ├── samples/            Spring에서 사진을 못 받으면 쓰는 예시 2장 (PCB 1, 기계 1)
│   └── (리포트는 reports/ 에 생김)
├── mcp_servers/
│   ├── pcb/                PCB 결함 MCP (YOLO, stdio). 워커가 부를 때마다 실행
│   └── mechanical/         금속 표면 결함 MCP (YOLO, HTTP 9104). 미리 켜 둔다
├── contract/               Spring 팀과의 Kafka 계약 (backend 레포에서 복사)
├── tests/                  판단 규칙 테스트 (uv run pytest)
├── docker-compose.yml      Kafka
├── setup.sh
└── .env.example
```

## 흐름

```
Kafka diagnosis.commands.v2  (Spring → 우리)
  → classify_photos   사진 받기(실패 시 예시 2장) + GPT로 PCB / MECH / OTHER 분류
  → split_text        GPT로 증상을 PCB / 기계 / SW 단서로 나눔
  → pcb_mcp / mech_mcp   필요한 것만 동시에
  → rag_mcp           증상 + PCB 라벨로 과거 사례 검색
  → judge             결함 찾음 → report
                      못 찾음 → request_photo (최대 3회)
                      3회 넘음 → fail
Kafka diagnosis.events.v2    (우리 → Spring)  +  worker/reports/*.md
```

| MCP | 상태 |
|---|---|
| pcb (`mcp_servers/pcb`) | 실제. 팀원 pcb_agent 서버 그대로 |
| mechanical (`mcp_servers/mechanical`) | 실제. 도구 2개: `detect_surface_defects`(강판 결함 모델, 일반 사진은 정확도 낮음) + `detect_dents`(찌그러짐·파손) |

`detect_dents`는 자동차 외판 모델(`vineetsarpal/yolov11n-car-damage`)을 쓴다. 원래 결함 이름이 `front-bumper-dent` 같은 자동차 부위라
GPT가 "자동차 얘기라 무시"해 버려서, 서버에서 `dent` / `breakage`로 바꿔 내보낸다. 로봇청소기용 모델이 생기면 `DENT_REPO`, `DENT_FILE`만 바꾼다.
| rag ([Rag_mcp 레포](https://github.com/skala-ai-agent-team6/Rag_mcp), 8014) | 실제. 증상 글 + PCB 라벨로 과거 수리 사례·라벨 정의 검색. 꺼져 있으면 검색 없이 진행. 찌그러짐 라벨은 보내지 않음 |

## Spring과 붙일 때

- `.env`에 `INTERNAL_SERVICE_TOKEN`, `SPRING_BASE_URL` 넣기 (사진 다운로드용)
- backend는 `--app.mock-ai.enabled=false`로 켠다 (안 끄면 Spring의 가짜 AI도 같이 답함)
- 이 레포의 Kafka 대신 backend의 `docker compose up`을 써도 된다 (같은 9092 포트라 둘 중 하나만)

## 남은 일

| 담당 | 할 일 | 위치 |
|---|---|---|
| 오케스트레이션 | 판단을 GPT로, 다시 찍을 부위·설명을 GPT로 | `graph.py` `decide`, `request_photo` |
| PCB | stdio → HTTP 서버로 (속도) | `tools.py` `call_pcb_mcp` |
| 하네스 | 처리 기록을 DB로, 재시도 중복 이벤트 정리 | `main.py` `done`, `handle` |
| 오케스트레이션 + Spring | 추천 부품 partId | `graph.py` `report` |
| 전체 | 예시 사진 대체를 운영에서 끄기 | `tools.py` `load_photos` |
| 프론트 + Spring | `user_input`에 넣을 이름 합의 (지금은 customerDescription) | `graph.py` `split_text` |

## 참고

- 같은 그룹 이름으로 워커를 두 개 켜면 명령을 나눠 갖는다. 시험할 땐 하나만 켠다.
- 새 그룹으로 처음 켜면 Kafka에 쌓인 예전 명령부터 처리한다.
- 박스 그린 사진은 각 MCP 폴더의 `results/`에 저장된다 (git 제외).

## 통합 버전 (백엔드·에이전트·프론트)
`integration/README.md` — 실행법, `integration/변경메모.md` — 팀원 코드 수정 내역, `integration/patches/` — 각 레포 패치
