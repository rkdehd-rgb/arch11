// 通过 SPARQL 直接查询指定资源的图片（全角 URI 处理）
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probes = [
  ['ch2-melbourne', ['Council_House_2', 'Council_House_2,_Melbourne', 'CH2_(building)']],
  ['bedzed', ['Beddington_Zero_Energy_Development', 'BedZED']],
  ['bosco-verticale', ['Bosco_Verticale']],
  ['parkroyal-pickering', ['PARKROYAL_on_Pickering', 'PARKROYAL_on_Pickering,_Singapore']],
  ['qunli-wetland', ['Qunli_National_Urban_Wetland', 'Qunli_Stormwater_Park']],
  ['houtan-park', ['Houtan_Park']],
  ['japan-pavilion-2000', ['Japan_Pavilion_(Expo_2000)', 'Japanese_Pavilion_(Expo_2000)']],
  ['unite-habitation', ["Unité_d'Habitation", 'Cité_radieuse']],
  ['koshino-house', ['Koshino_House', 'Koshino_House_(Azumi)']],
  ['ford-foundation', ['Ford_Foundation_Building']],
  ['new-gourna', ['New_Gourna']],
  ['gando-school', ['Gando_Primary_School', 'Primary_School,_Gando']],
  ['yokohama-terminal', ['Yokohama_International_Port_Terminal']],
  ['brock-commons', ['Brock_Commons_Tallwood_House']],
  ['hearst-tower', ['Hearst_Tower', 'Hearst_Tower_(New_York_City)']],
  ['461-dean', ['461_Dean']],
  ['the-stack', ['The_Stack_(Manhattan)']],
  ['diagoon', ['Diagoon_Delft', 'Diagoonwoningen']],
  ['va-dundee', ['V&A_Dundee']],
];

async function sparql(query) {
  const res = await fetch(`https://dbpedia.org/sparql?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function score(f) {
  const x = f.toLowerCase();
  let s = 0;
  if (x.endsWith('.jpg') || x.endsWith('.jpeg')) s += 10;
  if (x.endsWith('.png')) s += 3;
  if (x.includes('logo')) s -= 40;
  if (x.includes('map')) s -= 20;
  if (x.includes('diagram')) s -= 8;
  return s;
}

const out = {};
for (const [key, uris] of probes) {
  const values = uris.map((u) => `<http://dbpedia.org/resource/${encodeURI(u)}>`).join(' ');
  const query = `SELECT ?s ?img WHERE {
    VALUES ?s { ${values} }
    { ?s dbo:thumbnail ?img } UNION { ?s foaf:depiction ?img }
  } LIMIT 30`;
  let images = [];
  try {
    const data = await sparql(query);
    images = data.results.bindings.map((b) => ({
      uri: decodeURIComponent(b.s.value.split('/').pop()),
      img: b.img.value.replace('http://', 'https://'),
    }));
  } catch (err) {
    console.log(`[err] ${key}: ${err.message}`);
  }
  const byUri = new Map();
  for (const im of images) {
    if (!byUri.has(im.uri)) byUri.set(im.uri, []);
    byUri.get(im.uri).push(im.img);
  }
  const picks = {};
  for (const [u, list] of byUri) {
    let best = '';
    let bs = -99;
    for (const f of list) {
      const s = score(f);
      if (s > bs) { bs = s; best = f; }
    }
    if (bs >= 5) picks[u] = best.replace(/width=\d+/, 'width=1200');
  }
  out[key] = picks;
  console.log(key, Object.keys(picks).length ? JSON.stringify(picks) : '(empty)');
  await sleep(300);
}

await writeFile(path.join(here, 'probe-direct.json'), JSON.stringify(out, null, 2));
