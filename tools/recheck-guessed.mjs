// 对未确认的 key 逐一慢速重审（4 次重试，请求间隔 1s）
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, 'cases-manifest.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const guessed = [
  'ch2-melbourne', 'bedzed', 'bosco-verticale', 'parkroyal-pickering', 'qunli-wetland',
  'houtan-park', 'solar-siedlung', 'japan-pavilion-2000', 'cardboard-cathedral', 'mia-doha',
  'unite-habitation', 'koshino-house', 'gando-school', 'zeitz-mocaa', 'masdar',
  'the-shard', 'yokohama-terminal', 'nakagin', 'brock-commons', 'hsbc-hk',
  'hearst-tower', '461-dean', 'the-stack', 'diagoon', 'millennium-park',
  'seoullo-7017', 'national-mall',
];

async function sparql(query) {
  const res = await fetch(`https://dbpedia.org/sparql?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isGood(u) {
  const x = u.toLowerCase();
  if (!(x.endsWith('.jpg') || x.endsWith('.jpeg') || x.endsWith('.png'))) return false;
  if (x.includes('logo') || x.includes('_map')) return false;
  return true;
}

const out = {};
for (const key of guessed) {
  const item = manifest.find((m) => m.key === key);
  const s = `<http://dbpedia.org/resource/${encodeURI(item.title)}>`;
  const query = `SELECT ?final ?img WHERE {
    BIND(${s} AS ?x)
    OPTIONAL { ?x dbo:wikiPageRedirects ?red }
    BIND(COALESCE(?red, ?x) AS ?final)
    OPTIONAL { { ?final dbo:thumbnail ?img } UNION { ?final foaf:depiction ?img } }
  } LIMIT 25`;
  let photos = [];
  let finalTitle = item.title;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const data = await sparql(query);
      for (const b of data.results.bindings) {
        if (b.final) finalTitle = decodeURIComponent(b.final.value.split('/').pop());
        if (b.img && isGood(b.img.value)) photos.push(b.img.value.replace('http://', 'https://'));
      }
      break;
    } catch (err) {
      await sleep(1000);
      if (attempt === 3) console.log(`[err] ${key}: ${err.message}`);
    }
  }
  photos = [...new Set(photos)];
  out[key] = { title: item.title, final: finalTitle, photos };
  console.log(`${photos.length ? `[P${photos.length}]` : '[ ]'} ${key}${finalTitle !== item.title ? ` -> ${finalTitle}` : ''}`);
  await sleep(900);
}

await writeFile(path.join(here, 'recheck.json'), JSON.stringify(out, null, 2));
const total = Object.values(out).filter((v) => v.photos.length).length;
console.log(`\n${total}/${guessed.length} resolved`);
