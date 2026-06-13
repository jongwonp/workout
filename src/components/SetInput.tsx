import { useEffect, useRef, useState } from 'react';
import type { WorkoutSet } from '../types';
import type { SetMutablePatch } from '../db/repositories/sets';
import IntensityInput from './IntensityInput';
import { useUserStore } from '../store/userStore';
import {
  inputStep,
  kgToDisplayNumber,
  parseInputWeight,
  quickDeltas,
  type WeightUnit,
} from '../utils/unit';

/**
 * set의 rpe/rir 중 metric에 맞는 값을 derived. 다른 metric으로 저장돼 있으면 변환 (RPE = 10 - RIR).
 */
function intensityValueFromSet(
  set: WorkoutSet,
  metric: 'rpe' | 'rir'
): number | null {
  if (metric === 'rpe') {
    if (set.rpe !== null) return set.rpe;
    if (set.rir !== null) return 10 - set.rir;
    return null;
  }
  if (set.rir !== null) return set.rir;
  if (set.rpe !== null) return 10 - set.rpe;
  return null;
}

interface Props {
  set: WorkoutSet;
  onPersist: (id: string, patch: SetMutablePatch) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

/**
 * 한 세트의 입력 UI.
 *
 * - 입력 변경 시 로컬 상태 즉시 갱신, 500ms debounce 후 onPersist 호출
 * - 언마운트 시 dirty 상태면 즉시 flush
 * - 워밍업이면 배경색 다르게
 * - 맨몸 운동(load_type='bodyweight')은 무게 입력란 숨김
 *
 * 단위 처리 (slice2-spec §6.2):
 * - DB는 항상 kg 저장 (set.weight_kg). 표시/입력만 unit_preference에 맞춰 변환.
 * - 단위 전환 시 weightStr을 즉시 새 단위로 변환.
 * - 빠른 증감 / step 값은 표시 단위 기준 (Slice 2 결정: lb 친화 값).
 */
export default function SetInput({ set, onPersist, onDelete }: Props) {
  const unit: WeightUnit = useUserStore(
    (s) => s.user?.unit_preference ?? 'kg'
  );
  const intensityMetric = useUserStore(
    (s) => s.user?.intensity_metric ?? 'rpe'
  );

  // 로컬 입력 상태 — string으로 들고 있어 빈 값 / 소수점 입력 중간 상태 허용
  const [weightStr, setWeightStr] = useState(() =>
    set.weight_kg === null ? '' : String(kgToDisplayNumber(set.weight_kg, unit))
  );
  const [repsStr, setRepsStr] = useState(
    set.reps === 0 ? '' : String(set.reps)
  );
  const [isWarmup, setIsWarmup] = useState(set.is_warmup);
  const [intensityValue, setIntensityValue] = useState<number | null>(() =>
    intensityValueFromSet(set, intensityMetric)
  );

  const dirtyRef = useRef(false);
  /** 강도는 metric 변환 자동 갱신과 사용자 명시 입력을 구분해야 함 — 명시 입력 시에만 persist */
  const intensityDirtyRef = useRef(false);
  const latestRef = useRef<SetMutablePatch>({});
  const prevUnitRef = useRef<WeightUnit>(unit);
  const prevMetricRef = useRef<'rpe' | 'rir'>(intensityMetric);

  // 외부에서 set이 갱신되면 (예: 부모가 reload) 로컬 상태도 동기화
  // 단 사용자가 입력 중일 때는 무시 (dirty면 외부 갱신 덮어쓰지 않음)
  useEffect(() => {
    if (dirtyRef.current) return;
    setWeightStr(
      set.weight_kg === null ? '' : String(kgToDisplayNumber(set.weight_kg, unit))
    );
    setRepsStr(set.reps === 0 ? '' : String(set.reps));
    setIsWarmup(set.is_warmup);
    setIntensityValue(intensityValueFromSet(set, intensityMetric));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set]);

  // metric 전환 시 intensityValue를 새 metric 기준으로 재계산 (저장된 값을 변환)
  useEffect(() => {
    if (prevMetricRef.current === intensityMetric) return;
    setIntensityValue((prev) => {
      if (prev === null) return null;
      // 사용자가 dirty 입력 중이면 현재 값을 그대로 두지 않고 변환 (사용자가 의도적으로 metric 바꾼 것)
      return 10 - prev;
    });
    prevMetricRef.current = intensityMetric;
  }, [intensityMetric]);

  // 단위 전환 시 weightStr만 변환 (dirty 무관 — 사용자가 명시적으로 단위 바꾼 거니까)
  useEffect(() => {
    if (prevUnitRef.current === unit) return;
    setWeightStr((prev) => {
      if (prev === '') return '';
      const num = Number(prev);
      if (Number.isNaN(num)) return prev;
      const kg = parseInputWeight(num, prevUnitRef.current);
      return String(kgToDisplayNumber(kg, unit));
    });
    prevUnitRef.current = unit;
  }, [unit]);

  // debounced persist — 항상 kg로 저장. 강도는 명시적 입력 시에만 patch에 포함.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const weightNum = weightStr === '' ? null : Number(weightStr);
    if (weightNum !== null && Number.isNaN(weightNum)) return;

    const repsNum = repsStr === '' ? 0 : Number(repsStr);
    if (Number.isNaN(repsNum)) return;

    const patch: SetMutablePatch = {
      weight_kg: weightNum === null ? null : parseInputWeight(weightNum, unit),
      reps: repsNum,
      is_warmup: isWarmup,
    };
    if (intensityDirtyRef.current) {
      patch.rpe = intensityMetric === 'rpe' ? intensityValue : null;
      patch.rir = intensityMetric === 'rir' ? intensityValue : null;
    }
    latestRef.current = patch;
    const timer = setTimeout(() => {
      onPersist(set.id, patch);
      dirtyRef.current = false;
      intensityDirtyRef.current = false;
    }, 500);
    return () => clearTimeout(timer);
  }, [
    weightStr,
    repsStr,
    isWarmup,
    intensityValue,
    intensityMetric,
    unit,
    set.id,
    onPersist,
  ]);

  // 언마운트 시 dirty면 즉시 flush
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        onPersist(set.id, latestRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const adjustWeight = (delta: number) => {
    const current = weightStr === '' ? 0 : Number(weightStr);
    if (Number.isNaN(current)) return;
    const decimals = unit === 'lb' ? 1 : 2;
    const factor = Math.pow(10, decimals);
    const next = Math.max(0, Math.round((current + delta) * factor) / factor);
    markDirty();
    setWeightStr(String(next));
  };

  const handleIntensityChange = (v: number | null) => {
    markDirty();
    intensityDirtyRef.current = true;
    setIntensityValue(v);
  };

  const isBodyweight = set.load_type === 'bodyweight';
  const bg = isWarmup ? 'bg-amber-50' : 'bg-white';
  const bodyweightDisplay =
    set.body_weight_kg_snapshot === null
      ? null
      : `${kgToDisplayNumber(set.body_weight_kg_snapshot, unit)}${unit}`;

  return (
    <div
      className={`rounded-lg border border-gray-200 ${bg} p-3`}
      aria-label={`세트 ${set.set_number}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-black">
          세트 {set.set_number}
        </span>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isWarmup}
            onChange={(e) => {
              markDirty();
              setIsWarmup(e.target.checked);
            }}
            className="h-5 w-5"
          />
          워밍업
        </label>
        <button
          type="button"
          onClick={() => onDelete(set.id)}
          aria-label="세트 삭제"
          className="flex h-8 w-8 items-center justify-center text-gray-400 active:text-red-600"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {/* 무게 (맨몸이면 라벨만) */}
        <div>
          <label className="block text-xs font-medium text-gray-500">
            {isBodyweight ? '무게' : `무게 (${unit})`}
          </label>
          {isBodyweight ? (
            <div className="mt-1 flex h-11 items-center text-base text-gray-700">
              맨몸
              {bodyweightDisplay && (
                <span className="ml-2 text-xs text-gray-400">
                  ({bodyweightDisplay})
                </span>
              )}
            </div>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              step={inputStep(unit)}
              min="0"
              value={weightStr}
              onChange={(e) => {
                markDirty();
                setWeightStr(e.target.value);
              }}
              placeholder="0"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-gray-400"
            />
          )}
        </div>

        {/* 횟수 */}
        <div>
          <label className="block text-xs font-medium text-gray-500">
            횟수
          </label>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            value={repsStr}
            onChange={(e) => {
              markDirty();
              setRepsStr(e.target.value);
            }}
            placeholder="0"
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-gray-400"
          />
        </div>
      </div>

      {/* 빠른 증감 (외부 부하 종목만) */}
      {!isBodyweight && (
        <div className="mt-2 flex gap-1">
          {quickDeltas(unit).map((delta) => (
            <button
              key={delta}
              type="button"
              onClick={() => adjustWeight(delta)}
              className="h-9 flex-1 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 active:bg-gray-100"
            >
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>
      )}

      {/* 강도 (RPE 또는 RIR) — 워밍업이면 일반적으로 의미 없으니 본세트만 표시 */}
      {!isWarmup && (
        <IntensityInput
          value={intensityValue}
          metric={intensityMetric}
          onChange={handleIntensityChange}
        />
      )}
    </div>
  );
}
