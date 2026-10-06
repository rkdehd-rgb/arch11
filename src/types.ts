export type { Strategy } from './data/strategies';

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Grsai 生图接入节点：global=grsaiapi.com，cn=grsai.dakka.com.cn */
  grsaiNode?: GrsaiNode;
}

export type GrsaiNode = 'global' | 'cn';

/** 画板生成模式：async=统一异步接口，sync=OpenAI 同步生图，edit=图片编辑 */
export type GrsaiMode = 'async' | 'sync' | 'edit';

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
    /** Grsai 模型 id（真实生图时填充） */
    grsaiModel?: string;
    /** Grsai 生成模式；degraded 表示真实接口失败后程序化 SVG 兜底 */
    grsaiMode?: GrsaiMode | 'degraded';
  };
}
