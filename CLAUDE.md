# CLAUDE.md

> 이 파일은 Claude Code가 작업 시작 시 자동으로 읽는 프로젝트 컨텍스트다. **세션마다 반복 설명할 필요가 없는 것들**만 적는다. 슬라이스별 상세 작업 명세는 `slice{N}-spec.md`에서 별도로 관리한다.

---

## 프로젝트 정체성

**무엇**: 안드로이드 폰에서 사용할 1인용 근력 운동 기록 PWA.

**핵심 차별점**: 단순 기록 앱이 아니라, 사용자의 부상 이력과 운동 패턴을 학습하여 **상황에 맞는 중량/볼륨/종목 추천**을 제공한다. 보조근 자극을 분할 세트(fractional set)로 환산하여 부위별 주간 볼륨을 정확히 추적한다.

**사용자**: 1명 (개발자 본인). 다중 사용자 지원 없음.

**현재 단계**: Phase 1 / Slice 1 — 메모 앱 대체 수준의 최소 기능 구현 중. 추천 엔진은 Phase 2 이후.

---

## 불변 결정사항 (변경 시 명시적으로 합의 필요)

### 기술 스택
- **언어**: TypeScript (strict mode)
- **프레임워크**: React 19 + Vite
- **로컬 DB**: Dexie.js (IndexedDB 래퍼). raw IndexedDB API 사용 금지.
- **상태 관리**: Zustand. Redux/MobX/Recoil 금지.
- **라우팅**: React Router v6
- **스타일**: Tailwind CSS + shadcn/ui. styled-components, emotion 금지.
- **날짜**: date-fns. moment.js 금지.
- **PWA**: vite-plugin-pwa
- **배포 형태**: PWA (네이티브 앱 아님)
- **백엔드**: 없음. 모든 데이터 로컬 IndexedDB.

### 데이터 모델 원칙
- 모든 ID는 string (UUID).
- 시간은 ISO 8601 문자열로 저장.
- **직접 볼륨(direct)과 피로도 볼륨(effective)을 절대 한 숫자로 뭉치지 않는다.**
  - direct: 성장 볼륨 판단
  - effective: 보조근 포함 자극량
  - fatigue_score: 회복 부담
- **사용자가 입력하는 무게는 set.weight_kg에 직접 저장하지만, 추천 로직에서는 항상 `setLoadKg()` 헬퍼를 통해 부하 계산.**
  - 이유: weighted_bodyweight, assisted_bodyweight 케이스에서 weight_kg 직접 참조하면 부정확.

### 안전 우선 원칙
- **통증/부상 신호는 다른 어떤 신호보다 우선한다.**
- **안전 필터는 중량을 올리지 않는다.** 안전 상한선을 적용하는 로직 (min() 패턴).
- 디로딩/감량 추천을 안전 필터가 다시 증량으로 덮어쓰지 않는다.
- 앱은 의료적 진단을 하지 않는다. "전문가 상담 고려" 수준의 안내만.

---

## 코드 스타일 및 컨벤션

- 함수형 컴포넌트만 사용 (class 컴포넌트 금지)
- 한 파일 200줄 초과 시 분할 검토
- 비동기는 async/await (콜백 체인 금지)
- 에러 처리: try/catch + 사용자에게 토스트 메시지
- 파일명: 컴포넌트는 PascalCase.tsx, 유틸리티는 camelCase.ts
- 폴더 구조: `src/{db,pages,components,store,types,utils}` 기본 골격 유지
- 한국어 주석 OK (사용자가 한국어 사용자)

### 네이밍 규칙
- DB 테이블/필드: snake_case (예: `body_weight_kg`, `is_warmup`)
- TypeScript 타입/인터페이스: PascalCase (예: `WorkoutSet`, `ExerciseVariation`)
- 함수: camelCase (예: `setLoadKg`, `getLastSessionForExercise`)
- 상수: UPPER_SNAKE_CASE (예: `SET_TYPE_FATIGUE_MULTIPLIER`)

### TypeScript 가이드
- strict mode 활성화 유지
- `any` 사용 금지 (정말 필요하면 주석으로 이유 설명)
- 제공된 seeds.ts의 타입 정의를 그대로 활용 (재정의 금지)

---

## 개발 워크플로우

### 작업 단위
- **현재 작업 중인 슬라이스 명세서를 항상 먼저 읽는다** (예: `slice1-spec.md`).
- 슬라이스 명세서의 "범위 외 (의도적으로 안 만드는 것)" 섹션을 엄격히 준수한다.
- "이왕 만드는 김에 이것도..."라는 생각이 들어도 만들지 않는다. 슬라이스가 작아야 검토와 반복이 빠르다.

### 보고 시점
다음 시점에 멈춰서 사용자에게 보고하고 검토를 받는다:
1. 프로젝트 초기 세팅 완료 후
2. DB 스키마 작성 완료 후
3. 첫 화면 동작 가능해진 후 (다른 화면 작업 전)
4. 각 화면 완료 후
5. 검증 시나리오 1개 통과 후

한 번에 너무 많이 만든 후 보고하지 말 것.

