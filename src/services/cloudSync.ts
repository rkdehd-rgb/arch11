import { describeCloudError } from './cloud';
import { deleteDocs, listDocs, upsertDocs, type DocUpsert } from './cloudDocs';
import { migrateLocalImage } from './caseStorage';
import { useAuthStore } from '../stores/auth';
import { useCaseOverrideStore, type CaseOverrideMap } from '../stores/caseOverride';
import { useCustomStrategyStore, type CustomCaseRef } from '../stores/customStrategy';
import { useReportStore } from '../stores/report';
import { useSyncStore } from '../stores/sync';
import type { Strategy } from '../data/strategies';
import type { InferenceReport } from '../types';

/**
 * 云端同步引擎。
 *
 * 设计：**本地优先 + 登录后云端为权威**。
 * - 未登录时应用完全照旧运行（数据留在本机 localStorage），不做任何伪装；
 * - 登录后：先把本地独有数据回推云端，再以云端数据回填本地；此后任一处变更都会
 *   防抖上推，多端访问即一致。
 *
 * 报告按 id 求并集（报告是追加型数据，不会互相覆盖）；自定义策略与案例覆盖以
 * 云端为准，本地独有的条目会被推上去。
 */

const PUSH_DEBOUNCE_MS = 1200;

let started = false;
let suspended = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribers: Array<() => void> = [];

/** 上一次已推送到云端的文档「指纹」，用于只推送真正变化的条目 */
const reportSigs = new Map<string, string>();
const strategySigs = new Map<string, string>();
const overrideSigs = new Map<string, string>();

interface StrategyDoc {
  strategy: Strategy;
  cases: CustomCaseRef[];
}

function signature(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(Math.random());
  }
}

/** 合并云端与本地数据，并把本地独有条目回推。 */
async function pullAndMerge(): Promise<void> {
  const rows = await listDocs();
  const uid = useAuthStore.getState().session?.user.id;
  if (!uid) throw new Error('未登录，无法同步');

  const cloudReports = new Map<string, InferenceReport>();
  const cloudStrategies = new Map<string, StrategyDoc>();
  const cloudOverrides = new Map<string, string[]>();

  for (const row of rows) {
    if (row.kind === 'report') {
      cloudReports.set(row.doc_key, row.payload as InferenceReport);
    } else if (row.kind === 'strategy') {
      const doc = row.payload as StrategyDoc;
      if (doc?.strategy?.id) cloudStrategies.set(row.doc_key, doc);
    } else if (row.kind === 'case_override') {
      const doc = row.payload as { images?: string[] };
      cloudOverrides.set(row.doc_key, Array.isArray(doc?.images) ? doc.images : []);
    }
  }

  // ---- 报告：并集（云端在前，本地独有追加） ----
  const reportState = useReportStore.getState();
  const mergedReports = [...cloudReports.values()];
  const reportIds = new Set(mergedReports.map((r) => r.id));
  const localOnlyReports = reportState.reports.filter((r) => !reportIds.has(r.id));
  mergedReports.push(...localOnlyReports);
  mergedReports.sort((a, b) => b.createdAt - a.createdAt);
  reportState.replaceAll(mergedReports);

  // ---- 自定义策略：云端为准 + 本地独有 ----
  const strategyState = useCustomStrategyStore.getState();
  const mergedStrategies = [...cloudStrategies.values()];
  const strategyIds = new Set(mergedStrategies.map((s) => s.strategy.id));
  for (const strategy of strategyState.strategies) {
    if (strategyIds.has(strategy.id)) continue;
    mergedStrategies.push({
      strategy,
      cases: strategyState.cases.filter((c) => c.strategyId === strategy.id),
    });
  }
  strategyState.replaceAll(
    mergedStrategies.map((s) => s.strategy),
    mergedStrategies.flatMap((s) => s.cases),
  );

  // ---- 案例覆盖：云端为准 + 本地独有（随后统一迁移本地 dataURL 到云存储） ----
  const overrideState = useCaseOverrideStore.getState();
  const mergedOverrides: CaseOverrideMap = { ...overrideState.overrides };
  for (const [strategyId, images] of cloudOverrides) {
    mergedOverrides[strategyId] = { images: [...images] };
  }

  // 把本地 dataURL 尽力迁移到云存储，避免 JSONB 里塞几十 KB 的 base64
  for (const [strategyId, entry] of Object.entries(mergedOverrides)) {
    const migrated: string[] = [];
    for (const image of entry.images) {
      migrated.push(image.startsWith('data:') ? await migrateLocalImage(image, uid) : image);
    }
    mergedOverrides[strategyId] = { images: migrated };
  }
  overrideState.replaceAll(mergedOverrides);
}

