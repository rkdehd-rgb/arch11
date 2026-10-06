import { strategies, strategyGroups, strategyMap } from '../src/data/strategies';
import { cases, getCasesByStrategy } from '../src/data/cases';
import { localFallback, buildEdges } from '../src/services/llm';

console.log('策略总数:', strategies.length);
console.log('分组数:', strategyGroups.length);
console.log(
  '每维度数量:',
  strategyGroups
    .map((g) => `${g.name}=${strategies.filter((s) => s.group === g.id).length}`)
    .join(' '),
);
console.log('案例总数:', cases.length);
const noCase = strategies.filter((s) => getCasesByStrategy(s.id).length < 2).map((s) => s.id);
console.log('少于2案例的策略:', noCase.length ? noCase.join(',') : '无');
const danglingCase = cases.filter((c) => !strategyMap.has(c.strategyId)).map((c) => c.id);
console.log('悬空案例:', danglingCase.length ? danglingCase.join(',') : '无');
const danglingSyn = strategies.flatMap((s) =>
  s.synergies.filter((x) => !strategyMap.has(x)).map((x) => `${s.id}->${x}`),
);
console.log('悬空协同引用:', danglingSyn.length ? danglingSyn.join(',') : '无');
console.log('案例图片全部为 Commons URL:', cases.every((c) => c.image.startsWith('https://')));
console.log('策略ID唯一:', strategies.length === new Set(strategies.map((s) => s.id)).size);

// 兜底推理链路
const fb = localFallback(
  {
    projectName: '验证项目', location: '上海', siteArea: '12000', grossArea: '36000',
    far: '3.0', buildingType: '文化场馆', demands: ['绿色低碳', '在地文化'],
    content: '需要一座绿色低碳、融合在地文化的社区文化中心，有庭院和自然通风。',
  },
);
console.log('兜底命中策略数:', fb.strategies.length);
console.log('兜底摘要非空:', Boolean(fb.taskSummary));
const ids = new Set(fb.strategies.map((s) => s.strategyId));
console.log('兜底ID都存在:', [...ids].every((id) => strategyMap.has(id)));
const edges = buildEdges(fb);
console.log('协同边数:', edges.length);
console.log('边字段完整:', edges.every((e) => e.source && e.target && e.strength));
