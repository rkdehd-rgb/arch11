// 审计替换候选条目是否有照片
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [替换目标 key, 候选标题...]
const candidates = [
  ['ch2-melbourne', ['Council_House_2_(Melbourne)', 'CH2_Melbourne', 'Melbourne_City_Council_buildings']],
  ['bosco-verticale', ['Vertical_forest', 'Bosco_Verticale_(Milan)']],
  ['parkroyal-pickering', ['Royal_Park_on_Pickering', 'Parkroyal']],
  ['qunli-wetland', ['Qunli_Wetland', 'Qunli_Park']],
  ['houtan-park', ['Houtan', 'Houtan_Wetland']],
  ['solar-siedlung', ['Solar_ship', 'Solar_Siedlung_Freiburg', 'Heliotrope_(building)']],
  ['japan-pavilion-2000', ['Japan_Pavilion_at_Expo_2000', 'Paper_pavilion']],
  ['unite-habitation', ["Unité_d'Habitation_of_Marseille", 'Housing_Unit,_Marseille']],
  ['koshino-house', ['Koshino_House_(Kyoto)', 'Azuma_House']],
  ['gando-school', ['Gando', 'Opera_Village', 'Lycee_Schorge']],
  ['masdar', ['Masdar', 'Masdar_City_Personal_Rapid_Transit']],
  ['yokohama-terminal', ['Osanbashi_Pier', 'Yokohama_Port']],
  ['brock-commons', ['Brock_Commons', 'Tallwood_House']],
  ['461-dean', ['Dean_Street', 'Pacific_Street_Brooklyn']],
  ['the-stack', ['Stack_apartments', 'Prefabricated_building']],
  ['diagoon', ['Diagoon', 'Herman_Hertzberger']],
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
      await sleep(600);
    }
  }
  throw lastErr;
}

function isGood(u) {
  const x = u.toLowerCase();
  if (!(x.endsWith('.jpg') || x.endsWith('.jpeg') || x.endsWith('.png'))) return false;
  if (x.includes('logo') || x.includes('_map')) return false;
  return true;
}

const out = {};
for (const [key, titles] of candidates) {
  const values = titles.map((t) => `<http://dbpedia.org/resource/${encodeURI(t)}>`).join(' ');
  const query = `SELECT ?s ?final ?img WHERE {
    VALUES ?s { ${values} }
    OPTIONAL { ?s dbo:wikiPageRedirects ?red }
    BIND(COALESCE(?red, ?s) AS ?final)
    OPTIONAL { { ?final dbo:thumbnail ?img } UNION { ?final foaf:depiction ?img } }
  } LIMIT 25`;
  const picks = new Map();
  try {
    const data = await sparql(query);
    for (const b of data.results.bindings) {
      const t = decodeURIComponent((b.final || b.s).value.split('/').pop());
      if (!picks.has(t)) picks.set(t, []);
      if (isGood(b.img.value)) picks.get(t).push(b.img.value.replace('http://', 'https://'));
    }
  } catch (err) {
    console.log(`[err] ${key}: ${err.message}`);
  }
  out[key] = Object.fromEntries([...picks].map(([t, list]) => [t, [...new Set(list)] ]));
  console.log(key, Object.entries(out[key]).map(([t, l]) => `${t}(${l.length})`).join(', ') || '(none)');
  await sleep(250);
}

await writeFile(path.join(here, 'candidate-audit.json'), JSON.stringify(out, null, 2));
