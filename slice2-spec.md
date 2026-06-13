# 운동 기록 앱 — Phase 1 / Slice 2 구현 명세

> **이 문서를 읽는 AI 코드 에이전트에게**: 이 문서는 Slice 1이 완료된 상태에서 시작하는 두 번째 슬라이스 명세서다. Slice 1의 기록 기능 위에 **루틴/템플릿, 백업/복원, RPE/RIR 입력, 세션 컨디션 입력**을 추가한다. **반드시 이 문서의 "범위 외" 섹션을 먼저 확인하라.** 통증/부상 입력은 Slice 3, 추천 엔진은 Phase 2 이후다.

---

## 1. 슬라이스 컨텍스트

**전체 그림에서의 위치**:
- Phase 1 (메모 앱 대체) / Slice 2
- Slice 1: 기본 기록/조회/수정 (✅ 완료)
- **Slice 2: 편의성 + 데이터 안전 (이 문서)**
- Slice 3: 통증/부상 입력 (다음)
- Phase 2~: 추천 엔진 (먼 미래)

**Slice 1 완료 상태에서 시작**:
- 60개 종목 시드 데이터 로드되어 있음
- 운동 세션 시작/종료, 세트 추가/수정/삭제 동작
- 종목 추가/삭제 동작
- 히스토리 보기 + 과거 세션 편집 동작
- IndexedDB 영속성 + PWA 설치 가능
- 영구 저장 권한 요청 동작

**Slice 2의 목적**:
- 매일 쓰기 편한 수준으로 끌어올림
- **데이터 손실 위험을 명시적으로 줄임** (백업 기능)
- 추천 엔진에 필요한 데이터(RPE/RIR, 컨디션) 수집 시작

---

## 2. 이 슬라이스의 범위

### 만들 것

**신규 화면 1개 + 기존 화면 확장**:

1. **신규: 루틴 관리 화면** (`/routines`)
   - 루틴 목록 보기
   - 새 루틴 생성 / 편집 / 삭제
2. **신규: 설정 화면** (`/settings`)
   - 사용자 체중 입력 (지금까지 70kg 하드코딩)
   - 단위 전환 (kg ↔ lb)
   - JSON 백업 / 복원
   - 저장공간 사용량 표시 (`navigator.storage.estimate()`)
3. **확장: 운동 세션 화면**
   - "루틴에서 시작" 옵션 추가
   - 세트 입력에 RPE/RIR 필드 추가 (선택 입력)
   - 세션 시작 시 컨디션 입력 (선택)
4. **확장: 히스토리 화면**
   - 컨디션/RPE가 있는 세션은 표시

**신규 기능**:
- 루틴 CRUD
- 루틴 → 세션 시작 (RoutineExercise를 SessionExercise로 자동 복제)
- JSON 내보내기 (전체 데이터)
- JSON 가져오기 (검증 후 덮어쓰기 또는 병합)
- RPE/RIR 입력 (선택, 1~10 스케일)
- 세션 컨디션 입력 (선택, 5점 척도)
- 단위 전환 (kg ↔ lb)
- 저장공간 표시

**기존 동작에 영향이 없도록**:
- Slice 1 데이터는 그대로 호환되어야 함
- 새로 추가되는 필드는 모두 nullable (RPE/RIR/컨디션 미입력 시 null)
- 기존 세트는 RPE/RIR 없이 그대로 저장됨

### 범위 외 (의도적으로 안 만드는 것)

다음은 Slice 3 또는 Phase 2 이후 작업. **만들지 말 것**:

- ❌ 통증 로그 입력 (Slice 3)
- ❌ 무통증 체크인 (Slice 3)
- ❌ 부상 프로필 등록/활용 (Slice 3)
- ❌ 중량 추천 / 디로딩 판단 / 볼륨 계산 (Phase 2 이후)
- ❌ 보조근 환산, MEV/MAV/MRV (Phase 2A)
- ❌ 부위별 볼륨 통계, 그래프 (Phase 2A)
- ❌ 종목별 추이 그래프 (Phase 2A)
- ❌ 추천 계획 vs 실제 수행 비교 (Phase 2B)
- ❌ 종목 변형 추천 (Phase 3)
- ❌ 휴식 타이머 (Phase 5)
- ❌ 슈퍼셋, 드롭셋 UI (현재는 set_type 필드만 있고 입력 UI 없음, Phase 5)
- ❌ 클라우드 동기화 (Phase 5)

