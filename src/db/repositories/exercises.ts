import { db } from '../schema';
import type { Exercise, Muscle } from '../../types';

export interface ExerciseListItem {
  exercise: Exercise;
  /** primary role mapping의 muscle. 없으면 null (시드 데이터엔 모든 종목에 primary가 있지만 방어적 처리) */
  primaryMuscle: Muscle | null;
}

/**
 * 모든 종목 + 주동근 정보를 조회.
 * 60개 종목 × 평균 4~5개 매핑 = ~250 레코드. 전체 스캔으로 충분.
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

  return exercises.map((ex) => ({
    exercise: ex,
    primaryMuscle: primaryByExerciseId.get(ex.id) ?? null,
  }));
}
