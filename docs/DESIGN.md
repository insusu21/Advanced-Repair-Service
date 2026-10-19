# RobotCare AI 프론트엔드 설계서

> 서비스센터 기사가 **접수 → AI 분석 → 사람 확인 → 부품 조회 → 수리 완료** 를 한 흐름으로 처리하는 B2B 업무 웹.
> 전역 규칙: **AI 산출물은 항상 "AI 초안"이며, 사람이 승인한 것만 확정·반영된다.**

---

## 1. 전체 정보 구조와 사용자 흐름

### 1-1. 정보 구조 (IA)

```
RobotCare AI
├─ 로그인 (/login) ─ 역할 판별: 기사 / 품질 담당자 / 부품 담당자
└─ 앱 셸 (좌측 사이드바 + 상단 바)
   ├─ 홈 (/)                        모든 역할 · 역할별 "지금 처리할 일"
   ├─ 수리 접수 (/repairs/new)        기사
   ├─ 수리 목록 (/repairs)            기사(본인 지점) · 품질(전체)
   │   └─ 수리 건 워크스페이스 (상단 흐름 내비로 단계 이동)
   │       ├─ ① 진단 진행   /repairs/:id/progress   (SSE)
   │       ├─ ② AI 진단 결과 /repairs/:id/diagnosis  ★ 핵심 화면
   │       ├─ ③ 부품·발주   /repairs/:id/parts
   │       └─ ④ 수리 결과   /repairs/:id/review
   ├─ 승인 대기 (/approvals)          품질 · 수리 결과 승인 / 수동 검토 탭
   │   └─ 승인 검토 (/approvals/:id)  AI vs 기사 비교 · 승인/반려/수정 요청/재분석
   ├─ 부품 및 발주 (/parts)           기사(발주 현황·재고) · 부품 담당자(승인 대기·재고)
   └─ 품질 대시보드 (/dashboard)       품질 · 그래프 클릭 → 관련 수리 목록
```

### 1-2. 상태 흐름 (RepairStatus)

```
DRAFT ─submit→ RECEIVED → QUEUED → ANALYZING ──────────────→ DIAGNOSIS_COMPLETED (AI 초안)
                                     │  ▲                         │
                         사진 부족    ▼  │ 추가 사진 등록            ├─ 기사 "진단 확인" ──→ TECHNICIAN_REVIEW
                        ADDITIONAL_INFO_NEEDED                    ├─ 기사 "진단 반려" ──→ TECHNICIAN_REVIEW (AI 미사용)
                                     │ 3회 초과                    ├─ 기사 "추가 분석" ──→ QUEUED (진단 v+1)
                                     ▼                            └─ 기사 "본사 검토" ──→ MANUAL_REVIEW
                               MANUAL_REVIEW ──품질 "수동 진단 회신"──→ TECHNICIAN_REVIEW

TECHNICIAN_REVIEW ─수리 결과 제출→ HQ_APPROVAL ─┬─ 승인 → APPROVED (고장 DB·대시보드 반영) → CLOSED
                                               ├─ 수정 요청 → TECHNICIAN_REVIEW
                                               ├─ 반려 → REJECTED (반영 안 됨)
                                               └─ 재분석 → QUEUED
```

분석 실패는 상태값을 늘리지 않고 `analysisError` 필드 + 단계 `FAILED` 로 표현하며, 화면에서는 "분석 실패" 배지와 재분석/본사 검토 요청 버튼을 보여 준다.

### 1-3. 역할별 사용자 흐름

| 역할 | 핵심 흐름 |
|---|---|
| 서비스센터 기사 | 홈(할 일) → 접수 3단계 → 진행(SSE, 추가 사진) → **진단 확인** → 부품 확인·**발주 요청 등록** → 수리 결과 입력 → 본사 승인 요청 |
| 본사 품질 담당자 | 홈/승인 대기 → AI vs 기사 비교 → **승인·반려·수정 요청·재분석** / 수동 검토 회신 → 대시보드 → 드릴다운 |
| 부품 담당자 | 홈 → 부품 및 발주 → 요청 + 재고 함께 확인 → **발주 승인·반려** |

