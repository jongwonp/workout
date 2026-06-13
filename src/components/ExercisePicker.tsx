import { useEffect, useMemo, useState } from 'react';
import {
  getAllExercisesWithPrimaryMuscle,
  type ExerciseListItem,
} from '../db/repositories/exercises';
import type { Equipment } from '../types';

/**
 * 풀스크린 종목 선택 모달.
 * RoutineEditPage에서 종목 추가 시 사용. (ExerciseListPage와 검색/필터 UX 동일)
 */

type Category = '가슴' | '등' | '어깨' | '하체' | '팔' | '코어';

const CATEGORIES: Category[] = ['가슴', '등', '어깨', '하체', '팔', '코어'];

const CATEGORY_TO_MUSCLES: Record<Category, string[]> = {
  '가슴': ['chest', 'chest_upper', 'chest_lower'],
  '등': ['lats', 'rhomboids', 'erector_spinae', 'traps_upper', 'traps_mid'],
  '어깨': ['shoulder_front', 'shoulder_side', 'shoulder_rear'],
  '하체': ['quads', 'hamstrings', 'glutes', 'calves'],
  '팔': ['biceps', 'triceps', 'forearms'],
  '코어': ['abs', 'core', 'obliques'],
};

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: '바벨',
  dumbbell: '덤벨',
  machine: '머신',
  cable: '케이블',
  bodyweight: '맨몸',
  ez_bar: 'EZ바',
};

interface Props {
  /** 이미 추가된 종목 id 목록 — disabled로 표시 */
  disabledIds: Set<string>;
  onSelect: (exerciseId: string) => void;
  onClose: () => void;
}

export default function ExercisePicker({ disabledIds, onSelect, onClose }: Props) {
  const [items, setItems] = useState<ExerciseListItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(
    new Set()
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await getAllExercisesWithPrimaryMuscle();
      if (active) setItems(data);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    const activeCats = Array.from(selectedCategories);
    return items.filter(({ exercise, primaryMuscle }) => {
      if (q && !exercise.name.toLowerCase().includes(q)) return false;
      if (activeCats.length > 0) {
        if (!primaryMuscle) return false;
        const matches = activeCats.some((c) =>
          CATEGORY_TO_MUSCLES[c].includes(primaryMuscle.id)
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [items, query, selectedCategories]);

  const toggleCategory = (c: Category) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <h2 className="text-base font-semibold text-black">종목 선택</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center text-gray-500 active:text-black"
        >
          ✕
        </button>
      </header>

      <div className="border-b border-gray-100 bg-white p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목 검색"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-base outline-none focus:border-gray-400"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = selectedCategories.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                className={[
                  'h-9 rounded-full px-3 text-sm font-medium',
                  active ? 'bg-black text-white' : 'bg-gray-100 text-gray-700',
                ].join(' ')}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filtered === null ? (
          <p className="p-4 text-sm text-gray-400">로딩 중...</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">조건에 맞는 종목이 없어요.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {filtered.map(({ exercise, primaryMuscle }) => {
              const disabled = disabledIds.has(exercise.id);
              return (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(exercise.id)}
                    disabled={disabled}
                    className="flex h-full min-h-[88px] w-full flex-col items-start justify-between rounded-xl border border-gray-200 bg-white p-3 text-left active:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-base font-medium text-black">
                      {exercise.name}
                    </span>
                    <span className="mt-2 text-xs text-gray-500">
                      {disabled
                        ? '이미 추가됨'
                        : `${primaryMuscle?.name_ko ?? '—'} · ${EQUIPMENT_LABEL[exercise.default_equipment]}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
