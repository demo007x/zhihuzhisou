/**
 * 知乎智搜 · 评分与排序函数
 * 用法：见文件底部 main() 示例；或 require 后调用 scoreAndRank(candidates, llmScores, topN)
 *
 * 职责：
 *  1. 合并 LLM 返回的主观分（relevance / info_density / is_ad）到候选条目
 *  2. 用客观字段（authority_level / has_url / vote_up）本地算分
 *  3. 加权求总分 + 软文惩罚
 *  4. 降序排序 → 取 top N
 *
 * 原则：LLM 只给主观分，客观分、总分、排序全部由本模块算，保证稳定可复现。
 */

// 权重（与 references/scoring.md 一致）
const W = {
  relevance: 0.40, // 相关性（LLM）
  credibility: 0.25, // 可信度（客观）
  infoDensity: 0.20, // 信息量（LLM）
  spread: 0.15, // 传播信号（客观）
};

// 软文惩罚系数（不归零）
const AD_PENALTY = 0.4;

// 分档阈值
const TIER_KEEP = 0.65; // >= 保留
const TIER_LOW = 0.40; // 0.40~0.65 降权；<0.40 存疑

/** 可信度：authority_level(1~4) 归一化 ×0.7 + 可溯源加分 0.3 */
function credibility(authorityLevel, hasUrl) {
  const lv = Number(authorityLevel) || 0;
  const base = (Math.min(Math.max(lv, 0), 4) / 4) * 0.7;
  const bonus = hasUrl ? 0.3 : 0;
  return Math.min(base + bonus, 1.0);
}

/** 传播分：log10(赞+1)/log10(1001)，封顶 1.0 */
function spread(voteUp) {
  const v = Number(voteUp) || 0;
  const s = Math.log10(v + 1) / Math.log10(1000 + 1);
  return Math.min(s, 1.0);
}

/** 单条总分 */
function totalScore(c) {
  const rel = clamp01(c.relevance);
  const info = clamp01(c.infoDensity);
  const cred = credibility(c.authority_level, c.has_url);
  const spr = spread(c.vote_up);
  const raw =
    rel * W.relevance + cred * W.credibility + info * W.infoDensity + spr * W.spread;
  const penalty = c.is_ad ? AD_PENALTY : 1.0;
  return raw * penalty;
}

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(n, 0), 1);
}

function tierOf(score) {
  if (score >= TIER_KEEP) return '保留';
  if (score >= TIER_LOW) return '降权';
  return '存疑';
}

/**
 * 主函数：合并 LLM 打分 → 算总分 → 排序 → 取 top N
 * @param {Array} candidates 候选池（含 id, authority_level, has_url, vote_up 等）
 * @param {Array} llmScores  LLM 返回 [{id, relevance, info_density, is_ad}]
 * @param {Number} topN      取前 N 条，默认 20
 * @returns {Array} 排序后、带 score/tier 的前 topN 条
 */
function scoreAndRank(candidates, llmScores, topN = 20) {
  const scoreMap = new Map();
  for (const s of llmScores || []) {
    scoreMap.set(s.id, {
      relevance: s.relevance,
      info_density: s.info_density,
      is_ad: !!s.is_ad,
    });
  }

  const scored = (candidates || []).map((c) => {
    const s = scoreMap.get(c.id) || { relevance: 0, info_density: 0, is_ad: false };
    const merged = { ...c, ...s };
    const score = totalScore(merged);
    return { ...merged, score: round2(score), tier: tierOf(score) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------- 可独立运行示例 ----------
function main() {
  // 示例：候选池（模拟 zhihu-cli 检索后合并去重的结果）
  const candidates = [
    { id: 1, source: 'zhihu', title: 'Pot 划词翻译推荐', author: 'GitHub Daily', vote_up: 113, authority_level: 4, has_url: true },
    { id: 2, source: 'zhihu', title: 'PC 文本选择增强工具汇总', author: '梁川', vote_up: 2, authority_level: 4, has_url: true },
    { id: 3, source: 'global', title: 'Pot-Desktop 终极解决方案', author: 'gitblog_00087', vote_up: 0, authority_level: 2, has_url: true },
    { id: 4, source: 'global', title: '欧路词典（词典类，非划词）', author: '厂商', vote_up: 0, authority_level: 2, has_url: false },
    { id: 5, source: 'zhihu', title: 'STranslate 划词翻译实测', author: '寄辰晞', vote_up: 18, authority_level: 4, has_url: true },
  ];

  // 示例：LLM 返回的主观分
  const llmScores = [
    { id: 1, relevance: 0.9, info_density: 0.7, is_ad: false },
    { id: 2, relevance: 0.6, info_density: 0.6, is_ad: false },
    { id: 3, relevance: 0.2, info_density: 0.2, is_ad: true },
    { id: 4, relevance: 0.1, info_density: 0.1, is_ad: true },
    { id: 5, relevance: 0.8, info_density: 0.6, is_ad: false },
  ];

  const top = scoreAndRank(candidates, llmScores, 3);
  console.log(JSON.stringify(top, null, 2));
}

// 作为脚本直接运行时执行示例；作为模块被 require 时不执行
if (require.main === module) {
  main();
}

module.exports = { scoreAndRank, totalScore, credibility, spread, W, AD_PENALTY };
