import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteRoutineCascade,
  listRoutineSummaries,
  type RoutineSummary,
} from '../db/repositories/routines';
import { useSessionStore } from '../store/sessionStore';
import { formatDaysAgo } from '../utils/date';

export default function RoutineListPage() {
  const navigate = useNavigate();
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const startSessionFromRoutine = useSessionStore(
    (s) => s.startSessionFromRoutine
  );
  const [summaries, setSummaries] = useState<RoutineSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await listRoutineSummaries();
        if (active) setSummaries(data);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`'${name}' 루틴을 삭제할까요?\n\n루틴만 사라지고, 이 루틴으로 기록한 기존 세션은 그대로 남아요.`)) return;
    try {
      await deleteRoutineCascade(id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStart = async (id: string) => {
    if (currentSessionId) {
      setError('이미 진행 중인 세션이 있어요. 먼저 종료해주세요.');
      return;
    }
    if (starting) return;
    setStarting(id);
    setError(null);
    try {
      const sessionId = await startSessionFromRoutine(id);
      navigate(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-black">루틴</h1>
        <button
          type="button"
          onClick={() => navigate('/routines/new')}
          className="h-9 rounded-lg bg-black px-3 text-xs font-medium text-white"
        >
          + 새 루틴
        </button>
      </header>

      {error && (
        <div className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {summaries === null ? (
          <p className="p-4 text-sm text-gray-400">로딩 중...</p>
        ) : summaries.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p className="text-base font-medium text-black">아직 루틴이 없어요</p>
            <p className="mt-2 text-sm">
              자주 하는 운동을 묶어 루틴으로 만들어보세요.
            </p>
            <Link
              to="/routines/new"
              className="mt-4 inline-flex h-11 items-center rounded-lg bg-black px-4 text-sm font-medium text-white"
            >
              + 새 루틴 만들기
            </Link>
          </div>
        ) : (
          <ul>
            {summaries.map(({ routine, exerciseCount, lastUsedAt }) => {
              const isStarting = starting === routine.id;
              const startDisabled =
                starting !== null || currentSessionId !== null;
              return (
                <li key={routine.id} className="border-b border-gray-100">
                  <div className="flex items-center">
                    <Link
                      to={`/routines/${routine.id}/edit`}
                      className="flex-1 px-4 py-3 active:bg-gray-50"
                    >
                      <p className="text-sm font-semibold text-black">
                        {routine.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        종목 {exerciseCount}개
                        {lastUsedAt && (
                          <> · 최근 사용 {formatDaysAgo(lastUsedAt)}</>
                        )}
                        {!lastUsedAt && <> · 사용 안 함</>}
                      </p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleStart(routine.id)}
                      disabled={startDisabled}
                      aria-label={
                        currentSessionId
                          ? '진행 중 세션이 있어 시작 불가'
                          : '이 루틴으로 세션 시작'
                      }
                      title={
                        currentSessionId
                          ? '진행 중 세션이 있어 시작 불가'
                          : '이 루틴으로 세션 시작'
                      }
                      className="mr-1 flex h-9 w-9 items-center justify-center rounded-md text-gray-500 active:text-black disabled:opacity-30"
                    >
                      {isStarting ? '...' : '▶'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(routine.id, routine.name)}
                      aria-label="루틴 삭제"
                      className="mr-3 flex h-8 w-8 items-center justify-center rounded-md text-gray-400 active:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