### 1-4. "사람의 결정" 지점 (자동 확정 금지)

| 대상 | AI 가 하는 일 | 확정하는 사람 | 화면 |
|---|---|---|---|
| 진단 | 원인 후보·근거·신뢰도·부품 초안 | 기사 | AI 진단 결과 |
| 발주 | 발주안(AI_DRAFT) 제안 | 기사 요청 → 부품 담당자 승인 | 부품·발주 |
| 수리 결과 | (참고용 AI 진단만 제공) | 기사 입력 → 품질 담당자 승인 | 수리 결과 / 승인 검토 |
| 고장 DB·대시보드 | 없음 | 품질 담당자 승인분만 반영 | 대시보드 |

---

## 2. 페이지별 와이어프레임

공통 셸: 좌측 사이드바(역할별 메뉴 + 처리 필요 건수 배지) / 상단 바(현재 페이지명 · 알림 · 역할 배지 · 이름 · 로그아웃). 태블릿(≤1100px)에서는 사이드바가 햄버거 드로어로 바뀐다.

**로그인**
```
┌───────────── 남색 소개 패널 ─────────────┬──────── 로그인 카드 ────────┐
│ RobotCare AI                             │ 사번 [________]             │
│ 업무 5단계 안내                           │ 비밀번호 [______] 👁         │
│ "AI 결과는 초안, 사람 승인만 반영"        │ [   로그인   ]              │
│                                          │ 데모: [기사][품질][부품]     │
└──────────────────────────────────────────┴─────────────────────────────┘
```

**홈 / 수리 목록**
```
[인사 · 지점]                                   [+ 신규 수리 접수]
[추가 사진 필요 n][기사 검토 대기 n][본사 승인 대기 n][수리 완료 n]  ← 누르면 필터
┌ 지금 처리할 일 ───────────────────────────────────────────────┐
│ [상태배지] 다음 할 일 · 접수번호 · 모델 · 증상      3분 전  →   │
└───────────────────────────────────────────────────────────────┘
(목록) [검색____________] [모델▾] [정렬▾] [필터 초기화]
       (전체)(분석 중)(추가 사진 필요)(진단 초안 도착)…  ← 상태 칩
       접수번호 | 시리얼 | 모델/증상 | 상태(+진행바) | 다음 할 일 | 접수일 | 담당 기사
```

**신규 수리 접수 (3단계)**
```
[1 제품 정보]━[2 증상·에러코드]━[3 사진·최종 확인]
1) 시리얼 [RC__________][조회] → ✅ 제품 확인됨 (모델·공장·제조일·보증·펌웨어)
2) 증상 [+소음][+멈춤]… [textarea]   에러코드 [E___][추가] [E103][E210]  □ 에러코드 없음
   긴급도 (긴급)(보통)(낮음)
3) [제품 전체 📷][모터 📷][PCB 📷]  미리보기·다시 올리기·삭제·촬영 예시
   최종 확인 요약(각 항목 [수정])
─────────────── 하단 고정: [이전]            1/3 단계   [다음 →] / [접수하고 AI 진단 요청]
```

**진단 진행**
```
[흐름 내비: 접수 ✓ ─ ❷AI 분석 ─ 진단 확인 ─ 부품·발주 ─ 수리 결과 ─ 본사 승인]
[접수 요약 카드]
┌ AI 가 분석하고 있습니다                      (● 실시간 연결됨) ┐
│ ███████████░░░░░░░  "PCB 사진을 분석하고 있습니다."      45%   │
│ ● 현재 실행 중: PCB 분석 · PCB Agent                          │
└───────────────────────────────────────────────────────────────┘
[추가 사진 요청 카드]  (필요 시)   /  [분석 실패 배너 + 재분석·본사 검토]  /  [완료 → 진단 결과 확인]
┌ 단계별 진행(타임라인) ┐ ┌ 등록 사진 ┐
│ ✓ 접수·대기열          │ │ ▢ ▢ ▢     │
│ ✓ 분석 계획(오케스트)  │ ├ 실시간 이벤트(SSE 로그) ┤
│ ⟳ PCB 분석             │ │ 17:02 PCB 사진을…        │
│ ○ 모터 / SW / 유사 / 종합│ └──────────────────────────┘
```

