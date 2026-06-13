import { useEffect, useState } from 'react';
import { getSetsForSessionExercise } from '../db/repositories/sets';
import { useUserStore } from '../store/userStore';
import { setLoadKg } from '../utils/load';
import { displayWeight, type WeightUnit } from '../utils/unit';
import type { Exercise, SessionExercise, WorkoutSet } from '../types';

interface Props {
  sessionExercise: SessionExercise;
  exercise: Exercise;
}

/**
 * 히스토리 상세에서 read-only로 세트를 표시.
 * 세트당 한 줄: "1세트: 60.00 kg × 5회 (워밍업)" 또는 "1세트: 10회 (맨몸 70.00 kg)"
 * 표시 단위는 user.unit_preference 따라.
 */
export default function ReadOnlyExerciseBlock({
  sessionExercise,
  exercise,
}: Props) {
  const unit = useUserStore((s) => s.user?.unit_preference ?? 'kg');
  const [sets, setSets] = useState<WorkoutSet[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await getSetsForSessionExercise(sessionExercise.id);
      if (active) setSets(list);
    })();
    return () => {
      active = false;
    };
  }, [sessionExercise.id]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold text-black">{exercise.name}</h2>
      <ul className="mt-3 space-y-1">
        {sets === null ? (
          <li className="text-sm text-gray-400">로딩 중...</li>
        ) : sets.length === 0 ? (
          <li className="text-sm text-gray-400">세트 없음</li>
        ) : (
          sets.map((s) => <li key={s.id}>{renderSetLine(s, unit)}</li>)
        )}
      </ul>
    </div>
  );
}

function renderSetLine(s: WorkoutSet, unit: WeightUnit) {
  const isBodyweight = s.load_type === 'bodyweight';
  const load = setLoadKg(s);
  const main = isBodyweight
    ? `${s.reps}회 (맨몸 ${displayWeight(load, unit)})`
    : `${displayWeight(load, unit)} × ${s.reps}회`;
  // RPE / RIR — 저장된 값 그대로 표시 (둘 다 있으면 RPE 우선)
  const intensityTag =
    s.rpe !== null
      ? `RPE ${s.rpe}`
      : s.rir !== null
        ? `RIR ${s.rir}`
        : null;
  return (
    <span className="flex items-baseline justify-between text-sm">
      <span className="text-gray-500">{s.set_number}세트</span>
      <span className="text-black">
        {main}
        {intensityTag && (
          <span className="ml-2 text-xs text-gray-500">· {intensityTag}</span>
        )}
        {s.is_warmup && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
            워밍업
          </span>
        )}
      </span>
    </span>
  );
}
