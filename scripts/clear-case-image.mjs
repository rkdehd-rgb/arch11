// 清空指定案例在 cases.ts 中的 image（用于剔除人工核验不通过的配图）
// 用法：node scripts/clear-case-image.mjs <caseId>
import fs from 'fs';

const id = process.argv[2];
if (!id) {
  console.error('用法：node scripts/clear-case-image.mjs <caseId>');
  process.exit(1);
}

const p = 'src/data/cases.ts';
let text = fs.readFileSync(p, 'utf8');
const esc = id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
const re = new RegExp("(\\{[^}]*?id:\\s*'" + esc + "'[\\s\\S]*?)image:\\s*'[^']*'");
if (!re.test(text)) {
  console.error('未找到该案例，或 image 已为空：' + id);
  process.exit(1);
}
text = text.replace(re, (_m, pre) => pre + "image: ''");
fs.writeFileSync(p, text, 'utf8');
console.error('已清空配图：' + id);
