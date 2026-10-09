// 为 cases.ts 中 image 为空的案例检索 gooood 正文图。
//   阶段一（默认）：搜索 + 三重校验，产出 gooood-case-images.json（不修改 cases.ts）
//   阶段二：node scripts/fetch-case-images.mjs --apply   依据候选文件写回 cases.ts
// 三重校验（缺一不可）：
//   1) 项目名关键词命中（英文名优先；名称含 >=2 个关键词时要求全部命中）
//   2) 标题/链接中出现该案例的建筑师关键词，或出现其地点关键词
//   3) 图片 URL 通过 HTTP 2xx 且文件头魔数为真实图片
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const CASES = path.join(ROOT, 'src/data/cases.ts');
const MAP = path.join(ROOT, 'gooood-case-images.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STOP = new Set([
  'the', 'of', 'by', 'and', 'for', 'architects', 'design', 'studio', 'group',
  'architect', 'building', 'center', 'centre', 'park', 'museum', 'house',
  'international', 'school', 'company', 'partners', 'associates', 'office',
]);

// 去掉变音符并小写，避免 Kjørbo 的 ø 把 token 切断
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function parseCases() {
  const text = fs.readFileSync(CASES, 'utf8');
  return text
    .split('\n')
    .filter((l) => /^\s*\{\s*id:/.test(l))
    .map((l) => {
      const g = (re) => (l.match(re) || [, ''])[1];
      return {
        id: g(/id:\s*'([^']+)'/),
        name: g(/name:\s*'([^']*)'/),
        location: g(/location:\s*'([^']*)'/),
        architect: g(/architect:\s*'([^']*)'/),
        image: g(/image:\s*'([^']*)'/),
      };
    });
}

function tokens(s, minLen) {
  return (norm(s).match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w) && w.length >= minLen);
}
function cjkTokens(s) {
  return (String(s || '').match(/[\u4e00-\u9fff]+/g) || []).filter((w) => w.length >= 2);
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

const searchCache = new Map();
async function searchCards(term) {
  if (searchCache.has(term)) return searchCache.get(term);
  let html = '';
  try {
    html = await fetchText('https://www.gooood.cn/search?q=' + encodeURIComponent(term));
  } catch {
    searchCache.set(term, []);
    return [];
  }
  const cardRe = /<article[^>]*class="[^"]*result-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  const cards = [];
  let m;
  while ((m = cardRe.exec(html))) {
    const block = m[1];
    const hrefM = block.match(/href="([^"]+)"/);
    if (!hrefM) continue;
    let href = hrefM[1];
    if (href.startsWith('/')) href = 'https://www.gooood.cn' + href;
    const ariaM = block.match(/aria-label="([^"]*)"/);
    const h2M = block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    const title = (ariaM ? ariaM[1] : h2M ? h2M[1] : '').replace(/\s+/g, ' ').trim();
    cards.push({ title, href });
  }
  searchCache.set(term, cards);
  return cards;
}

// 三重校验
function pickCard(cards, c) {
  const en = tokens(c.name, 4);
  const cjk = cjkTokens(c.name);
  const strong = en.length ? en : cjk.map((w) => w.toLowerCase());
  if (!strong.length) return null;
  const need = strong.length >= 2 ? 2 : 1;

  const archWords = tokens(c.architect, 4);
  const locWords = tokens(c.location, 3);
  const locCjk = cjkTokens(c.location);
  const auxWords = [...archWords, ...locWords, ...locCjk.map((w) => w.toLowerCase())];

  let best = null;
  let bestScore = 0;
  for (const card of cards) {
    const hay = norm(card.title + ' ' + card.href);
    let score = 0;
    for (const w of strong) if (hay.includes(w)) score += 1;
    if (score < need) continue;
    // 第二重：标题须出现建筑师或地点线索
    const aux = auxWords.length === 0 || auxWords.some((w) => hay.includes(w));
    if (!aux) continue;
    if (score > bestScore) {
      bestScore = score;
      best = { ...card, score };
    }
  }
  return best;
}

function extractContentBlock(html) {
  const m = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i);
  if (!m) return html;
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (i < html.length && depth > 0) {
    if (html.startsWith('<div', i)) {
      depth++;
      i += 4;
    } else if (html.startsWith('</div', i)) {
      depth--;
      i += 5;
    } else i++;
  }
  return html.slice(start, i);
}

const PROMO =
  /interview|%E5%89%AF%E6%9C%AC|aha|banner|logo|avatar|icon|wechat|qr|招聘|二维码|微信|小红书|weixin/i;

