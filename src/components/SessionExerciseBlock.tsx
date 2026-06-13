import { useCallback, useEffect, useState } from 'react';
import LastSessionInfo from './LastSessionInfo';
import SetInput from './SetInput';
import {
  createSet,
  deleteSet,
  getSetsForSessionExercise,
  updateSet,
  type SetMutablePatch,
} from '../db/repositories/sets';
import type { Exercise, SessionExercise, WorkoutSet } from '../types';

interface Props {
  sessionExercise: SessionExercise;
  exercise: Exercise;
  /** 맨몸 운동 세트 생성 시 body_weight_kg_snapshot으로 들어갈 값 */
  userBodyWeightKg: number;
  /** ✕ 클릭 시 호출. confirm은 Block 내부에서 처리. */
  onRemove: (sessionExerciseId: string) => void;
}

export default function SessionExerciseBlock({
  sessionExercise,
  exercise,
  userBodyWeightKg,
  onRemove,
}: Props) {
  const [sets, setSets] = useState<WorkoutSet[] | null>(null);
  const [adding, setAdding] = useState(false);

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

  const isBodyweight = exercise.default_equipment === 'bodyweight';

  const handleAddSet = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const newSet = await createSet(sessionExercise.id, {
        loadType: isBodyweight ? 'bodyweight' : 'external',
        bodyWeightKg: isBodyweight ? userBodyWeightKg : undefined,
      });
      setSets((prev) => (prev ? [...prev, newSet] : [newSet]));
    } finally {
      setAdding(false);
    }
  };

  const handlePersist = useCallback(
    async (setId: string, patch: SetMutablePatch) => {
      await updateSet(setId, patch);
      setSets((prev) =>
        prev ? prev.map((s) => (s.id === setId ? { ...s, ...patch } : s)) : prev
      );
    },
    []
  );

  const handleDelete = useCallback(async (setId: string) => {
    await deleteSet(setId);
    setSets((prev) => (prev ? prev.filter((s) => s.id !== setId) : prev));
  }, []);

  const handleRemoveClick = () => {
    const setCount = sets?.length ?? 0;
    const msg =
      setCount === 0
        ? `'${exercise.name}'을(를) 세션에서 제거할까요?`
        : `'${exercise.name}'과(와) 입력한 세트 ${setCount}개를 모두 삭제할까요?`;
    if (!window.confirm(msg)) return;
    onRemove(sessionExercise.id);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-black">{exercise.name}</h2>
        <button
          type="button"
          onClick={handleRemoveClick}
          aria-label="종목 삭제"
          className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center text-gray-400 active:text-red-600"
        >
          ✕
        </button>
      </div>
      <div className="mt-1">
        <LastSessionInfo
          exerciseId={exercise.id}
          excludeSessionId={sessionExercise.session_id}
        />
      </div>

      <div className="mt-3 space-y-2">
        {sets === null ? (
          <p className="text-sm text-gray-400">로딩 중...</p>
        ) : sets.length === 0 ? (
          <p className="text-sm text-gray-400">세트가 없어요. 아래 버튼으로 추가하세요.</p>
        ) : (
          sets.map((s) => (
            <SetInput
              key={s.id}
              set={s}
              onPersist={handlePersist}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={handleAddSet}
        disabled={adding || sets === null}
        className="mt-3 h-11 w-full rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-50 disabled:opacity-50"
      >
        + 세트 추가
      </button>
    </div>
  );
}
