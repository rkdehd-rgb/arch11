// 针对缺图 key 的定向探测：bif 检索候选资源 -> 检查 thumbnail
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jobs = [
  ['ch2-melbourne', 'Council'],
  ['bosco-verticale', 'Bosco'],
  ['parkroyal-pickering', 'PARKROYAL'],
  ['qunli-wetland', 'Qunli'],
  ['houtan-park', 'Houtan'],
  ['solar-siedlung', 'Sonnenschiff'],
  ['japan-pavilion-2000', 'pavilion AND paper'],
  ['unite-habitation', 'Unite AND habitation'],
  ['koshino-house', 'Koshino'],
  ['gando-school', 'Gando'],
  ['masdar', 'Masdar'],
  ['yokohama-terminal', 'Osanbashi'],
  ['brock-commons', 'Brock'],
  ['461-dean', 'Dean AND modular'],
  ['the-stack', 'stack AND prefab'],
  ['diagoon', 'Diagoon'],
];

async function sparql(query) {
  const res = await fetch(`https://dbpedia.org/sparql?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isJpg(u) {
  const x = u.toLowerCase();
  return (x.endsWith('.jpg') || x.endsWith('.jpeg')) && !x.includes('logo') && !x.includes('_map');
}

const result = {};
for (const [key, term] of jobs) {
  const q1 = `SELECT DISTINCT ?s WHERE {
    ?s rdfs:label ?l . FILTER(LANG(?l)='en') .
    ?l bif:contains '${term}' .
  } LIMIT 8`;
  let uris = [];
  try {
    const d1 = await sparql(q1);
    uris = d1.results.bindings.map((b) => b.s.value);
  } catch (err) {
    console.log(`[e1] ${key}: ${err.message}`);
  }
  const found = [];
  for (const uri of uris.slice(0, 6)) {
    const name = uri.split('/').pop();
    const q2 = `SELECT ?img WHERE {
      OPTIONAL { <${uri}> dbo:wikiPageRedirects ?red }
      BIND(COALESCE(?red, <${uri}>) AS ?f)
      OPTIONAL { ?f dbo:thumbnail ?img }
    }`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const d2 = await sparql(q2);
      for (const b of d2.results.bindings) {
        if (b.img && isJpg(b.img.value)) {
          found.push({ title: name, image: b.img.value.replace('http://', 'https://').replace(/width=\d+/, 'width=1200') });
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(80);
  }
  const uniq = [...new Map(found.map((f) => [f.title, f])).values()];
  result[key] = uniq;
  console.log(key, uniq.map((f) => f.title).join(', ') || '-');
  await sleep(150);
}

await writeFile(path.join(here, 'manual-search.json'), JSON.stringify(result, null, 2));