**추가 사진 요청 카드**
```
┌ 📷 추가 사진 요청                 [✦ Motor Agent 요청][요청 1/3회] ┐
│ 모터 하단 연결부 사진이 필요합니다.                                 │
│ 필요한 이유  현재 사진에서는 외관 변형 여부를 확인하기 어렵습니다.  │
│ 촬영 방법    연결부가 정면으로 보이도록 촬영해 주세요.               │
│ ⚠ 추가 요청이 2회 더 발생하면 본사 수동 검토로 전환됩니다.          │
│ [사진 선택/촬영] [촬영 예시]          [사진 n장 추가하고 분석 계속] │
└─────────────────────────────────────────────────────────────────────┘
```

**AI 진단 결과 (핵심)**
```
[흐름 내비] [접수 요약]
┌ ✦ AI 생성 결과·사람의 확인 필요 (보라 점선) ─────────┐ ┌ 현재 승인 상태 (주황) ┐
│ 가장 가능성이 높은 고장 원인                          │ │ ⏳ 사람 확인 대기      │
│ 모터 하우징 변형                                      │ │ (승인 후: 처리자·시각) │
│ 신뢰도 87% ████████░ | 긴급도 긴급 | 분석 완료 | 유사 12 │ └───────────────────────┘
└──────────────────────────────────────────────────────┘
[▶ 이 진단은 아직 AI 초안입니다 ……………… 처리하러 가기 ↓]  (스크롤 시 상단 고정)
┌ 본문 ───────────────────────────────────┐ ┌ 우측 ─────────────┐
│ 원인 후보 순위 (①②③ + 신뢰도 + 근거 + 출처)│ │ 필요한 교체 부품   │
│ Agent 결과 [모터 · 이상][PCB · 정상][SW · 이상]│ │ 유사 수리 사례     │
│   └ 사진 위 이상 영역 박스(번호·심각도)     │ │ 참고 매뉴얼·출처   │
│ 에러 코드 분석 (E103 의미·해석·관련 부품)  │ └───────────────────┘
│ 권장 점검 순서 │ 권장 수리 방법            │
└─────────────────────────────────────────┘
┌ 진단 결과 처리 (HumanApprovalCard, 남색 테두리) ──────────────────────────┐
│ [AI 제안·근거·신뢰도·출처 (보라)]  │ 기사 의견 [textarea]                    │
│                                     │ [진단 내용 확인][수정 의견 작성]        │
│                                     │ [추가 분석 요청][본사 검토 요청][진단 반려]│
│                                     │ 승인자 / 승인 시각 : 처리 시 자동 기록   │
└─────────────────────────────────────────────────────────────────────────┘
[처리 이력 타임라인]
```

**기사 확인 · 수리 결과 입력**
```
(본사 수정 요청/수동 진단 회신/AI 반려 안내 배너)
┌ 입력 (초록 왼쪽 띠 = 사람 입력) ───────────────┐ ┌ 참고용 AI 진단 (보라, 고정) ┐
│ 1 AI 진단이 맞았나요? (맞음)(일부)(틀림)         │ │ 원인·신뢰도·후보·추천 부품   │
│ 2 실제 원인 (AI 후보 선택 | 직접 입력)            │ └─────────────────────────────┘
│ 3 교체 부품 [부품▾][수량][🗑] [+ 부품 추가] [✦AI 추천 불러오기]
│ 4 수리 방법 [textarea] [✦AI 권장 방법 불러오기] → "다르면 고쳐 주세요" 안내
│ 5 기사 코멘트 (자주 쓰는 문구 버튼)  ※ AI 와 다르면 필수
│ 6 수리 전·후 사진 (후 사진 필수)
└──────────────── 하단 고정: [본사 승인 요청] → 확인 모달 ┘
```

