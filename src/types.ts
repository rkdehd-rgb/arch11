export type { Strategy } from './data/strategies';

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Grsai 生图接入节点：global=grsaiapi.com，cn=grsai.dakka.com.cn */
  grsaiNode?: GrsaiNode;
  /**
   * Grsai 生图专用 API Key（可选）。
   * 留空时沿用上面的 apiKey（适用「一个 Grsai Key 跑通推理+生图」场景）；
   * 当推理用其它服务商（如 DeepSeek/OpenAI）时，在此单独填写 Grsai Key 即可打通真实生图。
   */
  grsaiApiKey?: string;
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

/** 匹配结果来源：builtin=内置/用户池匹配，suggested=LLM 提出的库外新策略 */
export type MatchSource = 'builtin' | 'suggested';

/** 库外策略携带的参考案例（schema 与 CaseRef 对齐） */
export interface SuggestedCaseRef {
  name: string;
  location: string;
  year: string;
  architect: string;
  highlight: string;
  image?: string;
}

export interface StrategyMatch {
  strategyId: string;
  matchScore: number;
  matchReason: string;
  conceptRefined: string;
  source?: MatchSource;
  /** 库外策略：完整策略定义（source=suggested 时填充） */
  definition?: {
    name: string;
    nameEn?: string;
    group: string;
    tags?: string[];
    concept: string;
    scenarios?: string[];
    synergies?: string[];
    synergyNote?: string;
  };
  /** 库外策略：1-2 个真实参考案例 */
  cases?: SuggestedCaseRef[];
}

export interface InferenceResult {
  taskSummary: string;
  strategies: StrategyMatch[];
  /** LLM 提出的库外策略建议（同时也含在 strategies 中），便于单独取用 */
  suggestedStrategies?: StrategyMatch[];
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
