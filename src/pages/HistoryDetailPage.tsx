import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReadOnlyExerciseBlock from '../components/ReadOnlyExerciseBlock';
import {
  deleteSessionCascade,
  getSession,
  getSessionExercisesWithDetails,
  type SessionExerciseWithDetails,
} from '../db/repositories/sessions';
import { useSessionStore } from '../store/sessionStore';
import {
  formatDateWithDay,
  formatDuration,
} from '../utils/date';
import type { WorkoutSession } from '../types';

export default function HistoryDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const currentSessionId = useSessionStore((s) => s.currentSessionId);

  const [session, setSession] = useState<WorkoutSession | null | undefined>(
    undefined
  );
  const [exercises, setExercises] = useState<SessionExerciseWithDetails[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!sessionId) return null;

  if (session === undefined) {
    return <p className="p-4 text-sm text-gray-400">로딩 중...</p>;
  }
  if (session === null) {
    return (
      <div className="p-4 text-gray-600">
        <h1 className="text-lg font-semibold text-black">세션을 찾을 수 없어요</h1>
        <p className="mt-2 text-sm">id: {sessionId}</p>
        <Link
          to="/history"
          className="mt-4 inline-flex h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-black"
        >
          목록으로
        </Link>
      </div>
    );
  }

  // 결정 (c): 진행 중 세션이 있으면 편집 비활성화
  const editDisabled = currentSessionId !== null;

  const handleDelete = async () => {
    if (!window.confirm('이 세션을 삭제할까요? 종목·세트도 함께 삭제돼요.')) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSessionCascade(sessionId);
      navigate('/history');
    } catch (err) {
      console.error('세션 삭제 실패', err);
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-base font-semibold text-black">
            {formatDateWithDay(session.date)}
          </h1>
          <div className="flex gap-2">
            {editDisabled ? (
              <button
                type="button"
                disabled
                title="진행 중인 세션이 있어 편집할 수 없어요"
                className="h-9 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-400"
              >
                수정
              </button>
            ) : (
              <Link
                to={`/history/${sessionId}/edit`}
                className="flex h-9 items-center rounded-md border border-gray-300 px-3 text-xs font-medium text-black"
              >
                수정
              </Link>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="h-9 rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 disabled:opacity-50"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          종목 {exercises.length}개
          {session.duration_seconds !== null && (
            <> · 운동 시간 {formatDuration(session.duration_seconds)}</>
          )}
        </p>
        {renderConditionMeta(session) && (
          <p className="mt-1 text-xs text-gray-500">
            {renderConditionMeta(session)}
          </p>
        )}
        {editDisabled && (
          <p className="mt-2 text-xs text-amber-700">
            진행 중인 세션이 있어 수정할 수 없어요. 세션을 종료한 뒤 다시 시도해주세요.
          </p>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-700">{error}</p>
        )}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {exercises.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">기록된 종목이 없어요.</p>
        ) : (
          exercises.map(({ sessionExercise, exercise }) => (
            <ReadOnlyExerciseBlock
              key={sessionExercise.id}
              sessionExercise={sessionExercise}
              exercise={exercise}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** 세션의 컨디션 / 수면 / 피로도 / 시간 제한을 한 줄 문자열로. 모두 null이면 null 반환. */
function renderConditionMeta(session: WorkoutSession): string | null {
  const parts: string[] = [];
  if (session.condition_score !== null) parts.push(`컨디션 ${session.condition_score}`);
  if (session.sleep_quality !== null) parts.push(`수면 ${session.sleep_quality}`);
  if (session.fatigue_level !== null) parts.push(`피로 ${session.fatigue_level}`);
  if (session.time_limit_minutes !== null)
    parts.push(`한도 ${session.time_limit_minutes}분`);
  return parts.length === 0 ? null : parts.join(' · ');
}
