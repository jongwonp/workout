# 운동 기록 앱 — Phase 1 / Slice 1 구현 명세

> **이 문서를 읽는 AI 코드 에이전트에게**: 이 문서는 운동 기록 PWA의 첫 번째 작은 슬라이스를 구현하기 위한 명세서다. 전체 spec(`workout-app-spec-v4.4.md`)은 매우 크지만, 이 슬라이스에서는 그중 극히 일부만 구현한다. **반드시 이 문서의 "범위 외 (의도적으로 안 만드는 것)" 섹션을 먼저 확인하라.** 의도적으로 뺀 기능을 추가로 만들지 말 것.

---

## 1. 프로젝트 개요

**무엇을 만드는가**: 안드로이드 폰에서 사용할 1인용 근력 운동 기록 PWA.

**왜 만드는가**: 사용자는 현재 기본 메모 앱에 운동을 기록 중이며, 더 체계적인 기록 + 향후 지능형 중량 추천을 받기 위함. 이 슬라이스는 **메모 앱을 대체할 수 있는 최소 기능**까지만 만든다.

**최종 목표 (참고, 이 슬라이스 범위 아님)**: 점진적 과부하 추천, 부상 이력 기반 안전 필터, 부위별 볼륨 관리, 디로딩 자동 감지 등을 포함한 종합 운동 시스템. 단, 이 슬라이스에서는 **추천 기능을 일절 만들지 않는다**.

**사용자 컨텍스트**:
- 운동 경력 있는 중급자 (벤치/스쿼트/데드/OHP 모두 함)
- 안드로이드 폰만 사용, PC는 거의 안 봄
- 부상 이력: 전면 어깨(recovering), 손목 건초염(recovering) — 단 이 슬라이스에서는 활용 안 함
- 웹 개발에 익숙, React/Next 경험 있음

---

## 2. 이 슬라이스의 범위

### 만들 것

**화면 3개**:
1. **종목 목록**: 시드 데이터 표시, 검색 가능
2. **운동 세션**: 진행 중인 운동 — 종목 선택 → 세트 입력 → 다음 종목 → 종료
3. **히스토리**: 날짜별 세션 목록 + 세션 상세 보기

**기능**:
- IndexedDB 초기화 (앱 첫 실행 시 시드 데이터 자동 로드)
- 운동 세션 시작 → 종료
- 세트 추가/수정/삭제 (무게 kg, 횟수만 — RPE/RIR 없음)
- 워밍업 vs 본세트 구분 (체크박스)
- 종목 선택 시 직전 세션 기록 자동 표시
- 모든 데이터 로컬 저장 (IndexedDB)
- PWA 설치 가능 (manifest + service worker)

### 범위 외 (의도적으로 안 만드는 것)

이 슬라이스에서는 **절대 만들지 말 것**. 다음은 모두 후속 슬라이스/Phase에서 다룬다.

- ❌ 변형(ExerciseVariation) 선택 UI — 데이터는 저장되지만 항상 기본 변형 자동 선택
- ❌ 통증 로그 입력 (Slice 3)
- ❌ 부상 프로필 활용 (Slice 3 입력, Phase 3 활용)
- ❌ 루틴/템플릿 저장 (Slice 2)
- ❌ JSON 백업/내보내기 (Slice 2)
- ❌ RPE/RIR 입력 (Slice 2)
- ❌ 세션 컨디션 (수면/피로도) 입력 (Slice 2)
- ❌ 휴식 타이머 (Phase 5)
- ❌ 중량 추천, 디로딩 판단, 볼륨 계산 (Phase 2 이후)
- ❌ 보조근 환산, MEV/MAV/MRV (Phase 2A)
- ❌ 부위별 볼륨 통계, 그래프 (Phase 2A)
- ❌ 종목별 추이 그래프 (Phase 2A)
- ❌ 추천 계획 vs 실제 수행 비교 (Phase 2B)
- ❌ 종목 변형 추천 (Phase 3)

