import { db } from '../schema';
import { newId } from '../../utils/id';
import { nowIso } from '../../utils/date';
import type {
  Exercise,
  SessionExercise,
  WorkoutSession,
  WorkoutSet,
} from '../../types';

/**
 * 진행 중 세션 = duration_seconds === null (결정 b).
 * 한 유저당 최대 1개이지만, 비정상 종료 등으로 여러 개가 남을 수 있어 최신 1개를 반환.
 */
export async function getInProgressSession(): Promise<WorkoutSession | null> {
  const candidates = await db.workoutSessions
    .filter((s) => s.duration_seconds === null)
    .toArray();
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.date < b.date ? 1 : -1));
  return candidates[0];
}

export async function createSession(): Promise<WorkoutSession> {
  const session: WorkoutSession = {
    id: newId(),
    date: nowIso(),
    routine_id: null,
    planned_session_id: null,
    condition_score: null,
    sleep_quality: null,
    fatigue_level: null,
    time_limit_minutes: null,
    is_deload: false,
    notes: '',
    duration_seconds: null,
  };
  await db.workoutSessions.add(session);
  return session;
}

/**
 * 루틴으로부터 새 세션 생성 (slice2-spec §6.4).
 * RoutineExercise를 SessionExercise로 복제 (order 유지, default_sets는 참고용 — 세트는 사용자가 직접 추가).
 * routine_id를 세션에 저장하여 추적.
 */
export async function createSessionFromRoutine(
  routineId: string
): Promise<WorkoutSession> {
  const routine = await db.routines.get(routineId);
  if (!routine) throw new Error('루틴을 찾을 수 없어요.');

  const routineExs = await db.routineExercises
    .where('routine_id')
    .equals(routineId)
    .toArray();
  routineExs.sort((a, b) => a.order - b.order);

  const session: WorkoutSession = {
    id: newId(),
    date: nowIso(),
    routine_id: routineId,
    planned_session_id: null,
    condition_score: null,
    sleep_quality: null,
    fatigue_level: null,
    time_limit_minutes: null,
    is_deload: false,
    notes: '',
    duration_seconds: null,
  };

  await db.transaction(
    'rw',
    [db.workoutSessions, db.sessionExercises],
    async () => {
      await db.workoutSessions.add(session);
      if (routineExs.length > 0) {
        const sessExs: SessionExercise[] = routineExs.map((re) => ({
          id: newId(),
          session_id: session.id,
          exercise_id: re.exercise_id,
          variation_id: re.variation_id,
          order: re.order,
          is_done: false,
        }));
        await db.sessionExercises.bulkAdd(sessExs);
      }
    }
  );

  return session;
}

export async function getSession(id: string): Promise<WorkoutSession | undefined> {
  return db.workoutSessions.get(id);
}

/** 세션 종료 처리. duration_seconds를 채워 "진행 중" 상태 해제. */
export async function updateSessionDuration(
  id: string,
  durationSeconds: number
): Promise<void> {
  await db.workoutSessions.update(id, { duration_seconds: durationSeconds });
}

/** 세션 시작 시 컨디션 입력 (slice2-spec §5.2). 부분 갱신 가능. */
export type SessionConditionPatch = Partial<
  Pick<
    WorkoutSession,
    'condition_score' | 'sleep_quality' | 'fatigue_level' | 'time_limit_minutes'
  >
>;

export async function updateSessionCondition(
  id: string,
  patch: SessionConditionPatch
): Promise<void> {
  await db.workoutSessions.update(id, patch);
}

/**
 * 세션 + 종목 + 세트 cascade 삭제. 트랜잭션으로 묶어 원자성 보장.
 */
export async function deleteSessionCascade(sessionId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.workoutSets, db.sessionExercises, db.workoutSessions],
    async () => {
      const sessExs = await db.sessionExercises
        .where('session_id')
        .equals(sessionId)
        .toArray();
      const sessExIds = sessExs.map((se) => se.id);
      if (sessExIds.length > 0) {
        await db.workoutSets
          .where('session_exercise_id')
          .anyOf(sessExIds)
          .delete();
      }
      await db.sessionExercises.where('session_id').equals(sessionId).delete();
      await db.workoutSessions.delete(sessionId);
    }
  );
}

/**
 * 히스토리 목록용 요약.
 * - exerciseCount: 세션의 종목 수
 * - setCount: 세션의 전체 세트 수 (워밍업 포함)
 * - exerciseNames: order 순으로 최대 3개의 종목 이름 (미리보기용)
 */
export interface SessionSummary {
  session: WorkoutSession;
  exerciseCount: number;
  setCount: number;
  exerciseNames: string[];
}

/**
 * 완료된(duration_seconds !== null) 세션을 최신순으로 반환.
 * 단일 사용자라 모든 세션을 메모리에서 join — 세션 수 ~수천 이내 가정.
 */
export async function getCompletedSessionsWithSummary(): Promise<
  SessionSummary[]
