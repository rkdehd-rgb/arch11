// 最终案例图片解析：顺序请求 DBpedia JSON，候选标题依次尝试，评分选最佳照片
// 用法: node tools/resolve-all.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, 'cases-manifest.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 精确标题查不到（或只有 logo）时的备选 DBpedia 标题
const aliases = {
  bedzed: ['BedZED'],
  'parkroyal-pickering': ['PARKROYAL_Collection_Pickering'],
  'qunli-wetland': ['Qunli_Stormwater_Park'],
  'houtan-park': ['Houtan_Wetland_Park'],
  'solar-siedlung': ['Sonnenschiff', 'Solar_Siedlung_am_Schlierberg'],
  'japan-pavilion-2000': ['Japanese_Pavilion_Expo_2000'],
  'unite-habitation': ['Cité_radieuse'],
  'koshino-house': ['Koshino_House_(Azumi)'],
  'ford-foundation': ['Ford_Foundation_Building_(Manhattan)'],
  'new-gourna': ['New_Gourna_(village)'],
  'gando-school': ['Primary_School_in_Gando'],
  masdar: ['Masdar_Institute', 'Masdar_City'],
  'yokohama-terminal': ['Yokohama_International_Passenger_Terminal'],
  'brock-commons': ['Brock_Commons_Tallwood_House'],
  'hsbc-hk': ['HSBC_Building_(Hong_Kong)'],
  'hearst-tower': ['Hearst_Tower_(New_York_City)'],
  '461-dean': ['461_Dean_Street'],
  'the-stack': ['Stack_(Manhattan)'],
  diagoon: ['Diagoonwoningen'],
  'va-dundee': ['Victoria_and_Albert_Museum_Dundee'],
};

const THUMB = 'http://dbpedia.org/ontology/thumbnail';
const DEP = 'http://xmlns.com/foaf/0.1/depiction';

async function fetchTopic(title) {
  let res;
  try {
    res = await fetch(`https://dbpedia.org/data/${title}.json`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  return data[`http://dbpedia.org/resource/${title}`] || null;
}

function scoreFile(fileUrl, title) {
  const f = fileUrl.toLowerCase();
  let score = 0;
  if (f.endsWith('.jpg') || f.endsWith('.jpeg')) score += 10;
  if (f.endsWith('.png')) score += 3;
  if (f.includes('logo')) score -= 40;
  if (f.includes('_map.') || f.includes('location_map')) score -= 25;
  if (f.includes('diagram')) score -= 8;
  if (f.includes('drawing')) score -= 4;
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10);
  if (stem && f.replace(/[^a-z0-9]+/g, '').includes(stem)) score += 4;
  return score;
}

function pickImage(topic, title) {
  const cands = [];
  if (Array.isArray(topic[THUMB])) cands.push(...topic[THUMB].map((t) => t.value));
  if (Array.isArray(topic[DEP])) cands.push(...topic[DEP].map((t) => t.value));
  let best = '';
  let bestScore = -999;
  for (const c of [...new Set(cands)]) {
    const s = scoreFile(c, title);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (!best || bestScore < 5) return '';
  return best.replace('http://', 'https://').replace(/width=\d+/, 'width=1200');
}

const results = [];
let resolved = 0;

for (const item of manifest) {
  const titles = [item.title, ...(aliases[item.key] || [])];
  let image = '';
  let usedTitle = item.title;
  for (const title of [...new Set(titles)]) {
    // eslint-disable-next-line no-await-in-loop
    const topic = await fetchTopic(title);
    if (topic) {
      const got = pickImage(topic, title);
      if (got) {
        image = got;
        usedTitle = title;
        break;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(120);
  }
  if (image) resolved += 1;
  console.log(`${image ? '[ok]  ' : '[miss]'} ${item.key} <- ${image || usedTitle}`);
  results.push({ key: item.key, strategyId: item.strategyId, title: usedTitle, image });
  await sleep(150);
}

await writeFile(path.join(here, 'case-images.json'), JSON.stringify(results, null, 2));
console.log(`\nDone: ${resolved}/${results.length} resolved`);
