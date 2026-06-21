import { db } from '../schema';
import { newId } from '../../utils/id';
import type {
  Equipment,
  Exercise,
  ExerciseMuscleMapping,
  Muscle,
} from '../../types';

export interface ExerciseListItem {
  exercise: Exercise;
  /** primary role mapping의 muscle. 없으면 null (시드 데이터엔 모든 종목에 primary가 있지만 방어적 처리) */
  primaryMuscle: Muscle | null;
}

/**
 * 모든 종목 + 주동근 정보를 조회.
 * 60개 종목 × 평균 4~5개 매핑 = ~250 레코드. 전체 스캔으로 충분.
 *
 * v4.6: is_archived=true(soft delete)인 종목은 목록/검색에서 제외.
 * (과거 세션·히스토리는 id 직접 조회라 보관된 종목 이름이 그대로 표시됨)
 */
export async function getAllExercisesWithPrimaryMuscle(): Promise<ExerciseListItem[]> {
  const [exercises, mappings, muscles] = await Promise.all([
    db.exercises.toArray(),
    db.exerciseMuscleMappings.toArray(),
    db.muscles.toArray(),
  ]);

  const muscleById = new Map(muscles.map((m) => [m.id, m]));
  const primaryByExerciseId = new Map<string, Muscle>();
  for (const m of mappings) {
    if (m.role !== 'primary') continue;
    const muscle = muscleById.get(m.muscle_id);
    if (muscle && !primaryByExerciseId.has(m.exercise_id)) {
      // 종목당 primary 매핑이 여러 개 있을 경우 첫 번째 사용 (시드엔 단일이지만 방어)
      primaryByExerciseId.set(m.exercise_id, muscle);
    }
  }

  return exercises
    .filter((ex) => !ex.is_archived)
    .map((ex) => ({
      exercise: ex,
      primaryMuscle: primaryByExerciseId.get(ex.id) ?? null,
    }));
}

// =========================================
// v4.6: 커스텀 종목 추가/수정/삭제
// =========================================

export interface CustomExerciseSecondary {
  muscleId: string;
  /** 0.5 또는 0.25 */
  coefficient: number;
}

export interface CustomExerciseInput {
  name: string;
  category: 'compound' | 'isolation';
  equipment: Equipment;
  primaryMuscleId: string;
  /** 0~2개 */
  secondaries: CustomExerciseSecondary[];
  restSeconds: number;
  repRange: [number, number];
}

/** 카테고리 기반 무게 증가 단위 기본값 */
function defaultIncrement(category: 'compound' | 'isolation'): number {
  return category === 'compound' ? 2.5 : 1.25;
}

/** 입력으로부터 ExerciseMuscleMapping 레코드 배열 생성 */
function buildMappings(
  exerciseId: string,
  input: CustomExerciseInput
): ExerciseMuscleMapping[] {
  const mappings: ExerciseMuscleMapping[] = [
    {
      exercise_id: exerciseId,
      muscle_id: input.primaryMuscleId,
      role: 'primary',
      coefficient: 1.0,
    },
  ];
  for (const s of input.secondaries) {
    mappings.push({
      exercise_id: exerciseId,
      muscle_id: s.muscleId,
      role: 'secondary',
      coefficient: s.coefficient,
    });
  }
  return mappings;
}

/**
 * 커스텀 종목 생성. Exercise + ExerciseMuscleMapping을 한 트랜잭션으로 저장.
 * 자동 추정/기본값은 spec(slice2.5 §5.2)대로 채운다.
 */
