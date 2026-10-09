// 第三轮：有方图片直链校验 / dezeen 主结果区定位 / 建筑学院选择器试探
// 结果写 /tmp/probe3.json
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
  } catch (e) {
    return 'ERR';
  }
}
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  return { status: r.status, text: await r.text() };
}

const out = {};

// 1) 有方图片直链（去 resize 参数取原图）
{
  const u1 = 'https://image.archiposition.com/2025/10/20251027104404youfang26.jpg';
  const u2 = u1 + '?x-oss-process=image/resize,m_fill,w_250,h_166';
  out.archiposition_img = {
    original: await imgOk(u1, 'https://www.archiposition.com/'),
    withParam: await imgOk(u2, 'https://www.archiposition.com/'),
    noReferer: await imgOk(u1),
  };
}

// 2) dezeen：定位主结果区
{
  const r = await get('https://www.dezeen.com/?s=' + encodeURIComponent('Heydar Aliyev Center'));
  const t = r.text;
  const searchCls = [...new Set((t.match(/class="([^"]*search[^"]*)"/gi) || []).map((s) => s.slice(0, 90)))].slice(0, 12);
  // 找出主内容区里的文章链接（h2/h3 内的 a）
  const headings = [];
  const re = /<h[23][^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]{4,140})<\/a>/g;
  let m;
  while ((m = re.exec(t)) && headings.length < 12) headings.push({ href: m[1], title: m[2] });
  out.dezeen = { status: r.status, searchCls, headings, len: t.length };
}

// 3) 建筑学院：换选择器
{
  const r = await get('https://www.archcollege.com/?s=' + encodeURIComponent('安藤忠雄'));
  const t = r.text;
  const clsCount = {};
  for (const c of t.match(/class="([^"]{0,60})"/g) || []) {
    const k = c.slice(7, -1);
    for (const part of k.split(/\s+/)) if (part) clsCount[part] = (clsCount[part] || 0) + 1;
  }
  const top = Object.entries(clsCount).sort((a, b) => b[1] - a[1]).slice(0, 25);
  const headings = [];
  const re = /<h[0-9][^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]{4,140})<\/a>/g;
  let m;
  while ((m = re.exec(t)) && headings.length < 6) headings.push({ href: m[1], title: m[2] });
  out.archcollege = { status: r.status, topClasses: top, headings, len: t.length };
}

// 4) divisare 搜索页结构 + 图直链
{
  const r = await get('https://divisare.com/search?q=' + encodeURIComponent('Ando'));
  const t = r.text;
  const firstImg = (t.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)[^"'\s]*/i) || [])[0] || '';
  out.divisare = {
    status: r.status,
    len: t.length,
    firstImg,
    verify: firstImg ? await imgOk(firstImg, 'https://divisare.com/') : '-',
  };
}

fs.writeFileSync('/tmp/probe3.json', JSON.stringify(out, null, 2), 'utf8');
console.log('written');
