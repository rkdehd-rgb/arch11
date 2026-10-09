// 多源案例配图检索：gooood → 有方 → 建筑学院 → divisare
// 沿用三重校验：① 项目名关键词命中 ② 建筑师/地点线索命中 ③ 图片真实可达（HTTP 2xx + 魔数）
// 用法：
//   node scripts/fetch-case-images-multi.mjs                 阶段一：产出候选 gooood-case-images.json
//   node scripts/fetch-case-images-multi.mjs --apply         阶段二：写回 cases.ts
//   node scripts/fetch-case-images-multi.mjs --limit=20
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const CASES = path.join(ROOT, 'src/data/cases.ts');
const MAP = path.join(ROOT, 'gooood-case-images.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

const STOP = new Set([
  'the', 'of', 'by', 'and', 'for', 'architects', 'design', 'studio', 'group',
  'architect', 'building', 'center', 'centre', 'park', 'museum', 'house',
  'international', 'school', 'company', 'partners', 'associates', 'office',
]);
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function tokens(s, min = 4) {
  return (norm(s).match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w) && w.length >= min);
}
function cjk(s) {
  return (String(s || '').match(/[\u4e00-\u9fff]+/g) || []).filter((w) => w.length >= 2);
}
const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const noParam = (u) => String(u || '').split('?')[0];

async function fetchText(url, accept = 'text/html') {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
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
async function urlOk(url, referer) {
  try {
    const h = { 'User-Agent': UA, Range: 'bytes=0-63' };
    if (referer) h.Referer = referer;
    const r = await fetch(url, { headers: h });
    if (!(r.ok || r.status === 206)) return false;
    return isImage(Buffer.from(await r.arrayBuffer()));
  } catch {
    return false;
  }
}

// ---------- 各图源 ----------
const GOOOOD_ARTICLE_IMG = /oss\.gooood\.cn\/uploads\/[^"'<>\s)]+/g;

const SOURCES = [
  {
    name: 'gooood',
    origin: 'https://www.gooood.cn',
    referer: '',
    searchUrl: (q) => `https://www.gooood.cn/search?q=${enc(q)}`,
    parseSearch(html) {
      const out = [];
      const re = /<article[^>]*class="[^"]*result-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
      let m;
      while ((m = re.exec(html))) {
        const b = m[1];
        const href = (b.match(/href="([^"]+)"/) || [])[1] || '';
        const title = stripTags(
          (b.match(/aria-label="([^"]*)"/) || [])[1] ||
            (b.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] ||
            '',
        );
        if (href) out.push({ href: href.startsWith('http') ? href : 'https://www.gooood.cn' + href, title, cover: '' });
      }
      return out;
    },
    parseArticle(html) {
      const block = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i) ? html : html;
      const urls = uniq(block.match(GOOOOD_ARTICLE_IMG) || []);
      return urls.map((u) => noParam(u.startsWith('http') ? u : 'https://' + u).replace(/-\d+x\d+(?=\.[a-z]+$)/i, ''));
    },
  },
  {
    name: 'archiposition',
    origin: 'https://www.archiposition.com',
    referer: 'https://www.archiposition.com/',
    searchUrl: (q) => `https://www.archiposition.com/?s=${enc(q)}`,
    parseSearch(html) {
      const out = [];
      const re = /<article[^>]*class="[^"]*search-article-item[^"]*"[\s\S]*?<\/article>/g;
      let m;
      while ((m = re.exec(html))) {
        const b = m[0];
        const href = (b.match(/href="([^"]+)"/) || [])[1] || '';
        const hM =
          b.match(/<h[0-9][^>]*>\s*<a[^>]*>([\s\S]{2,200}?)<\/a>/) ||
          b.match(/<h[0-9][^>]*>([\s\S]{2,200}?)<\/h[0-9]>/);
        const title = stripTags(hM ? hM[1] : '');
        const img = (b.match(/(?:data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/) || [])[1] || '';
        if (href)
          out.push({
            href: href.startsWith('http') ? href : 'https://www.archiposition.com' + href,
            title,
            cover: img ? noParam(img).replace(/\?.*$/, '') : '',
          });
      }
      return out;
    },
    parseArticle(html) {
      const urls = html.match(/https?:[^"'\s]*image\.archiposition\.com\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/g) || [];
      return uniq(urls.map(noParam));
    },
  },
  {
    name: 'archcollege',
    origin: 'https://www.archcollege.com',
    referer: 'https://www.archcollege.com/',
    searchUrl: (q) => `https://www.archcollege.com/?s=${enc(q)}`,
    parseSearch(html) {
      const out = [];
      const re = /<h[0-9][^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]{4,200}?)<\/a>/g;
      let m;
      while ((m = re.exec(html))) {
        out.push({ href: m[1], title: stripTags(m[2]), cover: '' });
      }
      return out;
    },
    parseArticle(html) {
      const urls =
        html.match(/https?:\/\/www\.archcollege\.com\/wp-content\/uploads\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/g) || [];
      return uniq(urls.map(noParam));
    },
  },
  {
    name: 'divisare',
    origin: 'https://divisare.com',
    referer: 'https://divisare.com/',
    searchUrl: (q) => `https://divisare.com/search?q=${enc(q)}`,
    parseSearch(html) {
      const out = [];
      const re = /href="(\/projects\/[^"]+)"[\s\S]{0,1200}?/g;
      let m;
      const seen = new Set();
      while ((m = re.exec(html))) {
        const href = m[1];
        if (seen.has(href)) continue;
        seen.add(href);
        const tail = html.slice(m.index, m.index + 1500);
        const img = (tail.match(/https:\/\/images\.divisare\.com\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/) || [])[0] || '';
        out.push({ href: 'https://divisare.com' + href, title: stripTags(href.split('/').pop() || ''), cover: noParam(img) });
      }
      return out;
    },
    parseArticle(html) {
      const urls = html.match(/https:\/\/images\.divisare\.com\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/g) || [];
      return uniq(urls.map(noParam));
    },
  },
];