export async function createCustomExercise(
  input: CustomExerciseInput
): Promise<Exercise> {
  const id = `custom_${newId()}`;
  const exercise: Exercise = {
    id,
    name: input.name.trim(),
    category: input.category,
    default_equipment: input.equipment,
    is_custom: true,
    target_rep_range: input.repRange,
    weight_increment_kg: defaultIncrement(input.category),
    default_rest_seconds: input.restSeconds,
    recommendation_bias: 1.0,
    fatigue_factor: 1.0,
    joint_stress_region_ids: [],
    movement_patterns: [],
    skill_level: 'medium',
    stability: 'moderate',
    unilateral: false,
    alternative_group_id: null,
    muscle_mapping_confidence: 'user_estimated',
    is_archived: false,
  };

  await db.transaction('rw', db.exercises, db.exerciseMuscleMappings, async () => {
    await db.exercises.add(exercise);
    await db.exerciseMuscleMappings.bulkAdd(buildMappings(id, input));
  });
  return exercise;
}

/**
 * 커스텀 종목 수정. is_custom=true인 종목만 허용.
 * 종목 필드 갱신 + 기존 매핑 전부 교체.
 */
export async function updateCustomExercise(
  id: string,
  input: CustomExerciseInput
): Promise<void> {
  const existing = await db.exercises.get(id);
  if (!existing) throw new Error('종목을 찾을 수 없어요.');
  if (!existing.is_custom) throw new Error('시드 종목은 수정할 수 없어요.');

  await db.transaction('rw', db.exercises, db.exerciseMuscleMappings, async () => {
    await db.exercises.update(id, {
      name: input.name.trim(),
      category: input.category,
      default_equipment: input.equipment,
      target_rep_range: input.repRange,
      weight_increment_kg: defaultIncrement(input.category),
      default_rest_seconds: input.restSeconds,
    });
    // 매핑 전체 교체 (복합 PK라 where로 삭제)
    await db.exerciseMuscleMappings
      .where('exercise_id')
      .equals(id)
      .delete();
    await db.exerciseMuscleMappings.bulkAdd(buildMappings(id, input));
  });
}

/** 종목이 과거 세션에서 사용됐는지 */
export async function isExerciseUsed(id: string): Promise<boolean> {
  const count = await db.sessionExercises
    .where('exercise_id')
    .equals(id)
    .count();
  return count > 0;
}

/**
 * 커스텀 종목 삭제. is_custom=true만 허용.
 * - 사용 이력 없음 → hard delete (Exercise + 매핑 삭제)
 * - 사용 이력 있음 → soft delete (is_archived=true, 과거 세션 보존)
 */
export async function deleteCustomExercise(
  id: string
): Promise<'deleted' | 'archived'> {
  const existing = await db.exercises.get(id);
  if (!existing) throw new Error('종목을 찾을 수 없어요.');
  if (!existing.is_custom) throw new Error('시드 종목은 삭제할 수 없어요.');

  const used = await isExerciseUsed(id);
  if (used) {
    await db.exercises.update(id, { is_archived: true });
    return 'archived';
  }

  await db.transaction('rw', db.exercises, db.exerciseMuscleMappings, async () => {
    await db.exerciseMuscleMappings.where('exercise_id').equals(id).delete();
    await db.exercises.delete(id);
  });
  return 'deleted';
}

/** 종목 + 매핑 조회 (수정 화면 초기값용) */
export async function getExerciseWithMappings(
  id: string
): Promise<{ exercise: Exercise; mappings: ExerciseMuscleMapping[] } | null> {
  const exercise = await db.exercises.get(id);
  if (!exercise) return null;
  const mappings = await db.exerciseMuscleMappings
    .where('exercise_id')
    .equals(id)
    .toArray();
  return { exercise, mappings };
}

/** 이름 중복 검사 (보관되지 않은 종목 대상, 대소문자·공백 무시). editingId는 자기 자신 제외 */
export async function isDuplicateName(
  name: string,
  editingId?: string
): Promise<boolean> {
  const norm = name.trim().toLowerCase();
  const all = await db.exercises.toArray();
  return all.some(
    (e) =>
      !e.is_archived &&
      e.id !== editingId &&
      e.name.trim().toLowerCase() === norm
  );
}
