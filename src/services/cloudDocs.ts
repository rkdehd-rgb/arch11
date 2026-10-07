import { cloud } from './cloud';

/** 云端文档类别：报告 / 自定义策略 / 案例图覆盖 */
export type DocKind = 'report' | 'strategy' | 'case_override';

export interface CloudDocRow {
  kind: DocKind;
  doc_key: string;
  payload: unknown;
  updated_at: string;
}

export interface DocUpsert {
  kind: DocKind;
  docKey: string;
  payload: unknown;
}

const TABLE = 'user_documents';

/**
 * 云 SDK 的 `Database` 泛型默认为 `unknown`，写操作的入参因此被推断成 `never[]`。
 * 这里按实际用到的 PostgREST 子集声明一个宽松接口，只在这一处收口类型，
 * 其余调用点保持类型干净。
 */
interface LooseFilter extends Promise<{ data: unknown; error: unknown }> {
  eq(column: string, value: unknown): LooseFilter;
  in(column: string, values: unknown[]): LooseFilter;
}
interface LooseTable {
  select(
    columns?: string,
    options?: unknown,
  ): Promise<{ data: unknown; error: unknown }> & {
    order(column: string, options?: unknown): Promise<{ data: unknown; error: unknown }>;
  };
  upsert(
    rows: Array<Record<string, unknown>>,
    options?: unknown,
  ): { select(columns?: string): Promise<{ data: unknown; error: unknown }> };
  delete(): LooseFilter;
}

function table(): LooseTable {
  return cloud.database.from(TABLE) as unknown as LooseTable;
}

function asMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** 拉取当前用户全部文档（RLS 已按 owner 过滤，无需也不应手写 owner 条件）。 */
export async function listDocs(): Promise<CloudDocRow[]> {
  const { data, error } = await table()
    .select('kind, doc_key, payload, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(asMessage(error));
  return (data ?? []) as CloudDocRow[];
}

/**
 * 批量写入（命中 (owner_id, kind, doc_key) 唯一索引即更新）。
 * `owner_id` 由 `DEFAULT auth.uid()` 在服务端填充，客户端绝不能传。
 */
export async function upsertDocs(rows: DocUpsert[]): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((row) => ({
    kind: row.kind,
    doc_key: row.docKey,
    payload: row.payload,
    updated_at: new Date().toISOString(),
  }));
  const { data, error } = await table()
    .upsert(payload, { onConflict: 'owner_id,kind,doc_key' })
    .select('doc_key');
  if (error) throw new Error(asMessage(error));
  // 写入返回空数组 = RLS 拦下了（例如未登录），并不代表成功
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('云端拒绝了写入，请确认登录状态后重试');
  }
}

/** 删除指定文档；`docKeys` 为空则删除该类别下全部文档。 */
export async function deleteDocs(kind: DocKind, docKeys: string[] = []): Promise<void> {
  const scoped = table().delete().eq('kind', kind);
  const { error } = await (docKeys.length > 0 ? scoped.in('doc_key', docKeys) : scoped);
  if (error) throw new Error(asMessage(error));
}