> **중요**: "이것도 같이 만들면 좋지 않을까?"라는 생각이 들어도 만들지 말 것. 슬라이스가 작아야 사용자가 빠르게 검토하고 다음 슬라이스로 넘어갈 수 있다.

---

## 3. 기술 스택

### 확정 사항

- **React 18 + Vite + TypeScript** (CRA 사용 금지, Next.js 사용 금지)
- **Dexie.js** (IndexedDB 래퍼) — raw IndexedDB API 사용 금지
- **Zustand** (현재 진행 중 세션 상태 관리)
- **React Router v6** (페이지 라우팅)
- **Tailwind CSS** (스타일)
- **shadcn/ui** (필요한 컴포넌트만 선별 설치)
- **date-fns** (날짜 처리)
- **vite-plugin-pwa** (PWA 설정)

### 사용하지 말 것

- Redux, MobX, Recoil 등 무거운 상태 관리
- styled-components, emotion (Tailwind만 사용)
- moment.js (date-fns 사용)
- raw IndexedDB API (Dexie만 사용)
- 외부 인증/백엔드 (단일 사용자, 로컬 전용)

### 초기 설치 명령어

```bash
npm create vite@latest workout-app -- --template react-ts
cd workout-app
npm install dexie zustand react-router-dom date-fns
npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa
npx tailwindcss init -p
# shadcn/ui는 필요한 컴포넌트가 명확해진 후 설치
```

---

## 4. 데이터 모델

전체 spec에는 더 많은 테이블이 있지만, 이 슬라이스에서는 다음만 사용한다.

### 사용할 테이블

```typescript
// 시드 데이터 (이미 작성됨, seeds.ts 사용)
BodyRegion              // 시드 로드만, UI 활용 없음
Muscle                  // 시드 로드만, UI 활용 없음
Exercise                // 종목 목록에 표시
ExerciseVariation       // 시드 로드만, UI 활용 없음 (기본 변형 자동 선택)
ExerciseMuscleMapping   // 시드 로드만, UI 활용 없음

// 사용자 데이터
User                    // 단일 사용자, id: 'me' 고정
WorkoutSession          // 운동 세션
SessionExercise         // 세션 내 종목
WorkoutSet              // 세트 기록
```

### 이 슬라이스에서 만들지 않는 테이블

`UserInjuryProfile`, `PainLog`, `Routine`, `RoutineExercise`, `PlannedWorkoutSession`, `PlannedExercise`, `WorkoutDeviation`, `RecommendationFeedback`, `RecommendationLog`, `VolumeSnapshot`, `MuscleVolumeTarget`, `UserExerciseVariationStats` — 단, **Dexie schema에는 정의해두되 지금은 비워둔다** (향후 슬라이스에서 채울 예정).

### 슬라이스 1에서 사용하는 타입 (TypeScript)

```typescript
// User
{
  id: 'me',
  body_weight_kg: number,    // 사용자 입력 (앱 첫 실행 시)
  unit_preference: 'kg' | 'lb',  // 기본 'kg'
  deload_mode_active: false,  // 슬라이스 1에서는 항상 false
  created_at: timestamp
}

// WorkoutSession
{
  id: string,                // UUID
  date: timestamp,           // 세션 시작 시점
  routine_id: null,          // 슬라이스 1에서는 항상 null
  planned_session_id: null,
  condition_score: null,     // 슬라이스 1에서는 입력 안 함
  sleep_quality: null,
  fatigue_level: null,
  time_limit_minutes: null,
  is_deload: false,
  notes: string,
  duration_seconds: number   // 종료 시 계산
}

// SessionExercise
{
  id: string,
  session_id: string,
  exercise_id: string,
  variation_id: string | null,  // 기본 변형 자동 선택 (is_default: true인 것)
  order: number
}

// WorkoutSet
{
  id: string,
  session_exercise_id: string,
  set_number: number,
  is_warmup: boolean,        // 사용자 체크박스
  weight_kg: number | null,  // 맨몸 운동은 null
  reps: number,
  rpe: null,                 // 슬라이스 1에서는 입력 안 함
  rir: null,
  set_type: 'normal',        // 슬라이스 1에서는 항상 'normal'
  load_type: 'external' | 'bodyweight',  // exercise에서 추론
  assistance_kg: null,
  body_weight_kg_snapshot: number | null,  // bodyweight 종목일 때 user 체중 기록
  notes: string,
  completed_at: timestamp
}
```

