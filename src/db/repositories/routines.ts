import { db } from '../schema';
import { newId } from '../../utils/id';
import { nowIso } from '../../utils/date';
import type {
  Exercise,
  Routine,
  RoutineExercise,
} from '../../types';

/**
 * 루틴 CRUD (slice2-spec §5.1).
 * 저장 시 Routine + RoutineExercise를 트랜잭션으로 묶음.
 * 삭제 시 RoutineExercise cascade.
 */

// =========================================
// 조회
// =========================================

export interface RoutineSummary {
  routine: Routine;
  exerciseCount: number;
  /** 이 루틴으로 시작한 가장 최근 세션 date. 없으면 null */
  lastUsedAt: string | null;
}

export async function listRoutineSummaries(): Promise<RoutineSummary[]> {
  const [routines, allRoutineExs, allSessions] = await Promise.all([
    db.routines.toArray(),
    db.routineExercises.toArray(),
    db.workoutSessions.toArray(),
  ]);

  const countByRoutineId = new Map<string, number>();
  for (const re of allRoutineExs) {
    countByRoutineId.set(re.routine_id, (countByRoutineId.get(re.routine_id) ?? 0) + 1);
  }

  const lastUsedByRoutineId = new Map<string, string>();
  for (const s of allSessions) {
    if (!s.routine_id) continue;
    const prev = lastUsedByRoutineId.get(s.routine_id);
    if (!prev || prev < s.date) {
      lastUsedByRoutineId.set(s.routine_id, s.date);
    }
  }

  const result = routines.map((routine) => ({
    routine,
    exerciseCount: countByRoutineId.get(routine.id) ?? 0,
    lastUsedAt: lastUsedByRoutineId.get(routine.id) ?? null,
  }));

  result.sort((a, b) => {
    // 마지막 사용 최신순, 동률은 생성 최신순
    const ad = a.lastUsedAt ?? '';
    const bd = b.lastUsedAt ?? '';
    if (ad !== bd) return ad < bd ? 1 : -1;
    return a.routine.created_at < b.routine.created_at ? 1 : -1;
  });
  return result;
}

export interface RoutineWithItems {
  routine: Routine;
  items: Array<{
    routineExercise: RoutineExercise;
    exercise: Exercise;
  }>;
}

export async function getRoutineWithItems(
  routineId: string
): Promise<RoutineWithItems | null> {
  const routine = await db.routines.get(routineId);
  if (!routine) return null;
  const routineExs = await db.routineExercises
    .where('routine_id')
    .equals(routineId)
    .toArray();
  routineExs.sort((a, b) => a.order - b.order);
  const exerciseIds = routineExs.map((re) => re.exercise_id);
  const exercises = await db.exercises.bulkGet(exerciseIds);
  const items = routineExs
    .map((re, i) => {
      const ex = exercises[i];
      return ex ? { routineExercise: re, exercise: ex } : null;
    })
    .filter((x): x is RoutineWithItems['items'][number] => x !== null);
  return { routine, items };
}

// =========================================
// 저장 / 수정 / 삭제
// =========================================

export interface SaveRoutineItem {
  exercise_id: string;
  variation_id: string | null;
  default_sets: number;
}

/**
 * 신규 루틴 저장. Routine + RoutineExercise를 한 트랜잭션으로 add.
 */
export async function createRoutine(
  name: string,
  items: SaveRoutineItem[]
): Promise<Routine> {
  const routine: Routine = {
    id: newId(),
    name,
    created_at: nowIso(),
  };
  await db.transaction(
    'rw',
    [db.routines, db.routineExercises],
    async () => {
      await db.routines.add(routine);
      if (items.length > 0) {
        const rows: RoutineExercise[] = items.map((it, i) => ({
          routine_id: routine.id,
          exercise_id: it.exercise_id,
          variation_id: it.variation_id,
          order: i,
          default_sets: it.default_sets,
          superset_group: null,
        }));
        await db.routineExercises.bulkAdd(rows);
      }
    }
  );
  return routine;
}

/**
 * 기존 루틴 갱신. 기존 RoutineExercise를 모두 삭제 후 재생성 (단순화).
 */
export async function updateRoutine(
  routineId: string,
  name: string,
  items: SaveRoutineItem[]
): Promise<void> {
  await db.transaction(
    'rw',
    [db.routines, db.routineExercises],
    async () => {
      const existing = await db.routines.get(routineId);
      if (!existing) throw new Error('루틴을 찾을 수 없어요.');
      await db.routines.update(routineId, { name });
      await db.routineExercises
        .where('routine_id')
        .equals(routineId)
        .delete();
      if (items.length > 0) {
        const rows: RoutineExercise[] = items.map((it, i) => ({
          routine_id: routineId,
          exercise_id: it.exercise_id,
          variation_id: it.variation_id,
          order: i,
          default_sets: it.default_sets,
          superset_group: null,
        }));
        await db.routineExercises.bulkAdd(rows);
      }
    }
  );
}

export async function deleteRoutineCascade(routineId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.routines, db.routineExercises],
    async () => {
      await db.routineExercises
        .where('routine_id')
        .equals(routineId)
        .delete();
      await db.routines.delete(routineId);
    }
  );
}

// =========================================
// 기본 변형 lookup (RoutineEditPage에서 종목 추가 시 사용)
// =========================================

export async function getDefaultVariationId(
  exerciseId: string
): Promise<string | null> {
  const defaultVariation = await db.exerciseVariations
    .where('exercise_id')
    .equals(exerciseId)
    .filter((v) => v.is_default === true)
    .first();
  return defaultVariation?.id ?? null;
}
