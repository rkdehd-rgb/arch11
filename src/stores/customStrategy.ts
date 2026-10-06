import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Strategy } from '../data/strategies';
import type { SuggestedCaseRef } from '../types';

export interface CustomCaseRef extends SuggestedCaseRef {
  id: string;
  strategyId: string;
}

export interface CustomStrategyState {
  /** 用户收藏入库的策略 */
  strategies: Strategy[];
  /** 用户策略自带的参考案例 */
  cases: CustomCaseRef[];
  addStrategy: (strategy: Strategy, cases: SuggestedCaseRef[]) => void;
  hasStrategy: (id: string) => boolean;
  removeStrategy: (id: string) => void;
  clear: () => void;
  replaceAll: (strategies: Strategy[], cases: CustomCaseRef[]) => void;
}

export const useCustomStrategyStore = create<CustomStrategyState>()(
  persist(
    (set, get) => ({
      strategies: [],
      cases: [],
      addStrategy: (strategy, cases) => {
        if (get().strategies.some((s) => s.id === strategy.id)) return;
        const customCases: CustomCaseRef[] = cases.map((c, i) => ({
          ...c,
          id: `${strategy.id}-c${i + 1}`,
          strategyId: strategy.id,
        }));
        set((state) => ({
          strategies: [...state.strategies, strategy],
          cases: [...state.cases, ...customCases],
        }));
      },
      hasStrategy: (id) => get().strategies.some((s) => s.id === id),
      removeStrategy: (id) =>
        set((state) => ({
          strategies: state.strategies.filter((s) => s.id !== id),
          cases: state.cases.filter((c) => c.strategyId !== id),
        })),
      clear: () => set({ strategies: [], cases: [] }),
      replaceAll: (strategies, cases) => set({ strategies, cases }),
    }),
    { name: 'archreason-custom-strategies' },
  ),
);
