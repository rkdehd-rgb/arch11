import { MODEL_CATALOG, DEFAULT_MODEL_ID, getModelSpec } from '../src/services/grsai';

const wantNano = [
  'nano-banana',
  'nano-banana-fast',
  'nano-banana-pro',
  'nano-banana-2',
  'nano-banana-2-fast',
  'nano-banana-2-pro',
  'nano-banana-2k',
  'nano-banana-4k',
  'nano-banana-cl',
  'nano-banana-vt',
  'nano-banana-outline',
];

const wantGpt = [
  'gpt-image-2',
  'gpt-image-2-vip',
  'gpt-image-2.5',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
];

const nano = MODEL_CATALOG.filter((m) => m.family === 'nano-banana').map((m) => m.id);
const gpt = MODEL_CATALOG.filter((m) => m.family === 'gpt-image').map((m) => m.id);

console.log('总数:', MODEL_CATALOG.length, '(期望 16)');
console.log('nano 逐字一致:', JSON.stringify(nano) === JSON.stringify(wantNano));
console.log('gpt  逐字一致:', JSON.stringify(gpt) === JSON.stringify(wantGpt));
console.log('默认模型:', DEFAULT_MODEL_ID, '(期望 nano-banana)');
console.log('ID 唯一:', new Set(MODEL_CATALOG.map((m) => m.id)).size === 16);

// 参数联动完整性
let ok = true;
for (const id of [...wantNano]) {
  const s = getModelSpec(id);
  if (!s.ratios || s.ratios.length === 0 || !s.sizes) ok = false;
}
const hasUltra = getModelSpec('nano-banana-2').ratios?.includes('8:1');
const baseNoUltra = !getModelSpec('nano-banana').ratios?.includes('8:1');
const sun = getModelSpec('gpt-image-2.5-sunburst');
const flare = getModelSpec('gpt-image-2.5-flare');
console.log('nano 参数完整:', ok);
console.log('2 系列有超宽 8:1:', hasUltra, '| 非2系列无:', baseNoUltra);
console.log('sunburst 质量档:', sun.qualities?.join('/'), '(含 xhigh/max:', sun.qualities?.includes('xhigh') && sun.qualities?.includes('max'), ')');
console.log('flare 质量档:', flare.qualities?.join('/'));
console.log('vip/flare/sunburst 支持透明:',
  getModelSpec('gpt-image-2-vip').transparent, flare.transparent, sun.transparent);
console.log('gpt-base 比例:', getModelSpec('gpt-image-2').ratios?.length, '档，quality:', getModelSpec('gpt-image-2').qualities?.join('/'));