**부품 재고 및 발주** — 발주 카드 = [AI 발주 제안·추천 이유·신뢰도 (보라)] | [수량·출고 창고·메모·□ 직접 확인 체크 → 발주 요청 등록]. 옆에 재고 카드(창고별 위치·수량, 생산 공장·담당·연락처·이메일, 예상 입고일, 단가). 부품 담당자는 [발주 승인][반려(사유 필수)].

**본사 승인 대기 / 승인 검토**
```
탭: [수리 결과 승인 n] [수동 검토 요청 n]
목록: 접수번호 | 모델 | AI 진단 원인(보라 밑줄) | 기사 확인 원인 | AI 일치(일치/일부/불일치) | 기사 | 대기
상세: AI 진단 vs 기사 확인 비교표 (차이 행 빨간 강조, 차이 n건 배지) → 기사 코멘트 → 사진
      → HumanApprovalCard [승인·DB 반영][수정 요청][재분석 요청][반려] → 승인 이력 타임라인
```

**품질 대시보드**
```
[기간▾]   "본사 승인 데이터만 집계"
[전체 접수][수리 완료][AI 진단 성공률][AI↔실제 일치율]
[기간별 추이 (선)]
[부품별 (가로막대)] [모델별 (막대)]
[지점별 (가로막대)] [공장별 (도넛)]
[반복 고장 유형 표 (추세 ↑↓)]
[관련 수리 목록]  ← 아무 그래프 항목 클릭 시 열림
```

---

## 3. Vue Router 경로 구조

| 경로 | 이름 | 화면 | 역할 |
|---|---|---|---|
| `/login` | login | LoginView | public |
| `/` | home | HomeView | 전체 |
| `/repairs` | repairs | RepairListView (`?status=&q=`) | 기사·품질 |
| `/repairs/new` | repair-new | RepairCreateView | 기사 |
| `/repairs/:id` | → `/repairs/:id/diagnosis` | redirect | |
| `/repairs/:id/progress` | repair-progress | RepairProgressView | 전체 |
| `/repairs/:id/diagnosis` | repair-diagnosis | DiagnosisResultView | 전체(결정은 기사) |
| `/repairs/:id/parts` | repair-parts | RepairPartsView | 기사·부품 |
| `/repairs/:id/review` | repair-review | TechnicianReviewView | 전체(입력은 기사) |
| `/approvals` | approvals | ApprovalQueueView | 품질 |
| `/approvals/:id` | approval-detail | ApprovalDetailView | 품질 |
| `/parts` | parts | PartsOrderView | 기사·부품 |
| `/dashboard` | dashboard | DashboardView | 품질 |
| `/forbidden`, `/*` | | ErrorView 403/404 | |

- `meta: { title, roles, nav, public }` — 전역 `beforeEach` 가드가 로그인·역할을 검사하고, 권한이 없으면 `/forbidden`.
- 모든 화면은 라우트 단위 지연 로딩(`() => import()`), 대시보드(ECharts)는 별도 청크.
- 목록에서 행을 누르면 `repairLink(status, role)` 이 **지금 해야 할 단계의 화면**으로 보낸다.
- 401 응답 시 `auth:expired` 이벤트 → 로그아웃 후 로그인으로 이동.

---

## 4. 재사용 컴포넌트 구조

```
components/
├─ common/        RepairStatusBadge · AiBadge(ai|human) · ConfidenceBar · StateView(loading|empty|error)
│                 SkeletonBlock · StatCard · BaseModal · ToastHost · DataSourceList
├─ layout/        AppLayout · AppSidebar · AppTopbar
├─ repair/        ImageUploader · StepIndicator · RepairFlowNav · RepairSummaryCard
│                 RepairProgressTimeline · AdditionalPhotoRequestCard · RepairTable
├─ diagnosis/     DiagnosisSummaryCard · DiagnosisEvidenceCard · AgentAnalysisCard
│                 AnnotatedImage · HumanApprovalCard ★
├─ review/        TechnicianCommentForm · ApprovalHistoryTimeline
├─ parts/         PartInventoryCard · PurchaseApprovalCard
└─ dashboard/     DefectStatisticsChart (ECharts, 클릭 → select 이벤트)
```

