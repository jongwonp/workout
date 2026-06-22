import { useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
// /session/new 진입 모드 선택은 SessionStartPage에서 처리.
// WorkoutSessionPage는 sessionId가 있는 경우만 다룬다.
import ConditionPromptScreen from '../components/ConditionPromptScreen';
import SessionExerciseBlock from '../components/SessionExerciseBlock';
import {
  getSession,
  getSessionExercisesWithDetails,
  removeExerciseFromSession,
  setSessionExerciseDone,
  updateSessionCondition,
  type SessionExerciseWithDetails,
} from '../db/repositories/sessions';
import { useSessionStore } from '../store/sessionStore';
import { useUserStore } from '../store/userStore';
import { formatDateWithDay, formatDuration } from '../utils/date';
import type { WorkoutSession } from '../types';

const EDIT_PATH_RE = /^\/history\/[^/]+\/edit$/;

export default function WorkoutSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const endSession = useSessionStore((s) => s.endSession);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const user = useUserStore((s) => s.user);

  const [session, setSession] = useState<WorkoutSession | null | undefined>(
    undefined
  );
  const [exercises, setExercises] = useState<SessionExerciseWithDetails[]>([]);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [conditionPrompted, setConditionPrompted] = useState(false);
  /** 완료(접힘) 종목 중 사용자가 다시 펼쳐 본 것 — 화면 임시 상태 (완료 자체는 DB 저장) */
  const [doneExpandedIds, setDoneExpandedIds] = useState<Set<string>>(new Set());

  const isEditMode = EDIT_PATH_RE.test(location.pathname);

  useEffect(() => {
    if (!sessionId) {
      setConditionPrompted(false);
      return;
    }
    const flag = sessionStorage.getItem(`condition_prompted:${sessionId}`);
    setConditionPrompted(flag === '1');
  }, [sessionId]);

  const handleConditionSubmit = async (patch: {
    condition_score: WorkoutSession['condition_score'];
    sleep_quality: WorkoutSession['sleep_quality'];
    fatigue_level: WorkoutSession['fatigue_level'];
    time_limit_minutes: WorkoutSession['time_limit_minutes'];
  }) => {
    if (!sessionId) return;
    await updateSessionCondition(sessionId, patch);
    sessionStorage.setItem(`condition_prompted:${sessionId}`, '1');
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));
    setConditionPrompted(true);
  };

  const handleConditionSkip = () => {
    if (!sessionId) return;
    sessionStorage.setItem(`condition_prompted:${sessionId}`, '1');
    setConditionPrompted(true);
  };

  const handleToggleDone = async (sessionExerciseId: string) => {
    const target = exercises.find(
      (e) => e.sessionExercise.id === sessionExerciseId
    );
    if (!target) return;
    const next = !target.sessionExercise.is_done;
    try {
      await setSessionExerciseDone(sessionExerciseId, next);
      setExercises((prev) =>
        prev.map((e) =>
          e.sessionExercise.id === sessionExerciseId
            ? {
                ...e,
                sessionExercise: { ...e.sessionExercise, is_done: next },
              }
            : e
        )
      );
      // 완료↔해제 전환 시 임시 펼침 상태는 초기화 (완료면 접힘이 기본)
      setDoneExpandedIds((prev) => {
        if (!prev.has(sessionExerciseId)) return prev;
        const n = new Set(prev);
        n.delete(sessionExerciseId);
        return n;
      });
    } catch (err) {
      console.error('완료 토글 실패', err);
    }
  };

  const handleToggleExpand = (sessionExerciseId: string) => {
    setDoneExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(sessionExerciseId)) n.delete(sessionExerciseId);
      else n.add(sessionExerciseId);
      return n;
    });
  };

  const handleRemoveExercise = async (sessionExerciseId: string) => {
    setRemoveError(null);
    try {
      await removeExerciseFromSession(sessionExerciseId);
      setExercises((prev) =>
        prev.filter((e) => e.sessionExercise.id !== sessionExerciseId)
      );
    } catch (err) {
      console.error('종목 삭제 실패', err);
      setRemoveError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    (async () => {
      const s = await getSession(sessionId);
      if (!active) return;
      setSession(s ?? null);
      if (s) {
        const list = await getSessionExercisesWithDetails(sessionId);
        if (active) setExercises(list);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  // sessionId가 없으면 SessionStartPage 라우트로 가야 함 — 방어적으로 종목 목록으로 보냄
  if (!sessionId) {
    return <Navigate to="/exercises" replace />;
  }

  if (session === undefined) {
    return <p className="p-4 text-sm text-gray-400">로딩 중...</p>;
  }
  if (session === null) {
    return (
      <div className="p-4 text-gray-600">
        <h1 className="text-lg font-semibold text-black">세션을 찾을 수 없어요</h1>
        <p className="mt-2 text-sm">id: {sessionId}</p>
      </div>
    );
  }

  const isInProgress = session.duration_seconds === null;

  // /session/:id로 종료된 세션 진입 → 상세 화면으로 일관성 있게 redirect
  if (!isEditMode && !isInProgress) {
    return <Navigate to={`/history/${sessionId}`} replace />;
  }

  // 컨디션 prompt: 진행 중 + 편집모드 아님 + 아무 컨디션 입력 안 됨 + 이번 세션에서 skip 안 함
  const needsConditionPrompt =
    isInProgress &&
    !isEditMode &&
    session.condition_score === null &&
    session.sleep_quality === null &&
    session.fatigue_level === null &&
    session.time_limit_minutes === null &&
    !conditionPrompted;
  if (needsConditionPrompt) {
    return (
      <ConditionPromptScreen
        onSubmit={handleConditionSubmit}
        onSkip={handleConditionSkip}
      />
    );
  }

  // 결정 (c): 편집 모드 진입 시 다른 진행 중 세션이 있으면 차단
  if (isEditMode && currentSessionId && currentSessionId !== sessionId) {
    return (
      <div className="p-4 text-gray-600">
        <h1 className="text-lg font-semibold text-black">편집할 수 없어요</h1>
        <p className="mt-2 text-sm">
          진행 중인 세션이 있어 과거 세션을 편집할 수 없어요. 진행 중 세션을 먼저 종료해주세요.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            to={`/session/${currentSessionId}`}
            className="inline-flex h-11 items-center rounded-lg bg-black px-4 text-sm font-medium text-white"
          >
            진행 중 세션으로
          </Link>
          <Link
            to={`/history/${sessionId}`}
            className="inline-flex h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-black"
          >
            상세 보기
          </Link>
        </div>
      </div>
    );
  }

  // 편집 모드인데 알고 보니 진행 중 세션 → /session/:id로 보냄 (진행 중 UI가 맞음)
  if (isEditMode && isInProgress) {
    return <Navigate to={`/session/${sessionId}`} replace />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-base font-semibold text-black">
            {formatDateWithDay(session.date)}
          </h1>
          {isInProgress ? (
            <span className="text-xs font-medium text-red-600">진행 중</span>
          ) : isEditMode ? (
            <span className="text-xs font-medium text-amber-700">편집 중</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          종목 {exercises.length}개
          {!isInProgress && session.duration_seconds !== null && (
            <> · 운동 시간 {formatDuration(session.duration_seconds)}</>
          )}
        </p>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {removeError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            종목 삭제 실패: {removeError}
          </div>
        )}
        {exercises.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">
            아직 추가된 종목이 없어요. "종목 추가"로 시작하세요.
          </p>
        ) : (
          exercises.map(({ sessionExercise, exercise }) => (
            <SessionExerciseBlock
              key={sessionExercise.id}
              sessionExercise={sessionExercise}
              exercise={exercise}
              userBodyWeightKg={user?.body_weight_kg ?? 70}
              isDone={sessionExercise.is_done}
              expanded={doneExpandedIds.has(sessionExercise.id)}
              onToggleDone={() => handleToggleDone(sessionExercise.id)}
              onToggleExpand={() => handleToggleExpand(sessionExercise.id)}
              onRemove={handleRemoveExercise}
            />
          ))
        )}
      </div>

      {isInProgress && (
        <footer className="border-t border-gray-100 bg-white p-3">
          {endError && (
            <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {endError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/exercises')}
              disabled={ending}
              className="h-11 flex-1 rounded-lg bg-emerald-600 text-sm font-medium text-white active:bg-emerald-700 disabled:opacity-50"
            >
              종목 추가
            </button>
            <button
              type="button"
              disabled={ending}
              onClick={async () => {
                if (!window.confirm('세션을 종료하시겠어요?')) return;
                setEnding(true);
                setEndError(null);
                try {
                  await endSession();
                  navigate('/history');
                } catch (err) {
                  console.error('세션 종료 실패', err);
                  setEndError(err instanceof Error ? err.message : String(err));
                  setEnding(false);
                }
              }}
              className="h-11 flex-1 rounded-lg bg-red-600 text-sm font-medium text-white active:bg-red-700 disabled:opacity-40"
            >
              {ending ? '종료 중...' : '세션 종료'}
            </button>
          </div>
        </footer>
      )}

      {isEditMode && !isInProgress && (
        <footer className="border-t border-gray-100 bg-white p-3">
          <button
            type="button"
            onClick={() => navigate(`/history/${sessionId}`)}
            className="h-11 w-full rounded-lg bg-sky-600 text-sm font-medium text-white active:bg-sky-700"
          >
            수정 완료
          </button>
        </footer>
      )}
    </div>
  );
}
