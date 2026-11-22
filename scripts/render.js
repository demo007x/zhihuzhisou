#!/usr/bin/env node
/**
 * 知乎智搜 · 答案页渲染（render.js）
 *
 * 职责：读「答案数据 JSON」（契约见 references/answer-schema.md），
 *       按 template.html 的固定版式，生成最终 HTML 答案页。
 *
 * 用法：
 *   node render.js --data answer.json --out 答案页.html
 *   （--data 默认 answer.json，--out 默认 answer.html）
 */

const fs = require('fs');
const path = require('path');

// ---------- 参数 ----------
function parseArgs(argv) {
  const a = { data: 'answer.json', out: 'answer.html' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data') a.data = argv[i + 1];
    else if (argv[i] === '--out') a.out = argv[i + 1];
  }
  return a;
}

// ---------- HTML 转义（防注入，保证来源/标题里的特殊字符安全）----------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- 可信度 tier → badge（纯 CSS 圆点，不用 emoji）----------
const TIER_BADGE = {
  '保留': '<span class="badge keep"><i class="dot"></i>保留</span>',
  '降权': '<span class="badge down"><i class="dot"></i>降权</span>',
  '存疑': '<span class="badge doubt"><i class="dot"></i>存疑</span>',
};
function tierBadge(tier) { return TIER_BADGE[tier] || '<span class="badge down"><i class="dot"></i>降权</span>'; }

// ---------- 意图标签 ----------
function renderTags(queries) {
  return (queries || []).map((q) => `<span class="tag">${esc(q)}</span>`).join('');
}

// ---------- 结论区 ----------
function renderConditions(conditions) {
  return (conditions || []).map((c) => `<li>${esc(c)}</li>`).join('');
}

// ---------- 时效验证提示 ----------
function renderVerify(verify) {
  if (!verify || !verify.done) return '';
  return `<div class="verify-note">${esc(verify.note || '已二次验证')}（核实于 ${esc(verify.date || '')}）</div>`;
}

// ---------- 证据区（按 type 分形态）----------
function renderEvidence(evidence) {
  const type = (evidence && evidence.type) || 'compare';
  if (type === 'compare') return renderCompare(evidence.items || []);
  if (type === 'facts') return renderFacts(evidence.items || []);
  // steps / multi_view 等其他形态：降级为通用列表
  return renderList(evidence.items || []);
}

// 对比表：来源锚点 + 可信度 并入表格列，不漂浮在表外
function renderCompare(items) {
  if (!items.length) return '<p>暂无证据</p>';
  // 从第一条的 fields 取表头，末尾固定加「来源」「可信度」两列
  const headers = Object.keys(items[0].fields || {}).concat(['来源', '可信度']);
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const rows = items.map((it) => {
    const cells = headers.map((h) => {
      if (h === '来源') return `<td>${renderSourceCell(it.source)}</td>`;
      if (h === '可信度') return `<td>${tierBadge(it.tier)}</td>`;
      return `<td>${esc((it.fields || {})[h])}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table class="compare-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

// 表格内的「来源」单元格：作者 + 原文链接
function renderSourceCell(s) {
  s = s || {};
  const author = s.author ? esc(s.author) : '';
  const url = s.url ? ` <a href="${esc(s.url)}" target="_blank">原文 ↗</a>` : '';
  return `${author}${url}`;
}

// 通用列表（每条：观点 + 来源 + 可信度标）
function renderList(items) {
  return items.map((it) => {
    const view = it.view || it.title || '';
    return `<div class="item"><div class="view">${esc(view)}</div>${renderItemMeta(it)}</div>`;
  }).join('');
}

// 事实查询（一句话结论列表）
function renderFacts(items) {
  return renderList(items);
}

// 单条证据的来源锚点 + 可信度标
function renderItemMeta(it) {
  const s = it.source || {};
  const badge = tierBadge(it.tier);
  const author = s.author ? `<span>${esc(s.author)}</span>` : '';
  const vote = s.vote_up != null ? `<span>👍 ${s.vote_up}</span>` : '';
  const lvl = s.authority_level != null ? `<span>权威 ${s.authority_level}</span>` : '';
  const url = s.url ? `<a href="${esc(s.url)}" target="_blank">原文 ↗</a>` : '';
  return `<div class="meta">${badge}${author}${vote}${lvl}${url}</div>`;
}

// ---------- 分歧区 ----------
function renderDivergence(div) {
  if (!div) return '<p>无</p>';
  if (!div.has_conflict) {
    // 降级为注意事项
    const notes = (div.point ? [div.point] : []).map((p) => `<li>${esc(p)}</li>`).join('');
    return `<ul class="sub">${notes || '<li>无</li>'}</ul>`;
  }
  const forCol = (div.for || []).map((p) => `<p>${esc(p)}</p>`).join('');
  const againstCol = (div.against || []).map((p) => `<p>${esc(p)}</p>`).join('');
  const point = div.point ? `<div class="divpoint">${esc(div.point)}</div>` : '';
  return `<div class="split">
    <div class="col for"><div class="col-title">正方</div>${forCol}</div>
    <div class="col against"><div class="col-title">反方</div>${againstCol}</div>
  </div>${point}`;
}

// ---------- 来源区 ----------
function renderSources(sources) {
  return (sources || []).map((s) => {
    const platform = s.platform ? ` <span class="src-platform">· ${esc(s.platform)}${s.author ? ' · ' + esc(s.author) : ''}</span>` : '';
    return `<li><a href="${esc(s.url)}" target="_blank">${esc(s.title)}</a>${platform}</li>`;
  }).join('');
}

// ---------- 主流程 ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataPath = path.resolve(args.data);
  const tplPath = path.join(__dirname, 'template.html');

  if (!fs.existsSync(dataPath)) {
    console.error(`未找到答案数据文件: ${dataPath}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  let tpl = fs.readFileSync(tplPath, 'utf8');

  const v = data.verdict || {};
  const sourceCount = (data.sources || []).length;
  const replacements = {
    '{{QUESTION}}': esc(data.question || ''),
    '{{QUERY_TAGS}}': renderTags(data.queries),
    '{{TRUST_PILL}}': esc(data.trustPill || `已核查 ${sourceCount} 个来源`),
    '{{CONCLUSION}}': esc(v.conclusion || ''),
    '{{CONDITIONS}}': renderConditions(v.conditions),
    '{{VERIFY_NOTE}}': renderVerify(data.verify),
    '{{EVIDENCE_TITLE}}': esc(data.titles?.evidence || '大家怎么说'),
    '{{EVIDENCE_BODY}}': renderEvidence(data.evidence),
    '{{DIVERGENCE_TITLE}}': esc(data.titles?.divergence || ((data.divergence && data.divergence.has_conflict) ? '有争议的地方' : '注意事项')),
    '{{DIVERGENCE_BODY}}': renderDivergence(data.divergence),
    '{{SOURCES_TITLE}}': esc(data.titles?.sources || '出处'),
    '{{SOURCES}}': renderSources(data.sources),
    '{{FOOTER}}': esc(data.footer || '答案由 AI 生成，请核对原文 · 知乎智搜'),
  };

  for (const [k, val] of Object.entries(replacements)) {
    tpl = tpl.split(k).join(val);
  }

  const outPath = path.resolve(args.out);
  fs.writeFileSync(outPath, tpl);
  console.log(`[渲染完成] ${outPath}`);
}

main();
