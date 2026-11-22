# LLM 打分 Prompt 模板（scoring-prompt）

> 用于「候选池 → LLM 逐条打分」这一步。目的：让 LLM 稳定、严格地返回 JSON 主观分。
> 配合 `scripts/run.js` 使用：run.js 产出 `candidates.json`，用下方 prompt 喂 LLM，把 LLM 返回的 JSON 存成 `scores.json`，再用 `--scores` 取 top。

---

## 一、System Prompt（固定不变）

```
你是一个搜索结果的评估器。你的任务是对一批候选内容逐条打分，判断它们对回答"用户问题"的价值。

规则：
1. 只输出 JSON，不要输出任何解释、Markdown 代码块、或多余文字。
2. 逐条给出三项：
   - relevance：相关性 0~1（这条内容是否真正回答了用户的子问题）
   - info_density：信息量 0~1（是否有真实样本/数据/具体代价，还是空话套话）
   - is_ad：是否软文/营销内容（布尔 true/false）
3. 判定软文 is_ad=true 的信号：标题极度夸张（"终极""全网最强""月入过万"）、
   正文带带货引流话术（"加我""找我""免费下载链接"）、作者是内容农场/矩阵号、同源批量灌水。
4. 只按给定字段判断，不要臆测、不要补充信息。
5. 输出格式必须是 JSON 数组，例如：
   [{"id":1,"relevance":0.9,"info_density":0.7,"is_ad":false}]
```

## 二、User Prompt（每批拼接）

```
用户问题：<用户原始问题>

候选内容（JSON 数组，每条含完整正文 content）：
<candidates.json 的内容，每批 20~30 条>

请逐条打分，严格按 System 要求输出 JSON 数组。
```

---

## 三、使用要点

- **分批评分**：候选池 50~100 条，每批 20~30 条喂一次，结果拼接。
- **严格 JSON**：若 LLM 返回了 Markdown 代码块或多余文字，需先剥离再 `JSON.parse`；解析失败则重试。
- **id 对齐**：LLM 返回的 `id` 必须与 candidates.json 中的 `id` 一一对应，漏掉的条目按 {relevance:0, info_density:0, is_ad:false} 兜底。

---

## 四、待定

- [ ] 是否在 System Prompt 里补充"硬约束词必须严格匹配"的说明（如用户要求"跨平台"，则单平台内容相关性给低分）
- [ ] 是否需要对"存疑（单一来源）"单独加一个输出字段
