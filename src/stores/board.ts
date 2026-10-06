import { create } from 'zustand';
import type { BoardItem } from '../types';

const STORAGE_KEY = 'archreason.board';

function loadBoard(): BoardItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BoardItem[];
  } catch {
    // ignore
  }
  return [];
}

function persist(items: BoardItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    // 容量超限等：本次更新仍保留在内存中，仅无法持久化，不拖垮操作
    console.warn('[board] 持久化失败：', err instanceof Error ? err.message : err);
  }
}

let idCounter = 0;
export function nextItemId(): string {
  idCounter += 1;
  return `item-${Date.now().toString(36)}-${idCounter}`;
}

interface BoardState {
  items: BoardItem[];
  selectedId: string | null;
  hydratedWithReport: string | null;
  addItem: (item: Omit<BoardItem, 'id'> & { id?: string }) => string;
  addItems: (items: Array<Omit<BoardItem, 'id'>>) => void;
  updateItem: (id: string, patch: Partial<BoardItem>) => void;
  removeItem: (id: string) => void;
  select: (id: string | null) => void;
  bringToFront: (id: string) => void;
  clearBoard: () => void;
  markHydrated: (reportId: string) => void;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  items: loadBoard(),
  selectedId: null,
  hydratedWithReport: null,
  addItem: (item) => {
    const id = item.id ?? nextItemId();
    const full: BoardItem = { ...item, id } as BoardItem;
    const next = [...get().items, full];
    persist(next);
    set({ items: next, selectedId: id });
    return id;
  },
  addItems: (items) => {
    const full = items.map((item) => ({ ...item, id: nextItemId() }));
    const next = [...get().items, ...full];
    persist(next);
    set({ items: next });
  },
  updateItem: (id, patch) => {
    const next = get().items.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    persist(next);
    set({ items: next });
  },
  removeItem: (id) => {
    const next = get().items.filter((item) => item.id !== id);
    persist(next);
    set({
      items: next,
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
  },
  select: (id) => set({ selectedId: id }),
  bringToFront: (id) => {
    const items = get().items;
    const target = items.find((item) => item.id === id);
    if (!target) return;
    const next = [...items.filter((item) => item.id !== id), target];
    persist(next);
    set({ items: next });
  },
  clearBoard: () => {
    persist([]);
    set({ items: [], selectedId: null, hydratedWithReport: null });
  },
  markHydrated: (reportId) => set({ hydratedWithReport: reportId }),
}));
