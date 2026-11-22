#!/usr/bin/env node
/**
 * 权重消融实验（ablation.js）
 *
 * 目的：用真实候选池 + 人工标注的 ground-truth 主观分，
 *       比较不同权重组合下的排序结果，找出更接近"理想排序"的权重。
 *
 * 方法：
 *   1. 固定候选池（真实检索数据）
 *   2. 人工标注每条的相关性/信息量/软文（ground-truth 主观分）
 *   3. 遍历多组权重，各算一次总分排序
 *   4. 用 Kendall Tau 衡量每组排序 vs 理想排序的吻合度
 *   5. 输出各组 Kendall Tau，供选择权重参考
 */

const { scoreAndRank, totalScore } = require('./score.js');

// ---------- 真实候选池（16 条，来自 run.js 检索）----------
const candidates = require('./candidates.json');

// ---------- 人工标注 ground-truth（主观分）----------
// 基于真实内容判断：
//  - 相关性：是否真回答"跨平台划词软件推荐"
//  - 信息量：有无真实样本/数据/代价
//  - is_ad：软文/下载站/矩阵号营销
const GT = {
  1:  { relevance: 0.9, info_density: 0.7, is_ad: false },  // GitHub Daily Pot 介绍，高赞真测评
  2:  { relevance: 0.6, info_density: 0.6, is_ad: false },  // 梁川 文本增强汇总，相关但杂
  3:  { relevance: 0.5, info_density: 0.4, is_ad: false },  // 12款软件，Pot 只占一条
  4:  { relevance: 0.4, info_density: 0.3, is_ad: false },  // 夸张标题，泛泛
  5:  { relevance: 0.8, info_density: 0.6, is_ad: false },  // 寄辰晞 STranslate/Pot 实测
  6:  { relevance: 0.7, info_density: 0.4, is_ad: false },  // Pot 介绍，一般
  7:  { relevance: 0.2, info_density: 0.2, is_ad: false },  // 好用到爆的软件，跑题
  8:  { relevance: 0.6, info_density: 0.4, is_ad: false },  // Pot 介绍
  9:  { relevance: 0.5, info_density: 0.4, is_ad: false },  // Pot 官网类
  10: { relevance: 0.5, info_density: 0.3, is_ad: false },  // TTime
  11: { relevance: 0.3, info_density: 0.2, is_ad: true  },  // CSDN 矩阵软文
  12: { relevance: 0.1, info_density: 0.1, is_ad: true  },  // 下载站
  13: { relevance: 0.3, info_density: 0.2, is_ad: true  },  // CSDN 软文
  14: { relevance: 0.3, info_density: 0.2, is_ad: true  },  // CSDN 软文
  15: { relevance: 0.3, info_density: 0.2, is_ad: true  },  // CSDN 软文
  16: { relevance: 0.3, info_density: 0.2, is_ad: true  },  // CSDN 软文
};

// 转成 llmScores 数组
const llmScores = Object.entries(GT).map(([id, v]) => ({ id: Number(id), ...v }));

// ---------- 理想排序（人工判断的"正确答案优先级"）----------
// 真正有价值的：1(GitHub Daily实测) > 5(STranslate实测) > 2 > 6/8 > ... > 软文(11-16)
const idealOrder = [1, 5, 2, 6, 8, 3, 9, 10, 4, 7, 11, 13, 14, 15, 16, 12];

// ---------- 不同的权重组合（待测）----------
const weightSets = {
  '当前 40/25/20/15': { relevance: 0.40, credibility: 0.25, infoDensity: 0.20, spread: 0.15 },
  '均衡 25/25/25/25': { relevance: 0.25, credibility: 0.25, infoDensity: 0.25, spread: 0.25 },
  '重相关性 50/20/20/10': { relevance: 0.50, credibility: 0.20, infoDensity: 0.20, spread: 0.10 },
  '重可信 30/40/15/15': { relevance: 0.30, credibility: 0.40, infoDensity: 0.15, spread: 0.15 },
  '轻传播 45/30/20/5': { relevance: 0.45, credibility: 0.30, infoDensity: 0.20, spread: 0.05 },
};

