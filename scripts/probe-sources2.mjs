// 第二轮探测：有方 / 建筑学院 / dezeen 主结果区 / Openverse(CC 授权聚合)
// 结果写入 /tmp/probe2.json，避免终端中文编码问题
import fs from 'fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function get(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*', ...headers } });
  return { status: r.status, text: await r.text() };
}

const out = {};

// 1) Openverse —— CC 授权图片聚合 API（合规兜底候选）
try {
  const r = await get('https://api.openverse.org/v1/images/?q=Heydar%20Aliyev%20Center&page_size=3');
  out.openverse = { status: r.status, sample: r.text.slice(0, 1200) };
} catch (e) {
  out.openverse = { error: String(e) };
}

// 2) 有方 archiposition 搜索页结构
try {
  const r = await get('https://www.archiposition.com/?s=' + encodeURIComponent('安藤忠雄'));
  const items = [];
  const re = /<article[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(r.text)) && items.length < 4) {
    const a = m[0];
    items.push({
      cls: (a.match(/class="([^"]{0,80})"/) || [])[1] || '',
      href: (a.match(/href="([^"]+)"/) || [])[1] || '',
      img: (a.match(/(?:data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/) || [])[1] || '',
      title: (a.match(/<h[23][^>]*>\s*(?:<a[^>]*>)?([^<]{4,120})/) || [])[1] || '',
    });
  }
  out.archiposition = { status: r.status, articleCount: (r.text.match(/<article/g) || []).length, items };
} catch (e) {
  out.archiposition = { error: String(e) };
}

// 3) 建筑学院 archcollege 搜索页结构
try {
  const r = await get('https://www.archcollege.com/?s=' + encodeURIComponent('安藤忠雄'));
  const items = [];
  const re = /<article[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(r.text)) && items.length < 4) {
    const a = m[0];
    items.push({
      cls: (a.match(/class="([^"]{0,80})"/) || [])[1] || '',
      href: (a.match(/href="([^"]+)"/) || [])[1] || '',
      img: (a.match(/(?:data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/) || [])[1] || '',
      title: (a.match(/<h[0-9][^>]*>\s*(?:<a[^>]*>)?([^<]{4,120})/) || [])[1] || '',
    });
  }
  out.archcollege = { status: r.status, articleCount: (r.text.match(/<article/g) || []).length, items };
} catch (e) {
  out.archcollege = { error: String(e) };
}

// 4) dezeen：列出所有 article 的 class，判断哪个是主结果区
try {
  const r = await get('https://www.dezeen.com/?s=' + encodeURIComponent('Heydar Aliyev Center'));
  const classes = (r.text.match(/<article[^>]*class="([^"]*)"/g) || []).map(
    (s) => (s.match(/class="([^"]*)"/) || [])[1],
  );
  const main = [];
  const re = /<article[^>]*class="([^"]*)"[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(r.text)) && main.length < 6) {
    const a = m[0];
    main.push({
      cls: m[1].slice(0, 70),
      href: (a.match(/href="([^"]+)"/) || [])[1] || '',
      img: (a.match(/(?:data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/) || [])[1] || '',
      title: (a.match(/<h[23][^>]*>([^<]{4,140})/) || [])[1] || '',
    });
  }
  out.dezeen = { status: r.status, classes, main };
} catch (e) {
  out.dezeen = { error: String(e) };
}

fs.writeFileSync('/tmp/probe2.json', JSON.stringify(out, null, 2), 'utf8');
console.log('written');