function uniq(arr) {
  return [...new Set(arr)];
}

// ---------- 三重校验 ----------
function pickItem(items, c) {
  const en = tokens(c.name, 4);
  const zh = cjk(c.name);
  const strong = en.length ? en : zh.map((w) => w.toLowerCase());
  if (!strong.length) return null;
  const need = strong.length >= 2 ? 2 : 1;

  const aux = [
    ...tokens(c.architect, 4),
    ...tokens(c.location, 3),
    ...cjk(c.location).map((w) => w.toLowerCase()),
  ];

  let best = null;
  let bestScore = 0;
  for (const it of items) {
    const hay = norm(it.title + ' ' + it.href);
    let score = 0;
    for (const w of strong) if (hay.includes(w)) score += 1;
    if (score < need) continue;
    if (aux.length && !aux.some((w) => hay.includes(w))) continue;
    if (score > bestScore) {
      bestScore = score;
      best = { ...it, score };
    }
  }
  return best;
}

function termsFor(c) {
  const t = [];
  const zh = cjk(c.name);
  const en = tokens(c.name, 4);
  if (zh.length) t.push(zh.join(' '));
  if (en.length) t.push(en.join(' '));
  t.push(String(c.name).replace(/[（(].*?[)）]/g, '').trim());
  return [...new Set(t.filter(Boolean))];
}

async function resolve(c) {
  const terms = termsFor(c);
  for (const src of SOURCES) {
    for (const term of terms) {
      let html = '';
      try {
        html = await fetchText(src.searchUrl(term));
      } catch {
        await sleep(120);
        continue;
      }
      await sleep(120);
      const items = src.parseSearch(html);
      const best = pickItem(items, c);
      if (!best) continue;

      const candidates = [];
      if (best.cover) candidates.push(best.cover);
      try {
        const art = await fetchText(best.href);
        candidates.push(...src.parseArticle(art).slice(0, 2));
      } catch {
        /* ignore */
      }
      await sleep(120);
      for (const u of candidates.slice(0, 3)) {
        if (await urlOk(u, src.referer)) {
          return { url: u, source: src.name, title: best.title, article: best.href, score: best.score };
        }
      }
    }
  }
  return null;
}

// ---------- 写回 ----------
function apply() {
  if (!fs.existsSync(MAP)) {
    console.error('缺少候选文件，请先跑阶段一');
    process.exit(1);
  }
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  let text = fs.readFileSync(CASES, 'utf8');
  let n = 0;
  for (const [id, info] of Object.entries(map)) {
    if (!info || !info.url || info.skip) continue;
    const esc = id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp("(\\{[^}]*?id:\\s*'" + esc + "'[\\s\\S]*?)image:\\s*'[^']*'");
    if (!re.test(text)) continue;
    text = text.replace(re, `$1image: '${info.url.replace(/'/g, "\\'")}'`);
    n++;
  }
  fs.writeFileSync(CASES, text, 'utf8');
  console.error(`写回完成：${n} 条`);
}

// ---------- 主流程 ----------
const args = process.argv.slice(2);
if (args.includes('--apply')) {
  apply();
  process.exit(0);
}

const limArg = args.find((a) => a.startsWith('--limit='));
const limit = limArg ? parseInt(limArg.split('=')[1], 10) : Infinity;

const text = fs.readFileSync(CASES, 'utf8');
const cases = text
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
const targets = cases.filter((c) => !c.image).slice(0, limit);
console.error(`待配图：${targets.length} 条（全库 ${cases.length}）`);

const map = {};
let hit = 0;
const bySource = {};
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
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    console.error(`[${i + 1}/${targets.length}] HIT  ${r.source.padEnd(14)} ${c.id} | ${c.name} | ${r.title}`);
  } else {
    console.error(`[${i + 1}/${targets.length}] miss ${''.padEnd(14)} ${c.id} | ${c.name}`);
  }
  if ((i + 1) % 3 === 0) fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
}
fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
console.error(`\n阶段一完成：命中 ${hit}/${targets.length}`, JSON.stringify(bySource));
