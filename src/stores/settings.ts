import { create } from 'zustand';
import type { ModelConfig } from '../types';

const STORAGE_KEY = 'archreason.settings';

function loadSettings(): ModelConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModelConfig>;
      return {
        baseUrl: parsed.baseUrl ?? '',
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? '',
        grsaiNode: parsed.grsaiNode === 'cn' ? 'cn' : 'global',
      };
    }
  } catch {
    // ignore malformed storage
  }
  return { baseUrl: '', apiKey: '', model: '' };
}

function saveSettings(config: ModelConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface SettingsState {
  config: ModelConfig;
  update: (patch: Partial<ModelConfig>) => void;
  isConfigured: () => boolean;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: loadSettings(),
  update: (patch) => {
    const next = { ...get().config, ...patch };
    saveSettings(next);
    set({ config: next });
  },
  isConfigured: () => {
    const { baseUrl, apiKey, model } = get().config;
    return Boolean(baseUrl.trim() && apiKey.trim() && model.trim());
  },
}));
