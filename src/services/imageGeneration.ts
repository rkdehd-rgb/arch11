/**
 * ImageGenerationService —— 概念方案图生成接口层
 * 演示版：本地程序化 SVG 概念示意图（按风格区分形母题与色板）
 * 后续可新增 RealApiImageGenerator 并在 createImageGenerator 中切换，调用方无需改动。
 */

export interface StyleOption {
  id: string;
  name: string;
  palette: {
    bg: string;
    ground: string;
    primary: string;
    secondary: string;
    accent: string;
    ink: string;
  };
}

export interface GenerateOptions {
  strategyId: string;
  strategyName: string;
  timestamp: number;
}

export interface GeneratedImage {
  src: string;
  width: number;
  height: number;
  styleId: string;
  styleName: string;
}

export const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'modernism',
    name: '现代主义',
    palette: { bg: '#F4F2ED', ground: '#E2DED4', primary: '#FFFFFF', secondary: '#C9C4B8', accent: '#A9472D', ink: '#3A3833' },
  },
  {
    id: 'new-chinese',
    name: '新中式',
    palette: { bg: '#F3F0E8', ground: '#E0DACB', primary: '#F8F5EC', secondary: '#8E8572', accent: '#7A4A32', ink: '#2F2B25' },
  },
  {
    id: 'parametric',
    name: '参数化未来',
    palette: { bg: '#1B1E26', ground: '#232733', primary: '#3E4658', secondary: '#6E7A93', accent: '#C9A86A', ink: '#E8EAF0' },
  },
  {
    id: 'white-box',
    name: '极简白盒',
    palette: { bg: '#FAFAF8', ground: '#ECEAE4', primary: '#FFFFFF', secondary: '#D9D6CE', accent: '#1C1B19', ink: '#4A4843' },
  },
  {
    id: 'vernacular',
    name: '在地乡土',
    palette: { bg: '#F1EBDD', ground: '#D9CFB8', primary: '#E8DCC4', secondary: '#B89968', accent: '#9C5B3A', ink: '#43382B' },
  },
  {
    id: 'brutalism',
    name: '粗野主义',
    palette: { bg: '#E6E3DC', ground: '#CFC9BC', primary: '#B8B1A2', secondary: '#878072', accent: '#5E584B', ink: '#2B2822' },
  },
  {
    id: 'folded-plate',
    name: '折板结构',
    palette: { bg: '#EDF0EE', ground: '#D5DAD5', primary: '#F7F9F7', secondary: '#9AA89F', accent: '#3F5C52', ink: '#2C332F' },
  },
  {
    id: 'eco-green',
    name: '生态绿建',
    palette: { bg: '#EFF2EA', ground: '#D3DCC8', primary: '#F6F8F2', secondary: '#7E9671', accent: '#4C6B45', ink: '#2E372B' },
  },
];

export function getStyle(id: string): StyleOption {
  return STYLE_OPTIONS.find((s) => s.id === id) ?? STYLE_OPTIONS[0];
}

// 确定性伪随机（同一 prompt/style 生成稳定画面）
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const W = 1200;
const H = 840;

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function baseScene(p: StyleOption['palette'], dark: boolean): string {
  // 天空渐变 + 地面 + 远山 + 配景树
  const skyStop = dark ? '#222632' : p.bg;
  const skyStop2 = dark ? '#151820' : shade(p.bg, -6);
  return `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${skyStop}"/>
      <stop offset="1" stop-color="${skyStop2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="980" cy="150" r="56" fill="${dark ? '#C9A86A' : '#FFF6E0'}" opacity="${dark ? 0.85 : 0.9}"/>
  <path d="M0,560 L180,470 L360,545 L520,455 L720,540 L900,475 L1200,545 L1200,600 L0,600 Z" fill="${p.secondary}" opacity="0.35"/>
  <rect x="0" y="588" width="${W}" height="${H - 588}" fill="${p.ground}"/>
  <line x1="0" y1="588" x2="${W}" y2="588" stroke="${p.ink}" stroke-opacity="0.25" stroke-width="1.5"/>
  ${figures(dark)}`;
}