---

## 5. 프로젝트 구조

```
workout-app/
├── public/
│   ├── icon-192.png            # PWA 아이콘 (placeholder OK)
│   ├── icon-512.png
│   └── manifest.json           # (vite-plugin-pwa가 자동 생성)
├── src/
│   ├── db/
│   │   ├── schema.ts           # Dexie 클래스 정의
│   │   ├── seeds.ts            # (제공된 파일 그대로 사용)
│   │   ├── seed-loader.ts      # 첫 실행 시 시드 로드
│   │   └── repositories/
│   │       ├── exercises.ts    # 종목 조회 함수
│   │       ├── sessions.ts     # 세션 CRUD
│   │       └── sets.ts         # 세트 CRUD
│   ├── pages/
│   │   ├── ExerciseListPage.tsx
│   │   ├── WorkoutSessionPage.tsx
│   │   └── HistoryPage.tsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui 컴포넌트
│   │   ├── SetInput.tsx        # 세트 입력 UI (가장 중요)
│   │   ├── ExerciseCard.tsx    # 종목 목록 카드
│   │   ├── SessionExerciseBlock.tsx  # 세션 내 종목 블록
│   │   ├── LastSessionInfo.tsx # 직전 기록 표시
│   │   └── BottomNav.tsx       # 하단 탭바
│   ├── store/
│   │   ├── sessionStore.ts     # Zustand: 진행 중 세션
│   │   └── userStore.ts        # Zustand: User 정보
│   ├── types/
│   │   └── index.ts            # 타입 정의 (seeds.ts에서 export된 것 + 사용자 데이터 타입)
│   ├── utils/
│   │   ├── id.ts               # UUID 생성
│   │   ├── date.ts             # 날짜 포맷
│   │   └── load.ts             # set_load_kg() 등 (Slice 1에서는 단순 버전)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts              # vite-plugin-pwa 설정 포함
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 6. 화면별 명세

### 6.1 종목 목록 화면 (`/exercises`)

**목적**: 시드된 60개 종목을 보고, 검색하고, 운동 세션 시작 시 선택할 수 있게.

**UX 흐름**:
1. 상단에 검색 바
2. 카테고리 필터 칩 (가슴/등/어깨/하체/팔/코어) — 다중 선택
3. 종목 카드 그리드 (각 카드: 종목명, 주동근, 기구 아이콘/텍스트)
4. 종목 카드 탭 → "이 종목 추가" 모달 (현재 세션 없으면 "새 세션 시작" 버튼)

**구현 요점**:
- 종목명 검색은 부분 일치 (한글, 영어 모두)
- 카테고리 필터는 `Exercise.category`가 아니라 **주동근의 group**으로 분류
  - 가슴 = chest/chest_upper/chest_lower 주동근 종목
  - 등 = lats/rhomboids/erector_spinae 주동근 종목
  - 어깨 = shoulder_front/shoulder_side/shoulder_rear 주동근 종목
  - 하체 = quads/hamstrings/glutes/calves 주동근 종목
  - 팔 = biceps/triceps 주동근 종목
  - 코어 = abs/core 주동근 종목
- 종목 카드는 큰 터치 영역 (헬스장에서 한 손으로 탭하기 좋게)

### 6.2 운동 세션 화면 (`/session/:id` 또는 `/session/new`)

**목적**: 운동 중 사용. 종목 추가, 세트 입력, 세션 종료.

**UX 흐름**:
1. 세션 시작 (`/session/new`) → 새 WorkoutSession 생성 → 종목 추가 화면으로
2. 화면 상단: 세션 정보 (시작 시간, 경과 시간, 종목 수)
3. 본문: 추가된 종목 리스트 (각 종목은 펼침/접힘)
4. 종목 펼침 상태:
   - 종목명 + 변형명(있으면)
   - **직전 세션 기록 표시** (예: "지난 기록: 80kg × 8회 × 3세트, 7일 전")
   - 세트 입력 표 (세트 번호, 워밍업 체크, 무게, 횟수, 삭제 버튼)
   - "세트 추가" 버튼
5. 하단: "종목 추가" 버튼 + "세션 종료" 버튼

**세트 입력 UI (가장 중요)**:
- 무게 입력: 숫자 키패드 자동 활성화 (`inputMode="decimal"`)
- 횟수 입력: 숫자 키패드 자동 활성화 (`inputMode="numeric"`)
- 0.25kg 단위까지 입력 가능 (소수점 두 자리)
- 입력 직후 자동 저장 (debounce 500ms)
- 큰 글자/버튼 (헬스장 환경 고려)
- 워밍업 체크박스는 명확히 표시 (워밍업 세트는 다른 배경색)

**맨몸 운동 처리**:
- `Exercise.default_equipment === 'bodyweight'`이면 무게 입력란 숨김 또는 "체중 + α" 입력
- 슬라이스 1에서는 간단하게: 맨몸 종목은 무게 입력란 없이 횟수만 받음
- `WorkoutSet.load_type = 'bodyweight'`, `body_weight_kg_snapshot = user.body_weight_kg` 저장
- 중량 풀업 등 weighted_bodyweight는 슬라이스 1에서 지원 안 함 (단순화)

**세션 종료**:
- "세션 종료" 버튼 → 확인 다이얼로그
- `duration_seconds` 계산해서 저장
- 히스토리 화면으로 이동

### 6.3 히스토리 화면 (`/history`)

**목적**: 과거 세션 조회.

**UX 흐름**:
1. 상단: 캘린더 또는 월별 그룹 헤더
2. 세션 카드 목록 (최신순):
   - 날짜 + 요일
   - 종목 수, 총 세트 수, 운동 시간
   - 주요 종목 미리보기 (앞 2~3개)
3. 세션 카드 탭 → 세션 상세 화면

**세션 상세 화면**:
- 세션 정보 (날짜, 시간, 메모)
- 종목별 세트 표시 (읽기 전용)
- 우상단 "수정" 버튼 → 운동 세션 화면으로 이동 (편집 모드)
- "삭제" 버튼 → 확인 다이얼로그 → 세션 + 세트 모두 삭제

**슬라이스 1에서 안 만드는 것**:
- 그래프, 통계
- 검색/필터
- 종목별 추이 보기
- 캘린더 히트맵 (잔디)

---

## 7. 핵심 컴포넌트/유틸리티

### 7.1 Dexie 스키마

```typescript
// src/db/schema.ts
import Dexie, { Table } from 'dexie';
import type { /* 타입들 */ } from '../types';

