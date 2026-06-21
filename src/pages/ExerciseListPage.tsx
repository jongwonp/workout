import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAllExercisesWithPrimaryMuscle,
  type ExerciseListItem,
} from "../db/repositories/exercises";
import { useSessionStore } from "../store/sessionStore";
import type { Equipment } from "../types";

type Category = "가슴" | "등" | "어깨" | "하체" | "팔" | "코어";

const CATEGORIES: Category[] = ["가슴", "등", "어깨", "하체", "팔", "코어"];

/**
 * 카테고리 → 주동근 id 목록. 결정 (a) 반영:
 *   - 승모근(traps_*) → '등'
 *   - 전완(forearms) → '팔'
 *   - 복사근(obliques) → '코어'
 */
const CATEGORY_TO_MUSCLES: Record<Category, string[]> = {
  가슴: ["chest", "chest_upper", "chest_lower"],
  등: ["lats", "rhomboids", "erector_spinae", "traps_upper", "traps_mid"],
  어깨: ["shoulder_front", "shoulder_side", "shoulder_rear"],
  하체: ["quads", "hamstrings", "glutes", "calves"],
  팔: ["biceps", "triceps", "forearms"],
  코어: ["abs", "core", "obliques"],
};

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "바벨",
  dumbbell: "덤벨",
  machine: "머신",
  cable: "케이블",
  bodyweight: "맨몸",
  ez_bar: "EZ바",
};

export default function ExerciseListPage() {
  const navigate = useNavigate();
  const ensureSessionAndAddExercise = useSessionStore(
    (s) => s.ensureSessionAndAddExercise,
  );
  const [items, setItems] = useState<ExerciseListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(
    new Set(),
  );
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          CATEGORY_TO_MUSCLES[c].includes(primaryMuscle.id),
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

  const handleSelect = async (exerciseId: string) => {
    if (adding) return; // 중복 탭 방어
    setAdding(exerciseId);
    setError(null);
    try {
      const sessionId = await ensureSessionAndAddExercise(exerciseId);
      navigate(`/session/${sessionId}`);
    } catch (err) {
      console.error("종목 추가 실패", err);
      setError(err instanceof Error ? err.message : String(err));
      setAdding(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-black">종목</h1>
        <button
          type="button"
          onClick={() => navigate("/exercises/new")}
          className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white active:bg-emerald-700"
        >
          + 새 종목 추가
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
                  "h-9 rounded-full px-3 text-sm font-medium",
                  active ? "bg-black text-white" : "bg-gray-100 text-gray-700",
                ].join(" ")}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {filtered === null ? (
          <p className="p-4 text-sm text-gray-400">로딩 중...</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">
            조건에 맞는 종목이 없어요.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {filtered.map(({ exercise, primaryMuscle }) => {
              const isAdding = adding === exercise.id;
              return (
                <li key={exercise.id} className="relative">
                  <button
                    type="button"
                    onClick={() => handleSelect(exercise.id)}
                    disabled={adding !== null}
                    className="flex h-full min-h-[88px] w-full flex-col items-start justify-between rounded-xl border border-gray-200 bg-white p-3 text-left active:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="text-base font-medium text-black">
                      {exercise.name}
                    </span>
                    <span className="mt-2 text-xs text-gray-500">
                      {isAdding
                        ? "추가 중..."
                        : `${primaryMuscle?.name_ko ?? "—"} · ${EQUIPMENT_LABEL[exercise.default_equipment]}`}
                    </span>
                  </button>
                  {exercise.is_custom && (
                    <button
                      type="button"
                      onClick={() => navigate(`/exercises/${exercise.id}/edit`)}
                      aria-label={`${exercise.name} 수정`}
                      className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-md text-gray-400 active:bg-gray-100 active:text-black"
                    >
                      ✎
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
