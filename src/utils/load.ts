import type { WorkoutSet } from '../types';

/**
 * 세트의 실제 부하(kg).
 * - external: weight_kg 그대로
 * - bodyweight: 체중 스냅샷
 *
 * Slice 2에서 weighted_bodyweight / assisted_bodyweight 케이스 추가 예정.
 */
export function setLoadKg(set: WorkoutSet): number {
  if (set.load_type === 'bodyweight') {
    return set.body_weight_kg_snapshot ?? 0;
  }
  return set.weight_kg ?? 0;
}
