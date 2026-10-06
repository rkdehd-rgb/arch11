// bif:contains 全文检索 + 图片校验，定位每个缺图 key 的可替换资源
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [key, 检索词（bif 语法）]
const searches = [
  ['ch2-melbourne', 'Melbourne AND green AND building'],
  ['bosco-verticale', 'vertical AND forest'],
  ['parkroyal-pickering', 'Pickering'],
  ['qunli-wetland', 'stormwater'],
  ['houtan-park', 'wetland AND park AND Shanghai'],
  ['solar-siedlung', 'Heliotrope'],
  ['japan-pavilion-2000', 'paper AND tube AND pavilion'],
  ['unite-habitation', 'radiant'],
  ['koshino-house', 'Row AND House'],
  ['gando-school', 'Kere AND school'],
  ['masdar', 'eco AND city'],
  ['yokohama-terminal', 'Osanbashi'],
  ['brock-commons', 'timber AND tower'],
  ['461-dean', 'modular AND residential'],
  ['the-stack', 'prefabricated AND apartment'],
  ['diagoon', 'Hertzberger'],
];

async function sparql(query) {
  let lastErr;
  for (let a = 0; a < 3; a += 1) {
    try {
      const res = await fetch(`https://dbpedia.org/sparql?query=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/sparql-results+json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(500);
    }
  }
  throw lastErr;
}

function good(u) {
  const x = u.toLowerCase();
  return (x.endsWith('.jpg') || x.endsWith('.jpeg')) && !x.includes('logo') && !x.includes('_map');
}

const out = {};
for (const [key, term] of searches) {
  const query = `SELECT DISTINCT ?s ?l WHERE {
    ?s rdfs:label ?l ; a dbo:Building .
    FILTER(LANG(?l)='en') .
    ?l bif:contains '${term}' .
  } LIMIT 10`;
  let list = [];
  try {
    const data = await sparql(query);
    list = data.results.bindings.map((b) => ({
      uri: b.s.value.split('/').pop(),
      label: b.l.value,
    }));
  } catch (err) {
    console.log(`[err] ${key}: ${err.message}`);
  }
  // 对前 4 个候选校验照片
  const withImg = [];
  for (const cand of list.slice(0, 5)) {
    const q2 = `SELECT ?img WHERE {
      OPTIONAL { <http://dbpedia.org/resource/${cand.uri}> dbo:thumbnail ?img }
    }`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const d2 = await sparql(q2);
      const img = d2.results.bindings[0] && d2.results.bindings[0].img.value.replace('http://', 'https://');
      if (img && good(img)) withImg.push({ ...cand, image: img.replace(/width=\d+/, 'width=1200') });
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  out[key] = withImg;
  console.log(key, withImg.map((x) => `${x.uri}`).join(', ') || '(no photo candidates)');
  await sleep(200);
}

await writeFile(path.join(here, 'bif-results.json'), JSON.stringify(out, null, 2));
