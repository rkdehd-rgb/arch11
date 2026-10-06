import { imageGenerationService, STYLE_OPTIONS } from '../src/services/imageGeneration';
import { extractJson } from '../src/services/llm';
import { strategies } from '../src/data/strategies';

async function main(): Promise<void> {
  for (const style of STYLE_OPTIONS) {
    const img = await imageGenerationService.generate('测试提示词', style.id, {
      strategyId: strategies[0].id,
      strategyName: strategies[0].name,
    });
    const ok = img.src.startsWith('data:image/svg+xml');
    console.log(
      `${style.id.padEnd(10)} ${ok ? 'OK' : 'FAIL'} | ${img.styleName} | ${img.src.length} bytes`,
    );
  }

  // JSON 提取：包裹在 markdown code fence 中
  const fenced = `说明文字\n\`\`\`json\n{"taskSummary":"摘要","strategies":[{"strategyId":"${strategies[0].id}","matchScore":91}],"synergyInsights":[]}\n\`\`\`\n`;
  const parsed = extractJson(fenced);
  console.log('fenced JSON 解析:', parsed !== null && parsed.taskSummary === '摘要');

  // 非法 JSON
  console.log('非法JSON返回null:', extractJson('不是JSON的内容{') === null);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
