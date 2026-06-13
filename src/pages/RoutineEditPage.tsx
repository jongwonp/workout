import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ExercisePicker from '../components/ExercisePicker';
import { db } from '../db/schema';
import {
  createRoutine,
  getDefaultVariationId,
  getRoutineWithItems,
  updateRoutine,
  type SaveRoutineItem,
} from '../db/repositories/routines';
import type { Exercise } from '../types';

/**
 * 루틴 신규/편집 통합 페이지.
 * - /routines/new → 신규 모드 (routineId 없음)
 * - /routines/:routineId/edit → 편집 모드
 *
 * 저장 시점에 트랜잭션. 미저장 상태에서 종목 추가/제거/순서/세트 수는 로컬 state.
 */

interface DraftItem {
  exercise: Exercise;
  variationId: string | null;
  defaultSets: number;
}

const MIN_SETS = 1;
const MAX_SETS = 20;
const DEFAULT_SETS = 3;

export default function RoutineEditPage() {
  const { routineId } = useParams<{ routineId: string }>();
  const navigate = useNavigate();
  const isEdit = !!routineId;

  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!routineId) return;
    let active = true;
    (async () => {
      try {
        const result = await getRoutineWithItems(routineId);
        if (!active) return;
        if (!result) {
          setError('루틴을 찾을 수 없어요.');
          setLoading(false);
          return;
        }
        setName(result.routine.name);
        setItems(
          result.items.map(({ routineExercise, exercise }) => ({
            exercise,
            variationId: routineExercise.variation_id,
            defaultSets: routineExercise.default_sets,
          }))
        );
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [routineId]);

  const disabledIds = useMemo(
    () => new Set(items.map((it) => it.exercise.id)),
    [items]
  );

  const handlePickerSelect = async (exerciseId: string) => {
    if (disabledIds.has(exerciseId)) return;
    try {
      const [ex, variationId] = await Promise.all([
        db.exercises.get(exerciseId),
        getDefaultVariationId(exerciseId),
      ]);
      if (!ex) return;
      setItems((prev) => [
        ...prev,
        { exercise: ex, variationId, defaultSets: DEFAULT_SETS },
      ]);
      setShowPicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateSets = (index: number, sets: number) => {
    const clamped = Math.max(MIN_SETS, Math.min(MAX_SETS, sets));
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, defaultSets: clamped } : it))
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('루틴 이름을 입력해주세요.');
      return;
    }
    if (items.length === 0) {
      setError('종목을 1개 이상 추가해주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: SaveRoutineItem[] = items.map((it) => ({
        exercise_id: it.exercise.id,
        variation_id: it.variationId,
        default_sets: it.defaultSets,
      }));
      if (isEdit && routineId) {
        await updateRoutine(routineId, trimmedName, payload);
      } else {
        await createRoutine(trimmedName, payload);
      }
      navigate('/routines');
    } catch (err) {
      console.error('루틴 저장 실패', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="p-4 text-sm text-gray-400">로딩 중...</p>;
  }

  // 종목 선택 중에는 화면 전체를 picker로 교체 — RoutineEditPage state(name/items)는 보존됨
  if (showPicker) {
    return (
      <ExercisePicker
        disabledIds={disabledIds}
        onSelect={handlePickerSelect}
        onClose={() => setShowPicker(false)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/routines')}
          className="text-sm text-gray-500 active:text-black"
        >
          취소
        </button>
        <h1 className="text-base font-semibold text-black">
          {isEdit ? '루틴 편집' : '새 루틴'}
        </h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <label className="block text-xs font-medium text-gray-500">
            루틴 이름
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 푸시 데이"
            maxLength={50}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-gray-400"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-black">
              종목 ({items.length}개)
            </h2>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="h-9 rounded-md border border-gray-300 px-3 text-xs font-medium text-black active:bg-gray-50"
            >
              + 종목 추가
            </button>
          </div>

          {items.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">
              "종목 추가"로 시작하세요.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((it, i) => (
                <li
                  key={it.exercise.id}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-black">
                      {i + 1}. {it.exercise.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      aria-label="종목 제거"
                      className="flex h-8 w-8 items-center justify-center text-gray-400 active:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">세트 수</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateSets(i, it.defaultSets - 1)}
                          aria-label="세트 수 감소"
                          className="h-8 w-8 rounded-md border border-gray-200 text-sm text-gray-700 active:bg-gray-100"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-black">
                          {it.defaultSets}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateSets(i, it.defaultSets + 1)}
                          aria-label="세트 수 증가"
                          className="h-8 w-8 rounded-md border border-gray-200 text-sm text-gray-700 active:bg-gray-100"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(i, -1)}
                        disabled={i === 0}
                        aria-label="위로 이동"
                        className="h-8 w-8 rounded-md border border-gray-200 text-sm text-gray-700 active:bg-gray-100 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(i, 1)}
                        disabled={i === items.length - 1}
                        aria-label="아래로 이동"
                        className="h-8 w-8 rounded-md border border-gray-200 text-sm text-gray-700 active:bg-gray-100 disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
