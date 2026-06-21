import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/schema';
import {
  createCustomExercise,
  deleteCustomExercise,
  getExerciseWithMappings,
  isDuplicateName,
  updateCustomExercise,
  type CustomExerciseInput,
} from '../db/repositories/exercises';
import type { Equipment, Muscle, MuscleGroup } from '../types';

type Category = 'compound' | 'isolation';

const EQUIPMENTS: { value: Equipment; label: string }[] = [
  { value: 'barbell', label: '바벨' },
  { value: 'dumbbell', label: '덤벨' },
  { value: 'machine', label: '머신' },
  { value: 'cable', label: '케이블' },
  { value: 'bodyweight', label: '맨몸' },
  { value: 'ez_bar', label: 'EZ바' },
];

const GROUP_ORDER: MuscleGroup[] = ['push', 'pull', 'legs', 'core'];
const GROUP_LABEL: Record<MuscleGroup, string> = {
  push: '푸시 (가슴·어깨·삼두)',
  pull: '풀 (등·이두·전완)',
  legs: '하체',
  core: '코어',
};

/** 카테고리 기반 기본값 */
function categoryDefaults(c: Category): { rest: number; reps: [number, number] } {
  return c === 'compound'
    ? { rest: 180, reps: [6, 12] }
    : { rest: 90, reps: [10, 15] };
}

const SELECT_CLS =
  'mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base outline-none focus:border-gray-500';
const INPUT_CLS =
  'mt-1 h-11 w-full rounded-lg border border-gray-300 px-3 text-base outline-none focus:border-gray-500';
const LABEL_CLS = 'block text-sm font-medium text-gray-700';

