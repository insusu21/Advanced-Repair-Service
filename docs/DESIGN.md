# RobotCare AI 프론트엔드 설계서

> 서비스센터 기사가 **접수 → AI 분석 → 사람 확인 → 부품 조회 → 수리 완료** 를 한 흐름으로 처리하는 B2B 업무 웹.
> 전역 규칙: **AI 산출물은 항상 "AI 초안"이며, 사람이 확인·확정한 것만 반영된다.** 고장 DB·대시보드에는 기사가 확정한 수리 리포트만 반영된다.

---

## 1. 전체 정보 구조와 사용자 흐름

### 1-1. 정보 구조 (IA)

```
RobotCare AI
├─ 로그인 (/login) ─ 역할 판별: 기사(TECHNICIAN) / 본사 품질 담당자(QUALITY_MANAGER)
└─ 앱 셸 (좌측 사이드바 + 상단 바)
   ├─ 홈 (/)                        모든 역할 · 역할별 "지금 처리할 일"
   ├─ 수리 접수 (/repairs/new)        기사
   ├─ 수리 목록 (/repairs)            기사(본인 지점) · 품질(전체)
   │   └─ 수리 건 워크스페이스 (상단 흐름 내비로 단계 이동)
   │       ├─ ① 진단 진행   /repairs/:id/progress   (SSE)
   │       ├─ ② AI 진단 결과 /repairs/:id/diagnosis  ★ 핵심 화면
   │       ├─ ③ 부품·발주   /repairs/:id/parts
   │       └─ ④ 수리 리포트 /repairs/:id/review   초안 저장 → 확정 (품질은 읽기 전용)
   ├─ 발주 승인 대기 (/order-approvals) 품질 · 기사가 요청한 발주 승인/반려
   ├─ 본사 수동 검토 (/approvals/:id) 품질 · MANUAL_REVIEW 건 수동 진단 회신 (메뉴 없음, 알림·목록에서 진입)
   ├─ 부품 및 발주 (/parts)           기사(발주 현황·재고) · 품질(승인 대기·전체 발주·재고)
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

TECHNICIAN_REVIEW ─기사 "리포트 확정"→ CLOSED (고장 DB·대시보드 반영)
       │  ▲                                  │
       └──┘ 초안 저장 (report r1 DRAFT)        └─ 기사 "리포트 수정" → 초안 r(n+1) 저장 (상태는 CLOSED 유지,
                                                  대시보드는 rn 확정본 유지) → 다시 확정 시 반영 내용을 r(n+1)로 교체
```

수리 리포트 (`Repair.report`, 백엔드 ReportContent 와 같은 구조)

| 필드 | 내용 |
|---|---|
| `content.actualCause` · `actualAction` · `technicianOpinion` | 실제 원인 · 실제 조치 · 기사 의견 |
| `content.faults[]` | `{ area: PCB\|MOTOR\|SW\|OTHER, partId? }` — `outcome = NO_FAULT_FOUND` 이면 빈 배열 |
| `content.outcome` · `repairSuccessful` | `FIXED \| NOT_FIXED \| NO_FAULT_FOUND` · 수리 성공 여부 (화면에서는 `FIXED` 일 때만 true 로 파생) |
| `content.aiAcceptance` | `ACCEPTED \| PARTIAL \| REJECTED`, AI 진단이 없던 건은 `NOT_AVAILABLE` |
| `version` | 낙관적 잠금. 저장·확정마다 +1, 요청 version 과 다르면 **409 `REPORT_VERSION`** |
| `revision` · `status` | 내용 개정 번호 · `DRAFT \| CONFIRMED`. 확정본을 수정 저장하면 revision+1 의 DRAFT |
| `createdBy` · `updatedBy/At` · `confirmedBy/At` · `confirmations[]` | 작성자 · 최종 수정 · 현재 확정 정보 · revision 별 확정 이력 |