> **중요**: Slice 1에서와 동일한 원칙. "이왕 만드는 김에 이것도..."는 금지. 슬라이스가 작아야 검토와 반복이 빠르다.

---

## 3. 기술 스택

**Slice 1과 동일**. 새로 추가되는 것:

- 파일 다운로드/업로드: 브라우저 기본 API (`Blob`, `URL.createObjectURL`, `<input type="file">`)
- 외부 라이브러리 추가 없음

**확인**: Slice 1에서 React 19, Vite 8, Dexie, Zustand, React Router v6, Tailwind v3 사용 중. 그대로 유지.

---

## 4. 데이터 모델

### 새로 사용하는 테이블

Slice 1에서는 schema만 정의하고 사용하지 않았던 테이블을 이제 사용한다.

```typescript
// Routine
{
  id: string;
  name: string;            // 예: "푸시 데이 A", "다리 운동"
  created_at: timestamp;
}

// RoutineExercise (Routine과 Exercise 연결)
{
  routine_id: string;
  exercise_id: string;
  variation_id: string | null;     // 기본 변형 자동 선택
  order: number;
  default_sets: number;            // 이 종목의 기본 세트 수 (예: 3)
  superset_group: number | null;   // Slice 2에서는 항상 null (Phase 5에서 사용)
}
```

### 기존 테이블 확장 (Slice 1에서 nullable로 정의되어 있던 필드들)

이미 schema에 정의되어 있고 Slice 1에서 항상 null로 저장하던 필드들을 이제 입력 받기 시작한다.

```typescript
// WorkoutSession - 새로 입력받는 필드
{
  // ... 기존 필드들
  condition_score: 1 | 2 | 3 | 4 | 5 | null;   // 선택 입력
  sleep_quality: 1 | 2 | 3 | 4 | 5 | null;     // 선택 입력
  fatigue_level: 1 | 2 | 3 | 4 | 5 | null;     // 선택 입력
  time_limit_minutes: number | null;            // 선택 입력
  routine_id: string | null;                    // 루틴에서 시작했으면 ID 저장
}

// WorkoutSet - 새로 입력받는 필드
{
  // ... 기존 필드들
  rpe: number | null;          // 1~10, 선택
  rir: number | null;          // 0~5, 선택
}
```

### User 테이블 활용

Slice 1에서는 70kg 하드코딩이었던 부분을 실제 사용자 입력으로 받기 시작.

```typescript
{
  id: 'me',
  body_weight_kg: number,         // 설정 화면에서 입력
  unit_preference: 'kg' | 'lb',   // 설정 화면에서 전환
  deload_mode_active: false,      // Slice 2에서도 항상 false (Phase 4)
  created_at: timestamp
}
```

---

## 5. 화면별 명세

### 5.1 신규 화면: 루틴 관리 (`/routines`)

**목적**: 자주 하는 운동 묶음을 템플릿으로 저장하고 재사용.

**UX 흐름 (루틴 목록)**:
1. 상단: "+ 새 루틴" 버튼
2. 본문: 저장된 루틴 카드 목록
   - 카드: 루틴 이름, 종목 수, 마지막 사용일
   - 카드 탭 → 루틴 상세/편집 화면
   - 카드 우측 점 3개 메뉴: "이 루틴으로 시작", "편집", "삭제"
3. 빈 상태: "아직 루틴이 없습니다. 자주 하는 운동을 묶어 루틴으로 만들어보세요."

**UX 흐름 (루틴 편집)**:
1. 루틴 이름 입력
2. 종목 추가 버튼 → 종목 목록에서 선택
3. 추가된 종목 리스트:
   - 종목명 + 기본 세트 수 입력 (스피너 또는 +/- 버튼, 기본값 3)
   - 순서 변경 (드래그 또는 위/아래 버튼)
   - 삭제 버튼
