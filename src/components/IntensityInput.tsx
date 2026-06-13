interface Props {
  value: number | null;
  metric: 'rpe' | 'rir';
  onChange: (v: number | null) => void;
}

const RPE_OPTIONS = [7, 8, 9, 10];
const RIR_OPTIONS = [3, 2, 1, 0];

/**
 * 강도 입력 (slice2-spec §5.2): RPE 또는 RIR.
 * 사용자 선호 metric 한 가지만 표시. 빠른 버튼 4개 + 클리어 ✕.
 *
 * 직접 input은 Slice 2에서 생략 — RPE 7~10 / RIR 0~3이 일반 범위라 빠른 버튼만으로 충분.
 */
export default function IntensityInput({ value, metric, onChange }: Props) {
  const options = metric === 'rpe' ? RPE_OPTIONS : RIR_OPTIONS;
  const label = metric.toUpperCase();

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-8 text-xs font-medium text-gray-500">{label}</span>
      <div className="flex flex-1 gap-1">
        {options.map((v) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(selected ? null : v)}
              className={[
                'h-9 flex-1 rounded-md border text-xs font-medium',
                selected
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 bg-white text-gray-700 active:bg-gray-100',
              ].join(' ')}
            >
              {v}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={value === null}
        aria-label="강도 지우기"
        className="flex h-9 w-9 items-center justify-center text-gray-400 active:text-black disabled:opacity-30"
      >
        ✕
      </button>
    </div>
  );
}