- 확정 시 고장 DB 레코드를 **수리 ID 기준으로 교체(upsert)**. `NO_FAULT_FOUND` 는 고장 건수에 넣지 않는다.
- `HQ_APPROVAL`(본사 승인 대기) 상태는 폐지. `APPROVED`·`REJECTED` 는 enum 에만 남아 있고 새 흐름에서는 만들어지지 않는다.

분석 실패는 상태값을 늘리지 않고 `analysisError` 필드 + 단계 `FAILED` 로 표현하며, 화면에서는 "분석 실패" 배지와 재분석/본사 검토 요청 버튼을 보여 준다.

### 1-3. 역할별 사용자 흐름

| 역할 | 핵심 흐름 |
|---|---|
| 서비스센터 기사 | 홈(할 일) → 접수 3단계 → 진행(SSE, 추가 사진) → **진단 확인** → 부품 확인·**발주 요청 등록** → 수리 리포트 **초안 저장 → 확정** (필요 시 수정·재확정) |
| 본사 품질 담당자 | 홈(발주 승인 대기 건수 · 대시보드 바로가기) → 발주 승인 대기 → 요청 + 재고 함께 확인 → **발주 승인·반려** / 품질 대시보드 → 드릴다운 |

### 1-4. "사람의 결정" 지점 (자동 확정 금지)

| 대상 | AI 가 하는 일 | 확정하는 사람 | 화면 |
|---|---|---|---|
| 진단 | 원인 후보·근거·AI 판단 점수·부품 초안 | 기사 | AI 진단 결과 |
| 발주 | 발주안(AI_DRAFT) 제안 | 기사 요청 → 본사 품질 담당자 승인 | 부품·발주 |
| 수리 리포트 | (참고용 AI 진단만 제공) | 기사 초안 저장 → **기사 확정** | 수리 리포트 |
| 고장 DB·대시보드 | 없음 | 기사가 확정한 리포트만 반영 (재확정 시 교체) | 대시보드 |

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
[추가 사진 필요 n][진단 확인 대기 n][리포트 확정 대기 n][수리 완료 n]  ← 누르면 필터
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
2) 증상 [+소음][+멈춤]… [textarea]   에러코드 (선택) [E___][추가] [E103][E210]  ※ 없으면 비워 두고 다음 단계
   기사 소견 [textarea] (선택, 1000자) "직접 보고 판단한 내용을 자유롭게 적어 주세요. AI 분석에 함께 사용됩니다."
   긴급도 (긴급)(보통)(낮음)
3) [PCB 📷 필수][기계·찌그러짐 📷 필수]  칸별 5장 · 전체 10장, 미리보기·다시 올리기·삭제·촬영 예시
   최종 확인 요약(기사 소견 포함, 각 항목 [수정])
