// 探测建筑类站点是否可作案例图源：
//   1) 站内搜索页是否服务端渲染（能直接解析出项目链接与图片）
//   2) 页面中的图片 URL 是否可直链下载（HTTP 2xx + 文件头魔数）
// 用法：node scripts/probe-sources.mjs
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const QUERY = process.argv[2] || 'Heydar Aliyev Center';

const SITES = [
  { name: 'gooood', url: (q) => `https://www.gooood.cn/search?q=${encodeURIComponent(q)}` },
  { name: 'archdaily', url: (q) => `https://www.archdaily.com/search/projects?q=${encodeURIComponent(q)}` },
  { name: 'archdaily-cn', url: (q) => `https://www.archdaily.cn/cn/search/projects?q=${encodeURIComponent(q)}` },
  { name: 'architizer', url: (q) => `https://architizer.com/search/?q=${encodeURIComponent(q)}` },
  { name: 'dezeen', url: (q) => `https://www.dezeen.com/?s=${encodeURIComponent(q)}` },
  { name: 'designboom', url: (q) => `https://www.designboom.com/?s=${encodeURIComponent(q)}` },
  { name: 'archello', url: (q) => `https://archello.com/search?query=${encodeURIComponent(q)}` },
  { name: 'divisare', url: (q) => `https://divisare.com/search?q=${encodeURIComponent(q)}` },
  { name: 'archilovers', url: (q) => `https://www.archilovers.com/search?q=${encodeURIComponent(q)}` },
  { name: 'archiposition', url: (q) => `https://www.archiposition.com/search?q=${encodeURIComponent(q)}` },
  { name: 'archiposition2', url: (q) => `https://www.archiposition.com/?s=${encodeURIComponent(q)}` },
  { name: 'archcollege', url: (q) => `https://www.archcollege.com/search?q=${encodeURIComponent(q)}` },
  { name: 'archcollege2', url: (q) => `https://www.archcollege.com/?s=${encodeURIComponent(q)}` },
  { name: 'wallpaper', url: (q) => `https://www.wallpaper.com/search?q=${encodeURIComponent(q)}` },
];

const IMG_RE = /https?:\/\/[^"'\s\\)]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s\\)]*)?/gi;
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

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  return { status: r.status, text: await r.text() };
}

async function headImage(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-63' } });
    if (!(r.ok || r.status === 206)) return `HTTP ${r.status}`;
    return isImage(Buffer.from(await r.arrayBuffer())) ? 'OK-image' : 'not-image';
  } catch (e) {
    return 'ERR';
  }
}

const rows = [];
for (const s of SITES) {
  const url = s.url(QUERY);
  let status = 0;
  let text = '';
  try {
    const r = await get(url);
    status = r.status;
    text = r.text;
  } catch {
    rows.push([s.name, 'ERR', '-', '-', '-', '-']);
    continue;
  }
  const hit = (text.match(new RegExp(QUERY.split(' ')[0], 'gi')) || []).length;
  const imgs = [...new Set(text.match(IMG_RE) || [])];
  // 过滤掉明显是 logo/icon/favicon 的
  const realImgs = imgs.filter((u) => !/logo|icon|favicon|avatar|sprite|placeholder/i.test(u));
  let verify = '-';
  if (realImgs.length) verify = await headImage(realImgs[0]);
  rows.push([
    s.name,
    String(status),
    `${(text.length / 1024).toFixed(0)}KB`,
    String(hit),
    `${realImgs.length}/${imgs.length}`,
    verify,
  ]);
  await new Promise((r) => setTimeout(r, 300));
}

console.log('站点'.padEnd(16), 'HTTP'.padEnd(6), '页面'.padEnd(8), '命中'.padEnd(6), '候选图'.padEnd(10), '首图校验');
console.log('-'.repeat(78));
for (const r of rows) {
  console.log(
    String(r[0]).padEnd(16),
    String(r[1]).padEnd(6),
    String(r[2]).padEnd(8),
    String(r[3]).padEnd(6),
    String(r[4]).padEnd(10),
    String(r[5]),
  );
}