export default function ExerciseEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [muscles, setMuscles] = useState<Muscle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 폼 상태
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('compound');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [primaryId, setPrimaryId] = useState('');
  const [sec1Id, setSec1Id] = useState('');
  const [sec1Coef, setSec1Coef] = useState(0.5);
  const [sec2Id, setSec2Id] = useState('');
  const [sec2Coef, setSec2Coef] = useState(0.5);
  const [restSeconds, setRestSeconds] = useState(180);
  const [repMin, setRepMin] = useState(6);
  const [repMax, setRepMax] = useState(12);
  /** 휴식/반복을 사용자가 직접 건드렸는지 — 카테고리 변경 시 기본값 자동 갱신 여부 판단 */
  const [touchedRest, setTouchedRest] = useState(false);

  // 근육 목록 로드 + (수정 모드) 기존 값 채우기
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ms = await db.muscles.toArray();
        if (!active) return;
        setMuscles(ms);

        if (isEdit && id) {
          const data = await getExerciseWithMappings(id);
          if (!active) return;
          if (!data) {
            setLoadError('종목을 찾을 수 없어요.');
            return;
          }
          if (!data.exercise.is_custom) {
            setLoadError('시드 종목은 수정할 수 없어요.');
            return;
          }
          const ex = data.exercise;
          setName(ex.name);
          setCategory(ex.category === 'isolation' ? 'isolation' : 'compound');
          setEquipment(ex.default_equipment);
          setRestSeconds(ex.default_rest_seconds);
          setRepMin(ex.target_rep_range[0]);
          setRepMax(ex.target_rep_range[1]);
          setTouchedRest(true); // 기존 값 보존

          const primary = data.mappings.find((m) => m.role === 'primary');
          if (primary) setPrimaryId(primary.muscle_id);
          const secs = data.mappings.filter((m) => m.role !== 'primary');
          if (secs[0]) {
            setSec1Id(secs[0].muscle_id);
            setSec1Coef(secs[0].coefficient >= 0.5 ? 0.5 : 0.25);
          }
          if (secs[1]) {
            setSec2Id(secs[1].muscle_id);
            setSec2Coef(secs[1].coefficient >= 0.5 ? 0.5 : 0.25);
          }
        }
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  // 카테고리 변경 시 휴식/반복 기본값 자동 갱신 (사용자가 안 건드렸을 때만)
  const handleCategoryChange = (c: Category) => {
    setCategory(c);
    if (!touchedRest) {
      const d = categoryDefaults(c);
      setRestSeconds(d.rest);
      setRepMin(d.reps[0]);
      setRepMax(d.reps[1]);
    }
  };

  const grouped = useMemo(() => {
    const byGroup = new Map<MuscleGroup, Muscle[]>();
    for (const m of muscles ?? []) {
      const list = byGroup.get(m.group) ?? [];
      list.push(m);
      byGroup.set(m.group, list);
    }
    return byGroup;
  }, [muscles]);

  const renderMuscleOptions = () =>
    GROUP_ORDER.map((g) => {
      const list = grouped.get(g);
      if (!list || list.length === 0) return null;
      return (
        <optgroup key={g} label={GROUP_LABEL[g]}>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name_ko}
            </option>
          ))}
        </optgroup>
      );
    });

  const buildInput = (): CustomExerciseInput => {
    const secondaries = [];
    if (sec1Id) secondaries.push({ muscleId: sec1Id, coefficient: sec1Coef });
    if (sec2Id) secondaries.push({ muscleId: sec2Id, coefficient: sec2Coef });
    return {
      name,
      category,
      equipment,
      primaryMuscleId: primaryId,
      secondaries,
      restSeconds,
      repRange: [repMin, repMax],
    };
  };

  const validate = (): string | null => {
    const n = name.trim();
    if (n.length < 1 || n.length > 30) return '종목 이름은 1~30자로 입력하세요.';
    if (!primaryId) return '주동근을 선택하세요.';
    if (sec1Id && sec1Id === primaryId)
      return '보조근에 주동근과 같은 근육은 선택할 수 없어요.';
    if (sec2Id && sec2Id === primaryId)
      return '보조근에 주동근과 같은 근육은 선택할 수 없어요.';
    if (sec1Id && sec2Id && sec1Id === sec2Id)
      return '보조근 1과 2는 서로 다른 근육이어야 해요.';
    if (!(repMin >= 1 && repMax >= repMin)) return '반복 범위가 올바르지 않아요.';
    if (!(restSeconds >= 0)) return '휴식 시간이 올바르지 않아요.';
    return null;
  };

  const handleSave = async () => {
    if (saving) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);

    // 이름 중복 경고 (저장은 가능)
    const dup = await isDuplicateName(name, isEdit ? id : undefined);
    if (dup) {
      const ok = window.confirm(
        `'${name.trim()}'과(와) 같은 이름의 종목이 이미 있어요. 그래도 추가할까요?`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      if (isEdit && id) {
        await updateCustomExercise(id, buildInput());
      } else {
        await createCustomExercise(buildInput());
      }
      navigate('/exercises');
    } catch (err) {
      console.error('종목 저장 실패', err);
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !id || saving) return;
    if (!window.confirm(`'${name.trim()}'을(를) 삭제할까요?`)) return;
    setSaving(true);
    try {
      const result = await deleteCustomExercise(id);
      if (result === 'archived') {
        window.alert('사용 이력이 있어 보관 처리됐어요. 과거 세션 기록은 그대로 유지됩니다.');
      }
      navigate('/exercises');
    } catch (err) {
      console.error('종목 삭제 실패', err);
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {loadError}
        </div>
        <button
          type="button"
          onClick={() => navigate('/exercises')}
          className="mt-4 h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 active:bg-gray-50"
        >
          종목 목록으로
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-black">
          {isEdit ? '종목 수정' : '종목 추가'}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/exercises')}
          aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center text-gray-500 active:text-black"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 이름 */}
        <div>
          <label className={LABEL_CLS} htmlFor="ex-name">
            종목 이름
          </label>
          <input
            id="ex-name"
            type="text"
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 케이블 풀오버"
            className={INPUT_CLS}
          />
        </div>

        {/* 카테고리 */}
        <div>
          <span className={LABEL_CLS}>카테고리</span>
          <div className="mt-1 flex gap-2">
            {(['compound', 'isolation'] as Category[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleCategoryChange(c)}
                className={[
                  'h-11 flex-1 rounded-lg border text-sm font-medium',
                  category === c
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 bg-white text-gray-700',
                ].join(' ')}
              >
                {c === 'compound' ? '컴파운드' : '아이솔레이션'}
              </button>
            ))}
          </div>
        </div>

        {/* 기구 */}
        <div>
          <label className={LABEL_CLS} htmlFor="ex-equip">
            기구
          </label>
          <select
            id="ex-equip"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value as Equipment)}
            className={SELECT_CLS}
          >
            {EQUIPMENTS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        {/* 주동근 */}
        <div>
          <label className={LABEL_CLS} htmlFor="ex-primary">
            주동근
          </label>
          <select
            id="ex-primary"
            value={primaryId}
            onChange={(e) => setPrimaryId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">선택하세요</option>
            {renderMuscleOptions()}
          </select>
        </div>

        {/* 보조근 1 */}
        <div>
          <label className={LABEL_CLS} htmlFor="ex-sec1">
            보조근 1 <span className="text-gray-400">(선택)</span>
          </label>
          <select
            id="ex-sec1"
            value={sec1Id}
            onChange={(e) => setSec1Id(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">없음</option>
            {renderMuscleOptions()}
          </select>
          {sec1Id && (
            <div className="mt-2 flex gap-2">
              {[0.5, 0.25].map((coef) => (
                <button
                  key={coef}
                  type="button"
                  onClick={() => setSec1Coef(coef)}
                  className={[
                    'h-9 flex-1 rounded-md border text-sm font-medium',
                    sec1Coef === coef
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 bg-white text-gray-700',
                  ].join(' ')}
                >
                  자극 {coef}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 보조근 2 */}
        <div>
          <label className={LABEL_CLS} htmlFor="ex-sec2">
            보조근 2 <span className="text-gray-400">(선택)</span>
          </label>
          <select
            id="ex-sec2"
            value={sec2Id}
            onChange={(e) => setSec2Id(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">없음</option>
            {renderMuscleOptions()}
          </select>
          {sec2Id && (
            <div className="mt-2 flex gap-2">
              {[0.5, 0.25].map((coef) => (
                <button
                  key={coef}
                  type="button"
                  onClick={() => setSec2Coef(coef)}
                  className={[
                    'h-9 flex-1 rounded-md border text-sm font-medium',
                    sec2Coef === coef
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 bg-white text-gray-700',
                  ].join(' ')}
                >
                  자극 {coef}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 권장 휴식 시간 */}
        <div>
          <label className={LABEL_CLS} htmlFor="ex-rest">
            권장 휴식 시간 (초)
          </label>
          <input
            id="ex-rest"
            type="number"
            inputMode="numeric"
            min={0}
            step={15}
            value={restSeconds}
            onChange={(e) => {
              setTouchedRest(true);
              setRestSeconds(Number(e.target.value));
            }}
            className={INPUT_CLS}
          />
        </div>

        {/* 권장 반복 범위 */}
        <div>
          <span className={LABEL_CLS}>권장 반복 범위</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={repMin}
              onChange={(e) => {
                setTouchedRest(true);
                setRepMin(Number(e.target.value));
              }}
              className={INPUT_CLS}
              aria-label="최소 반복"
            />
            <span className="text-gray-400">~</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={repMax}
              onChange={(e) => {
                setTouchedRest(true);
                setRepMax(Number(e.target.value));
              }}
              className={INPUT_CLS}
              aria-label="최대 반복"
            />
          </div>
        </div>

        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="h-11 w-full rounded-lg bg-red-600 text-sm font-medium text-white active:bg-red-700 disabled:opacity-50"
          >
            종목 삭제
          </button>
        )}
      </div>

      <footer className="border-t border-gray-100 bg-white p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/exercises')}
            disabled={saving}
            className="h-11 flex-1 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || muscles === null}
            className="h-11 flex-1 rounded-lg bg-sky-600 text-sm font-medium text-white active:bg-sky-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </footer>
    </div>
  );
}
