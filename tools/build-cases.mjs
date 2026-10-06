// 最终整合：从审计结果中为每个案例手工锁定最佳照片（exterior 优先），生成 TS 数据
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, 'cases-manifest.json'), 'utf8'));
const audit = JSON.parse(await readFile(path.join(here, 'audit.json'), 'utf8'));
const recheck = JSON.parse(await readFile(path.join(here, 'recheck.json'), 'utf8'));
const bifFinal = JSON.parse(await readFile(path.join(here, 'bif-final.json'), 'utf8'));

const photoMap = new Map(audit.map((a) => [a.key, a.photos]));
for (const [key, v] of Object.entries(recheck)) {
  const prev = photoMap.get(key) || [];
  photoMap.set(key, [...new Set([...prev, ...v.photos])]);
}
for (const [key, v] of Object.entries(bifFinal)) {
  const prev = photoMap.get(key) || [];
  photoMap.set(key, [...new Set([...prev, ...v.photos.map((p) => p.img)])]);
}

// 手工锁定：每个 key 对应的文件名（见审计 photos），exterior 优先
const picks = {
  'ch2-melbourne': 'CouncilHouse2.jpg',
  bedzed: 'BedZED_2007.jpg',
  'bosco-verticale': 'Bosco_Verticale_Milano.jpg',
  'parkroyal-pickering': 'PARKROYAL_on_Pickering_(8134682524).jpg',
  'qunli-wetland': 'Qunli_National_Urban_Wetland_Park.jpg',
  'houtan-park': 'Houtan_Park_Shanghai.jpg',
  copenhill: 'Amager_Bakke.jpg',
  'solar-siedlung': 'Solarschiff_Solarsiedlung_Freiburg_im_Breisgau_september_2014.jpg',
  'eastgate-centre': 'Eastgate_Centre,_Harare,_Zimbabwe.jpg',
  'bahrain-wtc': 'Bahrain_WTC.jpg',
  'japan-pavilion-2000': 'Japanese_Pavilion,_Expo_2000,_Hannover.jpg',
  'cardboard-cathedral': 'Christchurch_Cardboard_Cathedral_1_(31310889165).jpg',
  'suzhou-museum': 'Suzhou_Museum.jpg',
  'mia-doha': 'Museum_of_Islamic_Art,_Doha_00_(54).jpg',
  'villa-savoye': 'VillaSavoye.jpg',
  'unite-habitation': 'Cité_radieuse,_Marseille.jpg',
  'nezu-museum': '2018_Nezu_Museum_1.jpg',
  'koshino-house': 'Koshino_House.jpg',
  'habitat-67': 'Habitat_67,_southwest_view.jpg',
  interlace: 'The_Interlace,_Singapore.jpg',
  'ford-foundation': 'Interior-Ford_Foundation-01.jpg',
  'sony-center': 'Sony_Center_Berlin.jpg',
  'edge-amsterdam': 'TheEdge_03-2024.jpg',
  'bloomberg-london': 'Bloomberg_London_exterior_-_Cannon_Street,_Walbrook.jpg',
  'new-gourna': 'New_Gourna.jpg',
  'gando-school': 'Gando-School-Burkina-Faso.jpg',
  'harbin-opera': 'Harbin_Grand_Theatre_Pano_201609.jpg',
  'heydar-center': 'Heydar_Aliyev_Center_in_Baku_in_Azerbaijan.jpg',
  'tate-modern': 'Tate_Modern.jpg',
  'zeitz-mocaa': 'Zeitz_Museum_of_Contemporary_Art_Africa,_Cape_Town_(_1050775).jpg',
  superkilen: 'Superkilen.jpg',
  cheonggyecheon: 'Cheonggyecheon_evening_2.jpg',
  'al-bahr': 'Fountain_and_Al_Bahr_Towers_-_panoramio.jpg',
  masdar: 'Masdar_City_under_construction_2012.jpg',
  'the-shard': 'The_Shard_at_sunset_2017_(cropped).jpg',
  'azabudai-hills': 'Azabudai_Hills_opening_day_19.jpg',
  '798-district': 'Beijing_798_Art_District.jpg',
  'distillery-district': 'Gooderham.jpg',
  'rolex-learning': 'Rolex_Learning_center.jpg',
  'yokohama-terminal': 'Ōsanbashi_Pier.jpg',
  'roppongi-hills': 'Roppongi_Hills_2013-12-01.jpg',
  xintiandi: 'Xintiandi5.jpg',
  'seattle-library': 'Seattle_Library_01.jpg',
  'sendai-mediatheque': 'Sendai_Mediatheque_2009.jpg',
  nakagin: 'Nakagin_Capsule_Tower_(51472766807).jpg',
  'brock-commons': 'Brock_Commons.jpg',
  'hsbc-hk': 'HK_HSBC_Main_Building_2008_(cropped).jpg',
  'hearst-tower': 'Hearst_Tower_(August_2024).jpg',
  '461-dean': '461Dean_construction.jpg',
  'the-stack': 'The_Stack_4857.jpg',
  'centre-pompidou': 'Pompidou_center.jpg',
  'sainsbury-centre': 'Sainsbury_Centre_building_with_rainbow.jpg',
  diagoon: 'Diagoon_Delft.jpg',
  'quinta-monroy': 'Quinta_Monroy_Infill_Diagram.jpg',
  'federation-square': 'Fed_Square,_Melbourne,_west_view_20230219_1.jpg',
  'taikoo-li': '三里屯太古里南区.jpg',
  'millennium-park': 'Millennium_Square,_Chicago,_Illinois_(9181701264).jpg',
  zaryadye: 'Zaryadye25.jpg',
  'high-line': 'AHigh_Line_Park,_Section_1a.jpg',
  'seoullo-7017': 'Seoullo_7017_Overview_(5).jpg',
  'axe-historique': 'Jardin_des_Tuileries_Axis_Historique.jpg',
  'national-mall': 'National_Mall,_Washington,_D.C._(20100325-DSC01310).jpg',
  snfcc: 'Stavros_Niarchos_Foundation_Cultural_Center_-_52035330487.jpg',
  'va-dundee': 'The_RRS_Discovery_&_the_V&A_Museum,_Dundee.jpg',
};

