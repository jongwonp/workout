import { create } from 'zustand';
import { db } from '../db/schema';
import type { User } from '../types';
import type { WeightUnit } from '../utils/unit';

/**
 * 단일 사용자 ('me')의 프로필 + 환경 설정을 store로 관리.
 * - 부팅 시 1회 로드 (initialize)
 * - 체중/단위 변경은 DB + store 동시 업데이트
 * - 무게 표시되는 모든 컴포넌트가 unit_preference를 구독
 */

interface UserState {
  user: User | null;
  initialized: boolean;

  initialize: () => Promise<void>;
  setBodyWeight: (kg: number) => Promise<void>;
  setUnit: (unit: WeightUnit) => Promise<void>;
  setIntensityMetric: (metric: 'rpe' | 'rir') => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  initialized: false,

  initialize: async () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const user = await db.users.get('me');
      set({ user: user ?? null, initialized: true });
    })();
    return initPromise;
  },

  setBodyWeight: async (kg) => {
    const current = get().user;
    if (!current) throw new Error('User not initialized');
    await db.users.update('me', { body_weight_kg: kg });
    set({ user: { ...current, body_weight_kg: kg } });
  },

  setUnit: async (unit) => {
    const current = get().user;
    if (!current) throw new Error('User not initialized');
    await db.users.update('me', { unit_preference: unit });
    set({ user: { ...current, unit_preference: unit } });
  },

  setIntensityMetric: async (metric) => {
    const current = get().user;
    if (!current) throw new Error('User not initialized');
    await db.users.update('me', { intensity_metric: metric });
    set({ user: { ...current, intensity_metric: metric } });
  },
}));
