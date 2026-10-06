// 对 14 个剩余条目做 bif 全文检索 + 候选照片解析
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  const res = await fetch(`https://dbpedia.org/sparql?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function withRetry(query, attempts = 4) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await sparql(query);
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

function isGood(u) {
  const x = u.toLowerCase();
  if (!(x.endsWith('.jpg') || x.endsWith('.jpeg') || x.endsWith('.png'))) return false;
  if (x.includes('logo') || x.includes('_map')) return false;
  return true;
}

const targets = [
  { key: 'parkroyal-pickering', term: 'Pickering' },
  { key: 'qunli-wetland', term: 'Qunli' },
  { key: 'houtan-park', term: 'Houtan' },
  { key: 'solar-siedlung', term: 'Solarsiedlung' },
  { key: 'japan-pavilion-2000', term: 'Paper AND Hall' },
  { key: 'unite-habitation', term: 'Radieuse' },
  { key: 'koshino-house', term: 'Koshino' },
  { key: 'gando-school', term: 'Gando' },
  { key: 'masdar', term: 'Masdar' },
  { key: 'yokohama-terminal', term: 'Osanbashi' },
  { key: 'brock-commons', term: 'Tallwood' },
  { key: '461-dean', term: 'Dean' },
  { key: 'the-stack', term: 'Stack' },
  { key: 'diagoon', term: 'Diagoon' },
];

const out = {};
for (const t of targets) {
  const search = `SELECT DISTINCT ?s ?l WHERE {
    ?s rdfs:label ?l .
    FILTER(LANG(?l) = 'en')
    ?l bif:contains '${t.term}'
  } LIMIT 12`;
  const data = await withRetry(search);
  const cands = [];
  if (data) {
    for (const b of data.results.bindings) {
      const title = decodeURIComponent(b.s.value.split('/').pop());
      if (/^(File|Category):/.test(title)) continue;
      cands.push({ title, label: b.l.value });
    }
  }
  const candPhotos = [];
  if (cands.length) {
    const values = cands.map((c) => `<http://dbpedia.org/resource/${encodeURI(c.title)}>`).join(' ');
    const q2 = `SELECT ?s ?img WHERE { VALUES ?s { ${values} } { ?s dbo:thumbnail ?img } UNION { ?s foaf:depiction ?img } } LIMIT 40`;
    const data2 = await withRetry(q2);
    if (data2) {
      for (const b of data2.results.bindings) {
        const title = decodeURIComponent(b.s.value.split('/').pop());
        if (b.img && isGood(b.img.value)) {
          candPhotos.push({ title, img: b.img.value.replace('http://', 'https://') });
        }
      }
    }
  }
  out[t.key] = { candidates: cands, photos: candPhotos };
  console.log(`[${t.key}] candidates=${cands.length} photos=${candPhotos.length}`);
  for (const c of candPhotos.slice(0, 4)) console.log(`   ${c.title} -> ${decodeURIComponent(c.img.split('/').pop()).slice(0, 60)}`);
  await sleep(1100);
}

await writeFile(path.join(here, 'bif-final.json'), JSON.stringify(out, null, 2));
console.log('\nsaved bif-final.json');
