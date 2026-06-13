import { create } from 'zustand';
import {
  addExerciseToSession,
  createSession,
  createSessionFromRoutine,
  getInProgressSession,
  getSession,
  updateSessionDuration,
} from '../db/repositories/sessions';

interface SessionState {
  /** 부팅 시 IndexedDB에서 진행 중 세션 복구가 완료됐는지 */
  initialized: boolean;
  /** 진행 중 세션 id. null = 진행 중 세션 없음 */
  currentSessionId: string | null;

  initialize: () => Promise<void>;
  startSession: () => Promise<string>;
  /** 현재 세션을 종료하고 duration_seconds 저장. 진행 중 세션 없으면 no-op. */
  endSession: () => Promise<void>;
  /**
   * 종목 목록에서 호출. 진행 중 세션 없으면 새로 시작 + 종목 추가, 있으면 기존에 추가.
   * @returns 세션 id (navigate에 사용)
   */
  ensureSessionAndAddExercise: (exerciseId: string) => Promise<string>;
  /**
   * 루틴으로부터 세션 시작 (slice2-spec §6.4). 진행 중 세션이 있으면 throw.
   * @returns 세션 id
   */
  startSessionFromRoutine: (routineId: string) => Promise<string>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  initialized: false,
  currentSessionId: null,

  initialize: async () => {
    if (get().initialized) return;
    const inProgress = await getInProgressSession();
    set({ initialized: true, currentSessionId: inProgress?.id ?? null });
  },

  startSession: async () => {
    const session = await createSession();
    set({ currentSessionId: session.id });
    return session.id;
  },

  endSession: async () => {
    const id = get().currentSessionId;
    if (!id) return;
    const session = await getSession(id);
    if (!session) {
      // 데이터가 없으면 store만 초기화
      set({ currentSessionId: null });
      return;
    }
    // 결정 (f): 벽시계 경과 = floor((end - start) / 1000)
    const start = new Date(session.date).getTime();
    const end = Date.now();
    const duration = Math.max(0, Math.floor((end - start) / 1000));
    await updateSessionDuration(id, duration);
    set({ currentSessionId: null });
  },

  ensureSessionAndAddExercise: async (exerciseId: string) => {
    let sessionId = get().currentSessionId;
    if (!sessionId) {
      sessionId = await get().startSession();
    }
    await addExerciseToSession(sessionId, exerciseId);
    return sessionId;
  },

  startSessionFromRoutine: async (routineId: string) => {
    if (get().currentSessionId) {
      throw new Error('이미 진행 중인 세션이 있어요. 먼저 종료해주세요.');
    }
    const session = await createSessionFromRoutine(routineId);
    set({ currentSessionId: session.id });
    return session.id;
  },
}));
