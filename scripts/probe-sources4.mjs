// 第四轮：建筑学院图片直链 / world-architects / archdaily.cn / 搜建筑
import fs from 'fs';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MAGIC = [
  [0xff, 0xd8, 0xff],
  [0x89, 0x50, 0x4e, 0x47],
  [0x47, 0x49, 0x46, 0x38],
];
function isImage(b) {
  if (!b || b.length < 12) return false;
  for (const s of MAGIC) if (s.every((x, i) => b[i] === x)) return true;
  return b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP';
}
async function imgOk(url, referer) {
  try {
    const h = { 'User-Agent': UA, Range: 'bytes=0-63' };
    if (referer) h.Referer = referer;
    const r = await fetch(url, { headers: h });
    if (!(r.ok || r.status === 206)) return 'HTTP ' + r.status;
    return isImage(Buffer.from(await r.arrayBuffer())) ? 'OK-image' : 'not-image';
  } catch {
    return 'ERR';
  }
}
async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 'ERR', text: '' };
  }
}

const out = {};

// A) 建筑学院：取搜索结果的懒加载图并验直链
{
  const r = await get('https://www.archcollege.com/?s=' + encodeURIComponent('安藤忠雄'));
  const urls = new Set();
  for (const m of r.text.matchAll(/(?:data-src|data-original|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi))
    urls.add(m[1]);
  const list = [...urls].filter((u) => !/logo|avatar|icon/i.test(u)).slice(0, 3);
  out.archcollege = {
    status: r.status,
    found: urls.size,
    samples: list,
    verify: list[0] ? await imgOk(list[0], 'https://www.archcollege.com/') : '-',
    verifyNoRef: list[0] ? await imgOk(list[0]) : '-',
  };
}

// B) world-architects 搜索
{
  const r = await get('https://www.world-architects.com/en/search?q=' + encodeURIComponent('Ando'));
  out.worldarchitects = { status: r.status, len: r.text.length, head: r.text.slice(0, 200) };
}

// C) archdaily.cn
{
  const r = await get('https://www.archdaily.cn/cn/search/projects?q=' + encodeURIComponent('安藤忠雄'));
  const links = [...new Set((r.text.match(/href="(\/[^"]*\/\d{4,}[^"]*)"/g) || []))].slice(0, 5);
  out.archdailycn = { status: r.status, len: r.text.length, links };
}

// D) 搜建筑 sojianzhu
{
  const r = await get('https://www.sojianzhu.com/?s=' + encodeURIComponent('安藤忠雄'));
  const urls = new Set();
  for (const m of r.text.matchAll(/(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png)[^"]*)"/gi)) urls.add(m[1]);
  const list = [...urls].filter((u) => !/logo|avatar|icon/i.test(u)).slice(0, 2);
  out.sojianzhu = {
    status: r.status,
    len: r.text.length,
    found: urls.size,
    verify: list[0] ? await imgOk(list[0], 'https://www.sojianzhu.com/') : '-',
  };
}

fs.writeFileSync('/tmp/probe4.json', JSON.stringify(out, null, 2), 'utf8');
console.log('written');