4. 하단: "저장" / "취소" 버튼

**구현 요점**:
- 루틴 저장 시 `Routine` + `RoutineExercise` 두 테이블에 트랜잭션으로 저장
- 변형은 항상 기본 변형(`is_default: true`)으로 자동 선택 (Slice 2에서 변형 선택 UI 없음)
- 루틴 삭제 시 `RoutineExercise`도 cascade 삭제

### 5.2 운동 세션 화면 확장

**신규: 세션 시작 모드 선택**

`/session/new` 진입 시 모달 또는 화면:

> "어떻게 시작하시겠어요?"
> - 빈 세션 시작 (Slice 1 방식)
> - 루틴에서 시작 → 루틴 선택 화면

**루틴에서 시작**:
- 루틴 선택 → 새 `WorkoutSession` 생성 (routine_id 저장)
- 루틴의 모든 `RoutineExercise`를 `SessionExercise`로 자동 복제 (order 유지)
- 세트는 아직 입력 안 됨. 사용자가 각 종목에서 세트 추가하며 진행
- 사용자가 종목을 추가/제거하면 그게 실제 수행이 됨 (RoutineExercise는 변경 없음)

**신규: 세션 시작 시 컨디션 입력 (선택)**

세션 시작 직후 또는 첫 세트 입력 전에 한 번 묻는 단계. 건너뛰기 가능.

- 컨디션 (1~5): 😴 / 🙁 / 😐 / 🙂 / 💪
- 수면 (선택, 1~5): 동일 스케일
- 피로도 (선택, 1~5): 동일 스케일 (반대로 작동, 5가 가장 피곤)
- 시간 제한 (선택): "30분" / "45분" / "60분" / "90분" / 직접 입력 / 없음

UI: 카드 형태, 각 항목은 이모지/숫자 5단계 탭 버튼. 모두 건너뛸 수 있는 "나중에" 버튼.

**신규: 세트 입력에 RPE/RIR 필드 추가**

세트 입력 UI 확장:
- 무게 / 횟수 / **RPE 또는 RIR (선택)**
- RPE/RIR은 한 번에 하나만 입력 (사용자가 선호하는 것 선택)
- 설정 화면에서 기본 표시를 RPE 또는 RIR로 선택 가능
- 빠른 선택 버튼: RPE 7 / 8 / 9 / 10 (또는 RIR 3 / 2 / 1 / 0)
- "직접 입력" 옵션도 제공

> **참고**: RPE와 RIR은 거의 같은 개념의 다른 표현. RPE = 10 - RIR. 데이터는 둘 다 저장 가능하지만, UI에서 둘 다 입력시키지는 않음.

### 5.3 신규 화면: 설정 (`/settings`)

**섹션 1: 프로필**
- 체중 입력 (kg, 0.1 단위)
- 단위 선택 (kg / lb)
- 단위 변경 시 안내: "기존 데이터는 kg 기준으로 저장됩니다. 표시만 변환됩니다."

**섹션 2: 입력 환경**
- 기본 강도 표기: RPE 또는 RIR (둘 중 하나만 표시)
- 자동 저장 debounce 시간 (기본 500ms, 변경 가능하게 할지는 선택)

**섹션 3: 데이터 관리**
- "전체 데이터 백업 (JSON 다운로드)" 버튼
- "백업 파일에서 복원" 버튼 → 파일 선택 다이얼로그
- 복원 모드 선택: "덮어쓰기" 또는 "병합 (중복은 건너뜀)"
- 위험 경고: "복원은 되돌릴 수 없습니다. 현재 데이터를 먼저 백업하세요."

**섹션 4: 저장공간**
- 현재 사용량 / 가용 용량 표시 (예: "1.2MB / 6.4GB 사용 중")
- 영구 저장 권한 상태 표시 ("✅ 영구 저장 활성화됨" 또는 "⚠️ 영구 저장 미활성화 - 정기 백업을 권장합니다")
- 영구 저장 재요청 버튼 (권한 없을 때)

