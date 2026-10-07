// 把内置案例的图源从 wiki 换成 gooood（相关性打分版）：
//   1) 逐条用案例名搜索 gooood，按「标题/链接是否含案例名关键 token」打分，取最高分文章
//   2) 抓取该文章页正文图（过滤乱码 blob / 推广图）
//   3) 高置信命中 → gooood 图写入 image，原 wiki 写入 imageWiki 兜底；未命中 → 保留 wiki
// 用法：
//   node scripts/map-gooood-images.mjs --limit=6
//   node scripts/map-gooood-images.mjs --all
//   node scripts/map-gooood-images.mjs --apply
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const CASES_PATH = path.join(ROOT, 'src/data/cases.ts');
const MAP_PATH = path.join(ROOT, 'gooood-map.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STOP = new Set([
  'the', 'of', 'by', 'and', 'for', 'architects', 'design', 'studio', 'group',
  'architect', 'building', 'center', 'centre', 'park', 'museum', 'house',
]);

// ---------- 解析 cases.ts ----------
function parseCases() {
  const text = fs.readFileSync(CASES_PATH, 'utf8');
  return text
    .split('\n')
    .filter((l) => /^\s*\{\s*id:/.test(l))
    .map((l) => {
      const g = (re) => (l.match(re) || [, ''])[1];
      return {
        line: l,
        id: g(/id:\s*'([^']+)'/),
        name: g(/name:\s*'([^']*)'/),
        image: g(/image:\s*'([^']*)'/),
      };
    });
}

// ---------- 案例名 → 关键 token ----------
function nameTokens(name) {
  const cjk = name.match(/[一-鿿]+/g) || [];
  const en = (name.toLowerCase().match(/[a-z]{3,}/g) || [])
    .filter((w) => !STOP.has(w))
    .filter((w) => w.length >= 4);
  return { cjk, en };
}

// ---------- gooood 搜索 + 相关性打分 ----------
async function searchBestCard(name) {
  const { cjk, en } = nameTokens(name);
  const url = 'https://www.gooood.cn/search?q=' + encodeURIComponent(name);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error('search HTTP ' + res.status);
  const html = await res.text();
  const cardRe = /<article[^>]*class="[^"]*result-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  let best = null;
  let bestScore = 0;
  // 有英文专有名词时，必须以英文名命中（避免「垂直森林」这类通用概念词误匹配 Wonderwoods）；
  // 纯中文名才用中文名命中。
  const strong = en.length > 0 ? en : cjk;
  while ((m = cardRe.exec(html))) {
    const block = m[1];
    const hrefM = block.match(/href="([^"]+)"/);
    if (!hrefM) continue;
    let href = hrefM[1];
    if (href.startsWith('/')) href = 'https://www.gooood.cn' + href;
    const ariaM = block.match(/aria-label="([^"]*)"/);
    const h2M = block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    const title = (ariaM ? ariaM[1] : h2M ? h2M[1] : '').replace(/\s+/g, ' ').trim();
    const hay = (title + ' ' + href).toLowerCase();
    let score = 0;
    for (const w of strong) if (hay.includes(w)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = { title, href, score };
    }
  }
  return best && bestScore >= 1 ? best : null;
}

// ---------- 文章页正文图（仅取正文区 entry-content） ----------
// gooood 文章页含大量页眉/页脚/侧栏噪音图（招聘封面、微信二维码、事务所 logo），
// 真实项目照片都在正文容器 entry-content 内；其 URL 形如 _c_xxx.jpg（有效图床地址）。
function extractContentBlock(html) {
  const m = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i);
  if (!m) return html; // 兜底用整页
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  const len = html.length;
  while (i < len && depth > 0) {
    if (html.startsWith('<div', i)) {
      depth++;
      i += 4;
    } else if (html.startsWith('</div', i)) {
      depth--;
      i += 5;
    } else {
      i++;
    }
  }
  return html.slice(start, i);
}

