import {
  MODEL_CATALOG,
  PIXEL_PRESETS,
  DEFAULT_MODEL_ID,
  getModelSpec,
} from '../src/services/grsai';

const nb = MODEL_CATALOG.filter((m) => m.family === 'nano-banana');
const gpt = MODEL_CATALOG.filter((m) => m.family === 'gpt-image');
console.log('模型总数:', MODEL_CATALOG.length, '(期望 16)');
console.log('nano-banana:', nb.length, '(期望 11)');
console.log('gpt-image:', gpt.length, '(期望 5)');
console.log('默认模型:', DEFAULT_MODEL_ID);

const ids = new Set(MODEL_CATALOG.map((m) => m.id));
console.log('ID 唯一:', ids.size === MODEL_CATALOG.length);

const s2 = getModelSpec('nano-banana-2');
const hasUltra = ['1:4', '4:1', '1:8', '8:1'].every((r) => s2.ratios?.includes(r));
console.log('2 系列含超宽比例:', hasUltra);

const base = getModelSpec('nano-banana');
const noUltra = ['1:4', '8:1'].every((r) => !base.ratios?.includes(r));
console.log('非 2 系列无超宽比例:', noUltra);

const sun = getModelSpec('gpt-image-2.5-sunburst');
console.log('sunburst 质量档:', sun.qualities?.join('/'), '| 含 xhigh/max:',
  sun.qualities?.includes('xhigh') && sun.qualities?.includes('max'));
console.log('vip 仅像素(无 ratios 字段):', getModelSpec('gpt-image-2-vip').ratios === undefined);
console.log('flare 质量档:', getModelSpec('gpt-image-2.5-flare').qualities?.join('/'));
console.log('像素预设网格数:', PIXEL_PRESETS.length);

// 校验像素预设满足 16 倍数 & 最大边<=3840 & 比例<=3:1
let valid = true;
for (const preset of PIXEL_PRESETS) {
  for (const v of preset.values) {
    const [w, h] = v.split('x').map(Number);
    if (w % 16 !== 0 || h % 16 !== 0) valid = false;
    if (Math.max(w, h) > 3840) valid = false;
    if (Math.max(w, h) / Math.min(w, h) > 3) valid = false;
  }
}
console.log('像素预设全部合规:', valid);