**섹션 5: 정보**
- 앱 버전
- 데이터베이스 버전
- 사용자 ID (디버깅용)
- "데이터 모두 삭제" 버튼 (위험, 2단계 확인)

---

## 6. 핵심 기능 명세

### 6.1 JSON 백업/복원

**백업 형식**:

```json
{
  "format_version": "1.0",
  "exported_at": "2026-06-08T12:34:56.789Z",
  "app_version": "0.2.0",
  "data": {
    "users": [...],
    "workoutSessions": [...],
    "sessionExercises": [...],
    "workoutSets": [...],
    "routines": [...],
    "routineExercises": [...]
  }
}
```

**백업에 포함하지 않는 것**:
- 시드 데이터 (BodyRegion, Muscle, Exercise, ExerciseVariation, ExerciseMuscleMapping)
  - 이유: 앱 업데이트 시 시드가 바뀌므로 복원 시 충돌. 시드는 앱이 자동 로드.
- 사용자가 추가한 커스텀 종목 (Slice 2에서는 미구현, Phase 1 이후 결정)

**백업 트리거**:
- 사용자가 설정 화면에서 수동 트리거
- 자동 백업은 없음 (Phase 5 클라우드 동기화 시 추가)

**다운로드 방식**:
```typescript
const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `workout-backup-${formatDate(new Date())}.json`;
a.click();
URL.revokeObjectURL(url);
```

**복원 검증**:
- `format_version` 확인 (호환되지 않으면 거부)
- 각 테이블 데이터의 스키마 검증 (필수 필드 존재, 타입 일치)
- 참조 무결성 검증 (SessionExercise의 session_id가 WorkoutSession에 존재하는지 등)
- 검증 실패 시 명확한 에러 메시지

**복원 모드**:
- **덮어쓰기**: 기존 사용자 데이터 모두 삭제 후 백업 데이터로 교체. 시드는 유지.
- **병합**: 백업에 있는데 현재 DB에 없는 레코드만 추가. ID 충돌 시 건너뜀.
- 복원 실패 시 부분 변경 없이 원복되도록 트랜잭션으로 처리

### 6.2 단위 전환 (kg ↔ lb)

**저장 원칙**: **데이터베이스에는 항상 kg으로 저장**. 표시할 때만 변환.

```typescript
function displayWeight(kg: number, unit: 'kg' | 'lb'): string {
  if (unit === 'lb') return (kg * 2.20462).toFixed(1) + ' lb';
  return kg.toFixed(2) + ' kg';
}

function parseInputWeight(input: number, unit: 'kg' | 'lb'): number {
  if (unit === 'lb') return input / 2.20462;
  return input;
}
```

**UI**: 무게 입력 필드 옆에 현재 단위 표시. 단위 변경 시 입력 중인 값도 변환.

### 6.3 저장공간 표시

```typescript
async function getStorageInfo() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return {
    usageMB: (usage! / 1024 / 1024).toFixed(2),
    quotaMB: (quota! / 1024 / 1024).toFixed(0),
    percentUsed: ((usage! / quota!) * 100).toFixed(2),
  };
}

async function checkPersistedStatus() {
  if (!navigator.storage?.persisted) return false;
  return await navigator.storage.persisted();
}
```

설정 화면에서 호출하여 표시.

### 6.4 루틴에서 세션 시작 로직

```typescript
async function startSessionFromRoutine(routineId: string): Promise<string> {
  const routine = await db.routines.get(routineId);
  if (!routine) throw new Error('Routine not found');

  const routineExercises = await db.routineExercises
    .where('routine_id').equals(routineId)
    .sortBy('order');

  const sessionId = generateId();
  const now = new Date().toISOString();

  await db.transaction('rw', [db.workoutSessions, db.sessionExercises], async () => {
    // 진행 중 세션 중복 방지: duration_seconds === null인 세션이 있는지 확인
    const ongoing = await db.workoutSessions
      .filter(s => s.duration_seconds === null)
      .first();
    if (ongoing) {
      throw new Error('이미 진행 중인 세션이 있습니다.');
    }

    await db.workoutSessions.add({
      id: sessionId,
      user_id: 'me',
      date: now,
      routine_id: routineId,
      planned_session_id: null,
      condition_score: null,
      sleep_quality: null,
      fatigue_level: null,
      time_limit_minutes: null,
      is_deload: false,
      notes: null,
      duration_seconds: null,  // 진행 중
    });

    for (const re of routineExercises) {
      await db.sessionExercises.add({
        id: generateId(),
        session_id: sessionId,
        exercise_id: re.exercise_id,
        variation_id: re.variation_id,
        order: re.order,
      });
    }
  });

  return sessionId;
}
```

