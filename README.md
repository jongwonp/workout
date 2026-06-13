# 운동 기록 PWA

안드로이드 폰에서 사용할 1인용 근력 운동 기록 PWA. 백엔드 없이 IndexedDB에 로컬 저장.

현재 단계: **Phase 1 / Slice 2** — 매일 쓰기 편한 수준 + 데이터 안전 (백업/복원).

## 주요 기능

- **종목 라이브러리**: 60개 시드 종목, 검색 + 카테고리(가슴/등/어깨/하체/팔/코어) 필터
- **세션 기록**: 빈 세션 시작 또는 **저장된 루틴에서 시작**, 세트 추가/수정/삭제, 종목 추가/삭제
- **세트 입력 UI**: 무게/횟수 자동 저장 (debounce 500ms), 워밍업 토글, 빠른 증감(±1.25/2.5 kg 또는 ±2.5/5 lb), **RPE/RIR 선택 입력**
- **루틴 관리**: 자주 하는 운동 묶음 저장 (이름 + 종목 + 기본 세트 수 + 순서), 카드 ▶ 버튼으로 즉시 시작
- **세션 컨디션**: 시작 직후 컨디션/수면/피로도 5단계 + 시간 제한 (선택 입력, 건너뛰기 가능)
- **히스토리**: 월별 그룹 + 카드 (날짜/운동 시간/종목·세트 수/컨디션 미리보기), 상세 read-only, 수정/삭제
- **단위 전환**: kg ↔ lb (저장은 항상 kg, 표시만 변환)
- **JSON 백업/복원**: 전체 사용자 데이터 다운로드 + 덮어쓰기/병합 복원 (검증 포함)
- **저장공간 관리**: `navigator.storage.persist()` 영구 저장 권한 요청 + 사용량/한도 표시
- **PWA**: 홈 화면 추가 + 오프라인 동작 (service worker)

## 기술 스택

React 19 / Vite 8 / TypeScript / Dexie.js / Zustand / React Router v6 / Tailwind CSS v3 / vite-plugin-pwa.

## 개발

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속. 첫 실행 시 IndexedDB에 시드 데이터(60개 종목 등)가 자동 로드됨.

## 빌드 & PWA 미리보기

```bash
npm run build
npm run preview
```

`preview`는 빌드 결과를 production 모드로 서빙해 service worker가 동작하므로, PWA 설치 / 오프라인 동작 / 영구 저장 권한 테스트는 `preview`에서.

## 타입 체크

```bash
npx tsc --noEmit
```

## 안드로이드 폰에 PWA로 설치

1. 같은 네트워크의 다른 기기에서 접속하려면 dev 서버를 외부에 노출: `npm run dev -- --host` (또는 `preview` 사용)
2. 안드로이드 Chrome에서 표시된 Network URL(예: `http://192.168.x.x:5173`)로 접속
3. 우상단 메뉴 → **홈 화면에 추가** (또는 주소창의 설치 아이콘)
4. 홈 화면 아이콘 탭으로 풀스크린 실행
5. 캐싱 후엔 오프라인에서도 모든 기능 동작

> 실제 배포 환경(HTTPS) + PWA 설치 상태에서 `navigator.storage.persist()`가 자동 승인되는 경향이 있어 영구 저장 권한 활성화 가능성이 가장 높습니다.

## 데이터 저장 및 백업

- **모든 데이터는 브라우저 IndexedDB에 로컬 저장됨** (`WorkoutDB`)
- 외부 서버 동기화 없음
- **영구 저장 권한**: 설정 화면에서 상태 확인 + 재요청 가능. PWA 설치 + 첫 실행 시 자동 시도. 권한이 없으면 브라우저가 저장공간 부족 시 LRU 정책으로 삭제할 수 있음.
- **JSON 백업**: 설정 → 데이터 관리 → "전체 데이터 백업" → `workout-backup-YYYYMMDD-HHMMSS.json` 다운로드. 시드는 제외(앱이 자동 로드)되고 사용자 데이터(세션/세트/루틴 등)만 포함.
- **복원**:
  - **덮어쓰기**: 현재 사용자 데이터 모두 삭제 후 백업으로 교체
  - **병합**: 백업에 있고 현재 DB에 없는 레코드만 추가 (id 충돌 시 건너뜀)
  - 검증 실패(format_version 불일치, 참조 무결성 위반 등) 시 거부

### 데이터 초기화 (개발용)

브라우저 DevTools → Application → Storage → IndexedDB → `WorkoutDB` → Delete database → 새로고침.

또는 dev 콘솔에서:

```js
await __db.delete();
location.reload();
```

(`__db`는 dev 모드에서만 노출되는 Dexie 인스턴스)

## 다음 슬라이스 미리보기

- **Slice 3** (다음)
  - 통증 로그 입력 + 무통증 체크인
  - 부상 프로필 등록/관리 (`my-injury-profiles.ts` 데이터 활용)
- **Phase 2 이후**
  - 점진적 과부하 추천
  - 부위별 주간 볼륨 관리 (직접 / 보조근 환산, MEV/MAV/MRV)
  - 디로딩 자동 감지
  - 부상 안전 필터 (통증/부상 신호 우선)
  - 종목별 추이 그래프
- **Phase 5**
  - 슈퍼셋/드롭셋 UI
  - 휴식 타이머
  - 클라우드 동기화

## 폴더 구조

```
src/
├── App.tsx                       # Bootstrap (seed/user/세션/저장공간) + router
├── main.tsx
├── index.css                     # Tailwind directives
├── vite-env.d.ts                 # 컴파일 상수(__APP_VERSION__) 선언
├── db/
│   ├── schema.ts                 # Dexie WorkoutDB (13 tables)
│   ├── seeds.ts                  # 시드 데이터 (60종목 + 변형 + 매핑)
│   ├── seed-loader.ts            # 첫 실행 자동 로드 + User 마이그레이션
│   ├── backup.ts                 # JSON export/import + 검증
│   └── repositories/             # exercises / sessions / sets / routines
├── pages/
│   ├── ExerciseListPage.tsx
│   ├── SessionStartPage.tsx      # /session/new 모드 선택
│   ├── WorkoutSessionPage.tsx    # 진행 중 / 편집 모드
│   ├── HistoryPage.tsx           # 월별 그룹 목록
│   ├── HistoryDetailPage.tsx     # read-only 상세 + 수정/삭제
│   ├── RoutineListPage.tsx
│   ├── RoutineEditPage.tsx
│   └── SettingsPage.tsx          # 프로필/입력 환경/데이터 관리/저장공간/정보
├── components/
│   ├── BottomNav.tsx             # 5탭
│   ├── SetInput.tsx              # 세트 입력 (debounce + 단위 + RPE/RIR)
│   ├── IntensityInput.tsx        # RPE/RIR 빠른 버튼
│   ├── SessionExerciseBlock.tsx
│   ├── ReadOnlyExerciseBlock.tsx
│   ├── LastSessionInfo.tsx
│   ├── ConditionPromptScreen.tsx # 세션 시작 시 컨디션 입력
│   └── ExercisePicker.tsx        # 루틴 편집 시 종목 선택
├── store/
│   ├── sessionStore.ts           # 진행 중 세션
│   ├── userStore.ts              # 체중/단위/RPE-RIR 선호
│   └── storageStore.ts           # 영구 저장 권한 / 사용량
├── types/index.ts                # 타입 정의 (Routine 등 본격 사용)
└── utils/                        # id / date / load / unit
```
