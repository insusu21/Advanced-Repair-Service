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
- RAG 인덱스: `cd Rag_mcp && env -u OPENAI_API_KEY uv run --env-file ../.env repair-mcp index`

## 실행 (터미널 7개, 모두 레포 루트에서 시작)
주의
- `env -u OPENAI_API_KEY`: 셸에 옛 키가 남아 있으면 `.env` 키보다 먼저 쓰여 401이 난다. 그래서 뺀다.
- 5432·9092·8080·5173·9104·8011~8014 포트가 비어 있어야 한다. 확인: `lsof -nP -iTCP:5432 -sTCP:LISTEN` (로컬 Postgres, 다른 Kafka 컨테이너가 자주 잡고 있다)
- 워커는 레포 루트 `.env` 값을 셸 환경변수보다 먼저 쓴다. 포트를 바꿀 때는 `.env`에서 바꾼다.

```bash
# 1. DB·Kafka
cd backend && set -a && . ./.env && set +a && docker compose up -d --wait

# 2. Spring (dev, 가짜 AI 끔)
cd backend && set -a && . ./.env && set +a && ./gradlew bootRun --args='--app.mock-ai.enabled=false'

# 3. 기계 MCP
cd mcp_servers/mechanical && uv run python server.py

# 4. Rag_mcp 4개
cd Rag_mcp && for s in observation:8011 pcb:8012 damage:8013 rag:8014; do \
  env -u OPENAI_API_KEY uv run --env-file ../.env repair-mcp serve ${s%%:*} --transport http --port ${s##*:} & done; wait

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