function shade(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = percent < 0 ? 0 : 255;
  const amount = Math.abs(percent) / 100;
  r = Math.round((t - r) * amount + r);
  g = Math.round((t - g) * amount + g);
  b = round((t - b) * amount + b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function round(v: number): number {
  return Math.round(v);
}

function figures(dark: boolean): string {
  const tree = (x: number, s: number) => `
    <g transform="translate(${x},588)" opacity="0.9">
      <rect x="${-1.5 * s}" y="${-34 * s}" width="${3 * s}" height="${34 * s}" fill="${dark ? '#3a3f33' : '#7C6A52'}"/>
      <circle cx="0" cy="${-44 * s}" r="${16 * s}" fill="${dark ? '#4a5a48' : '#8FA07E'}"/>
    </g>`;
  return [tree(90, 1), tree(1100, 1.2), tree(1150, 0.8)].join('');
}

function paramBadge(opts: GenerateOptions, style: StyleOption): string {
  const time = new Date(opts.timestamp);
  const pad = (v: number) => String(v).padStart(2, '0');
  const stamp = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
  return `
  <g font-family="JetBrains Mono, monospace" font-size="15" fill="${style.palette.ink}" opacity="0.72">
    <rect x="32" y="${H - 92}" width="330" height="60" rx="4" fill="${style.palette.bg}" fill-opacity="0.55" stroke="${style.palette.ink}" stroke-opacity="0.18"/>
    <text x="48" y="${H - 66}">STYLE · ${esc(style.name)}</text>
    <text x="48" y="${H - 44}">STRATEGY · ${esc(opts.strategyName)}  |  ${stamp}</text>
  </g>`;
}

// ---------------- 各风格形母题 ----------------

function modernism(p: StyleOption['palette'], rng: () => number): string {
  const blocks: string[] = [];
  let x = 340;
  for (let i = 0; i < 4; i += 1) {
    const bw = 90 + rng() * 90;
    const bh = 120 + rng() * 220;
    blocks.push(`
    <rect x="${x}" y="${588 - bh}" width="${bw}" height="${bh}" fill="${i % 2 ? p.secondary : p.primary}" stroke="${p.ink}" stroke-opacity="0.5"/>
    <line x1="${x}" y1="${588 - bh + 24}" x2="${x + bw}" y2="${588 - bh + 24}" stroke="${p.ink}" stroke-opacity="0.15"/>`);
    // 水平窗带
    for (let f = 1; f < Math.floor(bh / 34); f += 1) {
      blocks.push(`<rect x="${x + 10}" y="${588 - bh + f * 30}" width="${bw - 20}" height="7" fill="${p.ink}" opacity="0.28"/>`);
    }
    x += bw - 6;
  }
  // 架空柱
  blocks.push(`<rect x="${x - 120}" y="540" width="10" height="48" fill="${p.ink}" opacity="0.5"/>`);
  return blocks.join('');
}

function newChinese(p: StyleOption['palette'], rng: () => number): string {
  const roof = (cx: number, y: number, w: number, h: number) => `
    <path d="M${cx - w / 2 - 26},${y} Q${cx},${y - h - 30} ${cx + w / 2 + 26},${y} L${cx + w / 2},${y + 10} L${cx - w / 2},${y + 10} Z" fill="${p.accent}" opacity="0.9"/>
    <rect x="${cx - w / 2}" y="${y + 10}" width="${w}" height="6" fill="${p.secondary}"/>`;
  let out = '';
  // 影壁与院落
  out += `<rect x="180" y="430" width="840" height="158" fill="none" stroke="${p.ink}" stroke-opacity="0.3" stroke-width="2"/>`;
  out += `<rect x="520" y="500" width="160" height="88" fill="${p.ground}" stroke="${p.ink}" stroke-opacity="0.25"/>`;
  const halls = [
    { cx: 320, y: 470, w: 200 },
    { cx: 600, y: 380, w: 260 },
    { cx: 880, y: 470, w: 200 },
  ];
  halls.forEach((hall, i) => {
    out += roof(hall.cx, hall.y, hall.w, 44);
    out += `<rect x="${hall.cx - hall.w / 2 + 14}" y="${hall.y + 16}" width="${hall.w - 28}" height="${588 - hall.y - 16}" fill="${p.primary}" stroke="${p.ink}" stroke-opacity="0.35"/>`;
    for (let k = 0; k < 4; k += 1) {
      out += `<rect x="${hall.cx - hall.w / 2 + 30 + k * ((hall.w - 60) / 4)}" y="${hall.y + 40}" width="18" height="40" fill="${p.secondary}" opacity="${0.5 + rng() * 0.3}"/>`;
    }
    if (i === 1) out += `<rect x="${hall.cx - 14}" y="${hall.y + 30}" width="28" height="${588 - hall.y - 30}" fill="${p.accent}" opacity="0.55"/>`;
  });
  return out;
}

function parametric(p: StyleOption['palette'], rng: () => number): string {
  let out = '';
  // 参数化流线塔身
  const cx = 600;
  const baseW = 300;
  for (let i = 0; i < 26; i += 1) {
    const t = i / 25;
    const y = 180 + t * 408;
    const w = baseW * (1 - t * 0.55) + Math.sin(t * 6) * 26;
    const x = cx - w / 2 + Math.sin(t * 4) * 18;
    out += `<path d="M${x},${y} Q${cx},${y - 10} ${x + w},${y} L${x + w - 8},${y + 14} L${x + 8},${y + 14} Z" fill="${i % 3 ? p.primary : p.secondary}" opacity="${0.55 + rng() * 0.35}" stroke="${p.ink}" stroke-opacity="0.2"/>`;
  }
  // 周边流线
  for (let i = 0; i < 9; i += 1) {
    const y0 = 620 + i * 12;
    out += `<path d="M120,${y0} C380,${y0 - 60 - rng() * 40} 820,${y0 - 60} 1080,${y0 - rng() * 30}" fill="none" stroke="${p.accent}" stroke-opacity="${0.5 - i * 0.04}" stroke-width="1.5"/>`;
  }
  return out;
}

function whiteBox(p: StyleOption['palette'], rng: () => number): string {
  let out = '';
  const boxes = [
    { x: 360, y: 300, w: 300, h: 288 },
    { x: 520, y: 220, w: 240, h: 368 },
    { x: 700, y: 360, w: 180, h: 228 },
  ];
  boxes.forEach((b, i) => {
    out += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${p.primary}" stroke="${p.ink}" stroke-opacity="${0.25 + i * 0.1}"/>`;
    // 极少的开口
    if (rng() > 0.4) {
      out += `<rect x="${b.x + b.w - 46}" y="${b.y + 30}" width="22" height="${b.h - 80}" fill="${i === 2 ? p.accent : p.secondary}"/>`;
    }
  });
  out += `<rect x="200" y="560" width="800" height="2" fill="${p.ink}" opacity="0.2"/>`;
  return out;
}

function vernacular(p: StyleOption['palette'], rng: () => number): string {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    const bw = 120 + rng() * 60;
    const bh = 80 + rng() * 70;
    const x = 240 + i * 110 - rng() * 20;
    const y = 588 - bh;
    out += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${p.primary}" stroke="${p.ink}" stroke-opacity="0.4"/>`;
    // 坡屋顶
    out += `<path d="M${x - 12},${y} L${x + bw / 2},${y - 46 - rng() * 20} L${x + bw + 12},${y} Z" fill="${p.secondary}" stroke="${p.ink}" stroke-opacity="0.4"/>`;
    out += `<rect x="${x + bw / 2 - 12}" y="${y + 24}" width="24" height="${bh - 24}" fill="${p.accent}" opacity="0.7"/>`;
  }
  // 地形起伏
  out += `<path d="M0,588 Q300,560 600,580 T1200,572 L1200,620 L0,620 Z" fill="${p.ground}" opacity="0.6"/>`;
  return out;
}

function brutalism(p: StyleOption['palette'], rng: () => number): string {
  let out = '';
  // 粗重混凝土体量
  const masses = [
    { x: 300, y: 250, w: 260, h: 338 },
    { x: 480, y: 330, w: 300, h: 258 },
  ];
  masses.forEach((m) => {
    out += `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" fill="${p.primary}" stroke="${p.ink}" stroke-opacity="0.45" stroke-width="2"/>`;
    for (let r = 0; r < Math.floor(m.h / 46); r += 1) {
      for (let c = 0; c < Math.floor(m.w / 54); c += 1) {
        if (rng() > 0.35) {
          out += `<rect x="${m.x + 12 + c * 54}" y="${m.y + 14 + r * 46}" width="30" height="24" fill="${p.ink}" opacity="0.4"/>`;
        }
      }
    }
  });
  // 暴露的粗柱
  for (let i = 0; i < 5; i += 1) {
    out += `<rect x="${320 + i * 120}" y="520" width="22" height="68" fill="${p.secondary}"/>`;
  }
  return out;
}

function foldedPlate(p: StyleOption['palette'], rng: () => number): string {
  let d = 'M180,588';
  const peaks: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= 10; i += 1) {
    const x = 180 + i * 84;
    const y = i % 2 ? 300 + rng() * 60 : 420 + rng() * 60;
    d += ` L${x},${y}`;
    peaks.push({ x, y });
  }
  d += ' L1020,588 Z';
  let out = `<path d="${d}" fill="${p.primary}" stroke="${p.ink}" stroke-opacity="0.4" stroke-width="2"/>`;
  // 折板棱线
  peaks.forEach((pt, i) => {
    out += `<line x1="${pt.x}" y1="${pt.y}" x2="${pt.x}" y2="588" stroke="${p.secondary}" stroke-opacity="${i % 2 ? 0.7 : 0.3}"/>`;
  });
  // 玻璃底
  out += `<rect x="240" y="470" width="720" height="118" fill="${p.secondary}" opacity="0.45"/>`;
  return out;
}

