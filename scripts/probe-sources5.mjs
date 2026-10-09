// 第五轮：archdaily.cn 项目页图片直链验证（ArchDaily 中文站为服务端渲染）
import fs from 'fs';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  return { status: r.status, text: await r.text() };
}
async function probe(url, referer) {
  try {
    const h = { 'User-Agent': UA, Range: 'bytes=0-63' };
    if (referer) h.Referer = referer;
    const r = await fetch(url, { headers: h });
    const b = Buffer.from(await r.arrayBuffer());
    const ok =
      (b[0] === 0xff && b[1] === 0xd8) ||
      (b[0] === 0x89 && b[1] === 0x50) ||
      b.slice(0, 4).toString('ascii') === 'RIFF';
    return `${r.status}${ok ? ' image=yes' : ' image=no'}`;
  } catch {
    return 'ERR';
  }
}

const out = {};
const q = '安藤忠雄';
const s = await get('https://www.archdaily.cn/cn/search/projects?q=' + encodeURIComponent(q));
out.searchStatus = s.status;

const links = [...new Set((s.text.match(/href="(\/[a-z]{2}\/\d+\/[^"]+)"/g) || []).map((x) => x.slice(6, -1)))];
out.projectLinks = links.slice(0, 3);

// 也试一个明确的国际项目
const s2 = await get('https://www.archdaily.cn/cn/search/projects?q=' + encodeURIComponent('Heydar Aliyev Center'));
const links2 = [...new Set((s2.text.match(/href="(\/[a-z]{2}\/\d+\/[^"]+)"/g) || []).map((x) => x.slice(6, -1)))];
out.projectLinksIntl = links2.slice(0, 3);

const target = links[0] || links2[0];
if (target) {
  const p = await get('https://www.archdaily.cn' + target);
  out.articleStatus = p.status;
  const imgs = [
    ...new Set(
      (p.text.match(/https:\/\/images\.adsttc\.com\/[^"'\s\\)]+\.(?:jpg|jpeg|png|webp)/gi) || []).map((u) =>
        u.split('?')[0],
      ),
    ),
  ];
  out.imgCount = imgs.length;
  out.imgSample = imgs[0] || '';
  if (imgs[0]) {
    out.verify_noRef = await probe(imgs[0]);
    out.verify_withRef = await probe(imgs[0], 'https://www.archdaily.cn/');
  }
  const og = (p.text.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || '';
  out.ogImage = og;
  if (og) out.ogVerify = await probe(og, 'https://www.archdaily.cn/');
}

fs.writeFileSync('/tmp/probe5.json', JSON.stringify(out, null, 2), 'utf8');
console.log('written');