─────────────── 하단 고정: [이전]            1/3 단계   [다음 →] / [접수하고 AI 진단 요청]
```

**진단 진행**
```
[흐름 내비: 접수 ✓ ─ ❷AI 분석 ─ 진단 확인 ─ 부품·발주 ─ 수리 리포트 ─ 리포트 확정]
[접수 요약 카드]
┌ AI 가 분석하고 있습니다                      (● 실시간 연결됨) ┐
│ ███████████░░░░░░░  "PCB 사진을 분석하고 있습니다."      45%   │
│ ● 현재 실행 중: PCB 분석 · PCB Agent                          │
└───────────────────────────────────────────────────────────────┘
[추가 사진 요청 카드]  (필요 시)   /  [분석 실패 배너 + 재분석·본사 검토]  /  [완료 → 진단 결과 확인]
┌ 단계별 진행(타임라인) ──────┐ ┌ 등록 사진 ┐
│ ✓ 접수·대기열               │ │ ▢ ▢       │
│ ⟳ 분석 진행                 │ ├ 실시간 이벤트(SSE 로그) ┤
│   ┆ ✓ PCB 분석       완료   │ │ 17:02 PCB 사진을…        │
│   ┆ ⟳ 매뉴얼·유사 사례 검색 │ └──────────────────────────┘
│   ┆   (도구는 도착한 순서대로 추가, 없으면 "분석 도구를 준비하고 있습니다")
│ ○ 결과 종합                 │
"현재 실행 중: 매뉴얼·유사 사례 검색" (실행 중인 도구 이름)
```

**추가 사진 요청 카드**
```
┌ 📷 추가 사진 요청                 [✦ 기계 분석 요청][요청 1/3회] ┐
│ 모터 하단 연결부 사진이 필요합니다.                                 │
│ 필요한 이유  현재 사진에서는 외관 변형 여부를 확인하기 어렵습니다.  │
│ 촬영 방법    연결부가 정면으로 보이도록 촬영해 주세요.               │
│ ⚠ 추가 요청이 2회 더 발생하면 본사 수동 검토로 전환됩니다.          │
│ [사진 선택/촬영] [촬영 예시]  추가 설명 [textarea]                  │
│                                   [추가 자료 제출하고 분석 계속]   │
└─────────────────────────────────────────────────────────────────────┘
```

**AI 진단 결과 (핵심) — 핵심 요약 + 펼쳐 보기**
```
[흐름 내비] [접수 요약] [같은 시리얼의 다른 수리 건]
┌ 한눈에 보기 ──────────────────────────────────────────┐ ┌ 승인 상태 ───────────┐
│ ✦ AI 분석 결과 · 확인 필요 (화면에서 AI 배지는 여기 한 번) │ │ ⏳ 관리자 확인 대기   │
│ 모터 하우징 변형                                       │ │ (처리 후: 승인자·시각)│
│ AI 판단 점수 87점 ███████░  ⓘ 고장 확률이 아니라 AI가    │ └──────────────────────┘
│   후보를 비교한 점수입니다 | 긴급도 긴급               │
│ 권장 조치 · 필요 부품(재고 있음/발주 필요) · 판단 근거 3개 · [데이터 출처 6개 보기] │
└──────────────────────────────────────────────────────┘
[진단 내용 확인] [추가 분석 요청] [진단 반려]              [더 보기 ▾ 수정 의견 작성 · 본사 검토 요청]
  → 누르면 사유 입력 모달 (반려·추가 분석·의견·본사 검토는 사유 필수)