function ecoGreen(p: StyleOption['palette'], rng: () => number): string {
  let out = '';
  // 退台绿化
  for (let i = 0; i < 5; i += 1) {
    const y = 250 + i * 68;
    const x = 300 + i * 40;
    const w = 560 - i * 80;
    out += `<rect x="${x}" y="${y}" width="${w}" height="68" fill="${p.primary}" stroke="${p.ink}" stroke-opacity="0.3"/>`;
    out += `<rect x="${x - 26}" y="${y - 14}" width="${w + 52}" height="16" fill="${p.secondary}"/>`;
    for (let t = 0; t < 8; t += 1) {
      const tx = x + 16 + t * ((w - 32) / 7);
      out += `<circle cx="${tx}" cy="${y - 16}" r="${8 + rng() * 4}" fill="${p.accent}" opacity="0.85"/>`;
    }
  }
  // 底部水景
  out += `<rect x="240" y="600" width="720" height="26" fill="${p.secondary}" opacity="0.5"/>`;
  return out;
}

const MOTIFS: Record<string, (p: StyleOption['palette'], rng: () => number) => string> = {
  modernism,
  'new-chinese': newChinese,
  parametric,
  'white-box': whiteBox,
  vernacular,
  brutalism,
  'folded-plate': foldedPlate,
  'eco-green': ecoGreen,
};

