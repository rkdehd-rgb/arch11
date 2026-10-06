import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 单策略的案例图覆盖：images 为完整图片数组（dataURL 或远程 URL） */
export interface CaseOverrideEntry {
  images: string[];
}

/** 覆盖层：strategyId -> 覆盖数据（不写内置库） */
export type CaseOverrideMap = Record<string, CaseOverrideEntry>;

export interface CaseOverrideState {
  overrides: CaseOverrideMap;
  /** 替换某位置的图 */
  replaceImage: (strategyId: string, index: number, image: string) => void;
  /** 追加一张图（上限 8） */
  addImage: (strategyId: string, image: string) => void;
  /** 批量追加（上限 8，超出截断） */
  addImages: (strategyId: string, images: string[]) => void;
  /** 删除某位置的图（允许删到 0 张，此时移除覆盖条目，回退内置） */
  removeImage: (strategyId: string, index: number) => void;
  /** 整体替换某策略的图数组 */
  setImages: (strategyId: string, images: string[]) => void;
  /** 清空全部覆盖 */
  clear: () => void;
  /** 整体替换覆盖层（导入用） */
  replaceAll: (overrides: CaseOverrideMap) => void;
}

export const MAX_CASE_IMAGES = 8;

/** 规范化：过滤空值、限制上限；空数组则删除该 key（回退到内置） */
function normalize(overrides: CaseOverrideMap): CaseOverrideMap {
  const next: CaseOverrideMap = {};
  for (const [key, entry] of Object.entries(overrides)) {
    const images = (entry?.images ?? []).filter((x) => typeof x === 'string' && x.length > 0).slice(0, MAX_CASE_IMAGES);
    if (images.length > 0) next[key] = { images };
  }
  return next;
}

export const useCaseOverrideStore = create<CaseOverrideState>()(
  persist(
    (set) => ({
      overrides: {},
      replaceImage: (strategyId, index, image) =>
        set((state) => {
          const current = [...(state.overrides[strategyId]?.images ?? [])];
          if (index < 0 || index >= current.length) return {};
          current[index] = image;
          return { overrides: normalize({ ...state.overrides, [strategyId]: { images: current } }) };
        }),
      addImage: (strategyId, image) =>
        set((state) => {
          const current = state.overrides[strategyId]?.images ?? [];
          if (current.length >= MAX_CASE_IMAGES) return {};
          return { overrides: normalize({ ...state.overrides, [strategyId]: { images: [...current, image] } }) };
        }),
      addImages: (strategyId, images) =>
        set((state) => {
          const current = state.overrides[strategyId]?.images ?? [];
          const room = MAX_CASE_IMAGES - current.length;
          if (room <= 0 || images.length === 0) return {};
          return {
            overrides: normalize({
              ...state.overrides,
              [strategyId]: { images: [...current, ...images.slice(0, room)] },
            }),
          };
        }),
      removeImage: (strategyId, index) =>
        set((state) => {
          const current = [...(state.overrides[strategyId]?.images ?? [])];
          if (index < 0 || index >= current.length) return {};
          current.splice(index, 1);
          const next = { ...state.overrides };
          if (current.length === 0) delete next[strategyId];
          else next[strategyId] = { images: current };
          return { overrides: normalize(next) };
        }),
      setImages: (strategyId, images) =>
        set((state) => ({
          overrides: normalize({ ...state.overrides, [strategyId]: { images: [...images] } }),
        })),
      clear: () => set({ overrides: {} }),
      replaceAll: (overrides) => set({ overrides: normalize(overrides) }),
    }),
    {
      name: 'archreason-case-overrides',
      // 超配额时直接向上抛，由 UI 捕获提示；避免 persist 静默失败
    },
  ),
);