세부 내용                                             [모두 펼치기] [모두 접기]
▸ 원인 후보 순위            87점 · 41점 · 18점   (진단 확인 전에는 펼침)
▸ 부위별 분석 (PCB · 기계)  이상 1 · 정상 1
▸ 사진 이상 영역            표시 3곳
▸ 에러 코드 분석            E103
▸ 점검 순서 · 수리 방법      점검 5단계 · 수리 3단계 · 부품 1종
▸ 유사 수리 사례            12건
▸ 참고 매뉴얼 · 데이터 출처  6개
▸ 처리 이력                마지막 처리 1줄
(데이터 없는 섹션은 숨김, 펼침 상태는 sessionStorage 에 화면별로 기억)
```

**수리 리포트 (초안 저장 → 확정)**
```
(수동 진단 회신 / AI 반려 / 버전 충돌 / "확정본 수정 중 — 대시보드에는 rn 반영 중" 배너)
┌ 입력 (초록 왼쪽 띠 = 사람 입력) ───────────────┐ ┌ 참고용 AI 진단 (보라, 고정) ┐
│ 1 처리 결과 (수리 완료)(수리 실패)(고장 없음)     │ │ 원인·판단 점수·후보·추천 부품│
│ 2 AI 진단이 맞았나요? (맞음)(일부)(틀림)  ※ AI 없으면 생략 → NOT_AVAILABLE
│ 3 실제 원인 (AI 후보 선택 | 직접 입력)            │ └─────────────────────────────┘
│ 4 고장 부위 [부위▾][교체 부품▾(선택)][🗑] [+ 추가] [✦AI 추천 불러오기]  ※ 고장 없음이면 숨김
│ 5 실제 조치 [textarea] [✦AI 권장 방법 불러오기]
│ 6 기사 의견 (자주 쓰는 문구 버튼)  ※ AI 와 다르면 필수
│ 7 수리 전·후 사진 (확정 시 후 사진 필수, 고장 없음 제외)
└──── 하단 고정: r1 초안 · 저장 시각 · [초안 저장] [리포트 확정] → "확정하면 고장 DB와 대시보드에 반영됩니다" 모달 ┘
읽기 전용(확정 후 · 품질 담당자): 리포트 내용 + 사진 + [리포트 수정](기사만) → 확정 이력 표(revision·확정자·시각·현재 반영본) → 처리 이력
```

**부품 재고 및 발주** — 발주 카드 = [AI 발주 제안·추천 이유·AI 판단 점수 (보라)] | [수량·출고 창고·메모·□ 직접 확인 체크 → 발주 요청 등록]. 옆에 재고 카드(창고별 위치·수량, 생산 공장·담당·연락처·이메일, 예상 입고일, 단가). AI 추천 부품마다 전체 창고 재고로 분기: 재고 충분 → 초록 "창고 재고로 수리 가능" + 창고 위치·수량 (발주 버튼 없음, 작은 링크 "그래도 발주 요청하기") / 부족 → 주황 "재고 부족 · 발주 필요" + 생산 공장·연락처·예상 입고일 + [발주 요청 등록]. 재고가 충분한 부품은 AI 발주안(AI_DRAFT)을 만들지 않는다. 본사 품질 담당자는 [발주 승인][반려(사유 필수)].

**본사 수동 검토** (`/approvals/:id`, MANUAL_REVIEW 건만)
```
사진 + AI 추가 사진 요청 이력 → HumanApprovalCard [수동 진단 회신(기사에게)][재분석 요청] → 처리 이력
```

**품질 대시보드**
```
[기간▾]   "기사가 확정한 리포트만 집계"
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
| `/repairs/:id/parts` | repair-parts | RepairPartsView | 기사·품질(조회) |
| `/repairs/:id/review` | repair-review | TechnicianReviewView | 전체(입력은 기사) |
| `/approvals/:id` | approval-detail | ApprovalDetailView (수동 검토 전용) | 품질 |
| `/order-approvals` | order-approvals | PartsOrderView (`pendingOnly`) | 품질 |
| `/parts` | parts | PartsOrderView | 기사·품질 |
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
| **HumanApprovalCard** | `suggestion, evidence, confidence, sources, sourceIds, decision, actions[], canDecide, busy` / `@action(key, comment)` | 전역 규칙의 9개 필수 요소를 **하나의 컴포넌트가 강제**. 액션별 `requiresComment` 검증, 결정 후 승인자·시각 표시. 진단 확인·수동 검토에 공통 사용 |
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
- `data.ts` — 시드: 사용자 3명(기사 2 · 품질 1), 제품 카탈로그(시리얼→모델), 부품 5종(창고·공장·연락처), 진단 템플릿 3종(모터 하우징 / 휠 센서 / PCB), 수리 15건(재입고 1건·리포트 초안 1건·재확정 1건·재고 없는 PCB 발주 1건 포함), 접수 사진은 PCB·MECHANICAL 2종, 발주 3건, 알림, 대시보드용 승인 고장 레코드 약 260건(최근 6개월, 시드 고정 난수, 모터 하우징 변형 증가 패턴).
- `db.ts` — 메모리 DB + `localStorage` 영속화(새로고침 유지, 페이지 이탈 시 즉시 저장) + SSE 대용 이벤트 버스.
- `engine.ts` — 오케스트레이터 시뮬레이터. 단계별로 `RepairEvent` 를 발생(실제 SSE 와 동일 스키마). 에러코드가 없으면 SW 분석을 건너뜀.
- `handlers.ts` — REST 엔드포인트와 1:1 대응. 역할 권한·상태 전이·필수 사유를 서버처럼 검증.

대표 사례 (요청서의 Mock 그대로): 접수 101 · RC-A100 · RC2026000187 · E103 · 모터 하우징 변형 87% · PCB 이상 없음 · 모터 하단 연결부 변형 · SW 회전 센서 오류 · 유사 12건 · RM-MT-103 수원 창고 7개 · 구미 제2공장 · 입고 2일.

