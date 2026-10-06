import {
  strategies as builtinStrategies,
  strategyMap as builtinMap,
  strategyGroups,
  type Strategy,
} from '../data/strategies';
import { getCasesByStrategy } from '../data/cases';
import type { CaseRef } from '../data/cases';
import { useCustomStrategyStore } from '../stores/customStrategy';
import type { StrategyMatch } from '../types';

/** 非响应式读取当前用户自定义策略（供服务层/提示词构建使用） */
export function getUserStrategies(): Strategy[] {
  return useCustomStrategyStore.getState().strategies;
}

/** 内置 + 用户自定义的完整匹配池 */
export function getPooledStrategies(): Strategy[] {
  return [...builtinStrategies, ...getUserStrategies()];
}

/** 内置 + 用户自定义的 id -> 策略 映射 */
export function getPooledMap(): Map<string, Strategy> {
  const map = new Map<string, Strategy>(builtinMap);
  for (const s of getUserStrategies()) map.set(s.id, s);
  return map;
}

export function getStrategyById(id: string): Strategy | undefined {
  return getPooledMap().get(id);
}

/** 策略是否为用户自定义 */
export function isUserStrategy(id: string): boolean {
  return getUserStrategies().some((s) => s.id === id);
}

/** 解析维度 id 为中文名，未知维度原样返回 */
export function getGroupName(groupId: string): string {
  const g = strategyGroups.find((x) => x.id === groupId);
  return g ? g.name : groupId;
}

/** 取策略参考案例：内置策略查内置案例库，用户策略查自定义案例 */
export function resolveCases(strategyId: string): CaseRef[] {
  if (isUserStrategy(strategyId)) {
    return useCustomStrategyStore.getState().cases.filter(
      (c) => c.strategyId === strategyId,
    ) as CaseRef[];
  }
  return getCasesByStrategy(strategyId);
}

/** 从匹配结果中取策略定义（库外策略用 definition 现场构建） */
export function resolveStrategy(match: StrategyMatch): Strategy | undefined {
  if (match.source === 'suggested' && match.definition) {
    return {
      id: match.strategyId,
      name: match.definition.name,
      nameEn: match.definition.nameEn ?? '',
      group: match.definition.group,
      tags: match.definition.tags ?? [],
      concept: match.definition.concept,
      scenarios: match.definition.scenarios ?? [],
      synergies: match.definition.synergies ?? [],
      synergyNote: match.definition.synergyNote,
      source: 'builtin',
    };
  }
  return getStrategyById(match.strategyId);
}

/** 为库外策略生成稳定、不与现有池冲突的 id（去掉 source:: 前缀后收藏） */
export function makeSuggestedId(name: string): string {
  const slug = Array.from(name)
    .map((ch) => {
      if (/[a-zA-Z0-9]/.test(ch)) return ch.toLowerCase();
      if (/[一-龥]/.test(ch)) return '';
      return '-';
    })
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const base = slug || 'custom-strategy';
  const map = getPooledMap();
  let id = base;
  let n = 2;
  while (map.has(id) || id.startsWith('suggested-')) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}