export class WorkoutDB extends Dexie {
  // 시드 데이터 테이블
  bodyRegions!: Table<BodyRegion, string>;
  muscles!: Table<Muscle, string>;
  exercises!: Table<Exercise, string>;
  exerciseVariations!: Table<ExerciseVariation, string>;
  exerciseMuscleMappings!: Table<ExerciseMuscleMapping, [string, string]>;

  // 사용자 데이터 테이블
  users!: Table<User, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  sessionExercises!: Table<SessionExercise, string>;
  workoutSets!: Table<WorkoutSet, string>;

  // 향후 슬라이스용 (스키마만 정의, 사용 안 함)
  userInjuryProfiles!: Table<UserInjuryProfile, string>;
  painLogs!: Table<PainLog, string>;
  routines!: Table<Routine, string>;
  routineExercises!: Table<RoutineExercise, [string, string]>;

  constructor() {
    super('WorkoutDB');
    this.version(1).stores({
      // 시드
      bodyRegions: 'id, parent_id',
      muscles: 'id, group',
      exercises: 'id, name, category, default_equipment, alternative_group_id',
      exerciseVariations: 'id, exercise_id, is_default',
      exerciseMuscleMappings: '[exercise_id+muscle_id], exercise_id, muscle_id',

      // 사용자 데이터
      users: 'id',
      workoutSessions: 'id, date',
      sessionExercises: 'id, session_id, exercise_id',
      workoutSets: 'id, session_exercise_id, set_number',

      // 향후 슬라이스용
      userInjuryProfiles: 'id, user_id, body_region_id, status',
      painLogs: 'id, user_id, date, body_region_id',
      routines: 'id',
      routineExercises: '[routine_id+exercise_id], routine_id',
    });
  }
}