데모 시나리오: 증상에 "덜컹/흐림/흔들" → 추가 사진 요청 / "실패" → 분석 실패 / 그 외 정상. 시드 111번은 실패, 102번은 추가 사진 대기, 109번은 3회 초과 수동 검토, 106번은 AI·기사 불일치.

---

## 7. REST API 와 SSE 연결 구조

```
View ─→ Pinia store ─→ src/api/*.ts ─┬─ VITE_USE_MOCK=true  → mocks/handlers.ts (지연·복사본 응답)
                                     └─ false               → axios(http.ts, 세션 쿠키 + CSRF) → /api (Vite proxy)
                                                               └─ src/api/adapters/* : snake_case·문자열 ID → 프론트 타입
View ─→ store.subscribe ─→ services/sse.ts ─┬─ mock → mocks/db 이벤트 버스
                                             └─ real → EventSource(withCredentials) named event → 상세 재조회
```

화면·스토어는 `src/types` 의 프론트 타입만 쓴다. 실서버 응답(snake_case, ID 는 `"101"` 같은 십진수 문자열)은 `src/api/adapters/` 에서 변환하고 ID 는 `Number()` 로 바꾼다.
백엔드에 아직 없는 기능은 `src/api/features.ts` 의 `FEATURES` 로 끄고, 화면은 카드를 숨기거나 "준비 중" 을 표시한다.
변환 확인: `src/api/adapters/__samples__.ts` 의 `runAllSamples()` (API.md 예시 + OpenAPI 스키마 기반 샘플 28개 검사).

#### 실서버 API (백엔드 API v2 — [docs/API.md](https://github.com/skala-ai-agent-team6/backend/blob/main/docs/API.md), openapi.json)

| Method | Path | 용도 · 프론트 변환 |
|---|---|---|
| GET | `/api/auth/csrf` | `{headerName, token}` — 메모리 보관, POST/PUT/DELETE 에 자동 첨부 |
| POST | `/api/auth/login` | form `username`(이메일)·`password` + CSRF → 성공 후 CSRF 재조회 |
| GET | `/api/auth/me` · POST `/api/auth/logout` | 세션 복원 / 로그아웃 |
| GET | `/api/products?serialNumber=` | 제품 조회 → `ProductInfo` (`id` = 접수 시 `productId`) |
| POST | `/api/repairs` | multipart `data`(JSON: productId, symptoms, errorCodes, firmware, userInput{technicianNote, photoKinds[], urgency}) + `files`(1~10) → 202 `{repairId, taskId, status}` |
| GET | `/api/repairs?page&size&status&serial` | 목록. 상태는 역변환해 전송, 검색어는 시리얼처럼 보일 때만 `serial`, 나머지는 화면에서 필터. `statusCounts` 없음 → 칩 건수 숨김 |
| GET | `/api/repairs/{id}` | 상세(attachments·tasks·photoRequests·reports·orders) → `Repair` · 추가 사진 요청 |
| GET | `/api/repairs/{id}/diagnosis` | Task + result(candidates·evidence·recommendedParts·summary·repairMethod) → `Diagnosis` |
| GET | `/api/repairs/{id}/diagnosis/tools` | 도구 실행 이력 → Agent(PCB·MOTOR·SW) 카드 |
| POST | `/api/repairs/{id}/attachments?requestId=` | 추가 사진 1장씩 → `attachmentId` |
| POST | `/api/repairs/{id}/diagnosis/resume` | `{requestId, submissionKey(UUID), attachmentIds, note}` — `note` 는 스키마에 없어 무시될 수 있음 |
| GET | `/api/attachments/{id}` | 사진 표시 (`<img>` src) |
| GET | `/api/repairs/{id}/events` | **SSE** named event → 상세 GET 재조회 |
| GET | `/api/repairs/{id}/report` | header + revisions → `RepairReport` (`confirmed_revision` 으로 확정 여부·이력) |
| PUT | `/api/repairs/{id}/report/draft` | `{version(처음 0), content}` — 불일치 409 `REPORT_VERSION` |
| POST | `/api/reports/{reportId}/confirm` | `{version, revision}` — 리포트 id·최신 revision 은 GET /report 로 확인 |
| GET | `/api/parts` · `/api/parts/{id}/inventory` · `/api/parts/{id}/factories` | 부품 + 창고 재고(available) + 공급 공장(lead_days) → `Part` (30초 캐시) |
| GET | `/api/repairs/{id}/procurement` | AI 조달 제안(스냅샷) → AI_DRAFT 카드 + 요청된 발주 |
| GET | `/api/orders/{id}` | 발주 상세(품목) — 품목 1개 = 발주 카드 1장 (`id = 주문id#품목id`) |
| POST | `/api/repairs/{id}/orders` | `{items:[{partId, quantity, source, warehouseId \| factoryId}]}` — 선택 창고 재고 부족이면 FACTORY |
| POST | `/api/orders/{id}/approve` · `/reject` | `{reason}` — 발주 상태 PENDING→요청됨, APPROVED, ORDERED(출고), RECEIVED(수령), REJECTED, CANCELLED |
| GET | `/api/dashboard?from&to&groupBy` | PERIOD·PART·CENTER·FACTORY·AREA 를 각각 호출해 합침 (확정 리포트만) |

