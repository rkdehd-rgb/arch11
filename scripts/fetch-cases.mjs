// 把案例库里引用的远程图下载到 public/cases/<id>.jpg，
// 让站点优先使用本地图片文件（前端缺失时按 imageWiki→wiki 顺序回退）。
//
// 用法：
//   node scripts/fetch-cases.mjs          下载全部（已存在则跳过）
//   node scripts/fetch-cases.mjs --dry    仅打印将要下载的条目，不实际下载
//
// 说明：
//   - 优先下载 image 字段（gooood 图床，沙箱/本机均可直连）；
//     若某案例 image 仍是 wiki 源（未匹配到 gooood），则回退下载 imageWiki（Wikimedia）。
//   - 下载结果默认不入库（见 .gitignore public/cases/*）；如需部署站点也用本地图，
//     取消忽略并提交 public/cases，或在部署环境运行本脚本。
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const casesPath = join(root, 'src/data/cases.ts');
const outDir = join(root, 'public/cases');
const dryRun = process.argv.includes('--dry');

const text = readFileSync(casesPath, 'utf8');
const re = /id:\s*'([^']+)'[\s\S]*?image:\s*'([^']+)'[\s\S]*?imageWiki:\s*'([^']+)'/g;
const tasks = [];
let m;
while ((m = re.exec(text))) {
  const id = m[1];
  const url = m[2];
  const wiki = m[3];
  // 优先用 gooood 图；若 image 仍是 wiki（未匹配），回退到 imageWiki
  const primary = /oss\.gooood\.cn/.test(url) ? url : wiki;
  if (!primary) continue;
  tasks.push({ id, url: primary });
}

console.log(`解析到 ${tasks.length} 条案例图（优先 gooood，回退 wiki）`);
mkdirSync(outDir, { recursive: true });

if (dryRun) {
  for (const t of tasks) console.log(`  ${t.id}  <-  ${t.url}`);
  process.exit(0);
}

const fetchUrl = (url) =>
  /commons\.wikimedia\.org/.test(url) && !url.includes('?')
    ? `${url}?width=1200`
    : url;
const CONCURRENCY = 6;
let ok = 0;
let skip = 0;
let fail = 0;

async function downloadOne(t) {
  const out = join(outDir, `${t.id}.jpg`);
  if (existsSync(out) && statSync(out).size > 0) {
    skip++;
    return;
  }
  try {
    const res = await fetch(fetchUrl(t.url), { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(out, buf);
    ok++;
  } catch (e) {
    fail++;
    console.error(`✗ ${t.id}: ${e.message}`);
  }
}

for (let i = 0; i < tasks.length; i += CONCURRENCY) {
  const batch = tasks.slice(i, i + CONCURRENCY);
  // eslint-disable-next-line no-await-in-loop
  await Promise.all(batch.map(downloadOne));
}

console.log(`完成：成功 ${ok}，跳过 ${skip}，失败 ${fail}`);
