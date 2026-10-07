import { create } from 'zustand';

export type SyncStatus = 'disabled' | 'syncing' | 'synced' | 'error';

interface SyncState {
  status: SyncStatus;
  message: string | null;
  lastSyncedAt: number | null;
  setStatus: (status: SyncStatus, message?: string | null) => void;
  markSynced: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'disabled',
  message: null,
  lastSyncedAt: null,
  setStatus: (status, message = null) => set({ status, message }),
  markSynced: () => set({ status: 'synced', message: null, lastSyncedAt: Date.now() }),
}));
