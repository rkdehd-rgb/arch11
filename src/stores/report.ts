import { create } from 'zustand';
import type { InferenceReport } from '../types';

const STORAGE_KEY = 'archreason.reports';

function loadReports(): InferenceReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as InferenceReport[];
  } catch {
    // ignore
  }
  return [];
}

function persist(reports: InferenceReport[]): void {
  // 仅保留最近 30 份，避免 localStorage 溢出
  const trimmed = reports.slice(0, 30);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

interface ReportState {
  reports: InferenceReport[];
  activeReportId: string | null;
  addReport: (report: InferenceReport) => void;
  setActive: (id: string | null) => void;
  removeReport: (id: string) => void;
  getReport: (id: string) => InferenceReport | undefined;
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: loadReports(),
  activeReportId: null,
  addReport: (report) => {
    const next = [report, ...get().reports];
    persist(next);
    set({ reports: next.slice(0, 30), activeReportId: report.id });
  },
  setActive: (id) => set({ activeReportId: id }),
  removeReport: (id) => {
    const next = get().reports.filter((r) => r.id !== id);
    persist(next);
    set({
      reports: next,
      activeReportId: get().activeReportId === id ? null : get().activeReportId,
    });
  },
  getReport: (id) => get().reports.find((r) => r.id === id),
}));