---

## 7. 검증 시나리오 (수동 테스트)

**시나리오 A: 루틴 생성 및 사용**
1. 루틴 관리 화면 진입
2. "+ 새 루틴" → 이름 "푸시 데이"
3. 종목 추가: 벤치프레스(4세트), 인클라인 덤벨(3세트), 트라이셉 푸쉬다운(3세트)
4. 저장
5. 운동 세션 시작 → "루틴에서 시작" → "푸시 데이" 선택
6. 3개 종목이 자동으로 추가되어 있는지 확인
7. 각 종목에 세트 입력 후 세션 종료

**시나리오 B: RPE/RIR 입력**
1. 새 세션 시작
2. 벤치프레스 추가, 첫 세트 입력 (80kg × 5회, RPE 8)
3. 두 번째 세트 (80kg × 5회, RPE 9)
4. 세션 종료 후 히스토리에서 RPE 표시 확인

**시나리오 C: 세션 컨디션 입력**
1. 새 세션 시작
2. 컨디션 입력 모달: 컨디션 4, 수면 3, 피로도 2 입력
3. 세션 진행 후 종료
4. 히스토리에서 컨디션 정보 확인

**시나리오 D: 백업 및 복원**
1. 설정 화면 → 백업 다운로드
2. 다운로드한 JSON 파일 확인 (열어서 데이터 존재 확인)
3. 일부 세션 삭제
4. 설정 → 복원 → 백업 파일 선택 → "덮어쓰기"
5. 삭제했던 세션이 복원되었는지 확인

**시나리오 E: 단위 전환**
1. 설정에서 단위를 lb로 변경
2. 히스토리의 무게가 lb로 표시되는지 확인 (80kg → 176.4lb)
3. 새 세션에서 무게 입력 시 lb 단위로 입력
4. 다시 kg으로 전환해도 데이터가 일관되게 표시

**시나리오 F: 저장공간 표시**
1. 설정 화면 → 저장공간 섹션
2. 현재 사용량과 한도가 표시됨
3. 영구 저장 권한 상태가 표시됨 (PWA 설치된 경우 ✅)

**시나리오 G: 잘못된 백업 파일 처리**
1. 빈 텍스트 파일 또는 형식이 다른 JSON으로 복원 시도
2. 명확한 에러 메시지 표시 ("올바른 백업 파일이 아닙니다")
3. 기존 데이터는 변경되지 않음

**시나리오 H: 진행 중 세션 + 루틴 시작 충돌**
1. 빈 세션 시작 (종료하지 않음)
2. 다른 화면 갔다가 다시 루틴 화면에서 "이 루틴으로 시작" 시도
3. "이미 진행 중인 세션이 있습니다" 안내 + 거부

---

## 8. 작업 가이드 (Claude Code에게)

### 작업 순서 권장

1. **타입 확장**: 기존 `WorkoutSession`, `WorkoutSet` 타입에 새 필드 사용 시작 (이미 schema에 정의됨)
2. **설정 화면 골격**: 가장 단순 — 라우팅 + 빈 화면부터
3. **백업 기능**: 다운로드만 먼저
4. **복원 기능**: 검증 + 트랜잭션
5. **체중/단위 설정**: 사용자 입력 받기 시작
6. **저장공간 표시**: `navigator.storage.estimate()` 활용
7. **루틴 목록 화면**: CRUD
8. **루틴 편집 화면**: 종목 추가/제거/순서 변경
9. **세션 시작 모드 선택**: 빈 세션 vs 루틴
10. **컨디션 입력 모달**: 세션 시작 시
11. **RPE/RIR 입력**: 세트 입력 UI 확장
12. **히스토리 표시 보강**: 새 필드 표시
13. **검증 시나리오 A~H 수동 테스트**

