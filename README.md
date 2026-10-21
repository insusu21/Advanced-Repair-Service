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
| `mcp_servers/business` | 업무 MCP: 재고·공장·발주 (우리 DB를 읽음) | 8015 |
| `worker/business_gateway.py` | Spring의 재고 요청을 업무 MCP 호출로 바꾸는 중계 | 8089 |
| `Rag_mcp/` | 관찰 정규화·PCB 해석·손상 해석·RAG 검색 MCP 4개 | 8011~8014 |
| `integration/` | 시연 스크립트, 사진 요청 대역, 시연 사진 | — |

## 준비 (처음 한 번)
필요: Docker Desktop, JDK 21, uv, Node 20+
```bash
./setup.sh
```
- `.env`에 `OPENAI_API_KEY`만 넣는다. (워커는 이 파일 값을 셸 환경변수보다 먼저 쓰니 다른 값은 넣지 않는다)
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
| 프론트 | `frontend/src/api/parts.ts` → 화면 `RepairPartsView.vue` |

확인 순서 (`./run.sh` 뒤):
1. 도구 목록: `cd mcp_servers/business && MCP_URL=http://127.0.0.1:8015/mcp uv run python client.py`
2. 중계 직접 호출:
   ```bash
   curl -s -X POST localhost:8089/rpc -H "Authorization: Bearer local-dev-business-token" -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":"t","method":"tools/call","params":{"name":"inventory.lookup","arguments":{"partIds":["1","3"]}}}'
   ```
3. 화면: 접수 → 진단 완료 → 진단 결과의 **필요 부품** (`/repairs/{id}/parts`)에서 재고·발주. 본사 `quality`는 **발주 승인 대기**
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
