import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  listRoutineSummaries,
  type RoutineSummary,
} from '../db/repositories/routines';
import { useSessionStore } from '../store/sessionStore';

/**
 * /session/new 진입 시 모드 선택 (slice2-spec §5.2).
 * - 빈 세션 시작 (Slice 1 방식)
 * - 루틴에서 시작 → 루틴 카드 탭으로 즉시 시작
 *
 * 진행 중 세션이 이미 있으면 /session/:id로 redirect.
 */
export default function SessionStartPage() {
  const navigate = useNavigate();
  const initialized = useSessionStore((s) => s.initialized);
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const startSession = useSessionStore((s) => s.startSession);
  const startSessionFromRoutine = useSessionStore(
    (s) => s.startSessionFromRoutine
  );

  const [routineSummaries, setRoutineSummaries] = useState<
    RoutineSummary[] | null
  >(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await listRoutineSummaries();
        if (active) setRoutineSummaries(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!initialized) {
    return <p className="p-4 text-sm text-gray-400">로딩 중...</p>;
  }
  if (currentSessionId) {
    return <Navigate to={`/session/${currentSessionId}`} replace />;
  }

  const handleStartEmpty = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const id = await startSession();
      navigate(`/session/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  };

  const handleStartFromRoutine = async (routineId: string) => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const id = await startSessionFromRoutine(routineId);
      navigate(`/session/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-black">세션 시작</h1>
        <p className="mt-1 text-xs text-gray-500">어떻게 시작하시겠어요?</p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleStartEmpty}
          disabled={starting}
          className="h-14 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
        >
          빈 세션 시작
        </button>

        <div>
          <h2 className="mb-2 mt-2 text-xs font-semibold text-gray-500">
            루틴에서 시작
          </h2>
          {routineSummaries === null ? (
            <p className="text-sm text-gray-400">로딩 중...</p>
          ) : routineSummaries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
              저장된 루틴이 없어요.{' '}
              <Link to="/routines/new" className="text-black underline">
                루틴 만들기
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {routineSummaries.map(({ routine, exerciseCount }) => (
                <li key={routine.id}>
                  <button
                    type="button"
                    onClick={() => handleStartFromRoutine(routine.id)}
                    disabled={starting}
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left active:bg-gray-50 disabled:opacity-50"
                  >
                    <p className="text-sm font-semibold text-black">
                      {routine.name}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      종목 {exerciseCount}개
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