### 보고 시점 (Slice 1과 동일 원칙)

1. 타입 확장 + 설정 화면 골격 완료 후
2. 백업/복원 동작 확인 후
3. 루틴 관리 화면 완료 후
4. 세션 화면 확장 완료 후
5. 검증 시나리오 1개 통과 후

### Slice 1에서 발견된 패턴 활용

Slice 1 작업 중 만든 다음 패턴을 그대로 활용:
- `setLoadKg()` 헬퍼
- `getLastSessionForExercise()` 조회
- 진행 중 세션 자동 복구 로직 (이미 동작 중)
- 종목 삭제 cascade 로직 (RoutineExercise 삭제에도 동일 패턴)

### 의도적 단순화

- **변형 선택 UI 없음**: 루틴 편집 시에도 항상 기본 변형 자동 선택. 변형 선택 UI는 Phase 2 이후.
- **슈퍼셋/드롭셋 UI 없음**: `superset_group` 필드는 항상 null. Phase 5.
- **자동 백업 없음**: 사용자가 수동 트리거. 클라우드 백업은 Phase 5.
- **커스텀 종목 추가 없음**: Slice 2에서도 종목은 시드 데이터만. 커스텀 종목은 별도 결정 필요.

---

## 9. 카테고리 필터 매핑 (Slice 1에서 보강된 내용 명시)

종목 목록의 카테고리 필터는 다음 매핑을 사용한다 (v4.5 명세):

- **가슴**: chest, chest_upper, chest_lower
- **등**: lats, traps_upper, traps_mid, rhomboids, erector_spinae
- **어깨**: shoulder_front, shoulder_side, shoulder_rear
- **하체**: quads, hamstrings, glutes, calves
- **팔**: biceps, triceps, forearms
- **코어**: abs, core, obliques

Slice 1 작업 중 누락되었던 traps_upper, traps_mid (→ 등), forearms (→ 팔), obliques (→ 코어)이 모두 포함됨.

루틴 편집 화면에서 종목 추가 시에도 이 매핑을 사용한다.

---

## 10. 완료 조건

- [ ] 검증 시나리오 A~H 모두 통과
- [ ] 기존 Slice 1 데이터가 영향 없이 그대로 표시되고 동작
- [ ] 백업 → 데이터 삭제 → 복원 → 원본과 동일한지 확인 (round-trip 검증)
- [ ] 단위 전환 후 다시 원래대로 전환해도 데이터 일관성 유지
- [ ] TypeScript 컴파일 에러 없음
- [ ] PWA 설치 상태에서 모든 신규 기능 동작

---

## 11. Slice 3 미리보기 (참고용, 만들지 말 것)

Slice 2 완료 후 작업할 내용 — **지금은 만들지 말 것**:

- 통증 로그 입력 (`PainLog`)
- 무통증 체크인
- 부상 프로필 등록 (`UserInjuryProfile`) — `my-injury-profiles.ts`의 데이터 import
- 통증 추이 그래프

Slice 2의 컨디션 입력과 비슷한 UX 패턴을 재사용하게 될 것.

---

## 12. 참고 파일

다음은 모두 이전에 작성된 파일. 이 슬라이스 작업 시 참고:

- `CLAUDE.md`: 프로젝트 전반 컨텍스트 (React 19로 업데이트됨)
- `workout-app-spec-v4.5.md`: 전체 spec
- `seeds.ts`: 시드 데이터 (수정 금지)
- `my-injury-profiles.ts`: 부상 프로필 (Slice 3에서 사용)
- `slice1-spec.md`: 이전 슬라이스 명세 (참고용)

질문이 생기면 추측하지 말고 명시적으로 물어볼 것. 특히 다음 상황:
- 명세에 없는 UI 요소를 만들어야 할지 애매할 때
- 외부 라이브러리를 추가해야 할 때
- 데이터 마이그레이션이 필요한 결정이 보일 때
