# 운동 기록 앱 기획 문서 v4.5

> 근력 운동 기록 + 지능형 중량 추천 + 보조근 볼륨 트래킹 + 부위별 주간 볼륨 관리 + 기록 기반 루틴 보정 + **부상 이력 기반 안전 추천 시스템**

**문서 성격**
- v4.5는 Slice 1 실제 구현 중 발견된 데이터 모델 결함과 누락 기능을 반영한 **첫 실사용 검증 반영 버전**이다.
- v4는 최종 지향 설계로 유지하되, 실제 구현은 Phase 단위로 축소해서 진행한다.
- 초기 MVP에서는 추천 엔진보다 **기록/조회/수정/백업의 안정성**을 우선한다.
- 통증/부상 관련 기능은 의학적 진단이 아니라, 운동 강도와 종목 선택을 보수적으로 조정하기 위한 안전장치다.

**v4.4 대비 주요 변경사항**
- **`WorkoutSession.duration_seconds`를 nullable로 변경** (`number | null`)
  - `null` = 진행 중 세션 표시
  - 한 사용자당 진행 중 세션 최대 1개로 제한
  - 앱 진입 시 자동 복구
- **종목 삭제(SessionExercise 삭제) 기능 명시**
  - 진행 중 세션과 과거 세션 편집 모드 모두에서 가능
  - cascade 삭제 규칙 (하위 WorkoutSet 함께 삭제)
- **과거 세션 편집 vs 진행 중 세션 분리 원칙 신설**
  - `sessionStore.currentSessionId`는 진행 중 세션 전용
  - 과거 세션 편집은 별도 라우트 + 로컬 상태로 분리
  - 충돌 방지를 위한 UI 규칙 명시
- **영구 저장 권한 요청 기능 신설**
  - 앱 시작 시 `navigator.storage.persist()` 호출
  - 브라우저 LRU eviction 방지
  - 권한 미획득 시 정기 백업 권장 안내
- 7.5 체크리스트에 위 4개 항목 반영

**v4.1~v4.4에서 유지된 주요 변경사항**
- `Exercise / ExerciseVariation / alternative_group_id` 경계 정리 (v4.3)
- weighted bodyweight 처리: `bodyweight`, `weighted_bodyweight`, `assisted_bodyweight` (v4.3)
- 안전 필터는 안전 상한선만 적용, 디로딩/감량 추천을 덮어쓰지 않음 (v4.3)
- 피로도 `over_limit` 상태에서 progression 차단, reduce_volume으로 분기 (v4.3)
- 통증 기록 없는 기간과 명시적 무통증 체크인(`pain_level = 0`) 구분 (v4.3)
- 4.0 공용 유틸리티 섹션과 variation fallback 정책 (v4.2)
- `alternative_group_id` 채우기 규칙과 부상 프로필 자동 상태 조정 (v4.2)
- `effective_sets`와 `fatigue_score`의 역할 분리 (v4.1)
- 워밍업 처리 규칙 정합성 수정 (v4.1)
- `ExerciseVariation.user_pain_incidents`를 제거하고 `UserExerciseVariationStats`로 분리 (v4.1)
- `PainLog`에 `user_id` 직접 추가, 운동하지 않은 날의 통증 기록 가능 (v4.1)
- `BodyRegion` 표준 테이블 추가 (v4.1)
- 맨몸/추가중량/어시스트 운동 모델 보강 (v4.1)
- Phase 1A의 변형 선택 UI를 필수에서 선택사항으로 완화 (v4.1)
- 통증 3/5 이상 메시지를 "전문가 상담 고려" 수준으로 정리 (v4.1)
- 4.0 유틸리티에 누락 함수 보강, `set_load_kg()` 기반 부하 조회 헬퍼, 안전 필터 fallback 체인 구체화, 무통증 체크인 UX 명세 (v4.4)

