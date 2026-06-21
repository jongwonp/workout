import { db } from './schema';
import { seedData } from './seeds';
import { nowIso } from '../utils/date';
import type { Exercise, User } from '../types';

const DEFAULT_BODY_WEIGHT_KG = 70; // Slice 2에서 설정 화면 도입 시 사용자 입력으로 대체

/**
 * 동시 호출 가드 (StrictMode dev 모드의 useEffect 이중 실행 등).
 * 진행 중인 promise가 있으면 같은 것을 반환. 실패 시 캐시 리셋하여 재시도 가능하게.
 */
let seedingPromise: Promise<void> | null = null;
let userPromise: Promise<User> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (seedingPromise) return seedingPromise;
  seedingPromise = (async () => {
    try {
      const existing = await db.exercises.count();
      if (existing > 0) return;

      const tables = [
        db.bodyRegions,
        db.muscles,
        db.exercises,
        db.exerciseVariations,
        db.exerciseMuscleMappings,
      ];

      await db.transaction('rw', tables, async () => {
        // 트랜잭션 내부 재검사 — 직렬화된 트랜잭션이 직전에 시드를 채웠을 수 있음
        const inTx = await db.exercises.count();
        if (inTx > 0) return;

        // 부분 시드 상태 (이전 실패 잔여물) 청소 후 재시드.
        // 정상 첫 실행이면 모든 clear가 no-op.
        await Promise.all(tables.map((t) => t.clear()));

        // seed Exercise는 v4.6 신규 필드가 없으므로 삽입 시 기본값을 채운다 (seeds.ts 불변).
        const exercises: Exercise[] = seedData.exercises.map((e) => ({
          ...e,
          muscle_mapping_confidence: 'verified' as const,
          is_archived: false,
        }));

        await db.bodyRegions.bulkAdd(seedData.bodyRegions);
        await db.muscles.bulkAdd(seedData.muscles);
        await db.exercises.bulkAdd(exercises);
        await db.exerciseVariations.bulkAdd(seedData.exerciseVariations);
        await db.exerciseMuscleMappings.bulkAdd(seedData.exerciseMuscleMappings);
      });
    } catch (err) {
      seedingPromise = null; // 재시도 가능하게 캐시 리셋
      throw err;
    }
  })();
  return seedingPromise;
}

/**
 * v4.6 마이그레이션: 기존(Slice 2) Exercise에 muscle_mapping_confidence / is_archived가 없으면 채운다.
 * idempotent — 모든 종목에 필드가 있으면 no-op. ensureSeeded() 이후 호출.
 */
export async function ensureExerciseDefaults(): Promise<void> {
  const exercises = await db.exercises.toArray();
  const toUpdate = exercises.filter(
    (e) =>
      (e as Partial<Exercise>).muscle_mapping_confidence === undefined ||
      (e as Partial<Exercise>).is_archived === undefined
  );
  if (toUpdate.length === 0) return;

  await db.transaction('rw', db.exercises, async () => {
    for (const ex of toUpdate) {
      const e = ex as Partial<Exercise>;
      await db.exercises.update(ex.id, {
        muscle_mapping_confidence:
          e.muscle_mapping_confidence ??
          (ex.is_custom ? 'user_estimated' : 'verified'),
        is_archived: e.is_archived ?? false,
      });
    }
  });
}

export async function ensureUser(): Promise<User> {
  if (userPromise) return userPromise;
  userPromise = (async () => {
    try {
      const existing = await db.users.get('me');
      if (existing) {
        // Slice 2 마이그레이션: intensity_metric 없는 기존 유저는 'rpe'로 채움
        const patched = ensureUserDefaults(existing);
        if (patched !== existing) {
          await db.users.put(patched);
        }
        return patched;
      }

      const user: User = {
        id: 'me',
        body_weight_kg: DEFAULT_BODY_WEIGHT_KG,
        unit_preference: 'kg',
        intensity_metric: 'rpe',
        deload_mode_active: false,
        created_at: nowIso(),
      };

      try {
        await db.users.add(user);
        return user;
      } catch {
        // 동시 호출로 다른 곳에서 이미 add됐을 수 있음 → 재조회
        const retry = await db.users.get('me');
        if (retry) return ensureUserDefaults(retry);
        throw new Error('User add 실패 후 재조회도 비어있음');
      }
    } catch (err) {
      userPromise = null;
      throw err;
    }
  })();
  return userPromise;
}

/** Slice 2에서 추가된 필드 fallback. 변경 있으면 새 객체, 없으면 그대로 반환. */
function ensureUserDefaults(user: User): User {
  const u = user as User & { intensity_metric?: 'rpe' | 'rir' };
  if (u.intensity_metric === undefined) {
    return { ...user, intensity_metric: 'rpe' };
  }
  return user;
}
