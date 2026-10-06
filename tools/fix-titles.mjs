// 低并发：用 bif:contains 全文索引修正条目标题
// 用法: node tools/fix-titles.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const searches = [
  ['bedzed', 'BedZED'],
  ['parkroyal-pickering', 'Pickering'],
  ['qunli-wetland', 'Qunli'],
  ['houtan-park', 'Houtan'],
  ['solar-siedlung', 'Sonnenschiff'],
  ['japan-pavilion-2000', 'Expo AND 2000 AND Japan AND Pavilion'],
  ['unite-habitation', 'Unité'],
  ['koshino-house', 'Koshino'],
  ['ford-foundation', 'Ford AND Foundation'],
  ['new-gourna', 'Gourna'],
  ['gando-school', 'Gando'],
  ['masdar', 'Masdar'],
  ['yokohama-terminal', 'Ōsanbashi'],
  ['brock-commons', 'Brock AND Commons'],
  ['hsbc-hk', 'HSBC AND Hong AND Kong'],
  ['hearst-tower', 'Hearst'],
  ['461-dean', '461 AND Dean'],
  ['the-stack', 'Stack AND Manhattan'],
  ['diagoon', 'Diagoon'],
  ['va-dundee', 'Dundee'],
];

async function sparql(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    let res = await fetch(`https://dbpedia.org/sparql?query=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/sparql-results+json' },
      signal: ctrl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const fixed = {};
for (const [key, term] of searches) {
  const query = `SELECT DISTINCT ?s WHERE {
    ?s rdfs:label ?l . FILTER (LANG(?l)='en') .
    ?l bif:contains '${term}' .
  } LIMIT 8`;
  let uris = [];
  try {
    const data = await sparql(query);
    uris = data.results.bindings.map((b) => b.s.value.replace('http://dbpedia.org/resource/', ''));
  } catch (err) {
    console.log(`[err] ${key}: ${err.message}`);
  }
  fixed[key] = uris;
  console.log(`${key}: ${uris.join(' | ') || '(none)'}`);
  await sleep(250);
}

await writeFile(path.join(here, 'title-candidates.json'), JSON.stringify(fixed, null, 2));