/** 推送报告：只提交内容有变化的条目，并删除已被本地移除的条目。 */
async function pushReports(): Promise<void> {
  const reports = useReportStore.getState().reports;
  const liveIds = new Set(reports.map((r) => r.id));

  const changed: DocUpsert[] = [];
  for (const report of reports) {
    const sig = signature(report);
    if (reportSigs.get(report.id) === sig) continue;
    changed.push({ kind: 'report', docKey: report.id, payload: report });
    reportSigs.set(report.id, sig);
  }
  await upsertDocs(changed);

  const removed = [...reportSigs.keys()].filter((id) => !liveIds.has(id));
  if (removed.length > 0) {
    await deleteDocs('report', removed);
    removed.forEach((id) => reportSigs.delete(id));
  }
}

/** 推送自定义策略（每个策略一份文档，带其参考案例）。 */
async function pushStrategies(): Promise<void> {
  const state = useCustomStrategyStore.getState();
  const liveIds = new Set(state.strategies.map((s) => s.id));
  const changed: DocUpsert[] = [];
  for (const strategy of state.strategies) {
    const doc: StrategyDoc = {
      strategy,
      cases: state.cases.filter((c) => c.strategyId === strategy.id),
    };
    const sig = signature(doc);
    if (strategySigs.get(strategy.id) === sig) continue;
    changed.push({ kind: 'strategy', docKey: strategy.id, payload: doc });
    strategySigs.set(strategy.id, sig);
  }
  await upsertDocs(changed);
  const toDelete = [...strategySigs.keys()].filter((id) => !liveIds.has(id));
  if (toDelete.length > 0) {
    await deleteDocs('strategy', toDelete);
    toDelete.forEach((id) => strategySigs.delete(id));
  }
}

/** 推送案例覆盖（每个策略一份文档）。 */
async function pushOverrides(): Promise<void> {
  const overrides = useCaseOverrideStore.getState().overrides;
  const liveIds = new Set(Object.keys(overrides));
  const changed: DocUpsert[] = [];
  for (const [strategyId, entry] of Object.entries(overrides)) {
    const sig = signature(entry.images);
    if (overrideSigs.get(strategyId) === sig) continue;
    changed.push({ kind: 'case_override', docKey: strategyId, payload: { images: entry.images } });
    overrideSigs.set(strategyId, sig);
  }
  await upsertDocs(changed);
  const toDelete = [...overrideSigs.keys()].filter((id) => !liveIds.has(id));
  if (toDelete.length > 0) {
    await deleteDocs('case_override', toDelete);
    toDelete.forEach((id) => overrideSigs.delete(id));
  }
}

async function flushPushes(): Promise<void> {
  try {
    await pushReports();
    await pushStrategies();
    await pushOverrides();
    useSyncStore.getState().markSynced();
  } catch (err) {
    useSyncStore.getState().setStatus('error', describeCloudError(err));
  }
}

function schedulePush(): void {
  if (!started || suspended) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushPushes();
  }, PUSH_DEBOUNCE_MS);
}

function attachSubscribers(): void {
  unsubscribers.push(
    useReportStore.subscribe((state, prev) => {
      if (state.reports !== prev.reports) schedulePush();
    }),
  );
  unsubscribers.push(
    useCustomStrategyStore.subscribe((state, prev) => {
      if (state.strategies !== prev.strategies || state.cases !== prev.cases) schedulePush();
    }),
  );
  unsubscribers.push(
    useCaseOverrideStore.subscribe((state, prev) => {
      if (state.overrides !== prev.overrides) schedulePush();
    }),
  );
}

/** 登录后启动同步：拉取 → 合并 → 回推 → 订阅后续变更。 */
export async function startCloudSync(): Promise<void> {
  if (started) return;
  started = true;
  suspended = true;
  useSyncStore.getState().setStatus('syncing');
  try {
    await pullAndMerge();
    suspended = false;
    attachSubscribers();
    await flushPushes();
  } catch (err) {
    suspended = false;
    if (unsubscribers.length === 0) attachSubscribers();
    useSyncStore.getState().setStatus('error', describeCloudError(err));
  }
}

/** 停止同步（登出时调用）：断开订阅并清空指纹，本地数据保留不动。 */
export function stopCloudSync(): void {
  started = false;
  suspended = false;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  unsubscribers.forEach((off) => off());
  unsubscribers = [];
  reportSigs.clear();
  strategySigs.clear();
  overrideSigs.clear();
  useSyncStore.getState().setStatus('disabled');
}

/** 手动触发一次全量推送（例如用户点击「立即同步」）。 */
export async function syncNow(): Promise<void> {
  if (!useAuthStore.getState().session) throw new Error('请先登录');
  if (!started) {
    await startCloudSync();
    return;
  }
  reportSigs.clear();
  strategySigs.clear();
  overrideSigs.clear();
  useSyncStore.getState().setStatus('syncing');
  await flushPushes();
}

/** 供 UI 判断「本地是否有未登录时可用的数据」 */
export function hasLocalOnlyData(): boolean {
  return (
    useReportStore.getState().reports.length > 0 ||
    useCustomStrategyStore.getState().strategies.length > 0 ||
    Object.keys(useCaseOverrideStore.getState().overrides).length > 0
  );
}
