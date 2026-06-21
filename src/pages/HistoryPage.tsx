import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCompletedSessionsWithSummary,
  type SessionSummary,
} from '../db/repositories/sessions';
import {
  formatDateWithDay,
  formatDuration,
  formatYearMonth,
} from '../utils/date';

export default function HistoryPage() {
  const [summaries, setSummaries] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await getCompletedSessionsWithSummary();
      if (active) setSummaries(data);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (summaries === null) {
    return <p className="p-4 text-sm text-gray-400">로딩 중...</p>;
  }

  if (summaries.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p className="text-base font-medium text-black">아직 기록이 없어요</p>
        <p className="mt-2 text-sm">
          첫 운동을 마치면 여기에 표시돼요.
        </p>
        <Link
          to="/exercises"
          className="mt-4 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white active:bg-emerald-700"
        >
          종목 목록으로
        </Link>
      </div>
    );
  }

  // 월별 그룹화 (최신순으로 이미 정렬됨)
  const groups = new Map<string, SessionSummary[]>();
  for (const s of summaries) {
    const key = formatYearMonth(s.session.date);
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  return (
    <div className="h-full overflow-y-auto">
      {Array.from(groups.entries()).map(([month, items]) => (
        <section key={month} className="border-b border-gray-100">
          <h2 className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500">
            {month}
          </h2>
          <ul>
            {items.map(({ session, exerciseCount, setCount, exerciseNames }) => (
              <li key={session.id} className="border-b border-gray-100 last:border-b-0">
                <Link
                  to={`/history/${session.id}`}
                  className="block px-4 py-3 active:bg-gray-50"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-black">
                      {formatDateWithDay(session.date)}
                    </span>
                    {session.duration_seconds !== null && (
                      <span className="text-xs text-gray-500">
                        {formatDuration(session.duration_seconds)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    종목 {exerciseCount}개 · 세트 {setCount}개
                    {session.condition_score !== null && (
                      <> · 컨디션 {session.condition_score}</>
                    )}
                    {session.time_limit_minutes !== null && (
                      <> · 한도 {session.time_limit_minutes}분</>
                    )}
                  </p>
                  {exerciseNames.length > 0 && (
                    <p className="mt-1 truncate text-xs text-gray-700">
                      {exerciseNames.join(', ')}
                      {exerciseCount > exerciseNames.length && ' ...'}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
