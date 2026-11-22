# 评分接口约定（scoring-interface）

> 本文件定义「LLM 打分」这一步的输入/输出契约，以及 top20 的取法。
> 目标：全程无人参与、可自动执行、可复现。

---

## 一、给 LLM 的输入（候选池 → LLM）

### 形式：结构化 JSON 数组，带完整正文，不截断
```json
[
  {
    "id": 1,
    "source": "zhihu",
    "title": "Pot 划词翻译推荐",
    "author": "GitHub Daily",
    "vote_up": 113,
    "authority_level": 4,
    "has_url": true,
    "content": "完整正文（知乎返回的 ContentText，实测约 300~1100 字，原样保留不截断）"
  }
]
```

字段说明：
- `id`：候选池内的唯一序号（用于回写打分结果）
- `source`：`zhihu` | `global`
- `title` / `author`：标题、作者
- `vote_up`：赞同数（VoteUpCount，无则 0）
- `authority_level`：权威等级（AuthorityLevel，1~4）
- `has_url`：是否有可点回的原文链接
- `content`：**完整正文**（不截断；实测知乎 ContentText 普遍 300~1100 字，喂给 LLM 完全合理，无需截断）

### 分批评分（已定）
- **每批 20~30 条**，分批喂给 LLM，而不是一次喂整批（50~100 条）。
- 理由：分批更稳、给分不飘，且与候选池规模天然匹配。

---

## 二、LLM 的输出（必须严格 JSON）

### 形式：按 id 返回主观分 + 软文判定，不给数值型客观分
```json
[
  { "id": 1, "relevance": 0.9, "info_density": 0.7, "is_ad": false },
  { "id": 2, "relevance": 0.3, "info_density": 0.4, "is_ad": true }
]
```

字段说明：
- `relevance`：相关性 0~1（LLM 判断，是否真正回答子问题）
- `info_density`：信息量 0~1（LLM 判断，有无真实样本/数据/代价）
- `is_ad`：是否软文（布尔，命中软文特征则 true）

### 职责边界（关键）
- **LLM 只回这三项**：相关性、信息量、软文判定。
- **客观分（可信度、传播分）由代码本地算**，不让 LLM 给——保证数值稳定、可复现。
- **总分与排序由代码算**，绝不让 LLM 排序。

---

## 三、快速取 top 20 的算法（纯代码，毫秒级）

> 本节的代码实现见 [`../scripts/score.js`](../scripts/score.js)，函数 `scoreAndRank(candidates, llmScores, topN)` 已实现打分、排序、取 top 全流程。

```
对每条候选：
  可信度 = (authority_level / 4) × 0.7 + (has_url ? 0.3 : 0)
  传播分 = log10(vote_up + 1) / log10(1000 + 1)   （封顶 1.0）
  总分   = (relevance×0.40 + 可信度×0.25 + info_density×0.20 + 传播分×0.15)
           × (is_ad ? 0.4 : 1.0)

然后：
  按总分降序 sort → slice(0, 20~30)  → 得到 top 20~30
```

要点：
- LLM 返回 `id → {relevance, info_density, is_ad}` 后，代码一次性算出总分并排序。
- 排序 + 取 top 是 **O(n log n) 的本地操作，毫秒级完成**，不依赖 LLM、不依赖人。

---

## 四、打分结果回写

- 把 LLM 返回的 `{relevance, info_density, is_ad}` 按 `id` 合并回候选池条目。
- 每条最终带：来源锚点（作者 + 赞同数 + 权威等级 + 链接）、总分、档位（保留/降权/存疑）。
- 分档阈值见 `scoring.md`（初版：≥0.65 保留，0.40~0.65 降权，<0.40 存疑）。

---

## 五、待校准项

- [ ] 每批条数（当前 20~30）是否最优
- [ ] LLM 是否严格返回 JSON（需在 prompt 中强制约束，必要时加 JSON 校验兜底）
