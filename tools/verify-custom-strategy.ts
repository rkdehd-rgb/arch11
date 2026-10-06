import { extractJson, buildSystemPrompt, buildEdges } from '../src/services/llm';
import { makeSuggestedId } from '../src/services/strategyPool';
import { useCustomStrategyStore } from '../src/stores/customStrategy';
import type { Strategy } from '../src/data/strategies';

// 模拟模型返回：5 条 builtin + 2 条 suggested（含 definition/cases）
const sample = JSON.stringify({
  taskSummary: '杭州某康养社区，需兼顾适老化与社交活力。',
  strategies: [
    { source: 'builtin', strategyId: 'courtyard-embed', matchScore: 92, matchReason: 'A', conceptRefined: 'a' },
    { source: 'builtin', strategyId: 'gray-space', matchScore: 88, matchReason: 'B', conceptRefined: 'b' },
    { source: 'builtin', strategyId: 'passive-design', matchScore: 84, matchReason: 'C', conceptRefined: 'c' },
    { source: 'builtin', strategyId: 'sponge-city', matchScore: 79, matchReason: 'D', conceptRefined: 'd' },
    { source: 'builtin', strategyId: 'wind-corridor', matchScore: 76, matchReason: 'E', conceptRefined: 'e' },
    {
      source: 'suggested',
      strategyId: 'cognitive-friendly-loop',
      matchScore: 83,
      matchReason: '康养社区需要支持认知障碍老人的环形漫步路径',
      conceptRefined: '设置无死胡同的闭合环路',
      definition: {
        name: '认知友好环路设计',
        nameEn: 'Cognitive-Friendly Loop',
        group: 'space',
        tags: ['适老化', '认知友好'],
        concept: '通过连续、可识别、无尽端的环形路径，降低老人迷路焦虑并鼓励日常步行社交。',
        scenarios: ['康养社区', '护理机构'],
        synergies: [],
        synergyNote: '',
      },
      cases: [
        { name: 'Hogeweyk 失智村', location: '荷兰 韦斯普', year: '2009', architect: 'Molenaar', highlight: '以村庄式街区与环路营造失智老人的安全自由生活', image: '' },
      ],
    },
  ],
  synergyInsights: ['认知环路与庭院结合形成连续而可识别的漫步系统'],
});

const result = extractJson(sample);
if (!result) throw new Error('解析失败');
console.log('builtin 匹配数:', result.strategies.filter((s) => s.source !== 'suggested').length);
console.log('suggested 数:', result.suggestedStrategies?.length);
const sug = result.suggestedStrategies?.[0];
console.log('库外策略名:', sug?.definition?.name, '| 临时 id:', sug?.strategyId);
console.log('库外案例:', sug?.cases?.[0]?.name);
const edges = buildEdges(result);
console.log('协同边数:', edges.length);

// 模拟收藏入库
const cleanId = makeSuggestedId('cognitive-friendly-loop');
const strategy: Strategy = {
  id: cleanId,
  name: sug!.definition!.name,
  nameEn: sug!.definition!.nameEn ?? '',
  group: sug!.definition!.group,
  tags: sug!.definition!.tags ?? [],
  concept: sug!.definition!.concept,
  scenarios: sug!.definition!.scenarios ?? [],
  synergies: [],
  source: 'user',
  addedAt: Date.now(),
};
useCustomStrategyStore.getState().addStrategy(strategy, sug?.cases ?? []);
console.log('入库后自定义数:', useCustomStrategyStore.getState().strategies.length);
console.log('幂等：再次加入不重复:', (useCustomStrategyStore.getState().addStrategy(strategy, []), useCustomStrategyStore.getState().strategies.length));

// 下次推理提示词应包含自定义策略
const prompt = buildSystemPrompt();
console.log('提示词含库数声明:', /共 33 条/.test(prompt));
console.log('提示词注入了自定义策略:', prompt.includes('认知友好环路设计'));
console.log('提示词标注用户自定义:', prompt.includes('（用户自定义）'));

// 演示模式（本地兜底）不含 suggested、不报错
import { localFallback } from '../src/services/llm';
const fb = localFallback({
  projectName: '测试', location: '杭州', siteArea: '10000', grossArea: '20000',
  far: '2.0', buildingType: '住宅', demands: [], content: '测试任务书',
});
console.log('兜底无 suggested:', (fb.suggestedStrategies?.length ?? 0) === 0, '| 5 条内置:', fb.strategies.length === 5);