| 컴포넌트 | 핵심 Props / Events | 설계 포인트 |
|---|---|---|
| **HumanApprovalCard** | `suggestion, evidence, confidence, sources, sourceIds, decision, actions[], canDecide, busy` / `@action(key, comment)` | 전역 규칙의 9개 필수 요소를 **하나의 컴포넌트가 강제**. 액션별 `requiresComment` 검증, 결정 후 승인자·시각 표시. 진단·수리 결과·수동 검토에 공통 사용 |
| AiBadge | `kind: 'ai' \| 'human'` | 보라 점선 "AI 생성 결과·사람의 확인 필요" / 초록 "사람 확정" |
| RepairStatusBadge | `status, failed` | 색 + 아이콘 + 텍스트 동시 표기 |
| ConfidenceBar | `value, label, size` | % + 높음/보통/낮음 텍스트, `role="meter"` |
| ImageUploader | `v-model: UploadItem[]`, `max, required, invalid, exampleSrc` | 드래그·카메라·미리보기·재업로드·삭제, 형식·용량 검증, 1280px 압축 |
| AnnotatedImage | `image, annotations[]` | % 좌표 박스 + 번호 범례 + 심각도별 선 모양(실선/파선/점선), 확대 모달 |
| AgentAnalysisCard | `result, images, sources` | 판정(이상/정상/의심/제외) 상단 색띠 + 아이콘 |
| PurchaseApprovalCard | `order, part, role` / `@request` `@decide` | 역할별로 "요청 등록(확인 체크 필수)" 또는 "승인·반려" |
| RepairFlowNav | `repair` | 6단계 업무 흐름, 아직 도달 못한 단계는 비활성 |
| StateView | `state, title, message` / `@retry` + slot | 로딩·빈 결과·오류를 한 형태로 |

---

## 5. Pinia 상태 구조

| 스토어 | state | 주요 actions | 비고 |
|---|---|---|---|
| `auth` | `user, token` / getters `isLoggedIn, role` | `login, logout, hasRole` | sessionStorage 보관 |
| `repairList` | `items, counts, query{status,keyword,sort,model}, loading, error, loadedAt` | `fetch, startLive, stopLive, resetQuery` | 전역 SSE 로 행 진행률 갱신, 상태 변경 시 카운트 재조회 |
| `repairDetail` | `repair, diagnosis, versions, photoRequests, sseState, lastEvent, eventLog, loading, diagLoading, submitting, error` / getter `activePhotoRequest` | `load, loadDiagnosis, subscribe, unsubscribe, decide, requestReanalysis, addPhotos, submitReview` | **낙관적 업데이트 금지** — 사람 결정은 서버 응답 후 반영 |
| `orders` | `parts, orders, repairOrders, loading, submittingId, error` / getter `pendingApproval` | `fetchAll, fetchForRepair, request, decide` | AI_DRAFT → (기사) REQUESTED → (부품) APPROVED/REJECTED |
| `dashboard` | `data, months, drill{dim,value,label}, records, loading, recordsLoading, error` | `fetch, drillDown, clearDrill` | |
| `notifications` | `items` / getter `unread` | `fetch, startPolling, read, readAll` | 10초 폴링 |
| `toast` | `toasts` | `success, error, info, warning` | |

공통 화면 로직은 `composables/useRepairPage` (라우트 id → 로드 + SSE 구독/해제), `useReasonDialog` (사유 입력 모달).

---

## 6. Mock 데이터 구조

