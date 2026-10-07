import {
  strategies as builtinStrategies,
  strategyMap as builtinMap,
  strategyGroups,
  type Strategy,
} from '../data/strategies';
import { getCasesByStrategy } from '../data/cases';
import type { CaseRef } from '../data/cases';
import { useCustomStrategyStore } from '../stores/customStrategy';
import { useCaseOverrideStore } from '../stores/caseOverride';
import type { StrategyMatch } from '../types';

/** 案例的最小元数据（内置 CaseRef / 库外 cases / 用户添加均可） */
export interface CaseMeta {
  image: string;
  name?: string;
  location?: string;
  year?: string;
  architect?: string;
  highlight?: string;
  /** 一级回退地址（gooood 图，已走代理） */
  imageFallback?: string;
  /** 二级回退地址（wiki 原图） */
  imageFallback2?: string;
}

/** 渲染用案例视图：合并覆盖层图片与基础元数据 */
export interface CaseView {
  image: string;
  name: string;
  location: string;
  year: string;
  architect: string;
  highlight: string;
  /** 是否为用户在基础案例之外新增的图 */
  custom: boolean;
  /** 一级回退地址（gooood 图，已走代理） */
  imageFallback: string;
  /** 二级回退地址（wiki 原图） */
  imageFallback2: string;
}

/** gooood 图床地址走后端代理，避免防盗链；其余地址原样返回 */
function toDisplayUrl(url: string): string {
  if (!url) return url;
  if (url.includes('oss.gooood.cn')) {
    return `/api/case-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

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

/** 取策略参考案例（基础元数据）：内置策略查内置案例库，用户策略查自定义案例 */
export function resolveCases(strategyId: string): CaseRef[] {
  if (isUserStrategy(strategyId)) {
    return useCustomStrategyStore.getState().cases.filter(
      (c) => c.strategyId === strategyId,
    ) as CaseRef[];
  }
  return getCasesByStrategy(strategyId);
}

/** 有效案例元数据：覆盖层优先，否则用基础案例；用于画板自动贴图等只需图片/简述处 */
export function resolveCaseMeta(strategyId: string): CaseMeta[] {
  const override = useCaseOverrideStore.getState().overrides[strategyId];
  const base = resolveCases(strategyId);
  if (override) {
    return override.images.map((image, i) => {
      const b = base[i];
      return {
        image,
        name: b?.name,
        location: b?.location,
        year: b?.year,
        architect: b?.architect,
        highlight: b?.highlight,
        imageFallback: toDisplayUrl(b?.image ?? ''),
        imageFallback2: b?.imageWiki ?? b?.image ?? '',
      };
    });
  }
  if (isUserStrategy(strategyId)) {
    return useCustomStrategyStore
      .getState()
      .cases.filter((c) => c.strategyId === strategyId)
      .map((c) => ({
        id: c.id,
        strategyId: c.strategyId,
        name: c.name,
        location: c.location,
        year: c.year,
        architect: c.architect,
        highlight: c.highlight,
        image: c.image ?? '',
        imageFallback: toDisplayUrl(c.image ?? ''),
        imageFallback2: c.image ?? '',
      }));
  }
  return getCasesByStrategy(strategyId).map((b) => ({
    ...b,
    image: `/cases/${b.id}.jpg`,
    imageFallback: toDisplayUrl(b.image),
    imageFallback2: b.imageWiki ?? b.image,
  }));
}

/** 渲染用案例视图：合并覆盖层图片 + 基础元数据，新增图标 custom */
export function resolveCaseView(
  strategyId: string,
  baseCases?: CaseMeta[],
): CaseView[] {
  const base = baseCases ?? resolveCases(strategyId);
  const override = useCaseOverrideStore.getState().overrides[strategyId];
  const isBuiltin = !isUserStrategy(strategyId);
  // 内置案例优先用本地 /cases/<id>.jpg；库外/用户案例保留原图
  const localOf = (b: { id?: string; image: string } | undefined): string =>
    isBuiltin && b?.id ? `/cases/${b.id}.jpg` : (b?.image ?? '');
  const images = override ? override.images : base.map(localOf);
  return images.map((image, i) => {
    const b = base[i];
    return {
      image,
      name: b?.name || '自定义参考案例',
      location: b?.location || '',
      year: b?.year || '',
      architect: b?.architect || '',
      highlight: b?.highlight || (i < base.length ? '' : '用户添加的参考案例图'),
      custom: i >= base.length,
      imageFallback: toDisplayUrl(b?.image ?? ''),
      imageFallback2: b?.imageWiki ?? b?.image ?? '',
    };
  });
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