접수 상태 매핑 (`adapters/status.ts`): RECEIVED→RECEIVED · DIAGNOSING→ANALYZING(작업 QUEUED 면 QUEUED) · WAITING_INPUT→ADDITIONAL_INFO_NEEDED · DIAGNOSED→DIAGNOSIS_COMPLETED · MANUAL_REVIEW→MANUAL_REVIEW · REPAIRING→TECHNICIAN_REVIEW · CLOSED→CLOSED · CANCELLED→CANCELLED(취소, 회색). 작업 FAILED 면 `analysisError`.

백엔드에 없어 화면에서 막거나 "준비 중" 으로 표시하는 것 (`FEATURES`)
- 진단 확인·반려·본사 검토 요청·수동 진단 회신, 재분석 요청 → 버튼 잠금/숨김
- 수리 전·후 사진 업로드 → 리포트 사진 칸 숨김 (사진 없이 확정)
- 추가 자료를 설명만 제출 → 사진 1장 이상 필요
- 대시보드 모델별 · AI 진단 성공률/일치율 · 드릴다운 · 반복 고장 추세 → "준비 중" (부위별 AREA 차트로 대체)
- 전체 발주 목록 API 없음 → 접수 목록(최대 100건) → 상세 orders → `GET /orders/{id}` 로 모음 (N+1 호출)
- 알림 API 없음 → 빈 목록, 전역 SSE 없음 → 목록 실시간 갱신 없음

#### Mock 전용 API (프론트 `mocks/handlers.ts` 에서만 동작, 실서버 경로 없음)

| Method | Path (가상) | 용도 |
|---|---|---|
| POST | `/repairs` → `/repairs/{id}/images` → `/repairs/{id}/submit` | 단계별 접수 (실서버는 multipart 한 번) |
| POST | `/repairs/{id}/images` (kind `BEFORE`/`AFTER`) | 수리 전·후 사진 |
| POST | `/repairs/{id}/approval` · `/reanalysis` | 진단 확인·반려·본사 검토·수동 진단 회신 · 재분석 |
| POST | `/repairs/{id}/additional-images` | 추가 사진 + 설명 (설명만 제출 가능) |
| GET | `/repairs?…` 의 `statusCounts` · `group` | 상태별 건수 · 그룹 필터 (실서버는 화면에서 그룹 필터) |
| GET | `/orders` | 전체 발주 목록 |
| GET | `/dashboard/defects` · `/dashboard/defects/records` | 모델별·AI 일치율 포함 통계 · 드릴다운 |
| GET/POST | `/notifications`, `/{id}/read`, `/read-all` | 알림 |