export function generateConceptImage(
  prompt: string,
  styleId: string,
  options: GenerateOptions,
): GeneratedImage {
  const style = getStyle(styleId);
  const dark = styleId === 'parametric';
  const seed = hashString(`${prompt}::${styleId}::${options.strategyId}`);
  const rng = makeRng(seed);
  const motif = (MOTIFS[style.id] ?? modernism)(style.palette, rng);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${baseScene(style.palette, dark)}
${motif}
${paramBadge(options, style)}
</svg>`;

  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return { src, width: W, height: H, styleId: style.id, styleName: style.name };
}

// ---------------- Service 接口层（可替换为真实 API） ----------------

export interface ImageGenerator {
  generate(
    prompt: string,
    styleId: string,
    options: GenerateOptions,
  ): Promise<GeneratedImage>;
}

class LocalSvgImageGenerator implements ImageGenerator {
  async generate(
    prompt: string,
    styleId: string,
    options: GenerateOptions,
  ): Promise<GeneratedImage> {
    return generateConceptImage(prompt, styleId, options);
  }
}

/**
 * 真实 API 实现位（后续替换用）：
 * class RealApiImageGenerator implements ImageGenerator {
 *   async generate(prompt, styleId, options) {
 *     const res = await fetch(`${apiBase}/images/generations`, { ... });
 *     ... 返回 { src, width, height, styleId, styleName }
 *   }
 * }
 */

export function createImageGenerator(): ImageGenerator {
  // 演示版固定本地 SVG；接入真实生图 API 时在此切换
  return new LocalSvgImageGenerator();
}

export const imageGenerationService: ImageGenerator = createImageGenerator();
