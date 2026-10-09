// 把 scripts/cases-extra.json 的新增案例合并进 src/data/cases.ts
// 用法：node scripts/build-cases.mjs
// 说明：保留 cases.ts 中原有案例条目（含 image 与 imageWiki），在其后追加新条目；
//      新条目 image 初始为空字符串，由 fetch-case-images.mjs 后续填充。
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const CASES = path.join(ROOT, 'src/data/cases.ts');
const BASE = path.join(ROOT, 'scripts/cases-base.ts');
const EXTRA = path.join(ROOT, 'scripts/cases-extra.json');

// 基线：原有的 64 条案例（含 image / imageWiki），来自 scripts/cases-base.ts
const text = fs.readFileSync(BASE, 'utf8');
const start = text.indexOf('export const cases: CaseRef[] = [');
if (start < 0) throw new Error('未找到 cases 数组起始标记');
const head = text.slice(0, start);
const bodyStart = start + 'export const cases: CaseRef[] = ['.length;
const bodyEnd = text.indexOf('\n];', bodyStart); // 行首的 '];' 才是数组结束
if (bodyEnd < bodyStart) throw new Error('未找到 cases 数组结束标记');
const existingBody = text.slice(bodyStart, bodyEnd);

// 拆出原有案例行
const existingLines = existingBody
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('{') && l.includes('id:'));

const existingIds = new Set(
  existingLines.map((l) => (l.match(/id:\s*'([^']+)'/) || [, ''])[1]),
);

const extra = JSON.parse(fs.readFileSync(EXTRA, 'utf8'));

const q = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const newLines = [];
let added = 0;
for (const c of extra) {
  if (existingIds.has(c.id)) {
    console.error('跳过（id 已存在）:', c.id);
    continue;
  }
  newLines.push(
    `  { id: '${q(c.id)}', strategyId: '${q(c.strategyId)}', name: '${q(c.name)}', ` +
      `location: '${q(c.location)}', year: '${q(c.year)}', architect: '${q(c.architect)}', ` +
      `highlight: '${q(c.highlight)}', image: '' },`,
  );
  added++;
}

const tail = text.slice(bodyEnd + 3); // '\n];' 之后的原有导出必须原样保留

const all = [...existingLines.map((l) => (l.endsWith(',') ? l : l + ',')), ...newLines];
const out =
  head +
  'export const cases: CaseRef[] = [\n' +
  all.join('\n') +
  '\n];\n' +
  tail;

fs.writeFileSync(CASES, out, 'utf8');
console.error(`完成：原有 ${existingLines.length} 条，新增 ${added} 条，合计 ${all.length} 条`);