**v1~v4.4에서 유지된 핵심 설계**
- 보조근 트래킹은 통계 기능이 아니라 추천 엔진의 핵심 입력 데이터
- 직접 볼륨과 피로도 볼륨을 분리
- 루틴 사전 검증 + 종목 가감 추천
- 추천 계획 vs 실제 수행 비교 및 학습
- 부상 이력 프로필 + 통증 로그 기반 안전 추천
- 종목 변형을 통한 관절 부담 조절

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기능 명세](#2-기능-명세)
3. [데이터 구조](#3-데이터-구조)
4. [핵심 알고리즘 의사코드](#4-핵심-알고리즘-의사코드)
5. [시스템 데이터 흐름](#5-시스템-데이터-흐름)
6. [개발 우선순위 및 마일스톤](#6-개발-우선순위-및-마일스톤)
7. [부록](#7-부록)

---

## 1. 프로젝트 개요

### 1.1 목적

기존 운동 기록 앱들이 제공하는 기본 기록 기능에 더해, 사용자의 운동 이력, 부위별 볼륨, 추천 대비 실제 수행, 컨디션, 통증, 부상 이력을 함께 분석하여 매 세션의 적정 중량/볼륨/종목 구성/그립 변형을 추천한다.

이 앱의 목표는 단순히 “더 무겁게 들게 하는 것”이 아니라, **근비대 목적의 점진적 과부하를 유지하면서도 부상 이력이 있는 사용자가 무리하지 않도록 루틴을 계속 보정하는 것**이다.

### 1.2 핵심 차별점

- **상황별 중량 추천**: 점진적 과부하 / 휴식 후 복귀 / 디로딩 자동 판단
- **직접 볼륨 + 피로도 볼륨 이중 관리**
  - 직접 볼륨: 성장 볼륨 판단
  - effective sets: 보조근까지 포함한 자극량
  - fatigue score: 실패세트, 드롭세트, 고피로 종목, 워밍업 부담까지 포함한 회복 부담
- **루틴 사전 검증**: 오늘 루틴 수행 시 주간 볼륨과 피로도 부담을 시뮬레이션
- **부상 이력 영구 안전 필터**: 통증이 없는 날에도 부상 이력이 있는 동작 패턴은 보수적으로 추천
- **종목 변형 추천**: 바벨/덤벨/머신, pronated/supinated/neutral grip 차이를 반영
- **추천 계획 vs 실제 수행 비교**: 사용자가 추천을 바꿔도 그 변경 자체를 학습 데이터로 활용
- **통증 추이 추적**: 통증이 좋아지는지, 유지되는지, 악화되는지를 시계열로 확인

### 1.3 설계 철학

> **같은 입력 데이터 하나가 여러 분석 축에 동시에 기여한다.**

사용자는 평소처럼 종목, 무게, 횟수, RPE/RIR, 통증 여부만 입력한다. 앱은 이 데이터를 종목별 진전, 직접 볼륨, 보조근 피로, 통증 추이, 부상 위험, 다음 루틴 조정에 동시에 활용한다.

### 1.4 타겟 사용자

- 1인 사용 기준
- 근비대와 점진적 과부하를 목표로 하는 초중급자~중급자
- 어깨, 손목, 허리, 무릎 등 부상 이력이 있어 보수적인 진행을 선호하는 사용자
- 고급 보디빌더용 세밀한 주기화 앱보다는, **안전한 진행을 도와주는 개인 운동 기록/추천 앱**을 원하는 사용자

### 1.5 추천 엔진의 판단 우선순위

1. **부상 이력 + 현재 통증**
   - UserInjuryProfile과 PainLog를 먼저 검사한다.
2. **컨디션/회복 상태**
   - 피로, 수면, 전반 컨디션, 시간 제한을 확인한다.
3. **피로도 부담**
   - effective sets와 fatigue score를 함께 확인한다.
4. **직접 성장 볼륨**
   - direct MEV/MAV/MRV 기준으로 부족/적정/과다를 본다.
5. **종목별 수행 추이**
   - 최근 기록, RPE/RIR, 정체 여부를 기준으로 중량을 추천한다.
6. **사용자 선호와 수정 패턴**
   - 반복되는 커스텀 패턴만 보수적으로 학습한다.

---

## 2. 기능 명세

### 2.1 기본 기능

#### F1. 운동 기록 입력

- **F1.1** 종목 선택: 라이브러리 검색, 즐겨찾기, 최근 사용 종목
- **F1.2** 종목 변형 선택
  - 초기 MVP에서는 기본 변형 자동 선택
  - 상세 UI는 선택사항으로 제공
  - 예: 덤벨 컬의 교대/동시 수행, 케이블 컬의 스트레이트바/로프/싱글핸들, 머신 체스트프레스의 뉴트럴/프론티드 손잡이
- **F1.3** 세트별 입력
  - 무게, 횟수, RPE, RIR, 메모
- **F1.4** 맨몸 운동 입력
  - 체중 기반, 체중 + 추가 중량, 어시스트 중량을 구분
- **F1.5** 단위 전환
  - kg ↔ lb
- **F1.6** 워밍업/본 세트 구분
  - 성장 볼륨과 effective sets에서는 워밍업 제외
  - fatigue_score에는 워밍업 강도에 따라 가볍게 반영
- **F1.7** 세트 유형
  - 일반 / 실패지점 근접 / 드롭세트 / 레스트포즈
- **F1.8** 세션 컨디션
  - 컨디션, 수면, 피로도, 시간 제한, 운동 전 특이사항
- **F1.9** 통증 입력
  - 부위, 정도, 타이밍, 관련 종목/변형
  - 운동하지 않은 날의 통증도 별도 기록 가능
- **F1.10** 무통증 체크인 (v4.4)
  - 부상 프로필이 등록된 부위에 한해, `pain_level = 0` 명시적 체크인을 수집한다.
  - 자동 상태 다운그레이드(active → recovering → managed → resolved)의 조건으로 사용된다.
  - 자세한 수집 방식은 부록 7.6 참고.
- **F1.11** 종목 삭제 (v4.5)
  - 진행 중 세션에서 종목(SessionExercise) 삭제 가능
  - 과거 세션 편집 모드에서도 삭제 가능
  - 종목 삭제 시 하위 모든 세트(WorkoutSet)도 함께 삭제 (cascade)
  - 삭제 전 확인 다이얼로그 권장 (실수 방지)
- **F1.12** 동시 편집 충돌 방지 (v4.5)
  - **진행 중 세션과 과거 세션 편집은 별도 상태로 분리한다.**
  - 진행 중 세션은 `sessionStore.currentSessionId`로 관리.
  - 과거 세션 편집은 별도 라우트(예: `/history/:sessionId/edit`)와 로컬 컴포넌트 상태로 관리. Zustand store에 올리지 않는다.
  - 진행 중 세션이 있을 때 과거 세션 편집 시도 시:
    - 옵션 A (권장, 단순): 편집 버튼 비활성화 + "운동을 마친 후 수정할 수 있습니다" 안내
    - 옵션 B (확인 다이얼로그): "진행 중인 운동이 있습니다. 정말 과거 세션을 편집하시겠습니까?"
  - 한 사용자당 진행 중 세션은 최대 1개로 제한 (`WorkoutSession.duration_seconds === null`인 레코드 최대 1개)
- **F1.13** 진행 중 세션 자동 복구 (v4.5)
  - 앱 진입 시 `duration_seconds === null`인 세션이 있으면 자동으로 진행 중 세션으로 복구
  - 사용자에게 "운동 중이던 세션이 있습니다. 계속하시겠습니까?" 확인
  - 사용자가 "종료"를 선택하면 현재 시간 기준으로 `duration_seconds` 계산해 종료 처리
- **F1.14** 영구 저장 권한 요청 (v4.5)
  - 앱 첫 실행 시 `navigator.storage.persist()` 호출하여 영구 저장 권한 요청
  - 브라우저의 LRU eviction 정책에서 IndexedDB 데이터를 보호
  - PWA로 설치된 경우 Chrome은 자동 승인하는 경향
  - 권한 미획득 시 사용자에게 정기 백업 권장 안내 표시 (F8 백업 기능과 연계)
  - 설정 화면에서 `navigator.storage.estimate()`로 현재 사용량/한도 표시 가능

#### F2. 운동 종목 라이브러리

- **F2.1** 프리셋 30~50개 + 커스텀 추가
- **F2.2** 카테고리
  - compound / isolation / mobility / warmup
- **F2.3** 종목 메타데이터
  - 주동근, 보조근, 자극 계수, 기구
- **F2.4** 종목별 추천 기본값
  - 권장 반복 범위, 증량 단위, 기본 휴식 시간
- **F2.5** 추천 보정 계수
  - `recommendation_bias`
- **F2.6** 피로도 계수
  - `fatigue_factor`
- **F2.7** 관절 부담 부위
  - BodyRegion 기준으로 표준화
- **F2.8** 운동 패턴
  - horizontal_press, vertical_press, squat, hinge, row, pull_down 등
- **F2.9** 안정성/난이도
  - skill_level, stability, unilateral
- **F2.10** 대체 종목 그룹
  - 같은 주동근을 자극하지만 보조근/관절 부담이 다른 후보 연결
- **F2.11** 종목 변형 트리
  - 하나의 종목에 여러 그립/기구/자세 변형 연결

#### F3. 부상 이력 프로필

통증 로그가 단기 신호라면, 부상 이력 프로필은 장기 안전 필터다.

- **F3.1** 부상 부위 등록
  - BodyRegion 기준
  - 예: shoulder_front, wrist, lower_back
- **F3.2** 부상 설명
  - 예: 벤치프레스 후 전면 어깨 통증, 손목 건초염
- **F3.3** 상태
  - active / recovering / managed / resolved
- **F3.4** 주의 수준
  - high / medium / low
- **F3.5** 영향 받는 동작 패턴
  - horizontal_press, vertical_press, wrist_extension 등
- **F3.6** 영향 받는 그립
  - pronated, supinated 등
- **F3.7** 보수적 증량 계수
  - 예: 평소 증량 단위의 50%만 적용
- **F3.8** 피로도 상한 보정
  - 부상 부위의 effective/fatigue limit를 낮춤

#### F4. 루틴/템플릿

- 운동 묶음을 템플릿으로 저장
- 시작 시 템플릿 불러오기
- 순서 변경, 슈퍼셋 묶기
- 루틴 실행 전 사전 검증 가능

#### F5. 이전 기록 자동 표시

- 종목 선택 시 직전 기록 표시
- 최근 N회 추이 표시
- 변형별 기록 분리 가능
  - 예: 바벨 벤치와 머신 체스트프레스는 별도 추이로 관리

#### F6. 휴식 타이머

- 자동 시작
- 종목별 기본 휴식 시간
- 백그라운드 알림

#### F7. 히스토리 & 통계

- 캘린더 뷰
- 종목별 기록 그래프
- 부위별 직접 볼륨 / effective sets / fatigue score 그래프
- PR 갱신
- 1RM 추정
- 통증 추이 그래프

#### F8. 데이터 백업/내보내기

- JSON/CSV 내보내기
- 로컬 백업
- 선택적 클라우드 동기화

---

### 2.2 추천 기능

#### F9. 점진적 과부하 추천

- 더블 프로그레션 기반
- RPE/RIR 보정
- 부상 프로필이 있으면 증량 단위 축소
- 피로도 부담이 높으면 증량보다 유지/감소 추천

#### F10. 휴식 후 복귀 추천

- 종목별 마지막 수행일 기준
- 휴식 기간이 길수록 중량/세트 보수적 조정
- 부상 부위 종목은 더 보수적으로 조정

#### F11. 디로딩 추천

트리거 예시:

- 마지막 디로딩 후 경과 시간
- 정체
- RPE 상승 추세
- 만성적 fatigue score 과다
- 통증 악화 추세

#### F12. 추천 보정 학습

- 사용자가 추천을 수정한 이유를 저장
- 같은 이유가 3회 이상 반복될 때만 학습 후보
- 한 번의 수정으로 bias를 크게 바꾸지 않음

---

### 2.3 보조근 볼륨 트래킹

#### F13. 분할 세트 환산

- 주동근: 1.0
- 강한 보조근: 0.5
- 약한 보조근: 0.25
- 안정화 근육: 0 또는 기록 제외

**볼륨 해석 원칙**

```txt
직접 세트(direct_sets):
성장 볼륨 판단에 사용한다.

간접 세트(indirect_sets):
보조근 자극을 추적한다.

effective_sets:
direct_sets + indirect_sets. 보조근 포함 자극량을 의미한다.

fatigue_score:
effective_sets에 set_type, warmup_intensity, exercise.fatigue_factor를 반영한 회복 부담 점수다.
```

직접 볼륨과 피로도 부담을 한 숫자로 뭉개지 않는다.

---

### 2.4 부위별 볼륨 관리

#### F14. Direct MEV/MAV/MRV

성장 볼륨 판단은 직접 세트 기준으로 한다.

- direct_MEV: 최소 효과 직접 세트
- direct_MAV: 적응 권장 직접 세트 범위
- direct_MRV: 직접 세트 기준 상한

#### F15. Effective/Fatigue 임계값

피로도 판단은 두 값을 함께 사용한다.

- `effective_warning`: 보조근 포함 자극량이 높은 상태
- `effective_limit`: 보조근 포함 자극량이 과한 상태
- `fatigue_warning`: set_type/운동피로도/워밍업까지 반영한 회복 부담 주의 상태
- `fatigue_limit`: 회복 부담이 높은 상태

판정 원칙:

```txt
effective_sets가 안전해도 fatigue_score가 높으면 피로도 경고를 낸다.
fatigue_score가 안전해도 effective_sets가 높으면 보조근 누적 경고를 낸다.
둘 중 더 위험한 쪽을 최종 피로도 상태로 사용한다.
```

#### F16. 실시간 볼륨 모니터링

대시보드에서는 부위별로 세 줄을 분리해서 보여준다.

```txt
가슴
- 직접 볼륨: 8 / 12~18세트
- 총 환산 자극량: 14 / limit 28
- 회복 부담 점수: 17 / limit 30
```

---

### 2.5 통합 추천 엔진

#### F17. 루틴 사전 검증

오늘 루틴을 그대로 수행하면 다음 값이 어떻게 되는지 시뮬레이션한다.

- 직접 볼륨
- indirect/effective sets
- fatigue score
- 부상 부위 관절 부담

추천 예시:

```txt
삼두 직접 볼륨은 부족하지만,
프레스 운동으로 인한 삼두 effective sets와 fatigue score가 이미 높습니다.
오늘은 트라이셉 익스텐션을 추가하기보다 다음 루틴으로 미루는 것을 추천합니다.
```

#### F18. 통합 진단 추천

- 종목 정체 + direct 볼륨 부족 → 직접 볼륨 증가
- 종목 정체 + effective/fatigue 과다 → 보조근 피로 또는 회복 부족 가능성
- 종목 정체 + 볼륨 정상 + RPE 상승 → 디로딩 고려
- 종목 정체 + 통증 악화 → 디로딩 + 해당 동작 패턴 일시 회피

#### F19. 종목 자동 제안

“오늘 뭐 할지 모르겠음” 모드.

- direct 볼륨 부족 부위 우선
- 최근 수행일이 오래된 부위 우선
- effective/fatigue 부담이 높은 부위는 회피
- 부상 이력에 걸리는 동작 패턴은 대체 종목/변형 우선

#### F20. 추천 계획 vs 실제 수행 비교

- 앱이 제안한 계획 저장
- 실제 수행과 비교
- 종목 추가/삭제, 세트 수 변경, 중량 변경, 반복 수 변경을 분석
- 다음 추천에 반영

#### F21. 통증/부상 우선 안전 추천

두 단계 필터를 적용한다.

1. 영구 필터: UserInjuryProfile
2. 즉시 필터: PainLog

통증 정도별 기본 처리:

```txt
1/5:
워밍업 강화, 중량 유지 또는 소폭 보수화, 변형 추천

2/5:
중량 15~20% 감소, 세트 -1, 변형 또는 대체 운동 추천

3/5 이상:
해당 종목 생략 또는 통증 없는 대체 운동 추천.
통증이 반복되거나 일상생활에도 영향을 준다면 전문가 상담 고려 메시지 표시.
```

#### F22. 종목 변형 추천

예시:

- 손목 부담: 바벨 컬 → 같은 `biceps_curl` 그룹의 EZ바 컬 또는 덤벨 해머 컬
- 어깨 부담: 바벨 벤치프레스 → 같은 `chest_horizontal_press` 그룹의 머신 체스트프레스 또는 덤벨 벤치프레스
- 팔꿈치 부담: 고정 바벨 운동 → 같은 대체 그룹의 케이블/덤벨 계열 종목
- 같은 종목 내부에서 핸들/그립만 바꿔 부담을 줄일 수 있으면 ExerciseVariation 교체를 우선한다.

#### F23. 추천 수정 이유 저장 및 학습

수정 이유:

- too_heavy
- too_light
- pain
- fatigue
- time_limit
- equipment_unavailable
- preference
- other

학습 원칙:

- 같은 이유가 반복될 때만 반영
- 통증 관련 피드백은 선호도보다 강하게 반영
- 단, 자동 차단보다는 “주의/대체 우선 추천”으로 시작

---

## 3. 데이터 구조

### 3.1 ER 개요

```txt
User ──┬─< UserInjuryProfile >── BodyRegion
       │
       ├─< PainLog >──────────── BodyRegion
       │
       ├─< Routine ──< RoutineExercise ──┐
       │                                  │
       │                                  ▼
       │                              Exercise ──┬─< ExerciseVariation
       │                                          │
       │                                          └─< ExerciseMuscleMapping ──> Muscle
       │
       ├─< UserExerciseVariationStats >── ExerciseVariation
       │
       ├─< WorkoutSession ──< SessionExercise ──< WorkoutSet
       │
       ├─< PlannedWorkoutSession ──< PlannedExercise
       │
       ├─< WorkoutDeviation
       ├─< RecommendationFeedback
       └─< MuscleVolumeTarget
```

---

### 3.2 테이블 스키마

#### `User`

```typescript
{
  id: string;
  body_weight_kg: number;
  unit_preference: 'kg' | 'lb';
  deload_mode_active: boolean;
  created_at: timestamp;
}
```

#### `BodyRegion` 신규

통증, 부상, 관절 부담 태그를 표준화하는 테이블.

```typescript
{
  id: string;             // 'shoulder_front', 'wrist', 'elbow', 'lower_back'
  name_ko: string;        // '전면 어깨', '손목'
  type: 'joint' | 'muscle' | 'area';
  parent_id: string | null; // shoulder_front -> shoulder 같은 계층 가능
}
```

#### `Muscle`

```typescript
{
  id: string;             // 'chest', 'triceps', 'lats'
  name_ko: string;
  group: 'push' | 'pull' | 'legs' | 'core';
  body_region_id?: string | null;
}
```

#### `Exercise`

`Exercise`는 실제 기록과 추천의 기본 단위다. v4.3에서는 경계 혼동을 줄이기 위해 `Exercise`를 너무 넓은 개념으로 잡지 않는다. 예를 들어 "바이셉 컬" 하나에 바벨/EZ바/덤벨/케이블을 모두 변형으로 넣기보다, 실제 수행감과 부하 특성이 크게 다른 종목은 별도 `Exercise`로 둔다.

예시:

```txt
Exercise 예시:
- 바벨 컬
- EZ바 컬
- 덤벨 컬
- 덤벨 해머 컬
- 케이블 컬

ExerciseVariation 예시:
- 덤벨 컬: 교대 / 동시 / 인클라인
- 케이블 컬: 스트레이트바 / 로프 / 싱글핸들
- 머신 체스트프레스: 뉴트럴 손잡이 / 프론티드 손잡이
```

```typescript
{
  id: string;
  name: string;
  category: 'compound' | 'isolation' | 'mobility' | 'warmup';
  default_equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'ez_bar';
  is_custom: boolean;
  target_rep_range: [number, number];
  weight_increment_kg: number;
  default_rest_seconds: number;
  recommendation_bias: number;     // 기본 1.0

  fatigue_factor: number;          // 기본 1.0, 고피로 종목 1.2~1.5
  joint_stress_region_ids: string[]; // BodyRegion.id 배열
  movement_patterns: string[];     // horizontal_press, vertical_press, hinge 등
  skill_level: 'easy' | 'medium' | 'hard';
  stability: 'stable' | 'moderate' | 'unstable';
  unilateral: boolean;
  alternative_group_id: string | null;
}
```

**`alternative_group_id` 채우기 규칙 (v4.3 명세)**

`alternative_group_id`는 **서로 다른 Exercise 간 대체 후보**를 묶는 값이다. 같은 그룹에 속하려면 다음 두 조건을 모두 만족해야 한다.

1. **주동근(primary muscle)이 같음** (`coefficient >= 1.0`인 매핑)
2. **움직임 패턴(movement_patterns) 중 하나 이상이 공통**

그룹 ID 명명 규칙: `{primary_muscle_group}_{primary_pattern}`

예시:
- `chest_horizontal_press`: 바벨 벤치프레스, 덤벨 벤치프레스, 머신 체스트프레스, 푸쉬업
- `chest_incline_press`: 인클라인 바벨프레스, 인클라인 덤벨프레스, 인클라인 머신프레스
- `shoulder_vertical_press`: 바벨 OHP, 덤벨 OHP, 머신 숄더프레스, 아놀드프레스
- `back_horizontal_pull`: 바벨로우, 덤벨로우, 시티드 케이블로우, 머신로우
- `back_vertical_pull`: 풀업, 랫풀다운, 어시스트 풀업
- `quad_squat`: 백스쿼트, 프론트스쿼트, 핵스쿼트, 레그프레스, 스미스스쿼트
- `biceps_curl`: 바벨 컬, EZ바 컬, 덤벨 컬, 덤벨 해머 컬, 케이블 컬

> **ExerciseVariation vs alternative_group_id의 차이**
> - `ExerciseVariation`: 같은 종목 내부의 작은 변형. 예: 덤벨 컬의 교대/동시/인클라인, 케이블 컬의 손잡이 차이.
> - `alternative_group_id`: 서로 다른 종목이지만 같은 주동근/패턴을 가진 대체 후보. 예: 바벨 컬 ↔ EZ바 컬 ↔ 케이블 컬.
> - 부상 시 우선순위: ① 같은 Exercise 안에서 더 안전한 Variation → ② 같은 alternative_group_id 안의 다른 Exercise → ③ 생략.

#### `ExerciseVariation`

같은 `Exercise` 내부의 그립/핸들/자세/수행 방식 차이를 표현한다. 변형 자체의 공통 정보만 가지고, 사용자별 통증 발생 횟수나 선호도는 `UserExerciseVariationStats`에 저장한다.

```typescript
{
  id: string;
  exercise_id: string;
  name: string;
  grip_type: 'pronated' | 'supinated' | 'neutral' | 'mixed' | 'semi_supinated' | 'none';
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'ez_bar';
  is_default: boolean;

  // BodyRegion.id를 key로 사용
  // 예: { wrist: 0.5, elbow: 0.8, shoulder_front: 0.7 }
  joint_stress_modifier: Record<string, number>;
}
```

#### `UserExerciseVariationStats` 신규

사용자별 변형 사용 이력, 통증, 선호도 집계.

```typescript
{
  user_id: string;
  variation_id: string;
  performed_count: number;
  pain_incident_count: number;
  last_performed_at: timestamp | null;
  user_preference_score: number | null; // 싫어함 -1, 중립 0, 선호 1 등
  updated_at: timestamp;
}
```

#### `ExerciseMuscleMapping`

```typescript
{
  exercise_id: string;
  muscle_id: string;
  role: 'primary' | 'secondary' | 'minor' | 'stabilizer';
  coefficient: number; // 1.0 / 0.5 / 0.25 / 0
}
```

#### `UserInjuryProfile`

통증이 없을 때도 작동하는 장기 안전 필터.

```typescript
{
  id: string;
  user_id: string;
  body_region_id: string;          // BodyRegion.id
  injury_description: string;
  status: 'active' | 'recovering' | 'managed' | 'resolved';
  caution_level: 'high' | 'medium' | 'low';

  affected_patterns: string[];     // horizontal_press, vertical_press 등
  affected_grips: string[];        // pronated, supinated 등

  conservative_increment_factor: number; // 0.5 = 평소 증량의 50%
  volume_cap_factor: number;       // 0.8 = 해당 부위 limit의 80%

  // v4.3 신규: 자동 상태 조정용 메타데이터
  auto_status_update_enabled: boolean;  // 자동 다운/업그레이드 제안 활성화
  last_pain_log_at: timestamp | null;   // 해당 부위 마지막 통증 기록 시점
  last_status_change_at: timestamp | null;

  started_at: timestamp;
  resolved_at: timestamp | null;
  notes: string | null;
}
```

**자동 상태 전이 규칙 (v4.3 명세)**

`auto_status_update_enabled = true`일 때, 시스템은 다음 조건에서 사용자에게 상태 변경을 **제안**한다 (자동 변경은 하지 않음, 사용자 확인 후 적용).

| 현재 상태 | 조건 | 제안 상태 |
|----------|------|-----------|
| active | 14일 이상 2회 이상 `pain_level = 0` 체크인 + 통증 기록 없음 | recovering |
| recovering | 30일 이상 3회 이상 `pain_level = 0` 체크인 + 통증 기록 없음 | managed |
| managed | 90일 이상 4회 이상 `pain_level = 0` 체크인 + 통증 기록 없음 | resolved (옵션) |
| recovering | 새 통증 2/5 이상 기록 | active |
| managed | 새 통증 2/5 이상 기록 | recovering |
| resolved | 새 통증 2/5 이상 기록 | managed |

자동 다운그레이드는 사용자가 안심하고 부상 부위를 "관리 모드"로 이동시킬 수 있게 하고, 자동 업그레이드는 통증 재발 시 안전 필터가 다시 강하게 작동하도록 한다. 단, 상태 완화는 단순히 기록이 없는 기간이 아니라 **명시적인 무통증 체크인(`pain_level = 0`)**이 충분히 쌓였을 때만 제안한다.

#### `MuscleVolumeTarget`

직접 볼륨, effective sets, fatigue score 기준을 모두 가진다.

```typescript
{
  user_id: string;
  muscle_id: string;

  // 성장 볼륨 기준: 직접 세트만
  direct_mev: number;
  direct_mav_low: number;
  direct_mav_high: number;
  direct_mrv: number;

  // 보조근 포함 자극량 기준
  effective_warning: number;
  effective_limit: number;

  // 회복 부담 점수 기준
  fatigue_warning: number;
  fatigue_limit: number;

  auto_adjusted: boolean;
  last_adjusted_at: timestamp | null;
}
```

#### `Routine`

```typescript
{
  id: string;
  name: string;
  created_at: timestamp;
}
```

#### `RoutineExercise`

```typescript
{
  routine_id: string;
  exercise_id: string;
  variation_id?: string | null;
  order: number;
  default_sets: number;
  superset_group: number | null;
}
```

#### `WorkoutSession`

```typescript
{
  id: string;
  user_id: string;
  date: timestamp;
  routine_id: string | null;
  planned_session_id: string | null;

  condition_score: 1 | 2 | 3 | 4 | 5;
  sleep_quality: 1 | 2 | 3 | 4 | 5 | null;
  fatigue_level: 1 | 2 | 3 | 4 | 5 | null;
  time_limit_minutes: number | null;

  is_deload: boolean;
  notes: string | null;

  /**
   * 세션 운동 시간 (초).
   * v4.5: null = 진행 중 세션을 의미한다.
   * 종료 시 Math.floor((endTime - startTime) / 1000)로 계산.
   * 한 사용자당 duration_seconds === null인 레코드는 최대 1개여야 한다.
   * 앱 진입 시 자동 복구 대상 (F1.13).
   */
  duration_seconds: number | null;
}
```

#### `SessionExercise`

```typescript
{
  id: string;
  session_id: string;
  exercise_id: string;
  variation_id: string | null;
  order: number;
}
```

#### `WorkoutSet`

```typescript
{
  id: string;
  session_exercise_id: string;
  set_number: number;

  is_warmup: boolean;
  warmup_intensity: 'light' | 'moderate' | 'near_working' | null;

  load_type: 'external' | 'bodyweight' | 'weighted_bodyweight' | 'assisted_bodyweight';
  weight_kg: number | null;              // 외부 중량 또는 추가 중량
  assistance_kg: number | null;          // 어시스트 풀업 등
  body_weight_kg_snapshot: number | null; // 해당 날짜 체중

  reps: number;
  rpe: number | null;
  rir: number | null;
  set_type: 'normal' | 'failure' | 'drop' | 'rest_pause';
  notes: string | null;
  completed_at: timestamp;
}
```

#### `PainLog`

운동 중/후 통증뿐 아니라 운동하지 않은 날의 통증도 기록 가능하게 `user_id`를 직접 가진다.

```typescript
{
  id: string;
  user_id: string;
  session_id: string | null;
  date: timestamp;

  body_region_id: string; // BodyRegion.id
  pain_level: 0 | 1 | 2 | 3 | 4 | 5;

  related_exercise_id: string | null;
  related_variation_id: string | null;
  timing: 'before' | 'during' | 'after' | 'next_day' | 'rest_day';
  notes: string | null;
}
```

#### `PlannedWorkoutSession`

```typescript
{
  id: string;
  user_id: string;
  scheduled_date: timestamp;
  routine_id: string | null;
  generated_by: 'system' | 'user_template' | 'manual';
  plan_type: 'normal' | 'deload' | 'comeback' | 'volume_adjusted' | 'pain_safe';
  summary: string | null;
  created_at: timestamp;
}
```

#### `PlannedExercise`

```typescript
{
  id: string;
  planned_session_id: string;
  exercise_id: string;
  variation_id: string | null;
  order: number;

  planned_sets: number;
  planned_weight_kg: number | null;
  planned_rep_min: number | null;
  planned_rep_max: number | null;

  reason_code:
    | 'progression'
    | 'maintain'
    | 'comeback'
    | 'deload'
    | 'reduce_volume'
    | 'increase_volume'
    | 'pain_safe'
    | 'injury_safe'
    | 'replacement'
    | 'variation_swap';

  reasoning: string;
}
```

#### `WorkoutDeviation`

```typescript
{
  id: string;
  user_id: string;
  planned_session_id: string | null;
  workout_session_id: string;
  planned_exercise_id: string | null;
  session_exercise_id: string | null;

  deviation_type:
    | 'added_exercise'
    | 'removed_exercise'
    | 'changed_weight'
    | 'changed_sets'
    | 'changed_reps'
    | 'changed_variation'
    | 'skipped';

  summary: string;
  created_at: timestamp;
}
```

#### `RecommendationFeedback`

```typescript
{
  id: string;
  user_id: string;
  planned_exercise_id: string | null;
  workout_session_id: string | null;

  user_action: 'accepted' | 'modified' | 'skipped';
  reason:
    | 'too_heavy'
    | 'too_light'
    | 'pain'
    | 'fatigue'
    | 'time_limit'
    | 'equipment_unavailable'
    | 'preference'
    | 'other'
    | null;

  memo: string | null;
  created_at: timestamp;
}
```

#### `RecommendationLog`

```typescript
{
  id: string;
  user_id: string;
  session_exercise_id: string | null;
  planned_exercise_id: string | null;

  recommended_weight: number | null;
  recommended_reps_range: [number, number] | null;
  recommendation_type:
    | 'progression'
    | 'comeback'
    | 'deload'
    | 'maintain'
    | 'volume_adjusted'
    | 'pain_safe'
    | 'variation_swap';

  reasoning: string;
  actual_avg_weight: number | null;
  actual_avg_reps: number | null;
  created_at: timestamp;
}
```

#### `VolumeSnapshot`

```typescript
{
  user_id: string;
  period_type: 'calendar_week' | 'rolling_7d' | 'rolling_10d';
  period_start: date;
  period_end: date;
  muscle_id: string;

  direct_sets: number;
  indirect_sets: number;
  effective_sets: number;
  total_reps: number;
  total_tonnage: number;
  fatigue_score: number;

  updated_at: timestamp;
}
```

---

## 4. 핵심 알고리즘 의사코드

### 4.0 공용 유틸리티

이후 알고리즘 의사코드에서 반복적으로 사용되는 헬퍼 함수들의 정의.

```python
# 상태 위험도 비교
RISK_ORDER = ['safe', 'warning', 'over_limit']

def max_risk(*statuses):
    """
    여러 상태 중 가장 위험한 쪽을 반환.
    예: max_risk('safe', 'warning') -> 'warning'
        max_risk('warning', 'over_limit') -> 'over_limit'
    """
    return max(statuses, key=lambda s: RISK_ORDER.index(s))


# 조건을 만족하는 원소 개수
def count(predicate, iterable):
    """predicate(x)가 True인 원소 수를 센다."""
    return sum(1 for x in iterable if predicate(x))


# 평균 (빈 리스트 안전)
def avg(values, default=0):
    values = list(values)
    return sum(values) / len(values) if values else default


# 무게 증량 단위로 반올림
def round_to_increment(weight, increment):
    """예: 47.3kg을 2.5kg 단위로 반올림 -> 47.5kg"""
    return round(weight / increment) * increment


# Epley 공식 기반 1RM 추정
def estimate_1rm(weight, reps):
    if reps <= 1:
        return weight
    return weight * (1 + reps / 30)


# clamp
def clamp(value, lo, hi):
    return max(lo, min(hi, value))


# 상태 위험도가 'warning' 이상인지
def is_risk_elevated(status):
    return status in ('warning', 'over_limit')


# === v4.4 신규: 시간 범위 헬퍼 ===

def current_calendar_week():
    """
    이번 캘린더 주의 (start, end) 반환. 월요일 시작 기준.
    """
    today_date = today()
    monday = today_date - days(today_date.weekday())
    sunday = monday + days(6)
    return (monday, sunday)


def current_rolling_7d():
    """
    오늘 기준 최근 7일 범위 (start, end) 반환.
    예: 오늘이 11/17이면 (11/11, 11/17).
    """
    end = today()
    start = end - days(6)
    return (start, end)


def current_rolling_10d():
    """
    오늘 기준 최근 10일 범위 (start, end) 반환.
    루틴 주기가 1주를 넘는 케이스(예: 9일 cycle)를 보정하기 위한 범위.
    """
    end = today()
    start = end - days(9)
    return (start, end)


# === v4.4 신규: load_type 인지 부하 조회 헬퍼 ===
# 추천 로직에서 자주 사용되는 함수들을 weight_kg 직접 참조 대신 set_load_kg() 기반으로 통일

def working_sets(session_exercise):
    """워밍업 제외 본세트만 반환"""
    return [s for s in session_exercise.sets if not s.is_warmup]


def find_session_exercise(session, exercise_id):
    """세션 내에서 특정 종목의 SessionExercise를 찾는다. 없으면 None."""
    return next(
        (se for se in session.exercises if se.exercise_id == exercise_id),
        None
    )


def last_session_max_weight(session, exercise_id):
    """
    세션 내 해당 종목의 본세트 중 최대 부하.
    v4.4: set_load_kg()를 사용해 weighted_bodyweight / assisted_bodyweight 케이스도 정확히 계산.
    """
    sess_ex = find_session_exercise(session, exercise_id)
    if not sess_ex:
        return None
    sets = working_sets(sess_ex)
    return max(set_load_kg(s) for s in sets) if sets else None


def last_session_avg_weight(session, exercise_id):
    """세션 내 해당 종목의 본세트 평균 부하."""
    sess_ex = find_session_exercise(session, exercise_id)
    if not sess_ex:
        return None
    sets = working_sets(sess_ex)
    return avg(set_load_kg(s) for s in sets) if sets else None


def last_session_set_count(session, exercise_id):
    """세션 내 해당 종목의 본세트 개수."""
    sess_ex = find_session_exercise(session, exercise_id)
    if not sess_ex:
        return 0
    return len(working_sets(sess_ex))


def get_last_weight(user, exercise, variation=None):
    """
    사용자의 해당 종목 직전 세션 최대 부하를 반환.
    variation이 지정되면 우선 그 변형의 세션만 조회, 없으면 종목 전체로 fallback.
    안전 필터에서 safe_max_weight 계산 시 사용된다.
    """
    history_result = get_recent_sessions_for_recommendation(
        user, exercise, variation=variation, limit=1
    )
    if not history_result.sessions:
        return None
    return last_session_max_weight(history_result.sessions[0], exercise.id)
```

> **사용 원칙**: 추천 로직에서 직전 세션의 부하를 참조할 때는 `set.weight_kg`을 직접 읽지 않고 위 헬퍼들을 사용한다. `weight_kg`만 보면 `weighted_bodyweight` 케이스에서 체중이 빠져 부정확해지고, `assisted_bodyweight` 케이스에서는 보조 중량 차감이 누락된다.

---

### 4.0.1 종목별 추이 조회 (variation fallback 규칙, v4.3 신규)

같은 종목을 여러 변형으로 번갈아 사용하면 각 변형의 히스토리가 짧아져 progression 판단이 불안정해진다. 이를 막기 위한 조회 정책.

```python
MIN_VARIATION_HISTORY = 3   # 변형별 최소 세션 수
DEFAULT_HISTORY_LIMIT = 10


def get_recent_sessions_for_recommendation(user, exercise, variation=None,
                                            limit=DEFAULT_HISTORY_LIMIT):
    """
    추천 계산에 사용할 세션 추이를 반환.

    정책:
    1. variation이 지정되면 우선 그 변형의 세션만 조회
    2. 세션 수가 MIN_VARIATION_HISTORY 미만이면 동일 exercise 전체 세션으로 fallback
       (단, fallback 사실을 메타데이터로 표시하여 추천 함수가 인지 가능하게 함)
    3. 그래도 부족하면 빈 결과 반환 (호출자가 starter_weight 로직으로 분기)
    """
    if variation:
        variation_sessions = query_sessions(
            user=user,
            exercise_id=exercise.id,
            variation_id=variation.id,
            limit=limit
        )
        if len(variation_sessions) >= MIN_VARIATION_HISTORY:
            return SessionHistory(
                sessions=variation_sessions,
                source='variation_specific',
                fallback_used=False
            )

    # Fallback: 종목 전체 추이
    all_sessions = query_sessions(
        user=user,
        exercise_id=exercise.id,
        limit=limit
    )

    if len(all_sessions) == 0:
        return SessionHistory(sessions=[], source='empty', fallback_used=False)

    return SessionHistory(
        sessions=all_sessions,
        source='exercise_general',
        fallback_used=(variation is not None)
    )
```

추천 함수는 `history.fallback_used`가 `True`일 때 사용자에게 "이 변형의 데이터가 적어 종목 전체 추이로 추정했습니다"라는 컨텍스트를 메시지에 포함시킨다.

---

### 4.0.2 대체 종목 후보 찾기 (v4.3 명세)

```python
def find_joint_friendly_alternatives(exercise, problem_region_id, user=None):
    """
    같은 alternative_group_id를 가진 종목 중,
    문제 부위(problem_region_id)에 부담이 적은 후보를 반환.

    우선순위:
    1. joint_stress_region_ids에 problem_region이 없는 종목 (가장 안전)
    2. 있더라도 기본 변형의 joint_stress_modifier가 낮은 종목
    3. 사용자가 최근 통증을 신고하지 않은 종목
    """
    if not exercise.alternative_group_id:
        return []

    candidates = query_exercises(
        alternative_group_id=exercise.alternative_group_id,
        exclude_id=exercise.id
    )

    scored = []
    for cand in candidates:
        score = 0.0

        # 문제 부위가 부담 태그에 없으면 큰 가산점
        if problem_region_id not in cand.joint_stress_region_ids:
            score -= 1.0
        else:
            # 기본 변형의 modifier 확인
            default_var = get_default_variation(cand)
            modifier = (
                default_var.joint_stress_modifier.get(problem_region_id, 1.0)
                if default_var else 1.0
            )
            score += modifier

        # 사용자별 통증 이력 페널티
        if user:
            recent_pain = count_pain_incidents_for_exercise(
                user, cand.id, body_region_id=problem_region_id, days=30
            )
            score += recent_pain * 0.3

        scored.append((cand, score))

    scored.sort(key=lambda x: x[1])
    return [c for c, _ in scored[:3]]
```

---

### 4.0.3 부상 프로필 자동 상태 조정 (v4.3 신규)

```python
PAIN_FREE_DAYS = {
    'active_to_recovering': 14,
    'recovering_to_managed': 30,
    'managed_to_resolved': 90,
}


def suggest_injury_profile_status_update(user, profile):
    """
    부상 프로필의 통증 기록 추이에 따라 상태 변경 제안.
    자동 변경은 하지 않고, 사용자 확인 UI에 노출만 함.

    v4.3 원칙:
    - 업그레이드(악화)는 최근 실제 통증 기록을 기준으로 빠르게 제안한다.
    - 다운그레이드(호전)는 "기록 없음"이 아니라 명시적 무통증 체크인(pain_level=0)이 충분할 때만 제안한다.
    """
    if not profile.auto_status_update_enabled:
        return None

    logs = get_recent_pain_logs(
        user_id=user.id,
        body_region_id=profile.body_region_id,
        days=180
    )
    pain_logs = [p for p in logs if p.pain_level > 0]
    pain_free_logs = [p for p in logs if p.pain_level == 0]

    # === 업그레이드 (악화) 제안: 최근 7일 내 2/5 이상 통증 ===
    recent_severe = [
        p for p in pain_logs
        if p.pain_level >= 2
        and days_between(today(), p.date) <= 7
    ]
    if recent_severe:
        upgrade_map = {
            'resolved': 'managed',
            'managed': 'recovering',
            'recovering': 'active',
        }
        new_status = upgrade_map.get(profile.status)
        if new_status:
            return {
                'direction': 'upgrade',
                'from': profile.status,
                'to': new_status,
                'reason': (
                    f"최근 7일 내 {profile.injury_description} 부위에 "
                    f"통증 {max(p.pain_level for p in recent_severe)}/5 기록. "
                    "안전 필터 강도를 높이는 것을 권장합니다."
                )
            }

    # === 다운그레이드 (호전) 제안 ===
    if pain_logs:
        days_since_last_pain = days_between(today(), max(p.date for p in pain_logs))
    else:
        days_since_last_pain = days_between(today(), profile.started_at)

    def has_pain_free_checkins(required_count, required_days):
        recent_zero_logs = [
            p for p in pain_free_logs
            if days_between(today(), p.date) <= required_days
        ]
        return len(recent_zero_logs) >= required_count

    downgrade_map = [
        ('active', 'recovering', PAIN_FREE_DAYS['active_to_recovering'], 2),
        ('recovering', 'managed', PAIN_FREE_DAYS['recovering_to_managed'], 3),
        ('managed', 'resolved', PAIN_FREE_DAYS['managed_to_resolved'], 4),
    ]

    for current, next_status, required_days, required_zero_logs in downgrade_map:
        if profile.status != current:
            continue

        if days_since_last_pain >= required_days and has_pain_free_checkins(required_zero_logs, required_days):
            return {
                'direction': 'downgrade',
                'from': current,
                'to': next_status,
                'reason': (
                    f"{profile.injury_description} 부위에 {days_since_last_pain}일 동안 통증 기록이 없고, "
                    f"무통증 체크인이 {required_zero_logs}회 이상 있습니다. "
                    f"상태를 '{next_status}'로 완화하시겠습니까?"
                )
            }

    return None
```

이 함수는 주기적으로(예: 주 1회 백그라운드 작업, 또는 앱 진입 시) 실행되어 사용자에게 알림 형태로 제안한다. 사용자가 확인을 누르면 `UserInjuryProfile.status`와 `last_status_change_at`이 업데이트된다.

---

### 4.1 볼륨 계산

```python
SET_TYPE_FATIGUE_MULTIPLIER = {
    'normal': 1.0,
    'failure': 1.4,
    'drop': 1.5,
    'rest_pause': 1.3,
}

WARMUP_FATIGUE_MULTIPLIER = {
    None: 0.0,
    'light': 0.1,
    'moderate': 0.3,
    'near_working': 0.5,
}


def set_load_kg(set_):
    """
    기록/통계용 부하 계산.
    - external: 머신/바벨/덤벨처럼 외부 중량만 계산
    - bodyweight: 체중 기반 운동
    - weighted_bodyweight: 체중 + 추가 중량 (중량 풀업/딥스 등)
    - assisted_bodyweight: 체중 - 보조 중량 (어시스트 풀업 등)
    """
    body = set_.body_weight_kg_snapshot or 0
    external = set_.weight_kg or 0
    assistance = set_.assistance_kg or 0

    if set_.load_type == 'external':
        return external

    if set_.load_type == 'bodyweight':
        return body

    if set_.load_type == 'weighted_bodyweight':
        return body + external

    if set_.load_type == 'assisted_bodyweight':
        return max(0, body - assistance)

    return 0


def calculate_volume_by_muscle(user, start_date, end_date):
    sessions = get_sessions_in_range(user, start_date, end_date)

    result = defaultdict(lambda: {
        'direct_sets': 0.0,
        'indirect_sets': 0.0,
        'effective_sets': 0.0,
        'fatigue_score': 0.0,
        'total_reps': 0.0,
        'total_tonnage': 0.0,
        'contributing_exercises': []
    })

    for session in sessions:
        for sess_ex in session.exercises:
            exercise = sess_ex.exercise
            mappings = get_muscle_mappings(exercise.id)

            working_sets = [s for s in sess_ex.sets if not s.is_warmup]
            warmup_sets = [s for s in sess_ex.sets if s.is_warmup]

            working_count = len(working_sets)
            working_reps = sum(s.reps for s in working_sets)
            working_tonnage = sum(set_load_kg(s) * s.reps for s in working_sets)

            working_fatigue = sum(
                SET_TYPE_FATIGUE_MULTIPLIER.get(s.set_type, 1.0)
                for s in working_sets
            )

            warmup_fatigue = sum(
                WARMUP_FATIGUE_MULTIPLIER.get(s.warmup_intensity, 0.1)
                for s in warmup_sets
            )

            for mapping in mappings:
                coef = mapping.coefficient
                mv = result[mapping.muscle_id]

                # 성장/자극 볼륨은 본세트만 반영
                fractional_sets = working_count * coef
                mv['effective_sets'] += fractional_sets
                mv['total_reps'] += working_reps * coef
                mv['total_tonnage'] += working_tonnage * coef

                if coef >= 1.0:
                    mv['direct_sets'] += fractional_sets
                else:
                    mv['indirect_sets'] += fractional_sets

                # 회복 부담은 본세트 + 워밍업을 모두 반영하되, 워밍업은 낮은 가중치
                mv['fatigue_score'] += (
                    (working_fatigue + warmup_fatigue)
                    * exercise.fatigue_factor
                    * coef
                )

                mv['contributing_exercises'].append({
                    'exercise': exercise.name,
                    'working_sets': working_count,
                    'warmup_sets': len(warmup_sets),
                    'coefficient': coef,
                    'effective_contribution': fractional_sets,
                    'fatigue_contribution': (
                        (working_fatigue + warmup_fatigue)
                        * exercise.fatigue_factor
                        * coef
                    )
                })

    return result
```

---

### 4.2 부위별 상태 판정

```python
def assess_muscle_volume_status(user, muscle_id,
                                projected_direct=0,
                                projected_indirect=0,
                                projected_fatigue=0):
    target = get_volume_target(user, muscle_id)
    weekly = calculate_volume_by_muscle(user, *current_rolling_7d())[muscle_id]

    current_direct = weekly['direct_sets']
    current_effective = weekly['effective_sets']
    current_fatigue = weekly['fatigue_score']

    projected_direct_total = current_direct + projected_direct
    projected_effective_total = current_effective + projected_direct + projected_indirect
    projected_fatigue_total = current_fatigue + projected_fatigue

    injury = get_injury_affecting_muscle(user, muscle_id)

    effective_limit = target.effective_limit
    fatigue_limit = target.fatigue_limit
    if injury and injury.status in ('active', 'recovering'):
        effective_limit *= injury.volume_cap_factor
        fatigue_limit *= injury.volume_cap_factor

    # 성장 볼륨: direct 기준
    if projected_direct_total < target.direct_mev:
        growth_status = 'below_mev'
    elif projected_direct_total < target.direct_mav_low:
        growth_status = 'mev_to_mav'
    elif projected_direct_total <= target.direct_mav_high:
        growth_status = 'optimal'
    elif projected_direct_total <= target.direct_mrv:
        growth_status = 'approaching_mrv'
    else:
        growth_status = 'over_mrv'

    # 자극량 누적: effective 기준
    if projected_effective_total < target.effective_warning:
        effective_status = 'safe'
    elif projected_effective_total < effective_limit:
        effective_status = 'warning'
    else:
        effective_status = 'over_limit'

    # 회복 부담: fatigue_score 기준
    if projected_fatigue_total < target.fatigue_warning:
        fatigue_score_status = 'safe'
    elif projected_fatigue_total < fatigue_limit:
        fatigue_score_status = 'warning'
    else:
        fatigue_score_status = 'over_limit'

    # 최종 피로도 상태는 더 위험한 쪽을 사용
    fatigue_status = max_risk(effective_status, fatigue_score_status)

    return {
        'muscle_id': muscle_id,
        'current_direct': current_direct,
        'current_effective': current_effective,
        'current_fatigue': current_fatigue,
        'projected_direct': projected_direct_total,
        'projected_effective': projected_effective_total,
        'projected_fatigue': projected_fatigue_total,
        'growth_status': growth_status,
        'effective_status': effective_status,
        'fatigue_score_status': fatigue_score_status,
        'fatigue_status': fatigue_status,
        'target': target,
        'injury_adjusted': injury is not None,
        'gap_to_direct_mev': target.direct_mev - projected_direct_total,
        'gap_to_effective_limit': effective_limit - projected_effective_total,
        'gap_to_fatigue_limit': fatigue_limit - projected_fatigue_total,
    }
```

---

### 4.3 통증 추이 분석

```python
def analyze_pain_trend(user, body_region_id, weeks=4):
    logs = get_pain_logs(
        user_id=user.id,
        body_region_id=body_region_id,
        start=today() - days(weeks * 7)
    )

    logs = [l for l in logs if l.pain_level > 0]
    if len(logs) < 3:
        return {'trend': 'insufficient_data', 'recent_max': 0}

    logs.sort(key=lambda l: l.date)
    split = max(1, len(logs) // 3)

    older = logs[:-split]
    recent = logs[-split:]

    older_avg = avg([l.pain_level for l in older]) if older else recent[0].pain_level
    recent_avg = avg([l.pain_level for l in recent])
    recent_max = max(l.pain_level for l in recent)

    diff = recent_avg - older_avg

    if diff <= -0.5:
        trend = 'improving'
    elif diff >= 0.5:
        trend = 'worsening'
    else:
        trend = 'stable'

    return {
        'trend': trend,
        'older_avg': older_avg,
        'recent_avg': recent_avg,
        'recent_max': recent_max,
        'last_log_date': logs[-1].date,
        'days_since_last_pain': days_between(today(), logs[-1].date)
    }
```

---

### 4.4 안전 필터

```python
def apply_safety_filter(user, recommendation, exercise, variation=None):
    """
    v4.3 원칙:
    - 안전 필터는 중량을 "올리는" 로직이 아니라 안전 상한선을 적용하는 로직이다.
    - 이미 디로딩/감량 추천이 나온 경우 안전 필터가 그 값을 다시 올리지 않는다.
    - 부상 프로필은 영구 필터, PainLog는 급성 필터로 작동한다.
    """
    profiles = get_active_injury_profiles(user)

    # 1. 장기 부상 이력 필터
    for profile in profiles:
        pattern_hit = any(
            p in exercise.movement_patterns
            for p in profile.affected_patterns
        )

        grip_hit = (
            variation is not None
            and variation.grip_type in profile.affected_grips
        )

        region_hit = profile.body_region_id in exercise.joint_stress_region_ids

        if not (pattern_hit or grip_hit or region_hit):
            continue

        # 안전 상한선 적용: progression은 제한하되, deload/reduce 추천을 다시 올리지 않는다.
        if recommendation.weight is not None:
            base_weight = get_last_weight(user, exercise, variation)
            safe_increment = exercise.weight_increment_kg * profile.conservative_increment_factor
            safe_max_weight = base_weight + safe_increment
            recommendation.weight = min(recommendation.weight, safe_max_weight)

        # v4.4: fallback 체인을 명시
        # 우선순위 ① 같은 Exercise 내 더 안전한 Variation
        #         ② 같은 alternative_group_id 내 다른 Exercise
        #         ③ 안전 상한선 적용만 (위 둘 다 없을 때)
        safer_variation = recommend_safer_variation(exercise, profile, current=variation)

        if safer_variation:
            recommendation.suggested_variation = safer_variation
            recommendation.reasoning += (
                f"\n[부상 이력] {profile.injury_description} 이력이 있어 "
                f"{safer_variation.name} 변형을 우선 추천합니다."
            )
        else:
            # Variation 후보가 없으면 다른 Exercise 후보로 fallback
            alternatives = find_joint_friendly_alternatives(
                exercise, profile.body_region_id, user=user
            )
            if alternatives:
                recommendation.suggested_alternatives = alternatives
                recommendation.reasoning += (
                    f"\n[부상 이력] {profile.injury_description} 이력으로 "
                    f"같은 부위를 자극하면서 부담이 적은 대체 종목을 추천합니다: "
                    f"{', '.join(a.name for a in alternatives[:2])}."
                )
            else:
                recommendation.reasoning += (
                    f"\n[부상 이력] {profile.injury_description} 이력으로 "
                    "중량 추천에 안전 상한선을 적용했습니다."
                )

    # 2. 최근 통증 로그 필터
    recent_pain = get_recent_pain_logs(user_id=user.id, days=10)
    relevant = [
        p for p in recent_pain
        if p.pain_level > 0 and p.body_region_id in exercise.joint_stress_region_ids
    ]

    if not relevant:
        return recommendation

    max_pain = max(p.pain_level for p in relevant)
    region_id = max(relevant, key=lambda p: p.pain_level).body_region_id
    trend = analyze_pain_trend(user, region_id)

    if max_pain >= 3:
        recommendation.type = 'pain_safe'
        recommendation.action = 'skip_or_replace'
        recommendation.weight = None
        recommendation.sets = 0
        recommendation.reasoning = (
            f"최근 {get_body_region(region_id).name_ko} 통증이 {max_pain}/5입니다. "
            "오늘은 해당 종목을 생략하거나 통증 없는 대체 운동으로 바꾸는 것을 권장합니다. "
            "통증이 반복되거나 일상생활에도 영향을 준다면 전문가 상담을 고려하세요."
        )
        recommendation.alternatives = find_joint_friendly_alternatives(
            exercise, region_id, user=user
        )
        return recommendation

    if max_pain == 2:
        recommendation.type = 'pain_safe'
        if recommendation.weight is not None:
            recommendation.weight *= 0.85
        recommendation.sets = max(1, recommendation.sets - 1)
        recommendation.reasoning += (
            f"\n[통증 주의] 최근 {get_body_region(region_id).name_ko} 통증 2/5. "
            "중량 약 15% 감소 및 세트 -1을 적용했습니다."
        )

    if max_pain == 1:
        recommendation.warning = (
            f"최근 {get_body_region(region_id).name_ko}에 약한 통증 기록이 있습니다. "
            "워밍업을 충분히 하고 통증이 생기면 즉시 중단하세요."
        )

    if trend['trend'] == 'worsening':
        recommendation.warning = (recommendation.warning or '') + (
            f"\n⚠ {get_body_region(region_id).name_ko} 통증이 악화 추세입니다. "
            "오늘은 보수적으로 진행하세요."
        )

    return recommendation
```

---

### 4.5 루틴 사전 검증

```python
def validate_routine(user, routine, scheduled_date):
    projected_direct = defaultdict(float)
    projected_indirect = defaultdict(float)
    projected_fatigue = defaultdict(float)

    for routine_ex in routine.exercises:
        exercise = routine_ex.exercise
        mappings = get_muscle_mappings(exercise.id)

        # 사전 검증에서는 기본적으로 normal set 기준으로 예상
        expected_set_fatigue = routine_ex.default_sets * exercise.fatigue_factor

        for mapping in mappings:
            contribution = routine_ex.default_sets * mapping.coefficient
            fatigue_contribution = expected_set_fatigue * mapping.coefficient

            if mapping.coefficient >= 1.0:
                projected_direct[mapping.muscle_id] += contribution
            else:
                projected_indirect[mapping.muscle_id] += contribution

            projected_fatigue[mapping.muscle_id] += fatigue_contribution

    all_muscles = (
        set(projected_direct.keys())
        | set(projected_indirect.keys())
        | set(projected_fatigue.keys())
    )

    assessments = {}
    warnings = []
    suggestions = []

    for muscle_id in all_muscles:
        a = assess_muscle_volume_status(
            user,
            muscle_id,
            projected_direct=projected_direct.get(muscle_id, 0),
            projected_indirect=projected_indirect.get(muscle_id, 0),
            projected_fatigue=projected_fatigue.get(muscle_id, 0),
        )
        assessments[muscle_id] = a
        muscle = get_muscle(muscle_id)

        if a['fatigue_status'] == 'over_limit':
            warnings.append({
                'type': 'fatigue_over_limit',
                'muscle': muscle.name_ko,
                'message': (
                    f"{muscle.name_ko} 피로도 부담이 한계를 넘을 가능성이 있습니다. "
                    f"effective {a['projected_effective']:.1f}, "
                    f"fatigue {a['projected_fatigue']:.1f}."
                ),
                'suggestions': generate_reduction_suggestions(routine, muscle_id)
            })

        if (
            a['growth_status'] == 'below_mev'
            and a['gap_to_direct_mev'] >= 2
            and a['fatigue_status'] != 'over_limit'
        ):
            suggestions.append({
                'type': 'add_direct_volume',
                'muscle': muscle.name_ko,
                'message': (
                    f"{muscle.name_ko} 직접 볼륨이 MEV 미달입니다. "
                    "피로도 부담이 높지 않다면 직접 운동을 1~2세트 추가할 수 있습니다."
                ),
                'recommended_exercises': suggest_exercises_for_muscle(muscle_id, user)
            })

    return RoutineValidation(
        routine_id=routine.id,
        assessments=assessments,
        warnings=warnings,
        suggestions=suggestions,
        is_balanced=(len(warnings) == 0)
    )
```

---

### 4.6 통합 추천 라우터

```python
def recommend_next_session(user, exercise, variation=None):
    # v4.3: variation fallback 정책 적용
    history_result = get_recent_sessions_for_recommendation(
        user, exercise, variation=variation, limit=10
    )
    history = history_result.sessions

    if len(history) == 0:
        rec = recommend_starter_weight(user, exercise)
        return apply_safety_filter(user, rec, exercise, variation)

    last = history[0]
    days_since_last = days_between(today(), last.date)

    if days_since_last >= 8:
        rec = recommend_comeback(exercise, last, days_since_last)
        attach_fallback_note(rec, history_result)
        return apply_safety_filter(user, rec, exercise, variation)

    primary = get_primary_muscle(exercise)
    volume = assess_muscle_volume_status(user, primary.id)

    stalled = is_stalled(history)
    rpe_creep = rpe_trending_up(history)

    pain_trends = [
        analyze_pain_trend(user, region_id)
        for region_id in exercise.joint_stress_region_ids
    ]
    worsening_pain = any(t['trend'] == 'worsening' for t in pain_trends)

    # 피로도 한계 초과는 progression보다 먼저 처리한다.
    # 이 상태에서는 경고만 붙이는 것이 아니라 유지/감량 추천으로 분기한다.
    if volume['fatigue_status'] == 'over_limit':
        rec = Recommendation(
            type='reduce_volume',
            weight=last_session_max_weight(last, exercise.id),
            reps_target=exercise.target_rep_range[0],
            sets=max(1, last_session_set_count(last, exercise.id) - 1),
            reasoning=(
                '해당 부위의 피로도 부담이 한계를 넘었습니다. '
                '오늘은 증량보다 중량 유지 또는 세트 감소를 권장합니다.'
            )
        )
        attach_fallback_note(rec, history_result)
        return apply_safety_filter(user, rec, exercise, variation)

    if stalled:
        if worsening_pain:
            rec = recommend_deload(exercise, last)
            rec.reasoning = '정체와 관련 부위 통증 악화가 함께 보여 디로딩을 권장합니다.'
            attach_fallback_note(rec, history_result)
            return apply_safety_filter(user, rec, exercise, variation)

        if volume['growth_status'] == 'below_mev' and volume['fatigue_status'] == 'safe':
            rec = Recommendation(
                type='increase_volume',
                weight=last_session_max_weight(last, exercise.id),
                reps_target=exercise.target_rep_range[0],
                sets=last_session_set_count(last, exercise.id) + 1,
                reasoning='직접 볼륨이 부족한 상태에서 정체가 보여 세트 +1을 권장합니다.'
            )
            attach_fallback_note(rec, history_result)
            return apply_safety_filter(user, rec, exercise, variation)

        if volume['fatigue_status'] == 'warning':
            rec = Recommendation(
                type='reduce_volume',
                weight=last_session_max_weight(last, exercise.id),
                reps_target=exercise.target_rep_range[0],
                sets=max(2, last_session_set_count(last, exercise.id) - 1),
                reasoning='피로도 부담이 높은 상태에서 정체가 보여 세트 감소를 권장합니다.'
            )
            attach_fallback_note(rec, history_result)
            return apply_safety_filter(user, rec, exercise, variation)

        if rpe_creep:
            rec = recommend_deload(exercise, last)
            attach_fallback_note(rec, history_result)
            return apply_safety_filter(user, rec, exercise, variation)

        rec = recommend_maintain(exercise, history)
        attach_fallback_note(rec, history_result)
        return apply_safety_filter(user, rec, exercise, variation)

    if should_deload(user, history, volume, pain_trends):
        rec = recommend_deload(exercise, last)
        attach_fallback_note(rec, history_result)
        return apply_safety_filter(user, rec, exercise, variation)

    if user.deload_mode_active:
        rec = recommend_deload(exercise, last)
        attach_fallback_note(rec, history_result)
        return apply_safety_filter(user, rec, exercise, variation)

    # 정상 progression은 fatigue_status가 safe/warning일 때만 허용한다.
    # warning이면 증량하더라도 메시지로 보수 진행을 안내한다.
    rec = recommend_progression(exercise, history)

    if volume['fatigue_status'] == 'warning':
        rec.warning = '해당 부위의 피로도 부담이 주의 영역입니다. 증량 폭을 보수적으로 가져가세요.'

    attach_fallback_note(rec, history_result)
    return apply_safety_filter(user, rec, exercise, variation)


def attach_fallback_note(recommendation, history_result):
    """variation fallback이 사용됐다면 추천 메시지에 컨텍스트 추가."""
    if history_result.fallback_used:
        note = (
            "참고: 이 변형의 기록이 부족하여 종목 전체 기록을 기반으로 추정했습니다. "
            "변형별 부하 차이를 고려해 무게를 조정하세요."
        )
        recommendation.warning = (
            f"{recommendation.warning}
{note}" if recommendation.warning else note
        )
```

---

### 4.7 디로딩 판단

```python
def should_deload(user, history, volume_status=None, pain_trends=None, weeks_threshold=6):
    triggers = []

    last_deload = find_last_deload_session(history)
    weeks_since = weeks_between(today(), last_deload.date) if last_deload else 999
    if weeks_since >= weeks_threshold:
        triggers.append('time_elapsed')

    if is_stalled(history, threshold=3):
        triggers.append('plateau')

    if rpe_trending_up(history):
        triggers.append('rpe_creep')

    if volume_status and volume_status['fatigue_status'] in ('warning', 'over_limit'):
        if has_been_high_fatigue_for_weeks(volume_status['muscle_id'], weeks=3):
            triggers.append('chronic_high_fatigue')

    if pain_trends and any(t['trend'] == 'worsening' for t in pain_trends):
        triggers.append('pain_worsening')

    return len(triggers) >= 2
```

---

### 4.8 종목 변형 추천

```python
def recommend_safer_variation(exercise, injury_profile, current=None):
    variations = get_exercise_variations(exercise.id)
    if not variations:
        return None

    scored = []
    for v in variations:
        if current and v.id == current.id:
            continue

        stress = v.joint_stress_modifier.get(injury_profile.body_region_id, 1.0)
        stats = get_user_variation_stats(injury_profile.user_id, v.id)

        pain_penalty = (stats.pain_incident_count * 0.2) if stats else 0
        preference_bonus = -(stats.user_preference_score or 0) * 0.1 if stats else 0
        grip_penalty = 0.5 if v.grip_type in injury_profile.affected_grips else 0

        score = stress + pain_penalty + grip_penalty + preference_bonus
        scored.append((v, score))

    if not scored:
        return None

    scored.sort(key=lambda x: x[1])
    best, best_score = scored[0]

    if current:
        current_stress = current.joint_stress_modifier.get(injury_profile.body_region_id, 1.0)
        if best_score >= current_stress * 0.9:
            return None

    return best
```

---

### 4.9 추천 수정 이유 기반 학습

```python
def update_recommendation_bias_from_feedback(user, exercise):
    feedbacks = get_recent_feedback(user, exercise, limit=10)

    too_heavy = count_reason(feedbacks, 'too_heavy')
    too_light = count_reason(feedbacks, 'too_light')
    pain = count_reason(feedbacks, 'pain')
    equipment = count_reason(feedbacks, 'equipment_unavailable')

    bias = exercise.recommendation_bias

    if too_heavy >= 3:
        bias *= 0.95
    if too_light >= 3:
        bias *= 1.05
    if pain >= 2:
        mark_exercise_as_caution_for_user(user, exercise)
        flag_variation_swap_priority(user, exercise)
    if equipment >= 3:
        flag_alternative_priority(user, exercise)

    return clamp(bias, 0.8, 1.2)
```

---

### 4.10 볼륨 타겟 학습

```python
def auto_adjust_volume_targets(user, muscle_id):
    target = get_volume_target(user, muscle_id)
    if not target.auto_adjusted:
        return None

    weekly = get_weekly_volume_history(user, muscle_id, weeks=8)
    progress = calculate_strength_trend(user, get_primary_exercises(muscle_id), weeks=8)
    pain_count = count_pain_logs_for_muscle(user, muscle_id, weeks=8)

    suggestions = []

    if count(lambda w: w.direct_sets >= target.direct_mrv * 0.9, weekly) >= 4 and progress <= 0:
        suggestions.append({
            'action': 'lower_direct_mrv',
            'recommended': target.direct_mrv - 2,
            'reason': '직접 고볼륨 유지에도 진전이 없어 direct MRV 하향 제안.'
        })

    if count(lambda w: w.fatigue_score >= target.fatigue_limit * 0.9, weekly) >= 3 and pain_count >= 2:
        suggestions.append({
            'action': 'lower_fatigue_limit',
            'recommended': target.fatigue_limit - 3,
            'reason': '회복 부담 한계 근처에서 통증이 반복되어 fatigue limit 하향 제안.'
        })

    if count(lambda w: w.direct_sets <= target.direct_mev * 1.2, weekly) >= 4 and progress > 0 and pain_count == 0:
        suggestions.append({
            'action': 'raise_direct_targets',
            'reason': '낮은 직접 볼륨에서도 진전이 있고 통증이 없어 볼륨 증가 여지 있음.',
            'recommended': {
                'direct_mav_low': target.direct_mav_low + 2,
                'direct_mav_high': target.direct_mav_high + 2,
                'direct_mrv': target.direct_mrv + 2,
            }
        })

    return suggestions
```

---

## 5. 시스템 데이터 흐름

```txt
세트 입력
  ├─ 종목 / 변형
  ├─ 무게 / 횟수 / RPE / RIR
  ├─ 워밍업 여부 / warmup_intensity
  ├─ set_type
  └─ load_type
        ↓
운동 세션 입력
  ├─ 컨디션
  ├─ 수면
  ├─ 피로도
  └─ 시간 제한
        ↓
통증/부상 데이터
  ├─ PainLog: 단기 통증
  └─ UserInjuryProfile: 장기 안전 필터
        ↓
분석 레이어
  ├─ 종목별 수행 추이
  ├─ direct_sets
  ├─ indirect_sets
  ├─ effective_sets
  ├─ fatigue_score
  ├─ pain trend
  └─ recommendation deviation
        ↓
통합 추천 엔진
  1. 부상/통증 안전 필터
  2. 컨디션/회복 상태
  3. fatigue/effective 부담
  4. direct 성장 볼륨
  5. 종목별 progression
  6. 사용자 수정 패턴
        ↓
추천 결과
  ├─ 오늘 중량/반복/세트 추천
  ├─ 종목 추가/감소 추천
  ├─ 종목 변형 추천
  ├─ 대체 운동 추천
  └─ 디로딩/보수 진행 권장
```

---

## 6. 개발 우선순위 및 마일스톤

### Phase 1A: 기록 앱으로 성립

목표: 일단 메모 앱을 대체할 수 있어야 한다.

1. 운동 종목 등록/선택
2. 기본 변형 자동 선택
3. 세트 입력
4. 루틴/템플릿
5. 이전 기록 표시
6. 수정/삭제
7. JSON/CSV 백업

> 이 단계에서는 `ExerciseVariation` 테이블은 만들 수 있지만, UI에서는 상세 변형 선택을 숨기거나 선택사항으로 둔다.

### Phase 1B: 분석 가능한 기록 앱

1. 워밍업/본세트 구분
2. RPE/RIR 입력
3. set_type 입력
4. load_type 입력
5. 세션 컨디션 입력
6. 통증 로그 입력
7. 부상 프로필 입력
8. 직접 세트 계산
9. 종목별 최근 추이 표시
10. 변형 선택 UI 활성화

### Phase 2A: 보조근 환산 + 볼륨 대시보드

1. ExerciseMuscleMapping 적용
2. direct/indirect/effective 분리 계산
3. fatigue_score 계산
4. VolumeSnapshot 캐시
5. calendar_week + rolling_7d + rolling_10d 계산
6. 부위별 볼륨 그래프
7. 통증 추이 그래프

### Phase 2B: 기본 추천 + 추천-실제 비교

1. 점진적 과부하 추천
2. 휴식 후 복귀 추천
3. PlannedWorkoutSession 저장
4. 추천 vs 실제 차이 기록
5. RecommendationFeedback 저장

### Phase 3: 볼륨 관리 + 안전 추천

1. direct MEV/MAV/MRV 설정
2. effective_warning/effective_limit 설정
3. fatigue_warning/fatigue_limit 설정
4. 루틴 사전 검증
5. 통증/부상 우선 안전 필터
6. ExerciseVariation 기반 변형 추천
7. 통합 진단 추천
8. 통증 추이 분석 기반 보수화

### Phase 4: 자동화 + 학습

1. 디로딩 자동 감지
2. 추천 보정 학습
3. 볼륨 타겟 자동 조정
4. 종목 자동 제안
5. 사용자별 변형 선호/통증 학습
6. **부상 프로필 자동 상태 조정 제안** (v4.3)

### Phase 5: 편의성

1. 휴식 타이머
2. 슈퍼셋/드롭셋 UX 강화
3. 클라우드 동기화
4. 위젯/워치 연동

---

## 7. 부록

### 7.1 BodyRegion 예시

| id | 이름 | type | parent |
|---|---|---|---|
| shoulder | 어깨 | area | null |
| shoulder_front | 전면 어깨 | area | shoulder |
| shoulder_side | 측면 어깨 | area | shoulder |
| shoulder_rear | 후면 어깨 | area | shoulder |
| wrist | 손목 | joint | null |
| elbow | 팔꿈치 | joint | null |
| lower_back | 허리 | area | null |
| knee | 무릎 | joint | null |
| hip | 고관절 | joint | null |
| ankle | 발목 | joint | null |

---

### 7.2 종목별 보조근 매핑 초안

| 종목 | 주동근 1.0 | 보조근 0.5 | 보조근 0.25 |
|---|---|---|---|
| 벤치프레스 | 가슴 | 앞어깨, 삼두 | — |
| 인클라인 벤치프레스 | 가슴 상부 | 앞어깨, 삼두 | — |
| 오버헤드프레스 | 앞어깨 | 옆어깨, 삼두 | 가슴 상부 |
| 딥스 | 가슴 하부, 삼두 | 앞어깨 | — |
| 데드리프트 | 햄스트링, 둔근, 척추기립근 | 광배, 승모 | 전완 |
| 스쿼트 | 대퇴사두 | 둔근 | 햄스트링 |
| 풀업/랫풀다운 | 광배 | 이두 | 뒤어깨, 능형근 |
| 바벨로우 | 광배, 능형근 | 뒤어깨, 이두 | 척추기립근 |
| 페이스풀 | 뒤어깨 | 능형근, 승모 | — |
| 바이셉 컬 | 이두 | — | 전완 |
| 트라이셉 익스텐션 | 삼두 | — | — |
| 레터럴 레이즈 | 옆어깨 | — | 승모 |

---

### 7.3 종목/변형 안전 예시

v4.3에서는 `Exercise`와 `ExerciseVariation`의 경계를 명확히 한다. 아래 표에서 바벨 컬, EZ바 컬, 덤벨 해머 컬은 서로 다른 `Exercise`이며, 같은 `alternative_group_id = biceps_curl`에 속한다. 반면 덤벨 컬의 교대/동시 수행, 케이블 컬의 손잡이 차이처럼 같은 종목 내부의 작은 차이는 `ExerciseVariation`으로 둔다.

#### 대체 그룹 예시

| alternative_group_id | Exercise 후보 | 주된 차이 | 손목 부담 | 어깨 부담 |
|---|---|---|---:|---:|
| biceps_curl | 바벨 컬 | 일자바 고정 | 1.0 | 0.3 |
| biceps_curl | EZ바 컬 | 반회외 그립 | 0.6 | 0.3 |
| biceps_curl | 덤벨 해머 컬 | 뉴트럴 그립 | 0.4 | 0.3 |
| biceps_curl | 케이블 컬 | 장력 일정, 손잡이 다양 | 0.5~0.8 | 0.3 |
| chest_horizontal_press | 바벨 벤치프레스 | 고정 바벨, 고중량 | 0.8 | 1.0 |
| chest_horizontal_press | 덤벨 벤치프레스 | 자유 궤도, 뉴트럴 가능 | 0.5 | 0.7 |
| chest_horizontal_press | 머신 체스트프레스 | 안정성 높음 | 0.3 | 0.5 |
| shoulder_vertical_press | 바벨 OHP | 고정 바벨, 기술 요구 | 0.9 | 1.0 |
| shoulder_vertical_press | 덤벨 OHP | 뉴트럴 가능 | 0.5 | 0.7 |
| shoulder_vertical_press | 머신 숄더프레스 | 안정성 높음 | 0.3 | 0.6 |

#### ExerciseVariation 예시

| Exercise | Variation | 설명 |
|---|---|---|
| 덤벨 컬 | 교대 수행 | 한 팔씩 번갈아 수행 |
| 덤벨 컬 | 동시 수행 | 양팔을 동시에 수행 |
| 덤벨 컬 | 인클라인 | 어깨 신전 자세에서 수행 |
| 케이블 컬 | 스트레이트바 | 양손 고정 바 손잡이 |
| 케이블 컬 | 로프 | 손목 각도 자유도 증가 |
| 케이블 컬 | 싱글핸들 | 한 팔씩 수행 |
| 머신 체스트프레스 | 뉴트럴 손잡이 | 손목/어깨 부담 감소 가능 |
| 머신 체스트프레스 | 프론티드 손잡이 | 일반 프레스 손잡이 |

`joint_stress_modifier` 값은 BodyRegion별 부담 보정값이다. 0.5는 해당 부위 부담을 기본 대비 50%로 본다는 뜻이다.

---

### 7.4 부위별 볼륨 가이드라인 초기값

#### Direct 기준

| 부위 | direct_MEV | direct_MAV | direct_MRV |
|---|---:|---:|---:|
| 가슴 | 8 | 12~18 | 22 |
| 등 | 10 | 14~20 | 25 |
| 앞어깨 | 6 | 8~14 | 18 |
| 옆어깨 | 8 | 12~18 | 22 |
| 뒤어깨 | 6 | 10~16 | 20 |
| 이두 | 6 | 10~16 | 20 |
| 삼두 | 6 | 10~16 | 20 |
| 대퇴사두 | 8 | 12~18 | 22 |
| 햄스트링 | 6 | 10~16 | 20 |
| 둔근 | 6 | 10~16 | 20 |
| 종아리 | 8 | 12~18 | 22 |
| 코어 | 0 | 8~16 | 25 |

#### Effective/Fatigue 기준

| 부위 | effective_warning | effective_limit | fatigue_warning | fatigue_limit |
|---|---:|---:|---:|---:|
| 가슴 | 20 | 28 | 22 | 32 |
| 등 | 22 | 32 | 24 | 36 |
| 앞어깨 | 14 | 22 | 16 | 26 |
| 옆어깨 | 18 | 26 | 20 | 30 |
| 뒤어깨 | 14 | 22 | 16 | 26 |
| 이두 | 18 | 26 | 20 | 30 |
| 삼두 | 18 | 26 | 20 | 30 |
| 대퇴사두 | 20 | 28 | 24 | 34 |
| 햄스트링 | 16 | 24 | 20 | 30 |
| 둔근 | 18 | 26 | 22 | 32 |
| 종아리 | 18 | 28 | 20 | 32 |
| 코어 | 16 | 28 | 18 | 32 |

부상 프로필이 있는 부위는 `volume_cap_factor`로 effective_limit와 fatigue_limit를 자동 축소한다.

---

### 7.5 v4.5 구현 시 체크리스트

1. **기록 기능이 먼저다**
   - 추천 엔진보다 안정적인 기록/조회/수정/백업을 먼저 완성한다.

2. **직접 볼륨과 피로도 판단을 분리한다**
   - direct는 성장 볼륨.
   - effective는 보조근 포함 자극량.
   - fatigue_score는 회복 부담.

3. **워밍업 규칙을 일관되게 적용한다**
   - 워밍업은 direct/effective에 넣지 않는다.
   - fatigue_score에는 강도별로 낮은 가중치를 준다.

4. **사용자별 통계는 마스터 데이터와 분리한다**
   - ExerciseVariation은 변형 자체의 정보.
   - UserExerciseVariationStats는 사용자별 통증/선호/수행 이력.

5. **BodyRegion으로 명칭을 통일한다**
   - shoulder, shoulder_front, wrist 등 표준 ID를 사용한다.
   - 자유 문자열을 추천 로직의 핵심 키로 쓰지 않는다.

6. **통증/부상은 항상 우선한다**
   - 통증이 있는 날에는 볼륨 최적화보다 안전 조정이 먼저다.

7. **추천값은 정답이 아니라 기본값이다**
   - 사용자가 바꾸는 것은 오류가 아니다.
   - 변경 이유를 다음 추천에 반영한다.

8. **초기 버전은 룰 기반으로 시작한다**
   - 설명 가능한 규칙으로 시작해야 디버깅과 안전성 확보가 쉽다.

9. **의료적 표현은 조심한다**
   - 앱은 진단하지 않는다.
   - 반복 통증이나 일상생활 영향이 있으면 전문가 상담을 고려하라고 안내한다.

10. **Phase 1A에서 변형 UI는 선택사항이다**
    - 데이터 구조는 준비하되, 초기 UI는 기본 변형 자동 선택으로 단순화한다.

11. **의사코드 헬퍼는 4.0절에서 미리 정의된 것만 사용한다** (v4.2~v4.4)
    - `max_risk`, `count`, `avg`, `clamp`, `current_rolling_7d` 등은 4.0절에 정의되어 있다.
    - 새 헬퍼가 필요하면 4.0절에 먼저 추가하고 사용한다.

12. **변형 데이터가 부족하면 종목 전체 추이로 fallback한다** (v4.2)
    - `get_recent_sessions_for_recommendation()`이 fallback 정책을 관리한다.
    - fallback이 발생하면 사용자 메시지에 명시 (`attach_fallback_note`).
    - MIN_VARIATION_HISTORY는 기본 3, 사용 패턴 보고 조정 가능.

13. **대체 그룹은 "주동근 + 동작 패턴"으로 정의한다** (v4.2)
    - alternative_group_id의 네이밍: `{primary_muscle_group}_{primary_pattern}`
    - 변형(같은 종목 그립/기구)과 혼동하지 않는다.
    - 부상 시 우선순위: 변형 교체 → 같은 그룹 다른 종목 → 생략.

14. **부상 프로필 상태는 자동으로 바꾸지 않는다** (v4.2)
    - 시스템은 "변경 제안"만 한다.
    - 사용자가 명시적으로 확인해야 status가 바뀐다.
    - 통증 재발 시 업그레이드 제안도 동일 — 자동 적용 금지.

15. **Exercise / Variation / 대체 그룹 경계를 지킨다** (v4.3)
    - `Exercise`는 실제 기록 단위에 가까운 구체 종목이다.
    - `ExerciseVariation`은 같은 종목 내부의 작은 변형이다.
    - `alternative_group_id`는 서로 다른 종목 간 대체 후보를 묶는다.

16. **맨몸 운동 부하 계산을 구분한다** (v4.3)
    - 일반 맨몸은 `bodyweight`.
    - 중량 풀업/딥스는 `weighted_bodyweight`.
    - 어시스트 풀업은 `assisted_bodyweight`.

17. **안전 필터는 중량을 올리지 않는다** (v4.3)
    - 부상 필터는 안전 상한선을 적용한다 (`min()` 패턴).
    - 디로딩/감량 추천을 다시 증량으로 덮어쓰지 않는다.

18. **fatigue over-limit에서는 progression을 차단한다** (v4.3)
    - `over_limit`이면 경고만 붙이지 말고 유지/감량 추천으로 분기한다.

19. **통증 없음과 기록 없음을 구분한다** (v4.3)
    - 부상 상태 완화 제안은 `pain_level = 0` 체크인이 충분히 있을 때만 한다.

20. **부하 조회는 `set_load_kg()` 기반 헬퍼만 사용한다** (v4.4)
    - `last_session_max_weight`, `last_session_avg_weight`, `get_last_weight` 등 4.0절 헬퍼를 사용한다.
    - `set.weight_kg`을 직접 읽으면 `weighted_bodyweight` / `assisted_bodyweight` 케이스에서 부정확해진다.

21. **안전 필터의 fallback 체인을 지킨다** (v4.4)
    - ① 같은 Exercise 내 더 안전한 Variation → `recommend_safer_variation`
    - ② 같은 alternative_group_id 내 다른 Exercise → `find_joint_friendly_alternatives`
    - ③ 위 둘 다 없으면 안전 상한선만 적용

22. **무통증 체크인을 명시적으로 수집한다** (v4.4)
    - 자동 다운그레이드 조건이 만족되려면 사용자가 실제로 "오늘 안 아픔" 입력을 해야 한다.
    - 부록 7.6의 UX 가이드 참고.

23. **진행 중 세션은 `duration_seconds === null`로 표현한다** (v4.5)
    - `0`을 진행 중 표시로 쓰지 않는다.
    - 한 사용자당 진행 중 세션은 최대 1개로 제한한다.
    - 앱 진입 시 자동 복구 (F1.13).

24. **종목 삭제는 cascade 처리한다** (v4.5)
    - SessionExercise 삭제 시 하위 WorkoutSet도 모두 함께 삭제한다.
    - 진행 중 세션과 과거 세션 편집 모드 모두에서 가능하다.
    - 삭제 전 확인 다이얼로그를 제공해 실수를 방지한다.

25. **진행 중 세션과 과거 세션 편집을 분리한다** (v4.5)
    - `sessionStore.currentSessionId`는 진행 중 세션 전용이다.
    - 과거 세션 편집은 별도 라우트 + 로컬 상태로 분리한다.
    - 두 상태를 같은 store에 올리지 않는다.

26. **앱 시작 시 영구 저장 권한을 요청한다** (v4.5)
    - `navigator.storage.persist()`를 호출해 LRU eviction을 방지한다.
    - PWA로 설치된 경우 자동 승인되는 경향이 있다.
    - 권한이 거부되면 정기 백업(F8)을 권장한다.

---

### 7.6 무통증 체크인 UX 가이드 (v4.4 신규)

**왜 필요한가**

`suggest_injury_profile_status_update` 함수는 단순히 통증 기록이 없는 기간만 보지 않고, 명시적인 `pain_level = 0` 체크인을 일정 횟수 이상 요구한다 (active → recovering: 14일 + 2회, recovering → managed: 30일 + 3회, managed → resolved: 90일 + 4회). 사용자가 통증 입력을 단순히 안 한 것(귀찮음, 잊음)과 실제로 "오늘 안 아팠음"을 시스템이 구분하기 위해서다.

이 조건이 만족 가능하려면 무통증 체크인을 자연스럽게 수집할 UX가 필요하다.

**수집 시점 (권장 우선순위)**

1. **운동 시작 시 부상 부위 카드 노출**
   - 부상 프로필이 등록된 부위에 한해, 세션 시작 화면에 "오늘 [전면 어깨] 컨디션은?" 카드를 표시
   - 옵션: "괜찮음(0) / 가벼움(1) / 보통(2) / 강함(3+) / 건너뛰기"
   - "건너뛰기"는 PainLog를 만들지 않음 → 다운그레이드 조건에 반영되지 않음
   - "괜찮음" 선택 시 `pain_level = 0`, `timing = 'before'` 로그 생성

2. **운동 후 부상 부위 체크인**
   - 세션 종료 시 부상 부위가 영향 받는 종목을 수행했다면 "[부위] 통증 있었나요?" 묻기
   - 옵션 동일, `timing = 'after'` 또는 `'during'`

3. **운동하지 않은 날의 주간 체크인**
   - 마지막 PainLog로부터 7일 이상 경과 시, 앱 진입 시 가벼운 알림: "[부위] 이번 주 어떻게 지내셨나요?"
   - 옵션 동일, `timing = 'rest_day'`
   - **이 케이스가 다운그레이드 조건 달성에 가장 중요하다.** 운동을 잘 안 한 시기에도 부상 부위 회복 신호를 수집할 수 있게 한다.

**입력 부담 최소화 원칙**

- 매 세션마다 강제로 묻지 않는다. 부상 프로필이 `active`나 `recovering` 상태일 때만 묻고, `managed`로 가면 빈도를 낮춘다 (예: 주 1회).
- "건너뛰기"를 항상 제공한다. 사용자가 답하기 싫을 때 부담 없이 넘어갈 수 있어야 한다.
- 부상 프로필이 등록되지 않은 부위에 대해서는 묻지 않는다.

**다운그레이드 제안 노출**

- `suggest_injury_profile_status_update`가 다운그레이드를 제안하면, 부상 부위 화면 또는 홈 화면에 알림 카드 형태로 표시:
  > "전면 어깨에 30일 동안 통증 기록이 없고, 무통증 체크인이 3회 있었습니다. 상태를 '관리 중(managed)'으로 완화하시겠습니까?"
- 사용자가 명시적으로 "예/아니오"를 선택해야 적용된다. 자동 적용 금지.

**업그레이드 제안 노출**

- 새 통증 2/5 이상이 기록되면 즉시 알림 카드 표시:
  > "전면 어깨에 통증 2/5가 기록되었습니다. 안전 필터 강도를 '회복 중(recovering)'으로 높일까요?"
- 사용자가 거절하면 7일간 같은 제안을 다시 띄우지 않는다 (스팸 방지).