export const db = new WorkoutDB();
```

### 7.2 시드 로더

```typescript
// src/db/seed-loader.ts
import { db } from './schema';
import { seedData } from './seeds';

export async function ensureSeeded() {
  const existing = await db.exercises.count();
  if (existing > 0) return;

  await db.transaction('rw', [
    db.bodyRegions,
    db.muscles,
    db.exercises,
    db.exerciseVariations,
    db.exerciseMuscleMappings,
  ], async () => {
    await db.bodyRegions.bulkAdd(seedData.bodyRegions);
    await db.muscles.bulkAdd(seedData.muscles);
    await db.exercises.bulkAdd(seedData.exercises);
    await db.exerciseVariations.bulkAdd(seedData.exerciseVariations);
    await db.exerciseMuscleMappings.bulkAdd(seedData.exerciseMuscleMappings);
  });
}

export async function ensureUser() {
  const existing = await db.users.get('me');
  if (existing) return existing;

  const user: User = {
    id: 'me',
    body_weight_kg: 70,  // 기본값, 사용자가 설정 화면에서 변경 가능 (Slice 1에서는 하드코딩)
    unit_preference: 'kg',
    deload_mode_active: false,
    created_at: new Date().toISOString(),
  };
  await db.users.add(user);
  return user;
}
```

### 7.3 Session Store (Zustand)

```typescript
// src/store/sessionStore.ts
import { create } from 'zustand';

interface SessionState {
  currentSessionId: string | null;
  startSession: () => Promise<string>;
  endSession: () => Promise<void>;
  addExercise: (exerciseId: string) => Promise<void>;
  // ... 세트 CRUD는 직접 repository 호출
}

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSessionId: null,
  startSession: async () => { /* WorkoutSession 생성, ID 반환 */ },
  endSession: async () => { /* duration 계산, currentSessionId 초기화 */ },
  addExercise: async (exerciseId) => { /* SessionExercise 생성 */ },
}));
```

### 7.4 직전 기록 조회

```typescript
// src/db/repositories/sessions.ts
export async function getLastSessionForExercise(exerciseId: string) {
  // 최근 SessionExercise 중 해당 exercise_id 인 것의 가장 최근 1개
  const recentSessions = await db.workoutSessions
    .orderBy('date')
    .reverse()
    .toArray();

  for (const session of recentSessions) {
    const sessEx = await db.sessionExercises
      .where('session_id').equals(session.id)
      .and(se => se.exercise_id === exerciseId)
      .first();
    if (sessEx) {
      const sets = await db.workoutSets
        .where('session_exercise_id').equals(sessEx.id)
        .toArray();
      return { session, sessionExercise: sessEx, sets };
    }
  }
  return null;
}
```

이 함수가 종목 추가 시 호출되어 "지난 기록: 80kg × 8회 × 3세트, 7일 전" 메시지를 만든다.

### 7.5 부하 계산 헬퍼

```typescript
// src/utils/load.ts
import type { WorkoutSet } from '../types';

