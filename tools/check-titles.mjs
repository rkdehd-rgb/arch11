// 精确探测一批候选标题是否存在且有照片
// 用法: node tools/check-titles.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probes = [
  ['bedzed', ['BedZED']],
  ['parkroyal-pickering', ['PARKROYAL_on_Pickering,_Singapore']],
  ['qunli-wetland', ['Qunli_Stormwater_Wetland_Park']],
  ['houtan-park', ['Houtan_Park_(Shanghai)']],
  ['solar-siedlung', ['Solar_Siedlung_am_Schlierberg', 'Sonnenschiff']],
  ['japan-pavilion-2000', ['Japanese_Pavilion,_Expo_2000']],
  ['unite-habitation', ["Cité_Radieuse"]],
  ['koshino-house', ['Koshino_House_(Azumi)']],
  ['ford-foundation', ['Ford_Foundation_Building_(Manhattan)']],
  ['new-gourna', ['New_Gourna,_Egypt']],
  ['gando-school', ['Gando_Primary_School,_Burkina_Faso']],
  ['masdar', ['Masdar_Institute', 'Masdar_City']],
  ['yokohama-terminal', ['Yokohama_International_Passenger_Terminal']],
  ['brock-commons', ['Brock_Commons_Tallwood_House']],
  ['hsbc-hk', ['HSBC_Building_(Hong_Kong)']],
  ['hearst-tower', ['Hearst_Tower']],
  ['461-dean', ['461_Dean_Street']],
  ['the-stack', ['The_Stack_(New_York_City)']],
  ['diagoon', ['Diagoonwoningen']],
  ['va-dundee', ['V&A_Dundee']],
];

async function getJson(title) {
  const res = await fetch(`https://dbpedia.org/data/${title}.json`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

const out = {};
for (const [key, titles] of probes) {
  out[key] = [];
  for (const title of titles) {
    let data = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      data = await getJson(title);
    } catch {
      // ignore
    }
    if (data) {
      const topic = data[`http://dbpedia.org/resource/${title}`];
      const thumbs = topic && topic['http://dbpedia.org/ontology/thumbnail'];
      const deps = topic && topic['http://xmlns.com/foaf/0.1/depiction'];
      const images = [
        ...(Array.isArray(thumbs) ? thumbs.map((t) => t.value) : []),
        ...(Array.isArray(deps) ? deps.map((t) => t.value) : []),
      ].map((u) => u.replace('http://', 'https://'));
      out[key].push({ title, images });
      console.log(`[found] ${key} -> ${title} (${images.length} imgs)`);
      break;
    }
    console.log(`[absent] ${key} -> ${title}`);
    // eslint-disable-next-line no-await-in-loop
    await sleep(150);
  }
  await sleep(150);
}

await writeFile(path.join(here, 'probe-results.json'), JSON.stringify(out, null, 2));
