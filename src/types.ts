export type { Strategy } from './data/strategies';

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface TaskBrief {
  projectName: string;
  location: string;
  siteArea: string;
  grossArea: string;
  far: string;
  buildingType: string;
  demands: string[];
  content: string;
}

export interface StrategyMatch {
  strategyId: string;
  matchScore: number;
  matchReason: string;
  conceptRefined: string;
}

export interface InferenceResult {
  taskSummary: string;
  strategies: StrategyMatch[];
  synergyInsights: string[];
}

export interface SynergyEdge {
  source: string;
  target: string;
  note: string;
  label?: string;
  strength?: 'preset' | 'insight';
}

export interface InferenceReport {
  id: string;
  createdAt: number;
  model: string;
  task: TaskBrief;
  result: InferenceResult;
  edges: SynergyEdge[];
  degraded: boolean;
}

export type BoardItemKind = 'reference' | 'inspiration' | 'generated';

export interface BoardItem {
  id: string;
  kind: BoardItemKind;
  x: number;
  y: number;
  width: number;
  src: string;
  title: string;
  note?: string;
  meta?: {
    strategyId?: string;
    style?: string;
    prompt?: string;
    timestamp?: number;
  };
}