`src/mocks/`
- `data.ts` — 시드: 사용자 4명, 제품 카탈로그(시리얼→모델), 부품 5종(창고·공장·연락처), 진단 템플릿 3종(모터 하우징 / 휠 센서 / PCB), 수리 13건(모든 상태 포함), 발주 3건, 알림, 대시보드용 승인 고장 레코드 약 260건(최근 6개월, 시드 고정 난수, 모터 하우징 변형 증가 패턴).
- `db.ts` — 메모리 DB + `localStorage` 영속화(새로고침 유지, 페이지 이탈 시 즉시 저장) + SSE 대용 이벤트 버스.
- `engine.ts` — 오케스트레이터 시뮬레이터. 단계별로 `RepairEvent` 를 발생(실제 SSE 와 동일 스키마). 에러코드가 없으면 SW 분석을 건너뜀.
- `handlers.ts` — REST 엔드포인트와 1:1 대응. 역할 권한·상태 전이·필수 사유를 서버처럼 검증.

대표 사례 (요청서의 Mock 그대로): 접수 101 · RC-A100 · RC2026000187 · E103 · 모터 하우징 변형 87% · PCB 이상 없음 · 모터 하단 연결부 변형 · SW 회전 센서 오류 · 유사 12건 · RM-MT-103 수원 창고 7개 · 구미 제2공장 · 입고 2일.

데모 시나리오: 증상에 "덜컹/흐림/흔들" → 추가 사진 요청 / "실패" → 분석 실패 / 그 외 정상. 시드 111번은 실패, 102번은 추가 사진 대기, 109번은 3회 초과 수동 검토, 106번은 AI·기사 불일치.

---

## 7. REST API 와 SSE 연결 구조

```
View ─→ Pinia store ─→ src/api/*.ts ─┬─ VITE_USE_MOCK=true  → mocks/handlers.ts (지연·복사본 응답)
                                     └─ false               → axios(http.ts) → /api (Vite proxy)
View ─→ store.subscribe ─→ services/sse.ts ─┬─ mock → mocks/db 이벤트 버스
                                             └─ real → EventSource + 지수 백오프 재연결
```

| Method | Path | 용도 |
|---|---|---|
| POST | `/api/auth/login` | 로그인 |
| GET | `/api/products/{serial}` | 시리얼 → 제품 자동 조회 *(추가)* |
| POST | `/api/repairs` | 접수 생성 (DRAFT) |
| POST | `/api/repairs/{id}/images` | 사진 업로드 (multipart: kind, file) |
| POST | `/api/repairs/{id}/submit` | 접수 확정 + AI 진단 요청 *(추가)* |
| GET | `/api/repairs?status&keyword&sort&model` | 목록 + 요약 카운트 |
| GET | `/api/repairs/{id}` | 상세 |
| GET | `/api/repairs/{id}/diagnosis` | `{ current, versions[] }` |
| GET | `/api/repairs/{id}/events` | **SSE** 진행 상태 |
| GET | `/api/repairs/{id}/photo-requests` | 추가 사진 요청 목록 *(추가)* |
| POST | `/api/repairs/{id}/additional-images` | 추가 사진 (multipart) |
| POST | `/api/repairs/{id}/technician-review` | 수리 결과 (multipart: review JSON + 전·후 사진) |
| POST | `/api/repairs/{id}/approval` | `{ target: DIAGNOSIS\|TECH_REVIEW\|MANUAL_REVIEW, action, comment }` |
| POST | `/api/repairs/{id}/reanalysis` | `{ reason, scope? }` |
| GET | `/api/approvals` | 본사 승인 대기 큐 *(추가)* |
| GET | `/api/parts`, `/api/parts/{partId}/inventory` | 부품·재고 |
| GET | `/api/repairs/{id}/orders` | AI 발주안 + 요청 내역 *(추가)* |
| POST | `/api/repairs/{id}/orders` | 기사 발주 요청 등록 |
| GET | `/api/orders`, POST `/api/orders/{id}/decision` | 발주 목록 / 부품 담당자 승인·반려 *(추가)* |
| GET | `/api/dashboard/defects?months=6` | 통계 (승인 데이터만) |
| GET | `/api/dashboard/defects/records?dim&value` | 그래프 드릴다운 목록 *(추가)* |
| GET/POST | `/api/notifications`, `/{id}/read`, `/read-all` | 알림 *(추가)* |