### 검증 방식
- 슬라이스 명세서의 "검증 시나리오"가 통과 기준이다.
- 자동 테스트가 없는 부분은 수동 테스트 시나리오를 명시한다.
- TypeScript 컴파일 에러는 0개여야 한다.

### 의문이 생기면
- 추측하지 말고 명시적으로 질문한다.
- 슬라이스 명세서에 없는 UI 요소나 기능을 만들어야 할 것 같을 때.
- 외부 라이브러리를 추가해야 할 때.
- "이게 더 좋을 것 같은데..." 싶은 변경.

---

## 프로젝트 파일 매핑

### 영구 문서
- `CLAUDE.md` (이 파일): 프로젝트 전반 컨텍스트
- `workout-app-spec-v4.4.md`: 전체 spec (최종 지향 설계). **참고용. 현재 슬라이스 범위 외 기능을 만들지 말 것.**

### 현재 슬라이스 작업 문서
- `slice1-spec.md`: 현재 작업 중인 슬라이스의 상세 명세. **작업 시작 전 필수 정독.**

### 데이터 시드 파일
- `seeds.ts`: 60개 종목 시드 데이터. **이 파일은 수정 금지.** `src/db/seeds.ts`로 그대로 복사해서 사용.
- `my-injury-profiles.ts`: 사용자 부상 프로필 (어깨, 손목). Slice 1에서는 사용 안 함. Slice 3에서 활용.

### 향후 추가될 문서
- `slice2-spec.md`, `slice3-spec.md`: Slice 1 완료 후 작성될 다음 슬라이스 명세
- `README.md`: 사용자용 설치/실행 가이드

---

## 자주 쓰는 명령어

```bash
# 개발 서버
npm run dev

# 빌드
npm run build

# 빌드 프리뷰 (PWA 동작 테스트)
npm run preview

# 타입 체크
npx tsc --noEmit

# Dexie 데이터 초기화 (브라우저 개발자도구)
# Application → Storage → IndexedDB → WorkoutDB → Delete
```

---

## 함정 주의사항 (자주 실수하는 부분)

### 1. spec 전체를 슬라이스 1에 적용하려는 시도
spec v4.4는 매우 크다. 추천 엔진, 부상 안전 필터, 볼륨 관리 등 많은 기능이 있다. **이건 최종 지향 설계이며, 슬라이스 1에서는 거의 다 만들지 않는다.** 슬라이스 명세서가 우선한다.

### 2. 데이터 모델 단순화 유혹
"이 필드는 안 쓰니까 빼자"는 유혹이 있을 수 있다. **하지 말 것.** 향후 슬라이스에서 마이그레이션 없이 데이터를 추가할 수 있도록, Dexie 스키마는 spec v4.4 기준으로 모두 정의해둔다. 사용은 슬라이스마다 점진적으로.

### 3. 변형(ExerciseVariation) UI 만들기
시드 데이터에 변형이 있다고 해서 UI를 만들지 말 것. Slice 1에서는 항상 `is_default: true`인 변형을 자동 선택한다. 변형 선택 UI는 Slice 2 이후.

### 4. 추천 기능 미리 만들기
"앞으로 어차피 만들 거니까 미리..."는 금지. 추천 엔진은 Phase 2 이후 작업이며, Slice 1에서는 어떤 형태의 추천도 만들지 않는다.

### 5. 무게 입력의 단위 가정
- kg가 기본이지만 사용자 설정으로 lb 전환 가능해야 한다 (Slice 2부터).
- Slice 1에서는 kg 고정. 단, `unit_preference` 필드는 데이터에 저장.

### 6. 맨몸 운동 부하 계산
- `set.weight_kg`만 보면 안 된다. 맨몸 운동은 `set.body_weight_kg_snapshot`을 본다.
- `setLoadKg()` 헬퍼를 만들어 사용 (Slice 1에서는 단순한 형태로 충분).

### 7. 시간 저장
- `new Date()`가 아니라 `new Date().toISOString()`으로 문자열 저장.
- 표시할 때만 date-fns로 파싱.

### 8. shadcn/ui 컴포넌트 한 번에 설치
필요한 컴포넌트만 그때그때 설치한다. `npx shadcn-ui@latest add button` 같은 식.

---

## 사용자 컨텍스트

- 운동 경력 있는 중급자 (벤치/스쿼트/데드/OHP 모두 함)
- 메인 기기: 안드로이드 폰. PC 거의 안 봄.
- 부상 이력: 전면 어깨(recovering), 손목 건초염(recovering)
- 웹 개발자 (React/Next 경험)
- 한국어 사용자

**시사점**:
- 모바일 우선 UX (세로 모드 375~430px)
- 큰 터치 영역 (44×44px 이상)
- 헬스장에서 한 손 입력 고려 (큰 숫자 입력, 자동 저장)
- 영구 데이터 안전성 중요 (백업 기능을 Slice 2에 우선 배치 예정)
- 한국어 UI

---

## 응답 스타일

- 한국어로 응답
- 작업 결과 보고 시 간결하게 (긴 설명보다 동작 가능한 코드 우선)
- 불확실한 부분은 솔직하게 "확신 없음" 표시
- 외부 패키지를 추가할 때는 이유 명시
- 코드 변경 후 변경된 파일 목록과 한 줄 요약 제공
