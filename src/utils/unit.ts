/**
 * 단위 전환 (slice2-spec §6.2).
 *
 * 데이터베이스에는 항상 kg으로 저장. 표시/입력만 변환.
 */

export type WeightUnit = 'kg' | 'lb';

export const LB_PER_KG = 2.20462;

/** 사용자에게 표시할 때 사용. 단위 라벨 포함. */
export function displayWeight(kg: number, unit: WeightUnit): string {
  if (unit === 'lb') return `${(kg * LB_PER_KG).toFixed(1)} lb`;
  return `${kg.toFixed(2)} kg`;
}

/** kg → 표시 단위 숫자값 (라벨 없음). input value에 사용. */
export function kgToDisplayNumber(kg: number, unit: WeightUnit): number {
  if (unit === 'lb') return roundTo(kg * LB_PER_KG, 1);
  return roundTo(kg, 2);
}

/** 표시 단위 숫자값 → kg (저장 시 사용). */
export function parseInputWeight(input: number, unit: WeightUnit): number {
  if (unit === 'lb') return input / LB_PER_KG;
  return input;
}

/** SetInput의 input step 속성용. lb 모드에선 0.5, kg 모드에선 0.25. */
export function inputStep(unit: WeightUnit): number {
  return unit === 'lb' ? 0.5 : 0.25;
}

/** 빠른 증감 버튼의 deltas. 표시 단위 기준 값. */
export function quickDeltas(unit: WeightUnit): readonly number[] {
  return unit === 'lb' ? [-5, -2.5, 2.5, 5] : [-2.5, -1.25, 1.25, 2.5];
}

function roundTo(num: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(num * factor) / factor;
}