SSE 이벤트 (요청서 스키마 + 확장 필드)
```json
{ "repairId": 101, "status": "ANALYZING", "stage": "PCB_ANALYSIS", "stageState": "RUNNING",
  "message": "PCB 사진을 분석하고 있습니다.", "progress": 45, "at": "2026-10-19T08:02:11Z",
  "photoRequest": null }
```
- `stage`: QUEUED · ORCHESTRATION · PCB_ANALYSIS · MOTOR_ANALYSIS · SW_ANALYSIS · SIMILAR_CASE_SEARCH · SYNTHESIS
- `stageState`: PENDING · RUNNING · DONE · SKIPPED · FAILED · WAITING_INPUT
- 서버는 기본 `message` 또는 `event: status` 로 전송 가능. EventSource 는 헤더를 못 붙이므로 토큰은 쿼리 또는 HttpOnly 쿠키.
- 재연결: 1s→2s→4s… 최대 30s, 6회 실패 시 `error` 상태 표시. `DIAGNOSIS_COMPLETED`(100%) 수신 시 진단을 자동 재조회.

---

## 8. 로딩 · 빈 결과 · 오류 · 승인 · 반려 상태 설계

| 상태 | 표현 | 위치 |
|---|---|---|
| 로딩(첫 로드) | 스켈레톤 블록 (레이아웃 유지) | 목록·상세·대시보드 |
| 로딩(재조회) | 기존 내용 유지 + 흐리게(opacity) + 새로고침 아이콘 회전 | 목록 |
| 처리 중 | 누른 버튼만 스피너 + 전체 버튼 비활성 (중복 제출 방지) | 승인 카드·발주·접수 |
| 빈 결과 | 아이콘 + 원인 문구 + **다음 행동 버튼** (필터 초기화 / 첫 접수 / 진단으로 이동) | StateView |
| 오류 | 빨간 아이콘 + 서버 메시지 + [다시 시도] | StateView, 토스트 |
| 입력 오류 | 필드 빨간 테두리 + 아이콘 + 문구, 첫 오류로 포커스 이동 | 접수·수리 결과 |
| 부분 실패(업로드) | 이미 만든 접수번호 유지 → [다시 시도] 시 같은 건에 재업로드 | 접수 3단계 |
| SSE 끊김 | 배지: 연결 중/실시간 연결됨/재연결 중/연결 실패 | 진단 진행 |
| 분석 실패 | 빨간 배너 + 사유 + [재분석 요청][본사 검토 요청] | 진단 진행 |
| AI 초안(대기) | 보라 점선 영역 + "AI 생성 결과·사람의 확인 필요" + 주황 "사람 확인 대기" | 모든 AI 결과 |
| 승인됨 | 초록 실선 영역 + "사람 확정" + 승인자·시각·의견 | 승인 카드·발주·수리 결과 |
| 반려됨 | 빨간 영역 + 반려 사유 + 반려자·시각, 반려·수정 요청·재분석은 **사유 필수** | 승인 카드 |
| 수정 요청 | 주황 배너로 본사 의견을 입력 화면 최상단에 표시, 기존 입력값 복원 | 수리 결과 입력 |
| 권한 없음 | 결정 버튼 대신 잠금 안내(조회 전용) / 경로 접근 시 403 화면 | 진단·승인 |
| 이탈 방지 | 작성 중 다른 화면 이동 시 확인창 | 접수 |

접근성: 기본 17px, 버튼 최소 48px(주요 버튼 56px), 상태는 색+아이콘+텍스트, 키보드로 표 행 열기(Enter), 차트는 스크린리더용 대체 버튼 제공, 포커스 링, `prefers-reduced-motion` 대응.
