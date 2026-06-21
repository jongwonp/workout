import { db } from '../schema';
import { newId } from '../../utils/id';
import { nowIso } from '../../utils/date';
import type { LoadType, WorkoutSet } from '../../types';

export async function getSetsForSessionExercise(
  sessionExerciseId: string
): Promise<WorkoutSet[]> {
  const sets = await db.workoutSets
    .where('session_exercise_id')
    .equals(sessionExerciseId)
    .toArray();
  sets.sort((a, b) => a.set_number - b.set_number);
  return sets;
}

interface CreateSetOptions {
  loadType: LoadType;
  /** load_type='bodyweight'일 때만 의미 있음 */
  bodyWeightKg?: number;
  /**
   * v4.6: "이전 세트와 동일" 복사용 초기값. 미지정 시 빈 세트.
   * 복사 규칙은 호출부(SessionExerciseBlock)에서 적용한다.
   */
  initial?: Pick<WorkoutSet, 'is_warmup' | 'weight_kg' | 'reps' | 'rpe' | 'rir'>;
}

/**
 * 새 세트 생성. set_number는 기존 세트 수 + 1.
 * 기본 초기값: weight_kg=null (외부 부하), reps=0, is_warmup=false.
 * opts.initial이 있으면 해당 값으로 채운다 (이전 세트 복사).
 */
export async function createSet(
  sessionExerciseId: string,
  opts: CreateSetOptions
): Promise<WorkoutSet> {
  const existing = await db.workoutSets
    .where('session_exercise_id')
    .equals(sessionExerciseId)
    .count();

  const init = opts.initial;
  const set: WorkoutSet = {
    id: newId(),
    session_exercise_id: sessionExerciseId,
    set_number: existing + 1,
    is_warmup: init?.is_warmup ?? false,
    weight_kg: init?.weight_kg ?? null,
    reps: init?.reps ?? 0,
    rpe: init?.rpe ?? null,
    rir: init?.rir ?? null,
    set_type: 'normal',
    load_type: opts.loadType,
    assistance_kg: null,
    body_weight_kg_snapshot:
      opts.loadType === 'bodyweight' ? (opts.bodyWeightKg ?? null) : null,
    notes: '',
    completed_at: nowIso(),
  };
  await db.workoutSets.add(set);
  return set;
}

export type SetMutablePatch = Partial<
  Pick<WorkoutSet, 'weight_kg' | 'reps' | 'is_warmup' | 'notes' | 'rpe' | 'rir'>
>;

export async function updateSet(
  setId: string,
  patch: SetMutablePatch
): Promise<void> {
  await db.workoutSets.update(setId, patch);
}

export async function deleteSet(setId: string): Promise<void> {
  await db.workoutSets.delete(setId);
}
