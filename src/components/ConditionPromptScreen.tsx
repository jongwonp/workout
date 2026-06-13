import { useState } from 'react';
import type { OneToFive } from '../types';

/**
 * 세션 시작 시 컨디션 입력 (slice2-spec §5.2).
 * - 컨디션 / 수면 / 피로도: 5단계 이모지 척도
 * - 시간 제한: 30/45/60/90분 칩 또는 없음
 * - "건너뛰기"로 모두 입력 안 하고 진행 가능
 *
 * 모든 항목 선택, 결과는 onSubmit으로 부모에 전달.
 */

interface Submission {
  condition_score: OneToFive | null;
  sleep_quality: OneToFive | null;
  fatigue_level: OneToFive | null;
  time_limit_minutes: number | null;
}

interface Props {
  onSubmit: (s: Submission) => Promise<void>;
  onSkip: () => void;
}

const CONDITION_EMOJI: Record<OneToFive, string> = {
  1: '😴',
  2: '🙁',
  3: '😐',
  4: '🙂',
  5: '💪',
};

const FATIGUE_EMOJI: Record<OneToFive, string> = {
  1: '🌱',
  2: '🌿',
  3: '🌾',
  4: '😓',
  5: '🥵',
};

const TIME_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 30, label: '30분' },
  { value: 45, label: '45분' },
  { value: 60, label: '60분' },
  { value: 90, label: '90분' },
  { value: null, label: '없음' },
];

function ScaleRow({
  value,
  onChange,
  emojiMap,
  label,
  hint,
}: {
  value: OneToFive | null;
  onChange: (v: OneToFive | null) => void;
  emojiMap: Record<OneToFive, string>;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-black">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <div className="mt-2 flex gap-2">
        {([1, 2, 3, 4, 5] as const).map((v) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(selected ? null : v)}
              className={[
                'flex h-12 flex-1 flex-col items-center justify-center rounded-lg border text-lg',
                selected
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 bg-white text-gray-700',
              ].join(' ')}
            >
              {emojiMap[v]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ConditionPromptScreen({ onSubmit, onSkip }: Props) {
  const [condition, setCondition] = useState<OneToFive | null>(null);
  const [sleep, setSleep] = useState<OneToFive | null>(null);
  const [fatigue, setFatigue] = useState<OneToFive | null>(null);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        condition_score: condition,
        sleep_quality: sleep,
        fatigue_level: fatigue,
        time_limit_minutes: timeLimit,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const hasAny =
    condition !== null ||
    sleep !== null ||
    fatigue !== null ||
    timeLimit !== null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-black">오늘 컨디션은?</h1>
        <p className="mt-1 text-xs text-gray-500">
          모두 선택 항목입니다. 건너뛸 수 있어요.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <ScaleRow
          value={condition}
          onChange={setCondition}
          emojiMap={CONDITION_EMOJI}
          label="컨디션"
          hint="5: 매우 좋음"
        />
        <ScaleRow
          value={sleep}
          onChange={setSleep}
          emojiMap={CONDITION_EMOJI}
          label="수면"
          hint="5: 매우 잘 잠"
        />
        <ScaleRow
          value={fatigue}
          onChange={setFatigue}
          emojiMap={FATIGUE_EMOJI}
          label="피로도"
          hint="5: 매우 피곤"
        />

        <div>
          <p className="text-sm font-medium text-black">시간 제한</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIME_OPTIONS.map((opt) => {
              const selected = timeLimit === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTimeLimit(opt.value)}
                  className={[
                    'h-10 rounded-full px-4 text-sm font-medium',
                    selected
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-700',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-100 bg-white p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            className="h-11 flex-1 rounded-lg border border-gray-300 text-sm font-medium text-black disabled:opacity-50"
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !hasAny}
            className="h-11 flex-1 rounded-lg bg-black text-sm font-medium text-white disabled:opacity-40"
          >
            {submitting ? '저장 중...' : '저장하고 시작'}
          </button>
        </div>
      </footer>
    </div>
  );
}