export function setLoadKg(set: WorkoutSet): number {
  if (set.load_type === 'bodyweight') {
    return set.body_weight_kg_snapshot ?? 0;
  }
  return set.weight_kg ?? 0;
}
```

Slice 1에서는 weighted_bodyweight, assisted_bodyweight 케이스가 없으므로 이 정도면 충분. 향후 슬라이스에서 확장.

---

## 8. PWA 설정

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '운동 기록',
        short_name: '운동',
        description: '근력 운동 기록 + 지능형 추천',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
});
```

### 아이콘

- `public/icon-192.png`, `public/icon-512.png` placeholder로 생성 (단색 배경 + 텍스트 "운동"이면 충분)
- 향후 디자인 개선

---

## 9. 검증 시나리오 (수동 테스트)

구현 완료 후 다음 시나리오가 모두 동작해야 한다:

**시나리오 A: 첫 실행 + 시드 로드**
1. 앱 첫 실행 → IndexedDB 자동 초기화
2. 종목 목록 화면에 60개 종목이 보임
3. 검색창에 "벤치" 입력 → 벤치프레스 관련 종목만 필터링
4. "가슴" 카테고리 칩 탭 → 가슴 운동만 표시

**시나리오 B: 운동 세션 진행**
1. 종목 목록에서 "바벨 벤치프레스" 탭 → "새 세션 시작" → 종목 추가됨
2. 첫 번째 세트: 무게 60, 횟수 5, 워밍업 체크 → 저장
3. 두 번째 세트: 무게 80, 횟수 8, 워밍업 해제 → 저장
4. "세트 추가" → 세 번째 세트 입력
5. "종목 추가" → "덤벨 컬" 추가
6. 덤벨컬 세트 입력
7. "세션 종료" → 히스토리로 이동

**시나리오 C: 직전 기록 자동 표시**
1. 시나리오 B 완료 후
2. 새 세션 시작 → "바벨 벤치프레스" 추가
3. **직전 기록이 자동으로 표시되어야 함**: "지난 기록: 80kg × 8회 (본세트 2개), 0일 전"

**시나리오 D: 히스토리 보기/수정/삭제**
1. 히스토리 화면 → 어제/오늘 세션이 보임
2. 세션 카드 탭 → 상세 보기 (모든 세트가 정확히 표시)
3. "수정" 탭 → 세션 화면으로 → 세트 무게 변경 → 자동 저장
4. 히스토리로 돌아가서 변경 사항 반영 확인
5. 세션 "삭제" → 확인 → 사라짐

**시나리오 E: 맨몸 운동**
1. 종목 목록에서 "풀업" 또는 "푸쉬업" 추가
2. 무게 입력란이 안 보이고 횟수만 입력
3. 저장 후 `set_load_kg`이 사용자 체중을 반환하는지 확인

**시나리오 F: PWA 설치**
1. 안드로이드 Chrome에서 앱 URL 접속
2. "홈 화면에 추가" 프롬프트 확인
3. 설치 후 홈 화면 아이콘으로 진입
4. 오프라인에서도 앱 동작 (서비스 워커 캐싱)

**시나리오 G: 데이터 영속성**
1. 세션 진행 중 브라우저 닫기
2. 다시 열기 → 진행 중이던 세션 또는 데이터 그대로 유지

---

## 10. 작업 가이드 (Claude Code에게)

### 작업 순서 권장

1. **프로젝트 초기화**: Vite + React + TypeScript + Tailwind + PWA 설정
2. **타입 정의**: `seeds.ts`에서 export된 타입 + 추가 사용자 데이터 타입
3. **Dexie 스키마**: 모든 테이블 정의 (사용 안 하는 것도 포함)
4. **시드 로더 + User 초기화**: 앱 진입 시 자동 실행
5. **라우팅 + 하단 탭바**: 3개 화면을 오갈 수 있게 우선 골격
6. **종목 목록 화면**: 가장 단순 — 데이터 표시 + 검색
7. **운동 세션 화면**: 가장 복잡 — 단계별로
   - 7-1. 세션 생성 + 종목 추가
   - 7-2. 세트 입력 UI + 자동 저장
   - 7-3. 직전 기록 표시
   - 7-4. 세션 종료
