import type {
  InferenceResult,
  ModelConfig,
  StrategyMatch,
  SynergyEdge,
  TaskBrief,
} from '../types';
import {
  getPooledStrategies,
  getPooledMap,
  resolveStrategy,
} from './strategyPool';

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

const JSON_SCHEMA_HINT = `{
  "taskSummary": "对任务书的精炼摘要，80-160字",
  "strategies": [
    {
      "source": "builtin",
      "strategyId": "source=builtin 时必须严格使用下方策略库中的 id",
      "matchScore": 0,
      "matchReason": "结合本项目任务书的具体分析，说明为什么匹配，60-140字",
      "conceptRefined": "针对本项目的策略落地思路，40-100字"
    },
    {
      "source": "suggested",
      "strategyId": "source=suggested 时给一个简短英文 kebab-case 临时标识（如 cognitive-friendly-loop）",
      "matchScore": 0,
      "matchReason": "说明这条库外新策略为何对本项目有价值，60-140字",
      "conceptRefined": "针对本项目的落地思路，40-100字",
      "definition": {
        "name": "策略中文名",
        "nameEn": "英文名（可留空字符串）",
        "group": "维度归类，从 绿色低碳/空间原型/在地文脉/复合业态/建造效率/城市关系 中选一个最贴近的",
        "tags": ["标签1", "标签2"],
        "concept": "核心理念 2-3 句",
        "scenarios": ["适用场景1", "适用场景2"],
        "synergies": [],
        "synergyNote": "与本方案其他策略的协同增益，没有可留空"
      },
      "cases": [
        { "name": "真实建成项目名", "location": "地点", "year": "年份", "architect": "建筑师/事务所", "highlight": "一句话亮点", "image": "Wikimedia Commons 图片 URL，没有可靠链接可留空字符串" }
      ]
    }
  ],
  "synergyInsights": ["结合本项目说明两个策略如何协同增益，每条 30-80 字"]
}`;

export function buildSystemPrompt(): string {
  const pooled = getPooledStrategies();
  const map = getPooledMap();
  const userCount = pooled.filter((s) => s.source === 'user').length;
  const catalog = pooled
    .map((s) => {
      const synergies = s.synergies
        .map((id) => map.get(id)?.name ?? id)
        .join('、');
      return [
        `- id: ${s.id}${s.source === 'user' ? '（用户自定义）' : ''}`,
        `  名称: ${s.name} | ${s.nameEn} | 维度: ${s.group}`,
        `  标签: ${s.tags.join('、')}`,
        `  理念: ${s.concept}`,
        `  适用场景: ${s.scenarios.join('；')}`,
        `  可协同策略: ${synergies || '无'}`,
      ].join('\n');
    })
    .join('\n');

  return `你是 ArchReason —— 一位资深建筑设计策略顾问。你的任务是为建筑师的设计任务书推理出最匹配的设计策略组合。

【策略库（共 ${pooled.length} 条：内置策略${pooled.length - userCount} 条 + 用户自定义 ${userCount} 条）】
${catalog}

【输出要求】
1. builtin 匹配：从上述策略库中选出与任务书最匹配的 5 条，source 填 "builtin"、strategyId 严格使用库中 id，按 matchScore 从高到低排序。
2. suggested 库外建议：在上述 5 条之外，额外提出 2-3 条策略库中确实没有、但针对本任务书真正有价值的新策略，source 填 "suggested"，并完整填写 definition（名称/维度/理念/场景/标签）与 1-2 个真实建成参考案例 cases。若任务书信息不足以产生有价值的库外策略，可只给 0-1 条。
3. matchScore 为 0-100 的整数，要拉开梯度、贴合任务书具体条件，不要全部高分。
4. matchReason 必须引用任务书中的具体信息（地点、规模、类型、诉求等），不能空泛。
5. synergyInsights 给出 2-4 条入选策略（含库外策略）之间在本项目中的协同增益。
6. strategies 数组顺序：先 5 条 builtin（按分数降序），再 2-3 条 suggested。
7. 只输出一个合法 JSON 对象，不要输出 markdown 代码块标记或任何解释文字。结构如下：
${JSON_SCHEMA_HINT}`;
}

export function buildUserMessage(task: TaskBrief): string {
  const meta = [
    `项目名称：${task.projectName || '（未填写）'}`,
    `项目地点：${task.location || '（未填写）'}`,
    `用地面积：${task.siteArea || '—'} ㎡`,
    `总建筑面积：${task.grossArea || '—'} ㎡`,
    `容积率：${task.far || '—'}`,
    `建筑类型：${task.buildingType || '—'}`,
    `核心诉求：${task.demands.join('、') || '—'}`,
  ].join('\n');
  return `【设计任务书 · 结构化信息】\n${meta}\n\n【任务书正文】\n${task.content}`;
}

