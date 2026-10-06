// 使用 DBpedia SPARQL 搜索候选建筑条目并选取最佳照片（并发版）
// 用法: node tools/find-cases-sparql.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, 'cases-manifest.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 模糊匹配的英文关键词（精确标题查不到时使用）
const fuzzy = {
  bedzed: 'Beddington Zero Energy',
  'parkroyal-pickering': 'PARKROYAL Pickering',
  'qunli-wetland': 'Qunli Stormwater',
  'houtan-park': 'Houtan Park',
  'solar-siedlung': 'Solar Settlement Freiburg',
  'japan-pavilion-2000': 'Japan Pavilion Expo 2000',
  'unite-habitation': 'Unite d Habitation',
  'koshino-house': 'Koshino House',
  'ford-foundation': 'Ford Foundation Building',
  'new-gourna': 'New Gourna',
  'gando-school': 'Gando Primary School',
  masdar: 'Masdar City',
  'yokohama-terminal': 'Yokohama International Port Terminal',
  'brock-commons': 'Brock Commons',
  'hsbc-hk': 'HSBC Main Building',
  'hearst-tower': 'Hearst Tower',
  '461-dean': '461 Dean',
  'the-stack': 'Stack Manhattan',
  diagoon: 'Diagoon Delft',
  'va-dundee': 'V and A Dundee',
};

async function sparql(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`https://dbpedia.org/sparql?query=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/sparql-results+json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function scoreFile(fileUrl, name) {
  const f = fileUrl.toLowerCase();
  let score = 0;
  if (f.endsWith('.jpg') || f.endsWith('.jpeg')) score += 10;
  if (f.endsWith('.png')) score += 4;
  if (f.includes('logo')) score -= 30;
  if (f.includes('_map')) score -= 20;
  if (f.includes('diagram')) score -= 6;
  if (name && f.includes(name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 10))) score += 3;
  return score;
}

// 单条查询：直接条目及其 depiction，一次拿全
async function resolveItem(item) {
  const kw = fuzzy[item.key];
  const kwFilter = kw
    ? `OPTIONAL { ?alt rdfs:label ?al . FILTER (LANG(?al)='en' && CONTAINS(LCASE(STR(?al)), "${kw.toLowerCase()}")) }`
    : '';
  const query = `SELECT DISTINCT ?s ?img WHERE {
    {
      { BIND(dbr:${item.title} AS ?s) }
      UNION { ?alt a dbo:Building ; rdfs:label ?x . FILTER (LANG(?x)='en' && CONTAINS(LCASE(STR(?x)), "${(kw || '').toLowerCase()}")) BIND(?alt AS ?s) }
    }
    ${kwFilter}
    { ?s dbo:thumbnail ?img } UNION { ?s foaf:depiction ?img }
  } LIMIT 40`;
  let data;
  try {
    data = await sparql(query);
  } catch {
    return { key: item.key, strategyId: item.strategyId, title: item.title, image: '' };
  }
  const byTitle = new Map();
  for (const b of data.results.bindings) {
    const s = b.s.value;
    const img = b.img.value;
    if (!byTitle.has(s)) byTitle.set(s, []);
    byTitle.get(s).push(img);
  }
  // 优先精确条目
  const exactUri = `http://dbpedia.org/resource/${item.title}`;
  const ordered = [exactUri, ...[...byTitle.keys()].filter((u) => u !== exactUri)];
  for (const uri of ordered.slice(0, 4)) {
    const imgs = byTitle.get(uri);
    if (!imgs) continue;
    const name = uri.split('/').pop();
    let best = '';
    let bestScore = -999;
    for (const im of imgs) {
      const s = scoreFile(im, name);
      if (s > bestScore) {
        bestScore = s;
        best = im;
      }
    }
    if (best && bestScore >= 5) {
      return {
        key: item.key,
        strategyId: item.strategyId,
        title: name,
        image: best.replace('http://', 'https://').replace(/width=\d+/, 'width=1200'),
      };
    }
  }
  return { key: item.key, strategyId: item.strategyId, title: item.title, image: '' };
}

// 并发 6
const results = [];
const queue = [...manifest];
async function worker() {
  while (queue.length) {
    const item = queue.shift();
    const r = await resolveItem(item);
    results.push(r);
    console.log(`${r.image ? '[ok]  ' : '[miss]'} ${item.key} <- ${r.image || r.title}`);
    await sleep(80);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

results.sort((a, b) => a.key.localeCompare(b.key));
await writeFile(path.join(here, 'case-images.json'), JSON.stringify(results, null, 2));
const resolved = results.filter((r) => r.image).length;
console.log(`\nDone: ${resolved}/${results.length} resolved`);