SSE (실서버: `GET /api/repairs/{id}/events`, `EventSource(url, { withCredentials: true })`)
```text
id: 42
event: PHOTO_REQUESTED
data: {"taskId":"1","status":"WAITING_INPUT","inputRevision":1,"requestId":"1","round":1,"bodyPart":"wheel","description":"하부 사진 요청"}
```
- 구독 이벤트: REPAIR_CREATED · DIAGNOSIS_QUEUED · DIAGNOSIS_STARTED · DIAGNOSIS_PROGRESS · TOOL_EXECUTED · PHOTO_REQUESTED · DIAGNOSIS_RESUMED · DIAGNOSIS_COMPLETED · DIAGNOSIS_FAILED · ORDER_PROPOSED · REPORT_DRAFT_SAVED · REPORT_CONFIRMED
- payload 는 쓰지 않고 상세를 GET 으로 다시 조회 (300ms 모아서 1회, 진단 완료·실패·재개면 진단도 재조회). `TOOL_EXECUTED` 는 `GET /diagnosis/tools` 만 다시 받아 '분석 진행' 도구 목록을 갱신
- URL 에 토큰 없음(세션 쿠키), 재연결은 브라우저 기본(Last-Event-ID). 서버가 거부해 CLOSED 가 되면 "연결 실패" 표시
- Mock 은 브라우저 내부 이벤트 버스로 `RepairEvent`(status·stage·tool·progress·photoRequest) 를 바로 반영

진행 단계 (프론트 표시)
- 고정 3단계: `QUEUED`(접수·대기열) → `ANALYSIS`(분석 진행) → `SYNTHESIS`(결과 종합). SW 분석 단계는 없음
- `ANALYSIS` 안에는 실제로 실행된 도구(`Repair.tools: AnalysisToolRun[]`)가 **도착한 순서대로** 추가된다
  - 실서버: `GET /diagnosis/tools`(ToolExecution) 의 `agent_type` → PCB `PCB 분석` · MOTOR `기계 분석` · RAG `매뉴얼·유사 사례 검색` · 그 외 `tool_name` 그대로(예: 소견 정리). 같은 agent·tool 재시도는 마지막 실행 하나로
  - 백엔드 작업 상태 → 단계: QUEUED → 접수·대기열 진행 / RUNNING → 분석 진행(stage 가 종합 계열이면 결과 종합) / WAITING_INPUT → 분석 진행 추가 사진 대기 / SUCCEEDED → 모두 완료 / FAILED → 분석 진행 실패
  - Mock: 사진이 있는 부위만(PCB 사진 → PCB 분석, 기계 사진 → 기계 분석) + 항상 매뉴얼·유사 사례 검색, 순서를 섞어 하나씩. 추가 자료 제출 후에는 `ANALYSIS` 부터 재개하고 끝나지 않은 도구만 다시 실행

#### AI 서버 결과 형식 (AI 서버 → 백엔드 → 프론트)

AI 서버는 Kafka 로 결과를 백엔드에 넘기고(진단 HTTP callback 없음), 프론트는 백엔드 `GET /api/repairs/{id}/diagnosis` 의 `result` 와 `GET /diagnosis/tools` 로 받는다.

```json
{
  "summary": "모터 하우징 변형 의심",
  "modelVersion": "diag-2026.10",
  "repairMethod": "1. 하단 연결부 확인\n2. 모터 어셈블리 교체",
  "candidates": [
    { "rank": 1, "cause": "모터 하우징 변형", "confidence": 0.87, "explanation": "하단 연결부 변형 탐지" },
    { "rank": 2, "cause": "휠 센서 접촉 불량", "confidence": 0.21, "explanation": "펄스 누락 일부" }
  ],
  "recommendedParts": [{ "partId": "1", "quantity": 1 }],
  "evidence": [
    { "type": "IMAGE", "attachmentId": "2", "annotation": { "label": "하단 연결부 변형", "x": 47, "y": 70, "w": 15, "h": 13, "severity": "HIGH" } },
    { "type": "MANUAL", "citation": "RC-A100 서비스 매뉴얼 7장" }
  ]
}
```