function filterImages(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    let url = raw.startsWith('http') ? raw : 'https://' + raw;
    url = url.split('?')[0];
    if (/%[0-9A-Fa-f]{2}/.test(url)) continue;
    if (PROMO.test(url)) continue;
    const original = url.replace(/-\d+x\d+(?=\.[a-zA-Z]+)/, '');
    if (seen.has(original)) continue;
    seen.add(original);
    out.push(original);
  }
  return out;
}

async function articleImages(articleUrl) {
  const html = await fetchText(articleUrl);
  const block = extractContentBlock(html);
  const urls = new Set();
  const attrRe = /(?:src|data-src|data-original|data-lazy-src)="([^"]*oss\.gooood\.cn[^"]*)"/g;
  let m;
  while ((m = attrRe.exec(block))) urls.add(m[1]);
  for (const u of block.match(/oss\.gooood\.cn\/uploads\/[^"'<>\s)]+/g) || []) urls.add(u);
  return filterImages([...urls]);
}

const MAGIC = [
  [0xff, 0xd8, 0xff],
  [0x89, 0x50, 0x4e, 0x47],
  [0x47, 0x49, 0x46, 0x38],
];
function isImage(buf) {
  if (!buf || buf.length < 12) return false;
  for (const sig of MAGIC) if (sig.every((b, i) => buf[i] === b)) return true;
  return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
}
async function urlOk(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-63' } });
    if (!(r.ok || r.status === 206)) return false;
    return isImage(Buffer.from(await r.arrayBuffer()));
  } catch {
    return false;
  }
}

async function resolve(c) {
  const en = tokens(c.name, 4);
  const cjk = cjkTokens(c.name);
  const terms = [];
  if (cjk.length) terms.push(cjk.join(' '));
  if (en.length) terms.push(en.join(' '));
  terms.push(String(c.name).replace(/[（(].*?[)）]/g, '').trim());
  const tried = new Set();
  for (const t of terms) {
    if (!t || tried.has(t)) continue;
    tried.add(t);
    const cards = await searchCards(t);
    await sleep(150);
    const best = pickCard(cards, c);
    if (!best) continue;
    let imgs = [];
    try {
      imgs = await articleImages(best.href);
    } catch {
      /* ignore */
    }
    await sleep(150);
    for (const u of imgs.slice(0, 3)) {
      if (await urlOk(u)) return { url: u, article: best.href, title: best.title, term: t, score: best.score };
    }
  }
  return null;
}

function apply() {
  if (!fs.existsSync(MAP)) {
    console.error('找不到 gooood-case-images.json，请先跑阶段一');
    process.exit(1);
  }
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  let text = fs.readFileSync(CASES, 'utf8');
  let n = 0;
  for (const [id, info] of Object.entries(map)) {
    if (!info || !info.url || info.skip) continue;
    const esc = id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const lineRe = new RegExp("(\\{[^}]*?id:\\s*'" + esc + "'[\\s\\S]*?)image:\\s*'[^']*'");
    if (!lineRe.test(text)) continue;
    text = text.replace(lineRe, `$1image: '${info.url.replace(/'/g, "\\'")}'`);
    n++;
  }
  fs.writeFileSync(CASES, text, 'utf8');
  console.error(`写回完成：${n} 条`);
}

const args = process.argv.slice(2);
if (args.includes('--apply')) {
  apply();
  process.exit(0);
}

const limArg = args.find((a) => a.startsWith('--limit='));
const limit = limArg ? parseInt(limArg.split('=')[1], 10) : Infinity;

const all = parseCases();
const targets = all.filter((c) => !c.image).slice(0, limit);
console.error(`待配图：${targets.length} 条（全库 ${all.length}）`);

const map = {};
let hit = 0;
for (let i = 0; i < targets.length; i++) {
  const c = targets[i];
  let r = null;
  try {
    r = await resolve(c);
  } catch {
    /* ignore */
  }
  if (r) {
    map[c.id] = r;
    hit++;
    console.error(`[${i + 1}/${targets.length}] HIT  ${c.id} | ${c.name} | ${r.title}`);
  } else {
    console.error(`[${i + 1}/${targets.length}] miss ${c.id} | ${c.name}`);
  }
  if ((i + 1) % 5 === 0) fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
}
fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
console.error(`\n阶段一完成：命中 ${hit}/${targets.length}，候选写入 ${MAP}`);
