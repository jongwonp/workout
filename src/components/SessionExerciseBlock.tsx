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
import { useUserStore } from "../store/userStore";
import { kgToDisplayNumber, type WeightUnit } from "../utils/unit";
import type { Exercise, SessionExercise, WorkoutSet } from "../types";

interface Props {
  sessionExercise: SessionExercise;
  exercise: Exercise;
  /** 맨몸 운동 세트 생성 시 body_weight_kg_snapshot으로 들어갈 값 */
  userBodyWeightKg: number;
  /** v4.7: 완료(접힘) 상태 */
  isDone: boolean;
  /** 완료 종목을 사용자가 다시 펼쳐 봤는지 */
  expanded: boolean;
  /** 완료 토글 */
  onToggleDone: () => void;
  /** 접힘 요약 ↔ 펼침 토글 */
  onToggleExpand: () => void;
  /** ✕ 클릭 시 호출. confirm은 Block 내부에서 처리. */
  onRemove: (sessionExerciseId: string) => void;
}

/** 접힘 요약 문구: 대표 세트(최대 무게) × 횟수 · N세트 */
function buildSummary(sets: WorkoutSet[], unit: WeightUnit): string {
  if (sets.length === 0) return "기록 없음";
  const working = sets.filter((s) => !s.is_warmup);
  const base = working.length > 0 ? working : sets;
  let top = base[0];
  for (const s of base) {
    if ((s.weight_kg ?? -1) > (top.weight_kg ?? -1)) top = s;
  }
  const head =
    top.weight_kg !== null
      ? `${kgToDisplayNumber(top.weight_kg, unit)}${unit}×${top.reps}`
      : `${top.reps}회`;
  return `${head} · ${base.length}세트`;
}

export default function SessionExerciseBlock({
  sessionExercise,
  exercise,
  userBodyWeightKg,
  isDone,
  expanded,
  onToggleDone,
  onToggleExpand,
  onRemove,
}: Props) {
  const unit: WeightUnit = useUserStore(
    (s) => s.user?.unit_preference ?? "kg",
  );
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

  // 완료 + 펼치지 않음 → 접힘 요약(흐리게). 행 전체 탭으로 펼침.
  if (isDone && !expanded) {
    return (
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left opacity-60 active:opacity-90"
        aria-label={`${exercise.name} 펼치기`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-black">
            <span className="text-emerald-600">✓</span> {exercise.name}
          </span>
          <span className="text-xs text-gray-400">펼치기 ▾</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {sets === null ? "..." : buildSummary(sets, unit)}
        </p>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-black">
          {isDone && <span className="text-emerald-600">✓ </span>}
          {exercise.name}
        </h2>
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

      {/* 완료 영역 — '+ 세트 추가'(초록 채움)와 구분되도록 초록 테두리 + 구분선 */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        {!isDone ? (
          <button
            type="button"
            onClick={onToggleDone}
            className="h-11 w-full rounded-lg border border-emerald-600 text-sm font-semibold text-emerald-700 active:bg-emerald-50"
          >
            ✓ 이 종목 완료
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleExpand}
              className="h-11 flex-1 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-50"
            >
              ▴ 접기
            </button>
            <button
              type="button"
              onClick={onToggleDone}
              className="h-11 rounded-lg px-3 text-sm font-medium text-gray-500 active:text-gray-800"
            >
              완료 해제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