/** 从模型文本中稳健提取 JSON（容忍代码块包裹与前后噪声） */
export function extractJson(text: string): InferenceResult | null {
  const trimmed = text.trim();
  // 取出首个 json code fence（可能前后有解释性文字）
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (fence ? fence[1] : trimmed)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const candidates = [cleaned];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) {
    candidates.push(cleaned.slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as Partial<InferenceResult>;
      if (validateResult(parsed)) return normalizeResult(parsed);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function validateResult(parsed: Partial<InferenceResult>): boolean {
  return (
    typeof parsed.taskSummary === 'string' &&
    Array.isArray(parsed.strategies) &&
    parsed.strategies.length > 0 &&
    parsed.strategies.every(
      (s) => typeof s.strategyId === 'string' && typeof s.matchScore === 'number',
    )
  );
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(asString).filter(Boolean);
}

function normalizeResult(parsed: Partial<InferenceResult>): InferenceResult {
  const pooledMap = getPooledMap();
  const seen = new Set<string>();
  const builtinPicked: StrategyMatch[] = [];
  const suggested: StrategyMatch[] = [];

  for (const s of parsed.strategies ?? []) {
    const rawId = asString(s.strategyId) || asString(s.definition?.name);
    const def = s.definition as StrategyMatch['definition'];
    const hasDef = def != null && asString(def.name) && asString(def.group) && asString(def.concept);
    const isSuggested = s.source === 'suggested' || (!pooledMap.has(rawId) && hasDef);

    // 内置已收满 5 条时，仅跳过内置项，仍继续处理后面的库外策略
    if (!isSuggested && builtinPicked.length >= 5) continue;

    if (isSuggested) {
      if (!hasDef) continue;
      const tempId = `suggested::${asString(rawId) || asString(def!.name)}`;
      const unique = seen.has(tempId) ? `${tempId}-${suggested.length + 1}` : tempId;
      seen.add(unique);
      const cases = Array.isArray(s.cases)
        ? s.cases
            .map((c) => ({
              name: asString(c.name),
              location: asString(c.location),
              year: asString(c.year),
              architect: asString(c.architect),
              highlight: asString(c.highlight),
              image: asString(c.image) || undefined,
            }))
            .filter((c) => c.name)
        : [];
      suggested.push({
        strategyId: unique,
        matchScore: Math.max(40, Math.min(99, Math.round(s.matchScore ?? 70))),
        matchReason: asString(s.matchReason),
        conceptRefined: asString(s.conceptRefined),
        source: 'suggested',
        definition: {
          name: asString(def!.name),
          nameEn: asString(def!.nameEn),
          group: asString(def!.group),
          tags: asStringArray(def!.tags),
          concept: asString(def!.concept),
          scenarios: asStringArray(def!.scenarios),
          synergies: asStringArray(def!.synergies),
          synergyNote: asString(def!.synergyNote),
        },
        cases,
      });
      if (suggested.length === 3) break;
      continue;
    }

    if (!rawId || !pooledMap.has(rawId) || seen.has(rawId)) continue;
    seen.add(rawId);
    builtinPicked.push({
      strategyId: rawId,
      matchScore: Math.max(40, Math.min(99, Math.round(s.matchScore))),
      matchReason: asString(s.matchReason),
      conceptRefined: asString(s.conceptRefined),
      source: 'builtin',
    });
  }

  return {
    taskSummary: asString(parsed.taskSummary),
    strategies: [...builtinPicked, ...suggested],
    suggestedStrategies: suggested,
    synergyInsights: (parsed.synergyInsights ?? []).map(asString).filter(Boolean),
  };
}

interface ChatChoice {
  message?: { content?: string | null };
}
interface ChatResponse {
  choices?: ChatChoice[];
}

async function requestChat(
  config: ModelConfig,
  messages: Array<{ role: string; content: string }>,
  timeoutMs = 60000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${normalizeBase(config.baseUrl)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}：${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('模型返回为空');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(config: ModelConfig): Promise<void> {
  await requestChat(
    config,
    [{ role: 'user', content: 'ping' }],
    20000,
  );
}

export async function runInference(
  config: ModelConfig,
  task: TaskBrief,
): Promise<InferenceResult> {
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserMessage(task) },
  ];

  // 第一次请求
  let raw: string;
  try {
    raw = await requestChat(config, messages);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('请求超时：模型在限定时间内未响应，请检查 Base URL 或更换模型。');
    }
    throw err;
  }
  let result = extractJson(raw);

  // JSON 不合法时重试一次，强化“只输出 JSON”的指令
  if (!result) {
    const retryMessages = [
      ...messages,
      { role: 'assistant', content: raw.slice(0, 400) },
      {
        role: 'user',
        content:
          '你上一次的输出无法被解析为合法 JSON。请严格只输出一个 JSON 对象，不要 markdown 代码块或解释，且 strategyId 必须来自策略库。',
      },
    ];
    const rawRetry = await requestChat(config, retryMessages);
    result = extractJson(rawRetry);
  }

  if (!result) {
    throw new Error(
      '模型两次返回均非合法 JSON。请尝试更换支持结构化输出的模型（如 gpt-4o-mini / deepseek-chat），或稍后重试。',
    );
  }

  // 若模型选出的内置策略不足 5 条，用本地打分补齐（库外策略不计入这 5 条）
  const builtinCount = result.strategies.filter((s) => s.source !== 'suggested').length;
  if (builtinCount < 5) {
    result = fillWithLocal(result, task);
  }
  return result;
}

// ===================== 本地兜底打分 =====================

const DEMAND_KEYWORDS: Record<string, string[]> = {
  绿色低碳: ['green', '绿色', '低碳', '节能', '光伏', '被动', '海绵', '绿化', '通风', '轻建造'],
  成本控制: ['core-skin', 'modular-build', 'prefab', 'local-material', 'growth-frame', '标准化'],
  地标性: ['symbol-translate', 'facade-vitality', 'vertical-mix'],
  在地文化: ['local-material', 'symbol-translate', 'climate-form', 'memory-retain'],
  快速周转: ['prefab', 'modular-build', 'light-build', 'core-skin'],
  复合业态: ['vertical-mix', 'vitality-ring', 'atrium-core', 'boundary-penetrate', 'public-return'],
  全龄友好: ['courtyard-embed', 'gray-space', 'urban-public-space', 'micro-weave'],
};

const TYPE_KEYWORDS: Record<string, string[]> = {
  住宅: ['courtyard-embed', 'terrace-step', 'pilotis', 'modular-build'],
  办公: ['shared-floor', 'atrium-core', 'core-skin', 'passive-design'],
  文化场馆: ['courtyard-embed', 'memory-retain', 'symbol-translate', 'gradient-open'],
  教育: ['sponge-city', 'courtyard-embed', 'shared-floor', 'wind-corridor'],
  商业综合体: ['vertical-mix', 'vitality-ring', 'atrium-core', 'facade-vitality'],
  产业园: ['shared-floor', 'modular-build', 'boundary-penetrate', 'time-evolve'],
  酒店: ['vertical-greenery', 'gray-space', 'facade-vitality', 'atrium-core'],
  城市更新改造: ['memory-retain', 'micro-weave', 'facade-vitality', 'time-evolve'],
};

function scoreStrategyLocal(strategyId: string, text: string): number {
  const map = getPooledMap();
  const s = map.get(strategyId);
  if (!s) return 0;
  let score = 48;
  const corpus = text;
  for (const tag of s.tags) {
    if (corpus.includes(tag)) score += 6;
  }
  for (const kw of [...s.scenarios, s.name, s.nameEn]) {
    const head = kw.slice(0, 4);
    if (head && corpus.includes(head)) score += 3;
  }
  // 同组协同加成
  if (s.synergies.some((id) => corpus.includes(map.get(id)?.name.slice(0, 3) ?? ''))) {
    score += 2;
  }
  return score;
}

export function localFallback(task: TaskBrief): InferenceResult {
  const text = [
    task.content,
    task.buildingType,
    task.location,
    task.demands.join(' '),
  ].join(' ');

  const bonus = new Map<string, number>();
  const addBonus = (id: string, value: number) => {
    bonus.set(id, (bonus.get(id) ?? 0) + value);
  };
  for (const demand of task.demands) {
    for (const id of DEMAND_KEYWORDS[demand] ?? []) addBonus(id, 8);
  }
  for (const id of TYPE_KEYWORDS[task.buildingType] ?? []) addBonus(id, 10);

  const pool = getPooledStrategies();
  const map = getPooledMap();
  const scored = pool.map((s) => ({
    strategyId: s.id,
    matchScore: Math.min(96, scoreStrategyLocal(s.id, text) + (bonus.get(s.id) ?? 0)),
  }));
  scored.sort((a, b) => b.matchScore - a.matchScore);
  const picked: StrategyMatch[] = scored.slice(0, 5).map((s, i) => {
    const strategy = map.get(s.strategyId)!;
    return {
      strategyId: s.strategyId,
      matchScore: s.matchScore - i,
      matchReason: `本项目为${task.location || '拟建地'}的${task.buildingType || '建筑'}，${task.demands.join('、') || '核心诉求'}与「${strategy.name}」的适用场景高度吻合：${strategy.scenarios[0]}，能有效回应任务书的关键约束。`,
      conceptRefined: `建议以${strategy.name}为主线，${strategy.concept.slice(0, 40)}……并结合本项目条件在方案初期落实。`,
      source: 'builtin',
    };
  });

  const insights: string[] = [];
  for (const p of picked) {
    const strat = map.get(p.strategyId);
    const partner = picked.find((q) => strat?.synergies.includes(q.strategyId));
    if (partner && strat?.synergyNote) {
      insights.push(
        `「${strat.name}」与「${map.get(partner.strategyId)?.name}」协同：${strat.synergyNote}`,
      );
    }
  }

  return {
    taskSummary: buildLocalSummary(task),
    strategies: picked,
    suggestedStrategies: [],
    synergyInsights: insights.slice(0, 4),
  };
}

function buildLocalSummary(task: TaskBrief): string {
  return `本项目「${task.projectName || '未命名项目'}」位于${task.location || '待定地点'}，用地面积约 ${task.siteArea || '—'} ㎡，总建筑面积约 ${task.grossArea || '—'} ㎡，容积率 ${task.far || '—'}，定位为${task.buildingType || '综合建筑'}。核心诉求为${task.demands.join('、') || '均衡发展'}，需在有限场地内平衡功能效率、环境品质与场所表达。`;
}

function fillWithLocal(current: InferenceResult, task: TaskBrief): InferenceResult {
  const local = localFallback(task);
  const builtin = current.strategies.filter((s) => s.source !== 'suggested');
  const suggested = current.strategies.filter((s) => s.source === 'suggested');
  const existing = new Set(builtin.map((s) => s.strategyId));
  for (const s of local.strategies) {
    if (builtin.length === 5) break;
    if (!existing.has(s.strategyId)) {
      builtin.push(s);
      existing.add(s.strategyId);
    }
  }
  if (!current.taskSummary) current.taskSummary = local.taskSummary;
  builtin.sort((a, b) => b.matchScore - a.matchScore);
  current.strategies = [...builtin, ...suggested];
  if (current.synergyInsights.length === 0) {
    current.synergyInsights = local.synergyInsights;
  }
  return current;
}

/** 根据入选策略与其预置协同关系生成协同图的边 */
export function buildEdges(result: InferenceResult): SynergyEdge[] {
  const matches = result.strategies;
  const ids = matches.map((s) => s.strategyId);
  const idSet = new Set(ids);
  const edges: SynergyEdge[] = [];
  const seen = new Set<string>();

  // 每个匹配解析出策略定义（含库外 suggested）
  const defById = new Map(
    matches.map((m) => [m.strategyId, resolveStrategy(m)] as const),
  );

  for (const id of ids) {
    const s = defById.get(id);
    if (!s) continue;
    for (const partnerId of s.synergies) {
      if (!idSet.has(partnerId)) continue;
      const key = [id, partnerId].sort().join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      const note = s.synergyNote || '组合使用可形成增益';
      edges.push({
        source: id,
        target: partnerId,
        note,
        label: note.length <= 14 ? note : note.slice(0, 12) + '…',
        strength: 'preset',
      });
    }
  }

  // 模型输出的协同洞见作为附加边（顺序配对未连接的策略）
  const insightPairs = result.synergyInsights.slice(0, 4);
  insightPairs.forEach((text, idx) => {
    const a = ids[idx];
    const b = ids[(idx + 1) % ids.length];
    if (!a || !b || a === b) return;
    const key = [a, b].sort().join('::');
    if (seen.has(key)) {
      const edge = edges.find((e) => [e.source, e.target].sort().join('::') === key);
      if (edge && edge.note.length < 12) edge.note = text;
      return;
    }
    seen.add(key);
    edges.push({
      source: a,
      target: b,
      note: text,
      label: text.length <= 14 ? text : text.slice(0, 12) + '…',
      strength: 'insight',
    });
  });

  return edges;
}
