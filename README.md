# 知乎智搜（zhihuzhisou）

一个基于**知乎智能搜索**的答案引擎 Skill。它把官方 zhihu-cli 的检索能力，升级成「可溯源、懂意图、可迭代」的答案。

> 知乎直答给你一个答案，知乎智搜给你一个看得见来源的答案。

## 它解决什么问题

知乎直答能给一段很顺的总结，但不会告诉你：这句话是谁说的、原话怎么说的、凭什么信它。知乎智搜补上这层"来源"——每条结论都能点回真实的知乎原文、作者、赞同数。

## 工作原理

```
用户提问 → 拆 query → 多路检索（知乎站内 + 全网）→ 合并去重
        → 打分加权 → 取 top20 → 时效二次验证 → 渲染成 HTML 答案页
```

核心设计：

- **客观分用代码算，主观分才交给 LLM**——赞同数、权威等级用代码算，保证分数稳定；"相不相关、有没有信息量、是不是软文"才让 LLM 判断。
- **软文降权但不删**——软文里偶尔有真信号（比如"某软件已停更"）。
- **时效状态二次验证**——结论涉及"停更/涨价/下架"，去官方来源核实，不轻信搜索返回的一句话。

## 目录结构

```
zhihuzhisou/
├── SKILL.md               # Skill 主定义（定位、流程、规则）
├── zhihu-cli-install.md   # 前置依赖 zhihu-cli 的安装说明
├── references/            # 规则文档
│   ├── scoring.md             # 打分权重与算法
│   ├── scoring-interface.md   # LLM 打分输入/输出契约
│   ├── scoring-prompt.md      # LLM 打分 prompt 模板
│   ├── answer-schema.md       # 答案数据契约
│   └── layout.md              # 答案页版式规范
├── scripts/               # 可执行脚本
│   ├── run.js                 # 检索编排（多 query → 候选池 → top）
│   ├── score.js               # 打分排序函数
│   ├── render.js              # 答案页渲染
│   ├── template.html          # 答案页 HTML 模板
│   └── ablation.js            # 权重消融实验
└── assets/                # 品牌资源
    └── logo.svg
```

## 前置依赖

本 Skill 依赖官方 **zhihu-cli**，先装它：

> 请下载安装 zhihu-cli skill 并完成初始化配置
> https://developer-cdn.zhihu.com/zhihu-cli/releases/stable/skill/zhihu-cli-skill.zip

详细安装与鉴权步骤见 [`zhihu-cli-install.md`](./zhihu-cli-install.md)。

## 怎么用

1. 装好 zhihu-cli，配好 Access Secret；
2. 把本 Skill 装进你的 Agent 环境（WorkBuddy、豆包等支持装 Skill 的软件）；
3. 直接说一句，比如"有什么跨平台好用的划词软件推荐"，它会自动跑完整个流程，产出带来源的 HTML 答案页。

## License

MIT
