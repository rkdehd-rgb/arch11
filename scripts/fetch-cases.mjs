// 把案例库里引用的 Wikimedia 远程图下载到 public/cases/<id>.jpg，
// 让站点优先使用本地图片文件（前端缺失时自动回退到 wiki 原图）。
//
// 用法：
//   node scripts/fetch-cases.mjs          下载全部（已存在则跳过）
//   node scripts/fetch-cases.mjs --dry    仅打印将要下载的条目，不实际下载
//
// 说明：
//   - 本沙箱对 upload.wikimedia.org 图床拦截，请在本机（或能访问 Wikimedia 的环境）运行。
//   - 统一请求 ?width=1200，强制返回 jpg，与前端 /cases/<id>.jpg 路径一致。
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
const re = /id:\s*'([^']+)'[\s\S]*?image:\s*'([^']+)'/g;
const tasks = [];
let m;
while ((m = re.exec(text))) {
  const id = m[1];
  const url = m[2];
  if (!/commons\.wikimedia\.org/.test(url)) continue; // 只处理 wiki 源
  tasks.push({ id, url });
}

console.log(`解析到 ${tasks.length} 条 wiki 案例图`);
mkdirSync(outDir, { recursive: true });

if (dryRun) {
  for (const t of tasks) console.log(`  ${t.id}  <-  ${t.url}`);
  process.exit(0);
}

const fetchUrl = (url) => (url.includes('?') ? url : `${url}?width=1200`);
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
