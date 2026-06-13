import { useEffect, useState } from 'react';
import {
  getLastSessionForExercise,
  type LastSessionRecord,
} from '../db/repositories/sessions';
import { useUserStore } from '../store/userStore';
import { formatDaysAgo } from '../utils/date';
import { setLoadKg } from '../utils/load';
import { displayWeight } from '../utils/unit';
import type { WorkoutSet } from '../types';

interface Props {
  exerciseId: string;
  /** 현재 진행 중 세션 id — 제외용 */
  excludeSessionId: string;
}

/**
 * 직전 세션 기록을 한 줄로 표시.
 * 결정 (d): 워밍업 제외하고 본세트만 사용.
 * 대표값: 본세트 중 부하가 가장 무거운 set (동률 시 reps 큰 것).
 *   - 외부 부하: "80kg × 8회 (본세트 2개), 어제"
 *   - 맨몸: "10회 (본세트 3개), 오늘"
 *   - 본세트 0개 (다 워밍업): "본세트 없음, N일 전"
 */
export default function LastSessionInfo({ exerciseId, excludeSessionId }: Props) {
  const unit = useUserStore((s) => s.user?.unit_preference ?? 'kg');
  const [record, setRecord] = useState<LastSessionRecord | null | undefined>(
    undefined
  );

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

  if (workingSets.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        지난 기록: 본세트 없음, <span className="text-gray-700">{when}</span>
      </p>
    );
  }

  const top = pickTopSet(workingSets);
  const isBodyweight = top.load_type === 'bodyweight';
  const loadStr = isBodyweight ? '' : `${displayWeight(setLoadKg(top), unit)} × `;

  return (
    <p className="text-xs text-gray-500">
      지난 기록:{' '}
      <span className="text-gray-700">
        {loadStr}
        {top.reps}회 (본세트 {workingSets.length}개)
      </span>
      , <span className="text-gray-700">{when}</span>
    </p>
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