function filePath(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=1200`;
}

// 校验：pick 的文件名是否在审计 photos 中（DBpedia 确认存在）
const rows = [];
let confirmed = 0;
for (const m of manifest) {
  const photos = photoMap.get(m.key) || [];
  const wanted = picks[m.key];
  const found = photos.find((p) => {
    const fn = decodeURIComponent(p.split('/').pop());
    return fn === wanted || fn.includes(wanted.replace(/\.(jpg|jpeg|png)$/i, ''));
  });
  let image;
  if (found) {
    image = found;
    confirmed += 1;
  } else {
    image = filePath(wanted); // 未审计确认，保留候选文件名（运行时 onError 兜底 SVG）
  }
  rows.push({ ...m, image, confirmed: Boolean(found) });
  console.log(`${found ? '[C]' : '[?]'} ${m.key}`);
}

// 生成 TS 片段供检查
const ts = rows
  .map((r) => `  { id: '${r.key}', strategyId: '${r.strategyId}', name: '${r.name.replace(/'/g, "\\'")}', location: '${r.location}', year: '${r.year}', architect: '${r.architect.replace(/'/g, "\\'")}', highlight: '${r.highlight.replace(/'/g, "\\'")}', image: '${r.image}' },`)
  .join('\n');
await import('node:fs').then((fs) => fs.promises.writeFile(path.join(here, 'cases.generated.ts.txt'), ts));

console.log(`\n${confirmed}/${rows.length} images DBpedia-confirmed; ${rows.length - confirmed} guessed (runtime SVG fallback)`);
