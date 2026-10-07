/**
 * 报告导出服务
 *  - 导出 Markdown（纯文本，便于二次编辑 / 归档）
 *  - 导出 PDF（打开排版好的打印视图，用户在浏览器「另存为 PDF」）
 *
 * 纯前端实现，不依赖任何第三方库，离线可用。
 */

import type { InferenceReport, StrategyMatch } from '../types';
import { resolveStrategy, getGroupName, resolveCases } from './strategyPool';

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 文件名安全化（去掉非法字符） */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || '报告';
}

/** 策略展示信息：兼容内置策略与库外建议策略 */
function strategyInfo(match: StrategyMatch): {
  name: string;
  nameEn: string;
  group: string;
  concept: string;
} {
  const resolved = resolveStrategy(match);
  if (resolved) {
    return {
      name: resolved.name,
      nameEn: resolved.nameEn || '',
      group: getGroupName(resolved.group),
      concept: resolved.concept,
    };
  }
  const def = match.definition;
  return {
    name: def?.name ?? match.strategyId,
    nameEn: def?.nameEn ?? '',
    group: def?.group ? getGroupName(def.group) : '',
    concept: def?.concept ?? '',
  };
}

/* ------------------------------ Markdown ------------------------------ */

export function reportToMarkdown(report: InferenceReport): string {
  const builtin = report.result.strategies.filter((m) => m.source !== 'suggested');
  const suggested = report.result.suggestedStrategies ?? [];
  const lines: string[] = [];

  lines.push(`# 推理报告 · ${report.task.projectName || '未命名项目'}`);
  lines.push('');
  lines.push('| 项 | 内容 |');
  lines.push('| --- | --- |');
  lines.push(`| 推理时间 | ${formatTime(report.createdAt)} |`);
  lines.push(`| 使用模型 | ${report.model}${report.degraded ? '（本地规则推理）' : ''} |`);
  if (report.task.location) lines.push(`| 项目地点 | ${report.task.location} |`);
  if (report.task.buildingType) lines.push(`| 建筑类型 | ${report.task.buildingType} |`);
  if (report.task.siteArea) lines.push(`| 用地面积 | ${report.task.siteArea} |`);
  if (report.task.grossArea) lines.push(`| 总建筑面积 | ${report.task.grossArea} |`);
  if (report.task.far) lines.push(`| 容积率 | ${report.task.far} |`);
  lines.push('');
  lines.push('## 任务书摘要');
  lines.push('');
  lines.push(report.result.taskSummary || '—');
  lines.push('');

  if (report.result.synergyInsights.length > 0) {
    lines.push('## 协同洞见');
    lines.push('');
    report.result.synergyInsights.forEach((insight) => lines.push(`- ${insight}`));
    lines.push('');
  }

  if (builtin.length > 0) {
    lines.push('## 匹配策略');
    lines.push('');
    builtin.slice(0, 5).forEach((match, i) => {
      const info = strategyInfo(match);
      lines.push(
        `### ${String(i + 1).padStart(2, '0')} ${info.name}${info.nameEn ? `（${info.nameEn}）` : ''} — 匹配度 ${match.matchScore}`,
      );
      lines.push('');
      if (info.group) lines.push(`- 类别：${info.group}`);
      if (info.concept) lines.push(`- 策略核心理念：${info.concept}`);
      lines.push(`- 本项目落地思路：${match.conceptRefined || '—'}`);
      lines.push(`- 匹配逻辑：${match.matchReason || '—'}`);
      const cases = resolveCases(match.strategyId)
        .map((c) => c.name)
        .filter(Boolean);
      if (cases.length > 0) lines.push(`- 参考案例：${cases.join('、')}`);
      lines.push('');
    });
  }

  if (suggested.length > 0) {
    lines.push('## 库外策略建议');
    lines.push('');
    suggested.forEach((match) => {
      const info = strategyInfo(match);
      lines.push(`### ${info.name} — 匹配度 ${match.matchScore}`);
      lines.push('');
      if (info.concept) lines.push(`- 策略核心理念：${info.concept}`);
      lines.push(`- 本项目落地思路：${match.conceptRefined || '—'}`);
      lines.push(`- 匹配逻辑：${match.matchReason || '—'}`);
      if (match.cases && match.cases.length > 0) {
        lines.push(`- 参考案例：${match.cases.map((c) => c.name).join('、')}`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('');
  lines.push(`由 ArchReason 建筑推理引擎生成 · ${formatTime(Date.now())}`);
  lines.push('');
  return lines.join('\n');
}

/** 下载文本文件 */
function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReportMarkdown(report: InferenceReport): void {
  const md = reportToMarkdown(report);
  const name = safeFileName(report.task.projectName || '项目');
  downloadText(`archreason-推理报告-${name}.md`, md, 'text/markdown');
}

/* ------------------------------ PDF / 打印 ------------------------------ */

/** 把相对图片地址转为绝对地址，保证打印窗口能加载 */
function absoluteUrl(src: string): string {
  if (!src) return '';
  if (/^(https?:|data:)/i.test(src)) return src;
  try {
    return new URL(src, window.location.origin).href;
  } catch {
    return src;
  }
}

function caseCardsHtml(match: StrategyMatch, isSuggested: boolean): string {
  const raw = isSuggested
    ? (match.cases ?? []).map((c) => ({ image: c.image ?? '', name: c.name, location: c.location }))
    : resolveCases(match.strategyId).map((c) => ({ image: c.image, name: c.name ?? '', location: c.location ?? '' }));
  const cards = raw
    .filter((c) => c.image)
    .map(
      (c) => `
      <figure class="case">
        <img src="${escapeHtml(absoluteUrl(c.image))}" alt="${escapeHtml(c.name)}" onerror="this.parentNode.style.display='none'" />
        <figcaption>${escapeHtml(c.name)}${c.location ? ` · ${escapeHtml(c.location)}` : ''}</figcaption>
      </figure>`,
    )
    .join('');
  return cards ? `<div class="cases">${cards}</div>` : '';
}

function matchBlockHtml(match: StrategyMatch, index: number, isSuggested: boolean): string {
  const info = strategyInfo(match);
  const badge = isSuggested
    ? '<span class="badge">库外新策略</span>'
    : `<span class="idx">${String(index + 1).padStart(2, '0')}</span>`;
  return `
  <article class="card">
    <div class="card-head">
      <div class="title-wrap">
        ${badge}
        <div>
          <h3>${escapeHtml(info.name)}</h3>
          <div class="meta">${escapeHtml(info.nameEn || '—')} · ${escapeHtml(info.group || '—')}</div>
        </div>
      </div>
      <div class="score">
        <div class="score-label">匹配度</div>
        <div class="score-val">${match.matchScore}</div>
        <div class="bar"><span style="width:${Math.max(0, Math.min(100, match.matchScore))}%"></span></div>
      </div>
    </div>
    <div class="grid2">
      <div>
        <div class="k">策略核心理念</div>
        <p>${escapeHtml(info.concept || '—')}</p>
      </div>
      <div>
        <div class="k">本项目落地思路</div>
        <p>${escapeHtml(match.conceptRefined || '—')}</p>
      </div>
    </div>
    <div class="reason">
      <div class="k">匹配逻辑</div>
      <p>${escapeHtml(match.matchReason || '—')}</p>
    </div>
    ${caseCardsHtml(match, isSuggested)}
  </article>`;
}

export function reportToPrintHtml(report: InferenceReport): string {
  const builtin = report.result.strategies.filter((m) => m.source !== 'suggested').slice(0, 5);
  const suggested = report.result.suggestedStrategies ?? [];
  const title = report.task.projectName || '未命名项目';

  const rows: string[] = [];
  rows.push(['推理时间', formatTime(report.createdAt)]);
  rows.push(['使用模型', `${report.model}${report.degraded ? '（本地规则推理）' : ''}`]);
  if (report.task.location) rows.push(['项目地点', report.task.location]);
  if (report.task.buildingType) rows.push(['建筑类型', report.task.buildingType]);
  if (report.task.siteArea) rows.push(['用地面积', report.task.siteArea]);
  if (report.task.grossArea) rows.push(['总建筑面积', report.task.grossArea]);
  if (report.task.far) rows.push(['容积率', report.task.far]);

  const metaHtml = rows
    .map(([k, v]) => `<div class="row"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`)
    .join('');

  const insights = report.result.synergyInsights.length
    ? `<section>
        <h2>协同洞见</h2>
        <ul>${report.result.synergyInsights.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </section>`
    : '';

  const builtinHtml = builtin.length
    ? `<section><h2>匹配策略</h2>${builtin.map((m, i) => matchBlockHtml(m, i, false)).join('')}</section>`
    : '';

  const suggestedHtml = suggested.length
    ? `<section><h2>库外策略建议</h2>${suggested.map((m, i) => matchBlockHtml(m, i, true)).join('')}</section>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>ArchReason 推理报告 · ${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 40px; font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", -apple-system, "Segoe UI", sans-serif; color: #2b2a27; line-height: 1.7; background: #fff; }
  .doc-head { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid #2b2a27; padding-bottom: 14px; margin-bottom: 22px; }
  .doc-head .brand { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: #8a857a; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h1 .sub { font-size: 15px; font-weight: 400; color: #8a857a; margin-left: 8px; }
  h2 { font-size: 16px; margin: 26px 0 12px; padding-left: 10px; border-left: 3px solid #a9472d; }
  .meta-box { width: 260px; background: #2b2a27; color: #fff; border-radius: 8px; padding: 14px 16px; font-size: 12.5px; }
  .meta-box .row { display: flex; justify-content: space-between; gap: 12px; margin: 3px 0; }
  .meta-box .row span { color: rgba(255,255,255,.6); }
  .summary { font-size: 13.5px; background: #f6f4ef; border-radius: 8px; padding: 14px 18px; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { font-size: 13px; margin: 3px 0; }
  .card { border: 1px solid #e3ded3; border-radius: 10px; padding: 18px 20px; margin: 14px 0; page-break-inside: avoid; }
  .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .title-wrap { display: flex; gap: 12px; align-items: flex-start; }
  .idx { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 7px; background: #2b2a27; color: #fff; font-weight: 600; font-size: 14px; font-family: ui-monospace, Menlo, monospace; }
  .badge { display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 7px; background: #a9472d; color: #fff; font-size: 11px; font-weight: 600; letter-spacing: .06em; }
  .card h3 { margin: 0; font-size: 16px; }
  .meta { font-size: 11px; color: #8a857a; font-family: ui-monospace, Menlo, monospace; margin-top: 3px; }
  .score { width: 190px; flex-shrink: 0; }
  .score-label { font-size: 11.5px; color: #8a857a; }
  .score-val { font-size: 18px; font-weight: 700; color: #a9472d; font-family: ui-monospace, Menlo, monospace; }
  .bar { height: 6px; border-radius: 3px; background: #ece8df; overflow: hidden; margin-top: 4px; }
  .bar span { display: block; height: 100%; background: #a9472d; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 14px; }
  .k { font-size: 11.5px; font-weight: 600; color: #8a857a; margin-bottom: 3px; }
  .card p { margin: 0; font-size: 13px; }
  .reason { margin-top: 14px; background: #f6f4ef; border-radius: 8px; padding: 12px 14px; }
  .cases { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; }
  .case { margin: 0; }
  .case img { width: 100%; height: 110px; object-fit: cover; border-radius: 6px; background: #f0ece4; display: block; }
  .case figcaption { font-size: 10.5px; color: #6f6a60; margin-top: 4px; line-height: 1.4; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e3ded3; font-size: 11px; color: #8a857a; text-align: center; }
  @media print { body { padding: 0 12mm; } .card { break-inside: avoid; } }
</style>
</head>
<body>
  <header class="doc-head">
    <div>
      <div class="brand">ArchReason · Reasoning Report</div>
      <h1>推理报告<span class="sub">${escapeHtml(title)}</span></h1>
    </div>
    <div class="meta-box">${metaHtml}</div>
  </header>

  <section>
    <h2>任务书摘要</h2>
    <div class="summary">${escapeHtml(report.result.taskSummary || '—')}</div>
  </section>

  ${insights}
  ${builtinHtml}
  ${suggestedHtml}

  <footer>由 ArchReason 建筑推理引擎生成 · ${formatTime(Date.now())}</footer>
  <script>
    window.addEventListener('load', function () {
      var imgs = Array.prototype.slice.call(document.images);
      var pending = imgs.length;
      function done() { if (--pending <= 0) { window.focus(); window.print(); } }
      if (pending === 0) { window.focus(); window.print(); return; }
      imgs.forEach(function (img) {
        if (img.complete) done(); else { img.addEventListener('load', done); img.addEventListener('error', done); }
      });
    });
  </script>
</body>
</html>`;
}

export function exportReportPdf(report: InferenceReport): boolean {
  const html = reportToPrintHtml(report);
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