// ---------- 软文惩罚系数（待测）----------
const adPenalties = [0.3, 0.4, 0.5, 0.6, 1.0];

// ---------- 工具：按权重打分排序 ----------
function rankByWeight(candidates, llmScores, W, adPenalty) {
  const scoreMap = new Map(llmScores.map((s) => [s.id, s]));
  const scored = candidates.map((c) => {
    const s = scoreMap.get(c.id) || { relevance: 0, info_density: 0, is_ad: false };
    const rel = clamp01(s.relevance);
    const info = clamp01(s.info_density);
    const cred = credibility(c.authority_level, c.has_url);
    const spr = spread(c.vote_up);
    const raw = rel * W.relevance + cred * W.credibility + info * W.infoDensity + spr * W.spread;
    const score = raw * (s.is_ad ? adPenalty : 1.0);
    return { id: c.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.id);
}

function clamp01(x) { const n = Number(x); if (Number.isNaN(n)) return 0; return Math.min(Math.max(n, 0), 1); }
function credibility(lv, hasUrl) { const base = (Math.min(Math.max(Number(lv) || 0, 0), 4) / 4) * 0.7; return Math.min(base + (hasUrl ? 0.3 : 0), 1.0); }
function spread(v) { const s = Math.log10((Number(v) || 0) + 1) / Math.log10(1001); return Math.min(s, 1.0); }

// ---------- Kendall Tau：衡量排序 vs 理想排序 ----------
function kendallTau(rank, ideal) {
  const pos = new Map(rank.map((id, i) => [id, i]));
  let concordant = 0, discordant = 0;
  for (let i = 0; i < ideal.length; i++) {
    for (let j = i + 1; j < ideal.length; j++) {
      const a = ideal[i], b = ideal[j];
      const pa = pos.get(a), pb = pos.get(b);
      if (pa == null || pb == null) continue;
      if ((pa - pb) * (i - j) > 0) concordant++;
      else if ((pa - pb) * (i - j) < 0) discordant++;
    }
  }
  const n = ideal.length;
  return (concordant - discordant) / (n * (n - 1) / 2);
}

// top-k 命中率：理想前 5 是否都在结果前 8
function topkHit(rank, ideal, k = 5, windowSize = 8) {
  const topIdeal = ideal.slice(0, k);
  const topRank = rank.slice(0, windowSize);
  const hit = topIdeal.filter((id) => topRank.includes(id)).length;
  return hit / k;
}

// ---------- 主流程 ----------
function main() {
  console.log('=== 权重消融实验 ===\n');
  console.log('候选池', candidates.length, '条；理想排序：', idealOrder.join(','), '\n');

  console.log('--- A. 不同权重组合（软文惩罚固定 0.4）---');
  console.log('权重组合'.padEnd(22), 'KendallTau'.padEnd(12), 'Top5命中');
  for (const [name, W] of Object.entries(weightSets)) {
    const rank = rankByWeight(candidates, llmScores, W, 0.4);
    const tau = kendallTau(rank, idealOrder);
    const hit = topkHit(rank, idealOrder);
    console.log(name.padEnd(22), tau.toFixed(3).padEnd(12), hit.toFixed(2));
  }

  console.log('\n--- B. 不同软文惩罚系数（权重固定 40/25/20/15）---');
  console.log('惩罚系数'.padEnd(12), 'KendallTau'.padEnd(12), 'Top5命中');
  for (const p of adPenalties) {
    const rank = rankByWeight(candidates, llmScores, weightSets['当前 40/25/20/15'], p);
    const tau = kendallTau(rank, idealOrder);
    const hit = topkHit(rank, idealOrder);
    console.log(String(p).padEnd(12), tau.toFixed(3).padEnd(12), hit.toFixed(2));
  }

  console.log('\n--- C. 当前权重(40/25/20/15, 惩罚0.4)的完整排序 ---');
  const cur = rankByWeight(candidates, llmScores, weightSets['当前 40/25/20/15'], 0.4);
  console.log(cur.map((id) => `${id}(${(candidates.find(c=>c.id===id)||{}).title||''}).slice(0,12)`).join(' > '));
}

main();
