/**
 * 타입 정의 — 시드 데이터 타입은 src/db/seeds.ts에서 re-export, 사용자 데이터 타입은 여기서 신규 정의.
 *
 * Slice 2에서 본격 사용: Routine, RoutineExercise + WorkoutSession/Set의 nullable 필드들.
 * 향후 슬라이스용 stub: UserInjuryProfile, PainLog (Slice 3).
 */

// =========================================
// 시드 데이터 타입 (src/db/seeds.ts에서 re-export)
// =========================================

export type {
  MuscleGroup,
  ExerciseCategory,
  Equipment,
  GripType,
  SkillLevel,
  Stability,
  MuscleRole,
  BodyRegion,
  Muscle,
  ExerciseVariation,
  ExerciseMuscleMapping,
} from '../db/seeds';

import type { Exercise as SeedExercise } from '../db/seeds';

/**
 * 앱에서 사용하는 Exercise 타입.
 *
 * seeds.ts는 "수정 금지" 원칙이라 seed의 Exercise를 직접 건드리지 않고,
 * v4.6에서 추가된 필드를 여기서 확장(재정의 아님)한다.
 * seed 데이터 삽입 시 seed-loader가 기본값을 채운다.
 */
export interface Exercise extends SeedExercise {
  /** v4.6: 보조근 매핑 정확도. 시드='verified', 커스텀='user_estimated' */
  muscle_mapping_confidence: 'verified' | 'user_estimated';
  /** v4.6(추가 결정): soft delete. 사용 이력 있는 커스텀 종목 삭제 시 true */
  is_archived: boolean;
}

// =========================================
// 공통 척도 타입
// =========================================

/** 1~5 척도 (컨디션 / 수면 / 피로도 입력) */
export type OneToFive = 1 | 2 | 3 | 4 | 5;

// =========================================
// 사용자 데이터 타입
// =========================================

export interface User {
  /** 단일 사용자 앱이므로 항상 'me' */
  id: string;
  body_weight_kg: number;
  unit_preference: 'kg' | 'lb';
  /** Slice 2: 강도 입력 방식 선호. 기본 'rpe'. SetInput이 둘 중 하나만 표시. */
  intensity_metric: 'rpe' | 'rir';
  deload_mode_active: boolean;
  /** ISO 8601 */
  created_at: string;
}

export interface WorkoutSession {
  id: string;
  /** ISO 8601 — 세션 시작 시점 */
  date: string;
  /** Slice 2: 루틴에서 시작했으면 ID 저장, 빈 세션이면 null */
  routine_id: string | null;
  /** Slice 1~2에서는 항상 null (planned session 기능 미구현) */
  planned_session_id: string | null;
  /** Slice 2: 세션 시작 시 입력. 미입력 시 null */
  condition_score: OneToFive | null;
  /** Slice 2: 세션 시작 시 입력. 미입력 시 null */
  sleep_quality: OneToFive | null;
  /** Slice 2: 세션 시작 시 입력. 1=가장 안 피곤, 5=가장 피곤. 미입력 시 null */
  fatigue_level: OneToFive | null;
  /** Slice 2: 세션 시작 시 입력 (30/45/60/90분 등). 미입력 시 null */
  time_limit_minutes: number | null;
  /** Slice 1~2에서는 항상 false (디로딩 모드는 Phase 4) */
  is_deload: boolean;
  notes: string;
  /**
   * 세션 운동 시간 (초). null = 진행 중 세션 (한 유저당 최대 1개).
   * 종료 시점에 floor((end - start) / 1000)으로 계산해 저장.
   */
  duration_seconds: number | null;
}

export interface SessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  /** is_default=true인 variation을 자동 할당 (변형 선택 UI는 Phase 2 이후) */
  variation_id: string | null;
  /** 세션 내 종목 순서 (0부터) */
  order: number;
  /** v4.7: 세션 중 '완료' 표시. true면 기본 접힘+흐리게. 기존 데이터는 undefined→false로 취급. */
  is_done: boolean;
}

/**
 * Slice 1~2 한정 — 향후 슬라이스에서 'amrap' / 'drop' / 'cluster' 등 추가 예정.
 */
export type SetType = 'normal';

/**
 * Slice 1~2 한정 — 'weighted_bodyweight' / 'assisted_bodyweight' 추가 예정.
 */
export type LoadType = 'external' | 'bodyweight';

export interface WorkoutSet {
  id: string;
  session_exercise_id: string;
  /** 1부터 시작 */
  set_number: number;
  is_warmup: boolean;
  /** 맨몸 운동(load_type='bodyweight')은 null. 외부 부하는 kg 값 저장 (단위 무관, lb 입력도 kg으로 변환 후 저장) */
  weight_kg: number | null;
  reps: number;
  /** Slice 2부터 입력 받음. 1~10 (소수 허용, 예: 8.5). 미입력 시 null */
  rpe: number | null;
  /** Slice 2부터 입력 받음. 0~5 정수. 미입력 시 null */
  rir: number | null;
  set_type: SetType;
  load_type: LoadType;
  /** Slice 3+ (assisted_bodyweight). 현재는 항상 null */
  assistance_kg: number | null;
  /** load_type='bodyweight'일 때 user.body_weight_kg 스냅샷 */
  body_weight_kg_snapshot: number | null;
  notes: string;
  /** ISO 8601 */
  completed_at: string;
}

// =========================================
// Slice 2에서 본격 사용 (루틴/템플릿)
// =========================================

export interface Routine {
  id: string;
  /** 사용자가 지정한 루틴 이름 (예: "푸시 데이 A") */
  name: string;
  /** ISO 8601 */
  created_at: string;
}

/**
 * 복합 PK [routine_id+exercise_id]. 한 루틴 내 동일 종목 중복 불가 (Slice 2 단순화).
 */
export interface RoutineExercise {
  routine_id: string;
  exercise_id: string;
  /** is_default=true인 variation 자동 선택 */
  variation_id: string | null;
  /** 루틴 내 종목 순서 (0부터). 사용자 정렬 변경 가능 */
  order: number;
  /** 이 종목의 기본 세트 수 (기본 3). 루틴에서 세션 시작 시 참고용. */
  default_sets: number;
  /** Slice 2에서는 항상 null. Phase 5 슈퍼셋 도입 시 사용. */
  superset_group: number | null;
}

// =========================================
// 향후 슬라이스용 stub 타입 (Dexie 스키마 컴파일 목적)
// =========================================
// Slice 3에서 정식 확장 예정. 현재는 schema가 인덱싱하는 필드 + id만 포함.

/**
 * Slice 3에서 확장. my-injury-profiles.ts의 전체 모양 참조.
 */
export interface UserInjuryProfile {
  id: string;
  user_id: string;
  body_region_id: string;
  /** 'active' | 'recovering' | 'managed' | 'resolved' (Slice 3에서 정식 union 도입) */
  status: string;
}

/**
 * Slice 3에서 확장.
 */
export interface PainLog {
  id: string;
  user_id: string;
  /** ISO 8601 */
  date: string;
  body_region_id: string;
}
