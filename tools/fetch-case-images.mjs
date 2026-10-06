// 从 DBpedia 读取每个建筑条目的权威 Wikimedia Commons 缩略图直链
// 用法: node tools/fetch-case-images.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, 'cases-manifest.json'), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchThumb(title) {
  const url = `https://dbpedia.org/data/${title}.json`;
  const res = await fetch(url, { redirect: 'follow', headers: { Accept: 'application/json' } });
  if (!res.ok) return { thumb: null, depiction: [] };
  const data = await res.json();
  const key = `http://dbpedia.org/resource/${title}`;
  const topic = data[key];
  if (!topic) return { thumb: null, depiction: [] };
  const thumbArr = topic['http://dbpedia.org/ontology/thumbnail'];
  const depArr = topic['http://xmlns.com/foaf/0.1/depiction'];
  const thumb = Array.isArray(thumbArr) && thumbArr[0] && thumbArr[0].value
    ? String(thumbArr[0].value).replace('http://', 'https://')
    : null;
  const depiction = Array.isArray(depArr)
    ? depArr.map((d) => String(d.value).replace('http://', 'https://'))
    : [];
  return { thumb, depiction };
}

function upgrade(url, width) {
  // DBpedia 默认 width=300；统一放大到 1200，Commons 会按宽缩略
  return url.replace(/width=\d+/, `width=${width}`);
}

const results = [];
let missing = 0;

for (let i = 0; i < manifest.length; i += 1) {
  const item = manifest[i];
  let info = { thumb: null, depiction: [] };
  for (let attempt = 0; attempt < 2 && !info.thumb; attempt += 1) {
    try {
      info = await fetchThumb(item.title);
    } catch (err) {
      console.error(`[warn] ${item.title} attempt ${attempt + 1}: ${err.message}`);
    }
    if (!info.thumb) await sleep(600);
  }
  const image = info.thumb
    ? upgrade(info.thumb, 1200)
    : info.depiction[0]
      ? upgrade(info.depiction[0], 1200)
      : '';
  if (!image) {
    missing += 1;
    console.error(`[missing] ${item.key} (${item.title})`);
  } else {
    console.log(`[ok] ${item.key} <- ${image}`);
  }
  results.push({ key: item.key, strategyId: item.strategyId, image });
  await sleep(120);
}

await writeFile(path.join(here, 'case-images.json'), JSON.stringify(results, null, 2));
console.log(`\nDone: ${results.length - missing}/${results.length} resolved, ${missing} missing`);
