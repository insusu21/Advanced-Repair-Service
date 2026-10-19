# RobotCare AI — 서비스센터 로봇청소기 고장 진단 지원 (Frontend)

Vue 3 · Vite · TypeScript · Composition API · Vue Router · Pinia · Axios · SSE · ECharts

> **AI 가 만든 결과는 모두 "AI 초안"입니다. 사람이 확인·승인한 것만 고장 DB 와 품질 대시보드에 반영됩니다.**

설계 문서(정보 구조·사용자 흐름·와이어프레임·라우터·컴포넌트·스토어·Mock·API/SSE·상태 설계): [`docs/DESIGN.md`](docs/DESIGN.md)

---

## 실행 방법 (VS Code)

요구 사항: **Node.js 20 이상** (권장 22), npm

```bash
# 1) 압축을 풀고 VS Code 로 폴더 열기
code robotcare-ai

# 2) VS Code 터미널(Ctrl + `)에서
npm install
npm run dev          # http://localhost:5173
```

VS Code 가 권장 확장(**Vue - Official**)을 설치하라고 안내하면 설치하세요. (`.vscode/extensions.json`)

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (Mock 모드, 백엔드 불필요) |
| `npm run type-check` | vue-tsc 타입 검사 |
| `npm run build` | 타입 검사 + 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |

### 데모 계정 (비밀번호 모두 `1234`, 로그인 화면에 바로가기 버튼 있음)

| 사번 | 이름 | 역할 |
|---|---|---|
| T1001 | 김정훈 | 서비스센터 기사 (강남) |
| T1002 | 박민수 | 서비스센터 기사 (부산) |
| Q2001 | 이서연 | 본사 품질 담당자 |
| P3001 | 최도윤 | 부품 담당자 |

### 5분 데모 시나리오

1. **기사(T1001)** 로그인 → 홈 "지금 처리할 일" → `SR-2026-10707` (RC-A100, E103)
2. AI 진단 결과: 모터 하우징 변형 87% · 사진 위 이상 영역 · 근거·출처 확인 → **진단 내용 확인**
3. 부품·발주: AI 발주안(모터 어셈블리 RM-MT-103, 수원 창고 7개) → 확인 체크 → **발주 요청 등록**
4. 수리 결과 입력 → **본사 승인 요청**
5. 신규 수리 접수: 시리얼 `RC2026000999`, 증상에 "덜컹" 포함 → 진행 화면에서 **추가 사진 요청** 카드 → 사진 추가 → 분석 완료
6. **품질(Q2001)** → 승인 대기 → `106` 건(AI·기사 불일치 비교) / 방금 건 **승인 · DB 반영** → 품질 대시보드 → 막대 클릭으로 관련 수리 목록
7. **부품(P3001)** → 부품 및 발주 → 요청 **승인**

상단의 **데모 초기화** 버튼으로 언제든 처음 상태로 돌아갈 수 있습니다. (Mock 데이터는 브라우저 localStorage 에 저장)

---

## 실제 백엔드 연결

`.env.development`

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=/api
```

```bash
VITE_API_PROXY_TARGET=http://localhost:8080 npm run dev   # /api 를 백엔드로 프록시
```

화면·스토어 코드는 바꿀 필요가 없습니다. `src/api/*.ts` 가 Mock/실서버를 분기하고, `src/services/sse.ts` 가 Mock 이벤트 버스와 `EventSource` 를 같은 인터페이스로 감쌉니다. API 계약과 SSE 이벤트 형식은 `docs/DESIGN.md` 7장과 `src/types` 를 기준으로 맞추면 됩니다.

---

## 폴더 구조

```
robotcare-ai/
├─ .vscode/                     VS Code 권장 확장·설정
├─ docs/DESIGN.md               설계 문서 (1~8장)
├─ public/mock/                 Mock 사진 (제품·모터·PCB·추가·수리 후)
├─ src/
│  ├─ main.ts                   앱 부트스트랩 (Mock 모드: 진행 중 분석 재개)
│  ├─ App.vue
│  ├─ router/index.ts           경로·역할 가드·지연 로딩
│  ├─ types/                    도메인 타입(index) · API DTO(api) · 업로드 · 승인 액션
│  ├─ constants/status.ts       상태·단계·역할·긴급도 메타 (라벨+아이콘+톤)
│  ├─ api/                      http(axios·오류 정규화) · repairs · parts · dashboard · auth
│  ├─ services/sse.ts           SSE 연결 (재연결·백오프, Mock 겸용)
│  ├─ stores/                   auth · repairs(목록) · repairDetail · orders · dashboard · notifications · toast
│  ├─ composables/              useRepairPage · useReasonDialog
│  ├─ mocks/                    data(시드) · db(영속·이벤트 버스) · engine(AI 파이프라인) · handlers(REST)
│  ├─ utils/                    format · repairFlow(상태→다음 화면·할 일)
│  ├─ styles/                   tokens.css(디자인 토큰) · base.css(공통 UI)
│  ├─ components/
│  │  ├─ common/                RepairStatusBadge · AiBadge · ConfidenceBar · StateView · StatCard · BaseModal …
│  │  ├─ layout/                AppLayout · AppSidebar · AppTopbar
│  │  ├─ repair/                ImageUploader · StepIndicator · RepairFlowNav · RepairProgressTimeline
│  │  │                         AdditionalPhotoRequestCard · RepairSummaryCard · RepairTable
│  │  ├─ diagnosis/             DiagnosisSummaryCard · DiagnosisEvidenceCard · AgentAnalysisCard
│  │  │                         AnnotatedImage · HumanApprovalCard
│  │  ├─ review/                TechnicianCommentForm · ApprovalHistoryTimeline
│  │  ├─ parts/                 PartInventoryCard · PurchaseApprovalCard
│  │  └─ dashboard/             DefectStatisticsChart
│  └─ views/                    Login · Home · RepairList · RepairCreate · RepairProgress
│                               DiagnosisResult · RepairParts · TechnicianReview
│                               ApprovalQueue · ApprovalDetail · PartsOrder · Dashboard · Error
├─ index.html · vite.config.ts · tsconfig*.json · package.json
```

## 디자인 원칙

- 남색 주색 · 흰/밝은 회색 배경 · 정상 초록 / 대기 주황 / 실패·반려 빨강 · 장식 최소화
- **AI 결과 = 보라 점선 영역 + "AI 생성 결과·사람의 확인 필요" 배지**, **사람 확정 = 초록 실선 + "사람 확정"**
- 기본 글자 17px, 버튼 최소 48px(주요 동작 56px), 상태는 색 + 아이콘 + 텍스트 함께
- 데스크톱 우선, 1100px 이하 태블릿에서 사이드바 드로어·1단 레이아웃