| 필드 | 형식 | 프론트 변환 (`src/api/adapters/diagnosis.ts`) |
|---|---|---|
| `candidates[].confidence` | **0~1** | ×100 → 'AI 판단 점수'(0~100점). 고장 확률이 아니라 후보끼리 비교한 점수 — 높음/보통/낮음 등급·기준선 없이 순위 비교로만 표시 |
| `candidates[]` | rank·cause·explanation | rank 순 정렬, 1순위 = 대표 원인, explanation → 판단 근거 |
| `repairMethod` | 문자열(줄바꿈·번호) | 단계 배열로 분리 |
| `recommendedParts[]` | partId·quantity | 부품 이름·품번은 `/api/parts` 로 연결, 재고 상태는 전체 창고 available 합계 |
| `evidence[]` | type·attachmentId·annotation·citation | 데이터 출처 목록, annotation(x·y·w·h %·severity) → 사진 이상 영역 |
| 도구 실행(`/diagnosis/tools`) | agent_type·tool_name·status·output_payload | 진행 화면 도구 목록 + 부위별 분석 카드(PCB·MOTOR 만, output_payload 의 verdict·summary·findings·confidence(0~1)) |
| 실패 | task `status=FAILED`, `error_code` | `analysisError`. `INCONCLUSIVE_AFTER_THIRD_PHOTO` = 추가 사진 3차 후에도 판단 불가 → 접수 `MANUAL_REVIEW` (4차 요청 없음), 문구는 `constants/errors.ts` |

---

## 8. 로딩 · 빈 결과 · 오류 · 승인 · 반려 상태 설계

| 상태 | 표현 | 위치 |
|---|---|---|
| 로딩(첫 로드) | 스켈레톤 블록 (레이아웃 유지) | 목록·상세·대시보드 |
| 로딩(재조회) | 기존 내용 유지 + 흐리게(opacity) + 새로고침 아이콘 회전 | 목록 |
| 처리 중 | 누른 버튼만 스피너 + 전체 버튼 비활성 (중복 제출 방지) | 승인 카드·발주·접수 |
| 빈 결과 | 아이콘 + 원인 문구 + **다음 행동 버튼** (필터 초기화 / 첫 접수 / 진단으로 이동) | StateView |
| 오류 | 빨간 아이콘 + 서버 메시지 + [다시 시도] | StateView, 토스트 |
| 입력 오류 | 필드 빨간 테두리 + 아이콘 + 문구, 첫 오류로 포커스 이동. 리포트는 초안 저장(처리 결과·AI 수용만)과 확정(전체)의 검증 범위가 다름 | 접수·수리 리포트 |
| 부분 실패(업로드) | 이미 만든 접수번호 유지 → [다시 시도] 시 같은 건에 재업로드 | 접수 3단계 |
| SSE 끊김 | 배지: 연결 중/실시간 연결됨/재연결 중/연결 실패 | 진단 진행 |
| 분석 실패 | 빨간 배너 + 사유 + [재분석 요청][본사 검토 요청] | 진단 진행 |
| AI 초안(대기) | 보라 점선 영역 + "AI 생성 결과·사람의 확인 필요" + 주황 "사람 확인 대기" | 모든 AI 결과 |
| 승인됨 | 초록 실선 영역 + "사람 확정" + 승인자·시각·의견 | 승인 카드·발주·수리 결과 |
| 반려됨 | 빨간 영역 + 반려 사유 + 반려자·시각, 반려·수정 요청·재분석은 **사유 필수** | 승인 카드 |
| 버전 충돌 | 409 `REPORT_VERSION` → 빨간 배너 + 최신 버전 재조회, 입력 중인 내용은 유지하고 [최신 내용으로 되돌리기] 제공 | 수리 리포트 |
| 권한 없음 | 결정 버튼 대신 잠금 안내(조회 전용) / 경로 접근 시 403 화면 | 진단·승인 |
| 이탈 방지 | 작성 중 다른 화면 이동 시 확인창 | 접수 |

접근성: 기본 17px, 버튼 최소 48px(주요 버튼 56px), 상태는 색+아이콘+텍스트, 키보드로 표 행 열기(Enter), 차트는 스크린리더용 대체 버튼 제공, 포커스 링, `prefers-reduced-motion` 대응.
