import { useCallback, useEffect, useState } from "react";
import LastSessionInfo from "./LastSessionInfo";
import SetInput from "./SetInput";
import {
  createSet,
  deleteSet,
  getSetsForSessionExercise,
  updateSet,
  type SetMutablePatch,
} from "../db/repositories/sets";
import type { Exercise, SessionExercise, WorkoutSet } from "../types";

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

  const isBodyweight = exercise.default_equipment === "bodyweight";

  const handleAddSet = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const newSet = await createSet(sessionExercise.id, {
        loadType: isBodyweight ? "bodyweight" : "external",
        bodyWeightKg: isBodyweight ? userBodyWeightKg : undefined,
      });
      setSets((prev) => (prev ? [...prev, newSet] : [newSet]));
    } finally {
      setAdding(false);
    }
  };

  // v4.6: 직전 세트 복사. 새 세트는 직전 세트의 워밍업 여부를 그대로 따른다.
  //   - 본세트 복사: 무게/횟수/RPE·RIR
  //   - 워밍업 복사: 무게/횟수만 (강도 미복사)
  const lastSet = sets && sets.length > 0 ? sets[sets.length - 1] : null;

  const handleCopySet = async () => {
    if (adding || !lastSet) return;
    setAdding(true);
    try {
      const newSet = await createSet(sessionExercise.id, {
        loadType: isBodyweight ? "bodyweight" : "external",
        bodyWeightKg: isBodyweight ? userBodyWeightKg : undefined,
        initial: {
          is_warmup: lastSet.is_warmup,
          weight_kg: lastSet.weight_kg,
          reps: lastSet.reps,
          rpe: lastSet.is_warmup ? null : lastSet.rpe,
          rir: lastSet.is_warmup ? null : lastSet.rir,
        },
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
        prev
          ? prev.map((s) => (s.id === setId ? { ...s, ...patch } : s))
          : prev,
      );
    },
    [],
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
          <p className="text-sm text-gray-400">
            세트가 없어요. 아래 버튼으로 추가하세요.
          </p>
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

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleAddSet}
          disabled={adding || sets === null}
          className="h-11 flex-1 rounded-lg bg-emerald-600 text-sm font-medium text-white active:bg-emerald-700 disabled:opacity-50"
        >
          + 세트 추가
        </button>
        <button
          type="button"
          onClick={handleCopySet}
          disabled={adding || sets === null || lastSet === null}
          aria-label="이전 세트와 동일하게 추가"
          className="h-11 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 active:bg-gray-50 disabled:opacity-40"
        >
          ⟲ 이전 세트와 동일
        </button>
      </div>
    </div>
  );
}
