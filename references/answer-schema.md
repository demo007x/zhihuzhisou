# 答案数据契约（answer-schema）

> 定义「答案页」填充时输入的数据结构。render.js 按此契约读取 JSON，填充 HTML 模板。
> 该 JSON 由「LLM 成稿」步骤产出（在 top20~30 素材 + 时效验证结论的基础上）。

---

## 一、完整结构

```json
{
  "question": "有什么跨平台好用的划词软件推荐？",
  "queries": ["跨平台划词翻译工具", "划词+OCR", "Mac/Win/Linux 通用"],
  "titles": { "evidence": "怎么选", "divergence": "有争议的地方", "sources": "出处" },
  "verdict": {
    "conclusion": "跨平台和持续维护目前不可兼得……",
    "conditions": ["只要Windows：装STranslate", "必须跨平台：Pot仍可用但已停更"],
    "reversal": "若Pot恢复维护或出现新的跨平台替代，结论需更新"
  },
  "verify": {
    "done": true,
    "date": "2026-11-21",
    "note": "以下维护状态均已二次验证（GitHub archived / 官网公告）"
  },
  "evidence": {
    "type": "compare",   // compare | steps | facts | multi_view
    "items": [
      {
        "title": "Pot",
        "fields": { "平台": "Win/macOS/Linux", "维护状态": "已停更(2026-09-07)", "是否跨平台": "是" },
        "source": { "author": "官方仓库", "vote_up": 0, "authority_level": 4, "url": "https://github.com/pot-app/pot-desktop" },
        "tier": "保留"
      }
    ]
  },
  "divergence": {
    "has_conflict": true,
    "for": ["要跨平台→选Pot，功能完整但停更"],
    "against": ["要持续维护→选STranslate，但仅Windows"],
    "point": "跨平台和持续维护不可兼得，按真实平台选"
  },
  "sources": [
    { "title": "Pot 官方仓库(archived)", "author": "GitHub", "platform": "GitHub", "url": "https://github.com/pot-app/pot-desktop" }
  ]
}
```

---

## 二、字段说明

| 字段 | 说明 |
|---|---|
| `question` | 用户原始问题 |
| `queries` | 拆出的子问题标签 |
| `titles` | 板块标题（可选）。evidence 默认「大家怎么说」、divergence 默认「有争议的地方/注意事项」、sources 默认「出处」；可按问题类型覆盖，如对比类 evidence 用「怎么选」、教程类用「怎么做」 |
| `verdict.conclusion` | 一句话人话结论 |
| `verdict.conditions` | 适用条件（分人/分场景，数组） |
| `verdict.reversal` | 反转信号（什么情况下结论失效） |
| `verify` | 时效验证信息（done/date/note） |
| `evidence.type` | 证据形态：compare(对比表)/steps(步骤)/facts(事实)/multi_view(多方) |
| `evidence.items` | 证据条目（对比表用 fields 键值对；其他形态用统一字段） |
| `evidence.items[].tier` | 可信度档：保留/降权/存疑 |
| `divergence` | 分歧区（has_conflict=false 时降级为"注意事项"） |
| `sources` | 来源清单 |

---

## 三、可信度 tier 与视觉映射

| tier | 颜色 | 含义 |
|---|---|---|
| 保留 | 🟢 绿 | 高相关 + 可信 + 有信息量 |
| 降权 | 🟡 橙 | 软文/相关弱/单一来源 |
| 存疑 | 🟠 红 | 单一来源且无法交叉验证 |

---

## 四、待定

- [ ] `evidence.items` 对非对比表形态（steps/facts/multi_view）的字段是否统一，还是分形态定义
- [ ] 结论区是否要支持多段（当前只有一句 conclusion + 条件列表）
