#!/usr/bin/env node
/**
 * 知乎智搜 · 编排脚本（run.js）
 *
 * 职责：把「拆 query → 检索 → 合并去重 → 规范化 → 打分排序 → top20~30」自动串起来。
 * 边界：本脚本负责「检索 + 合并去重 + 打分排序」的确定性部分；
 *       「拆 query」和「LLM 打分」是 AI 步骤，由调用方（Agent）在脚本外完成，
 *       脚本对这两步留了清晰的输入/输出接口。
 *
 * 用法：
 *   node run.js --queries "跨平台划词翻译,划词OCR工具,免费开源翻译软件" --zhihu-count 10 --global-count 10
 *   （--queries 逗号分隔多个 query，每个 query 都跑两路检索后合并去重）
 *   （也兼容单数 --query）
 *   输出：
 *     1) 候选池 candidates.json（规范化、去重后，供 LLM 打分）
 *     2) top20~30 结果（若提供了 llmScores 则打分排序，否则仅输出候选池）
 *
 * 可选参数：
 *   --queries <a,b,c>  多个 query（逗号分隔）
 *   --query <q>        单个 query（兼容）
 *   --zhihu-count <n>  每个 query 站内搜索条数（默认 8，上限 10）
 *   --global-count <n> 每个 query 全网搜索条数（默认 8）
 *   --scores <file>    LLM 打分结果 JSON（[{id,relevance,info_density,is_ad}]）
 *   --top <n>          取前 N 条（默认 20）
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { scoreAndRank } = require('./score.js');

// ---------- 参数解析 ----------
function parseArgs(argv) {
  const args = { zhihuCount: 8, globalCount: 8, top: 20 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--queries') args.queries = next;
    else if (a === '--query') args.queries = next; // 单数兼容
    else if (a === '--zhihu-count') args.zhihuCount = parseInt(next, 10);
    else if (a === '--global-count') args.globalCount = parseInt(next, 10);
    else if (a === '--scores') args.scoresFile = next;
    else if (a === '--top') args.top = parseInt(next, 10);
  }
  // 解析 query 列表（逗号/顿号分隔，去空、去重）
  args.queryList = args.queries
    ? args.queries.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
    : [];
  return args;
}

// ---------- 定位 zhihu-cli ----------
function findCli() {
  const candidates = [
    path.join(process.env.HOME, 'Library', 'Application Support', 'zhihu-cli', 'current', 'zhihu-cli'),
    'zhihu-cli',
  ];
  for (const c of candidates) {
    try {
      // 官方 CLI 不支持 --version，用 capabilities 探测（无需凭证）
      execFileSync(c, ['capabilities'], { stdio: 'ignore' });
      return c;
    } catch (_) { /* try next */ }
  }
  return null;
}

// ---------- 检索（调 zhihu-cli）----------
function search(cli, scope, query, count) {
  const raw = execFileSync(cli, ['search', scope, '--query', query, '--count', String(count)], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const data = JSON.parse(raw);
  const items = (data && data.Data && data.Data.Items) || [];
  return items;
}

// ---------- 规范化一条结果 ----------
function normalize(item, scope) {
  return {
    source: scope,
    title: item.Title || '',
    author: item.AuthorName || '',
    vote_up: Number(item.VoteUpCount) || 0,
    authority_level: Number(item.AuthorityLevel) || 0,
    has_url: !!item.Url,
    url: item.Url || '',
    content: item.ContentText || '', // 完整正文，不截断（实测 300~1100 字，无需截断）
  };
}

// ---------- 去重（按 url 优先，无 url 按 title+author）----------
function dedup(list) {
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const key = it.url || `${it.title}::${it.author}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// ---------- 主流程 ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.queryList.length) {
    console.error('用法: node run.js --queries "关键词1,关键词2,关键词3" [--zhihu-count 10] [--global-count 10] [--scores scores.json] [--top 20]');
    process.exit(1);
  }

  const cli = findCli();
  if (!cli) {
    console.error('未找到 zhihu-cli，请先安装并配置（见 zhihu-cli-install.md）');
    process.exit(1);
  }

  // 1. 多 query × 两路检索
  let raw = [];
  for (const q of args.queryList) {
    try {
      const zh = search(cli, 'zhihu', q, args.zhihuCount);
      raw = raw.concat(zh.map((it) => normalize(it, 'zhihu')));
    } catch (e) { console.error(`知乎搜索失败(${q}):`, e.message); }
    try {
      const gl = search(cli, 'global', q, args.globalCount);
      raw = raw.concat(gl.map((it) => normalize(it, 'global')));
    } catch (e) { console.error(`全网搜索失败(${q}):`, e.message); }
  }

  // 2. 合并去重
  const candidates = dedup(raw);

  // 3. 分配 id
  candidates.forEach((c, i) => { c.id = i + 1; });

  // 4. 输出候选池（供 LLM 打分）
  const candidatesPath = path.join(process.cwd(), 'candidates.json');
  fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2));
  console.log(`[检索完成] 合并去重后候选池 ${candidates.length} 条 → ${candidatesPath}`);

  // 5. 若有 LLM 打分结果，则打分排序取 top
  if (args.scoresFile && fs.existsSync(args.scoresFile)) {
    const llmScores = JSON.parse(fs.readFileSync(args.scoresFile, 'utf8'));
    const top = scoreAndRank(candidates, llmScores, args.top);
    const topPath = path.join(process.cwd(), 'top.json');
    fs.writeFileSync(topPath, JSON.stringify(top, null, 2));
    console.log(`[打分完成] 取 top ${top.length} 条 → ${topPath}`);
    console.log(JSON.stringify(top.map((t) => ({ id: t.id, title: t.title, score: t.score, tier: t.tier })), null, 2));
  } else {
    console.log(`[提示] 未提供 --scores，已输出候选池。请将 candidates.json 交给 LLM 打分，`);
    console.log(`       再把结果存为 [{id,relevance,info_density,is_ad}]，用 --scores 重新运行以取 top。`);
  }
}

main();