> {
  const [allSessions, allSessEx, allSets, allExercises] = await Promise.all([
    db.workoutSessions.toArray(),
    db.sessionExercises.toArray(),
    db.workoutSets.toArray(),
    db.exercises.toArray(),
  ]);

  const exerciseById = new Map(allExercises.map((e) => [e.id, e]));
  const sessExBySessionId = new Map<string, SessionExercise[]>();
  for (const se of allSessEx) {
    const arr = sessExBySessionId.get(se.session_id) ?? [];
    arr.push(se);
    sessExBySessionId.set(se.session_id, arr);
  }
  const setCountBySessExId = new Map<string, number>();
  for (const s of allSets) {
    setCountBySessExId.set(
      s.session_exercise_id,
      (setCountBySessExId.get(s.session_exercise_id) ?? 0) + 1
    );
  }

  const summaries: SessionSummary[] = [];
  for (const session of allSessions) {
    if (session.duration_seconds === null) continue;
    const sessExs = sessExBySessionId.get(session.id) ?? [];
    sessExs.sort((a, b) => a.order - b.order);
    const exerciseNames = sessExs
      .slice(0, 3)
      .map((se) => exerciseById.get(se.exercise_id)?.name)
      .filter((n): n is string => Boolean(n));
    const setCount = sessExs.reduce(
      (sum, se) => sum + (setCountBySessExId.get(se.id) ?? 0),
      0
    );
    summaries.push({
      session,
      exerciseCount: sessExs.length,
      setCount,
      exerciseNames,
    });
  }

  summaries.sort((a, b) => (a.session.date < b.session.date ? 1 : -1));
  return summaries;
}

/**
 * 세션의 종목 목록 + 각 종목의 Exercise 정보. order 오름차순.
 */
export interface SessionExerciseWithDetails {
  sessionExercise: SessionExercise;
  exercise: Exercise;
}

export async function getSessionExercisesWithDetails(
  sessionId: string
): Promise<SessionExerciseWithDetails[]> {
  const sessEx = await db.sessionExercises
    .where('session_id')
    .equals(sessionId)
    .toArray();
  if (sessEx.length === 0) return [];
  sessEx.sort((a, b) => a.order - b.order);
  const exerciseIds = sessEx.map((s) => s.exercise_id);
  const exercises = await db.exercises.bulkGet(exerciseIds);
  return sessEx
    .map((se, i) => {
      const ex = exercises[i];
      return ex ? { sessionExercise: se, exercise: ex } : null;
    })
    .filter((x): x is SessionExerciseWithDetails => x !== null);
}

/**
 * 세션에 종목 추가. variation은 is_default=true인 것 자동 선택.
 * order는 기존 종목 수.
 */
/**
 * 특정 종목의 직전 기록 (현재 세션 제외).
 * 최근 세션부터 역순으로 훑어 해당 exercise_id가 들어간 첫 세션을 반환.
 * 세트는 워밍업/본세트 모두 포함 — 필터링은 표시 컴포넌트 책임 (결정 d).
 */
export interface LastSessionRecord {
  session: WorkoutSession;
  sessionExercise: SessionExercise;
  sets: WorkoutSet[];
}

export async function getLastSessionForExercise(
  exerciseId: string,
  excludeSessionId?: string
): Promise<LastSessionRecord | null> {
  const recentSessions = await db.workoutSessions
    .orderBy('date')
    .reverse()
    .toArray();

  for (const session of recentSessions) {
    if (excludeSessionId && session.id === excludeSessionId) continue;
    const sessEx = await db.sessionExercises
      .where('session_id')
      .equals(session.id)
      .and((se) => se.exercise_id === exerciseId)
      .first();
    if (sessEx) {
      const sets = await db.workoutSets
        .where('session_exercise_id')
        .equals(sessEx.id)
        .toArray();
      sets.sort((a, b) => a.set_number - b.set_number);
      return { session, sessionExercise: sessEx, sets };
    }
  }
  return null;
}

/**
 * 세션에서 종목 제거. 해당 종목의 모든 세트도 cascade로 삭제.
 * order 재정렬은 안 함 (간격이 생겨도 정렬 순서는 정확함).
 */
export async function removeExerciseFromSession(
  sessionExerciseId: string
): Promise<void> {
  await db.transaction(
    'rw',
    [db.workoutSets, db.sessionExercises],
    async () => {
      await db.workoutSets
        .where('session_exercise_id')
        .equals(sessionExerciseId)
        .delete();
      await db.sessionExercises.delete(sessionExerciseId);
    }
  );
}

export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string
): Promise<SessionExercise> {
  const existing = await db.sessionExercises
    .where('session_id')
    .equals(sessionId)
    .count();

  const defaultVariation = await db.exerciseVariations
    .where('exercise_id')
    .equals(exerciseId)
    .filter((v) => v.is_default === true)
    .first();

  const sessEx: SessionExercise = {
    id: newId(),
    session_id: sessionId,
    exercise_id: exerciseId,
    variation_id: defaultVariation?.id ?? null,
    order: existing,
    is_done: false,
  };
  await db.sessionExercises.add(sessEx);
  return sessEx;
}

/** v4.7: 세션 종목 '완료' 토글 저장. */
export async function setSessionExerciseDone(
  sessionExerciseId: string,
  isDone: boolean
): Promise<void> {
  await db.sessionExercises.update(sessionExerciseId, { is_done: isDone });
}
