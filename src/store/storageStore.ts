import { create } from 'zustand';

/**
 * F1.14 (spec v4.5): 영구 저장 권한 관리.
 * - 부팅 시 1회 자동 요청 (navigator.storage.persist())
 * - 설정 화면에서 사용자 재요청 가능
 * - 결과를 store에 보관하여 설정 화면에서 표시
 */

export interface StorageEstimate {
  /** 사용 중 (bytes) */
  usage: number;
  /** 가용 한도 (bytes) */
  quota: number;
  /** 0~1 */
  percentUsed: number;
}

interface StorageState {
  /** null = 아직 확인 안 됨, true/false = 결과 */
  isPersistent: boolean | null;
  /** Storage API 자체 지원 여부 */
  supported: boolean;
  /** 가장 최근 estimate. 설정 화면에서 새로고침할 때 갱신 */
  estimate: StorageEstimate | null;

  /** 부팅 시 호출: 현재 상태 확인 + 미획득 시 자동 요청 */
  initialize: () => Promise<void>;
  /** 사용자 명시적 재요청 (설정 화면 버튼) */
  requestPersistence: () => Promise<void>;
  /** 사용량/한도 갱신 */
  refreshEstimate: () => Promise<void>;
}

const isPersistSupported =
  typeof navigator !== 'undefined' &&
  'storage' in navigator &&
  typeof navigator.storage?.persist === 'function';

const isEstimateSupported =
  typeof navigator !== 'undefined' &&
  'storage' in navigator &&
  typeof navigator.storage?.estimate === 'function';

/**
 * 동시 호출 방어 — StrictMode 이중 effect 등.
 */
let initPromise: Promise<void> | null = null;

export const useStorageStore = create<StorageState>((set) => ({
  isPersistent: null,
  supported: isPersistSupported,
  estimate: null,

  initialize: async () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        if (!isPersistSupported) {
          set({ isPersistent: false });
          return;
        }
        const current = await navigator.storage.persisted();
        if (current) {
          set({ isPersistent: true });
          return;
        }
        // 첫 진입에 한해 자동 요청 — PWA 설치된 Chrome은 prompt 없이 승인
        const granted = await navigator.storage.persist();
        set({ isPersistent: granted });
      } catch (err) {
        console.warn('storage.persist 실패', err);
        set({ isPersistent: false });
      }
    })();
    return initPromise;
  },

  requestPersistence: async () => {
    if (!isPersistSupported) {
      set({ isPersistent: false });
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      set({ isPersistent: granted });
    } catch (err) {
      console.warn('storage.persist 실패', err);
      set({ isPersistent: false });
    }
  },

  refreshEstimate: async () => {
    if (!isEstimateSupported) {
      set({ estimate: null });
      return;
    }
    try {
      const { usage, quota } = await navigator.storage.estimate();
      if (typeof usage !== 'number' || typeof quota !== 'number' || quota === 0) {
        set({ estimate: null });
        return;
      }
      set({
        estimate: {
          usage,
          quota,
          percentUsed: usage / quota,
        },
      });
    } catch (err) {
      console.warn('storage.estimate 실패', err);
      set({ estimate: null });
    }
  },
}));