8. **히스토리 화면**: 목록 + 상세 + 수정/삭제
9. **검증 시나리오 A~G 수동 테스트**

### 단위 테스트 권장 영역

이 슬라이스는 작아서 단위 테스트가 필수는 아니지만, 다음은 테스트하면 좋다:

- `getLastSessionForExercise()`: 직전 기록 조회 로직
- `setLoadKg()`: 부하 계산
- Repository 함수의 CRUD (특히 세션 삭제 시 cascade)

### UX 디테일

- **모바일 우선**: 모든 UI는 세로 모드 폰 (375~430px 너비) 기준
- **큰 터치 영역**: 버튼은 최소 44×44px
- **숫자 입력**: `<input type="number" inputMode="decimal">` 활용
- **자동 저장**: 사용자가 "저장" 버튼을 누르지 않아도 입력 즉시 저장 (debounce 500ms)
- **하단 네비게이션 바**: 종목/세션/히스토리 3개 탭, 진행 중 세션이 있으면 세션 탭에 빨간 점

### 코드 스타일

- TypeScript strict mode
- 함수형 컴포넌트만 사용
- 큰 컴포넌트는 분할 (한 파일 200줄 이하 권장)
- 비동기 로직은 async/await
- 에러 처리: try/catch + 사용자에게 토스트 메시지

### 의도적으로 단순화한 부분 (Slice 2~3에서 개선 예정)

- `body_weight_kg`는 user 테이블에 하드코딩된 70kg. 사용자가 수정하는 UI는 Slice 2에서.
- 변형 선택 UI 없음. 모든 SessionExercise에 `is_default=true`인 variation 자동 할당.
- 세션 중간에 앱이 종료되면 "진행 중 세션 복구"는 단순히 가장 최근 세션이 종료 안 된 것으로 판단 (정교한 복구 UX는 나중).
- 카테고리 필터의 "가슴/등/어깨..." 분류는 클라이언트에서 매핑. 별도 카테고리 테이블 없음.

---

## 11. 완료 조건

다음을 모두 만족하면 Slice 1 완료:

- [ ] 검증 시나리오 A~G 모두 통과
- [ ] 안드로이드 Chrome에서 PWA 설치 가능
- [ ] 오프라인에서도 모든 기능 동작 (앱 진입, 종목 조회, 세션 진행, 히스토리 보기)
- [ ] IndexedDB 데이터가 브라우저 종료/재시작 후에도 유지
- [ ] TypeScript 컴파일 에러 없음
- [ ] README.md에 다음 포함:
  - 설치/실행 방법
  - 안드로이드 폰에서 PWA로 설치하는 방법
  - 데이터가 브라우저 IndexedDB에 저장된다는 안내
  - 다음 슬라이스에서 추가될 기능 미리보기

---

## 12. 참고 파일

다음 파일은 이 슬라이스 작업 시 함께 제공된다:

- `seeds.ts`: 시드 데이터 (60개 종목 + 변형 + 매핑). **이 파일은 수정하지 말 것**. `src/db/seeds.ts`로 그대로 복사해서 사용.
- `my-injury-profiles.ts`: 사용자 부상 프로필. **Slice 1에서는 사용 안 함**. Slice 3에서 활용.
- `workout-app-spec-v4.4.md`: 전체 spec. **이 슬라이스 작업 시에는 참고용으로만 읽고, 이 슬라이스 범위 외 기능을 만들지 말 것.**

질문이 생기면 추측하지 말고 명시적으로 물어볼 것. 특히 다음 상황:
- 명세에 없는 UI 요소를 만들어야 할지 애매할 때
- "이게 더 좋을 것 같은데..." 싶은 변경을 하고 싶을 때
- 외부 라이브러리를 추가해야 할 때
