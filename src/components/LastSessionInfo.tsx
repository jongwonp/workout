import { useEffect, useState, type ReactNode } from 'react';
import {
  getLastSessionForExercise,
  type LastSessionRecord,
} from '../db/repositories/sessions';
import { useUserStore } from '../store/userStore';
import { formatDaysAgo } from '../utils/date';
import { setLoadKg } from '../utils/load';
import { displayWeight, type WeightUnit } from '../utils/unit';
import type { WorkoutSet } from '../types';

interface Props {
  exerciseId: string;
  /** 현재 진행 중 세션 id — 제외용 */
  excludeSessionId: string;
}

/**
 * 직전 세션 기록을 한 줄 요약으로 표시 + 탭하면 전체 세트 펼침.
 * 결정 (d): 요약 대표값은 워밍업 제외 본세트 중 부하가 가장 무거운 set (동률 시 reps 큰 것).
 *   - 외부 부하: "80kg × 8회 (본세트 2개), 어제"
 *   - 맨몸: "10회 (본세트 3개), 오늘"
 *   - 본세트 0개 (다 워밍업): "본세트 없음, N일 전"
 * 펼치면 세트별 무게/횟수(+강도)를 그대로 보여줘 세트 간 감량/감횟수도 확인 가능.
 */
export default function LastSessionInfo({ exerciseId, excludeSessionId }: Props) {
  const unit = useUserStore((s) => s.user?.unit_preference ?? 'kg');
  const [record, setRecord] = useState<LastSessionRecord | null | undefined>(
    undefined
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const r = await getLastSessionForExercise(exerciseId, excludeSessionId);
      if (active) setRecord(r);
    })();
    return () => {
      active = false;
    };
  }, [exerciseId, excludeSessionId]);

  if (record === undefined) return null; // 로딩 중에는 자리 잡지 않음
  if (record === null) {
    return <p className="text-xs text-gray-400">지난 기록 없음</p>;
  }

  const workingSets = record.sets.filter((s) => s.is_warmup === false);
  const when = formatDaysAgo(record.session.date);
  const canExpand = record.sets.length > 0;

  // 요약 본문
  let summary: ReactNode;
  if (workingSets.length === 0) {
    summary = (
      <>
        본세트 없음, <span className="text-gray-700">{when}</span>
      </>
    );
  } else {
    const top = pickTopSet(workingSets);
    const isBodyweight = top.load_type === 'bodyweight';
    const loadStr = isBodyweight
      ? ''
      : `${displayWeight(setLoadKg(top), unit)} × `;
    summary = (
      <>
        <span className="text-gray-700">
          {loadStr}
          {top.reps}회 (본세트 {workingSets.length}개)
        </span>
        , <span className="text-gray-700">{when}</span>
      </>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        disabled={!canExpand}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1 text-left text-xs text-gray-500 disabled:cursor-default"
      >
        <span>지난 기록: {summary}</span>
        {canExpand && (
          <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
        )}
      </button>

      {expanded && canExpand && (
        <ul className="mt-1 space-y-0.5 border-l-2 border-gray-100 pl-2">
          {record.sets.map((s) => (
            <li key={s.id} className="text-xs text-gray-600">
              {formatSetLine(s, unit)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 세트 한 줄: "2. 80kg × 6회 · RPE 8" / 워밍업이면 앞에 '웜' 표시 */
function formatSetLine(s: WorkoutSet, unit: WeightUnit): ReactNode {
  const isBodyweight = s.load_type === 'bodyweight';
  const loadStr = isBodyweight
    ? '맨몸'
    : `${displayWeight(setLoadKg(s), unit)} ×`;
  const intensity =
    s.rpe !== null ? ` · RPE ${s.rpe}` : s.rir !== null ? ` · RIR ${s.rir}` : '';
  return (
    <>
      <span className="text-gray-400">{s.set_number}.</span>{' '}
      {s.is_warmup && <span className="text-amber-600">웜 </span>}
      {loadStr} {s.reps}회
      <span className="text-gray-400">{intensity}</span>
    </>
  );
}

/** 부하 큰 순 → reps 많은 순 → set_number 작은 순 */
function pickTopSet(sets: WorkoutSet[]): WorkoutSet {
  return sets.reduce((best, cur) => {
    const bestLoad = setLoadKg(best);
    const curLoad = setLoadKg(cur);
    if (curLoad > bestLoad) return cur;
    if (curLoad < bestLoad) return best;
    if (cur.reps > best.reps) return cur;
    return best;
  });
}