function collectImgUrls(block) {
  const urls = new Set();
  const attrRe =
    /(?:src|data-src|data-original|data-lazy-src)="([^"]*oss\.gooood\.cn[^"]*)"/g;
  let m;
  while ((m = attrRe.exec(block))) urls.add(m[1]);
  for (const u of block.match(/oss\.gooood\.cn\/uploads\/[^"'<>\s)]+/g) || [])
    urls.add(u);
  return [...urls];
}

const PROMO = /interview|%E5%89%AF%E6%9C%AC|aha|banner|logo|avatar|icon|wechat|qr|招聘|二维码|微信|小红书|weixin/i;

function filterImages(urls) {
  const SEEN = new Set();
  const out = [];
  for (const raw of urls) {
    let url = raw.startsWith('http') ? raw : 'https://' + raw;
    url = url.split('?')[0];
    if (/%[0-9A-Fa-f]{2}/.test(url)) continue; // 真正坏链
    if (PROMO.test(url)) continue; // 残余推广/二维码
    const original = url.replace(/-\d+x\d+(?=\.[a-zA-Z]+)/, '');
    if (SEEN.has(original)) continue;
    SEEN.add(original);
    out.push(original);
  }
  return out;
}

async function articleImages(articleUrl) {
  const res = await fetch(articleUrl, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error('article HTTP ' + res.status);
  const html = await res.text();
  const block = extractContentBlock(html);
  return filterImages(collectImgUrls(block));
}

// ---------- 主流程 ----------
async function buildMap(limit) {
  const cases = parseCases();
  const map = {};
  const n = Math.min(limit, cases.length);
  for (let i = 0; i < n; i++) {
    const c = cases[i];
    let card = null;
    try {
      card = await searchBestCard(c.name);
    } catch (e) {
      // ignore
    }
    await sleep(250);
    let imgs = [];
    if (card) {
      try {
        imgs = await articleImages(card.href);
      } catch (e) {
        // ignore
      }
      await sleep(250);
    }
    const matched = Boolean(card) && imgs.length > 0;
    map[c.id] = {
      wiki: c.image,
      matched,
      goooodUrl: matched ? imgs[0] : c.image,
      articleUrl: card ? card.href : '',
      articleTitle: card ? card.title : '',
      score: card ? card.score : 0,
      allImgs: imgs,
    };
    const tag = matched
      ? `MATCH(${card.score}) [${card.title}] -> ${imgs[0]}`
      : 'no-match (wiki)';
    console.error(`[${i + 1}/${n}] ${c.id} (${c.name}) -> ${tag}`);
  }
  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
  const hit = Object.values(map).filter((v) => v.matched).length;
  console.error(`\n完成：${hit}/${n} 命中 gooood，映射写入 ${MAP_PATH}`);
  return map;
}

// ---------- 写回 cases.ts ----------
function applyMap() {
  if (!fs.existsSync(MAP_PATH)) {
    console.error('找不到 gooood-map.json，请先跑 --all 生成映射');
    process.exit(1);
  }
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  let text = fs.readFileSync(CASES_PATH, 'utf8');
  let changed = 0;
  for (const [id, info] of Object.entries(map)) {
    const idRe = new RegExp(
      "(\\{[^}]*?id:\\s*'" + id.replace(/[-]/g, '\\-') + "'[^}]*?)image:\\s*'[^']*'(\\s*\\})",
    );
    const lineRe = new RegExp("^(\\s*\\{[^}]*?id:\\s*'" + id + "'[\\s\\S]*?\\},?)$", 'm');
    const lm = text.match(lineRe);
    if (lm && lm[1].includes('imageWiki:')) continue; // 已写过，幂等跳过
    const before = text;
    text = text.replace(idRe, (_m, pre, post) => {
      const gooood = info.matched ? info.goooodUrl : info.wiki;
      const wiki = info.wiki;
      return `${pre}image: '${gooood.replace(/'/g, "\\'")}', imageWiki: '${wiki.replace(/'/g, "\\'")}'${post}`;
    });
    if (text !== before) changed++;
  }
  text = text.replace(
    /(  image: string;\n)/,
    "  image: string;\n  imageWiki?: string;\n",
  );
  fs.writeFileSync(CASES_PATH, text);
  console.error(`写回完成：修改 ${changed} 条案例，CaseRef 接口已补 imageWiki`);
}

const args = process.argv.slice(2);
if (args.includes('--apply')) {
  applyMap();
} else if (args.includes('--all')) {
  await buildMap(1e9);
} else {
  const limArg = args.find((a) => a.startsWith('--limit='));
  const limit = limArg ? parseInt(limArg.split('=')[1], 10) : 3;
  await buildMap(limit);
}
