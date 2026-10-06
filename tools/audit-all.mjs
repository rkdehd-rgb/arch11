// 审计 64 个目标条目：跟随重定向，检查最终页面是否有照片
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, 'cases-manifest.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`https://dbpedia.org/sparql?query=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/sparql-results+json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(700);
    }
  }
  throw lastErr;
}

function isGoodPhoto(u) {
  const x = u.toLowerCase();
  if (!(x.endsWith('.jpg') || x.endsWith('.jpeg') || x.endsWith('.png'))) return false;
  if (x.includes('logo')) return false;
  if (x.includes('_map') || x.includes('location_map') || x.includes('commons-logo')) return false;
  return true;
}

// 每批 8 个资源（避免 URL 过长）
const audit = [];
for (let i = 0; i < manifest.length; i += 3) {
  const batch = manifest.slice(i, i + 3);
  const values = batch.map((m) => `<http://dbpedia.org/resource/${encodeURI(m.title)}>`).join(' ');
  const query = `SELECT ?s ?final ?img WHERE {
    VALUES ?s { ${values} }
    OPTIONAL { ?s dbo:wikiPageRedirects ?red }
    BIND(COALESCE(?red, ?s) AS ?final)
    OPTIONAL { { ?final dbo:thumbnail ?img } UNION { ?final foaf:depiction ?img } }
  }`;
  let rows = [];
  try {
    const data = await sparql(query);
    rows = data.results.bindings;
  } catch (err) {
    console.log(`[batch err] ${i}: ${err.message}`);
  }
  const map = new Map();
  for (const b of rows) {
    const s = decodeURIComponent(b.s.value.split('/').pop());
    if (!map.has(s)) map.set(s, { final: '', photos: [] });
    const rec = map.get(s);
    if (b.final) rec.final = decodeURIComponent(b.final.value.split('/').pop());
    if (b.img && isGoodPhoto(b.img.value)) rec.photos.push(b.img.value.replace('http://', 'https://'));
  }
  for (const m of batch) {
    const rec = map.get(m.title) || { final: '', photos: [] };
    audit.push({ key: m.key, strategyId: m.strategyId, title: m.title, final: rec.final, photos: [...new Set(rec.photos)] });
    console.log(`${rec.photos.length ? '[P]' : '[ ]'} ${m.key} ${rec.final && rec.final !== m.title ? `(${rec.final})` : ''} n=${rec.photos.length}`);
  }
  await sleep(300);
}

await writeFile(path.join(here, 'audit.json'), JSON.stringify(audit, null, 2));
const withP = audit.filter((a) => a.photos.length).length;
console.log(`\n${withP}/${audit.length} entries have photos`);
