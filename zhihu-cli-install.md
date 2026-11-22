# zhihu-cli 安装与配置（知乎智搜的前置依赖）

知乎智搜（zhihuzhisou）**依赖官方 zhihu-cli**。zhihu-cli 是知乎开放平台的标准执行入口，统一封装公共内容、本人知乎 Context 和 Access Secret 管理。本 Skill 的「检索层」全部通过 zhihu-cli 完成。

> 说明：zhihu-cli 是「原子调用命令」，知乎智搜是在其之上做的「应用能力」。两者是一套：先装 zhihu-cli，再装知乎智搜。

---

## 一、zhihu-cli 是什么

| 项目 | 说明 |
|---|---|
| 入口命令 | `zhihu-cli` |
| 来源 | 知乎数据开放平台（developer.zhihu.com） |
| 鉴权 | Access Secret（写入系统密钥链，不落明文文件） |
| 支持平台 | macOS Apple Silicon / macOS Intel / Windows x64 / Linux amd64 / Linux arm64 |

---

## 二、安装方式

### 方式 A（推荐）：安装官方 zhihu-cli skill 包

官方提供标准安装入口（skill zip），装上后由 skill 的 setup 脚本自动下载 CLI：

1. 下载官方 skill 包：
   ```
   https://developer-cdn.zhihu.com/zhihu-cli/releases/stable/skill/zhihu-cli-skill.zip
   ```
2. 在你的 Agent 环境中安装该 skill。
3. 每个 Session 第一次使用前，先做一次无副作用状态检查：

```bash
# macOS / Linux
bash <skill-dir>/scripts/run.sh status

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File <skill-dir>/scripts/run.ps1 status
```

4. 若返回 `installed=false`，请求用户授权后执行 setup：

```bash
# macOS / Linux
bash <skill-dir>/scripts/setup.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File <skill-dir>/scripts/setup.ps1
```

5. setup 成功时，stdout 最后一行返回 JSON，其中 `binary_path` 是 CLI 的绝对路径：

```json
{"ok":true,"installed":true,"downloaded_cli_version":"<version>","binary_path":"/absolute/path/to/zhihu-cli","auth_configured":false,"next_action":"request_access_secret"}
```

**重要**：后续所有 CLI 调用，都必须通过这个 `binary_path` 执行，不依赖 PATH 中的裸命令。

---

## 三、配置 Access Secret（鉴权）

### 1. 申请 Access Secret

打开 <https://developer.zhihu.com/profile>，登录知乎账号，点击「申请新 Access Secret」，复制生成的密钥。

### 2. 通过标准输入写入密钥链（推荐，避免进入命令行参数）

```bash
printf '%s' '<access-secret>' | <binary_path> auth set --secret-stdin
```

> 安全要求：不得在回复、日志、Shell 历史或项目文件中重复完整 Access Secret；不把 Access Secret 写入 Skill 目录。

### 3. 验证凭证

```bash
<binary_path> auth status --verify
<binary_path> me contents --type all --limit 1
```

两条都成功，才表示初始化完成（内容列表为空也算成功）。

### 4. 凭证读取顺序

1. `ZHIHU_ACCESS_SECRET` 环境变量（CI/容器/沙箱场景用）。
2. 操作系统密钥链（桌面场景）。
3. 无凭证时返回 `AUTH_REQUIRED`。

---

## 四、核心命令速查（知乎智搜用到的）

| 能力 | 命令 |
|---|---|
| 知乎站内搜索 | `<binary_path> search zhihu --query "<关键词>" --count 10` |
| 全网搜索 | `<binary_path> search global --query "<关键词>" --count 10 [--search-db all]` |
| 知乎热榜 | `<binary_path> hot --limit 20` |
| 主题问题推荐 | `<binary_path> question recommend --query "<主题>" --count 5` |
| 问题回答摘要 | `<binary_path> question answers --question-url "<问题URL>" --limit 20` |
| 知乎直答 | `<binary_path> answer --query "<问题>" [--model zhida-fast-1p5]` |
| 查看能力清单 | `<binary_path> capabilities` |
| 查询额度 | `<binary_path> quota` |

**关键字段**（搜索返回）：`Title`（标题）、`AuthorName`（作者）、`VoteUpCount`（赞同数）、`AuthorityLevel`（权威等级 1–4）、`ContentText`（摘要/内容）、`Url`（原文链接）。

---

## 五、常见错误处理

| 错误码 | 处理方式 |
|---|---|
| `AUTH_REQUIRED` | 打开 `action_url`，申请 Access Secret 后 `auth set --secret-stdin` |
| `AUTH_INVALID` | 重新申请 Access Secret，不回显旧值 |
| `KEYCHAIN_UNAVAILABLE` | 通过宿主 Secret Store 注入 `ZHIHU_ACCESS_SECRET` |
| 服务端 `Code: 30001` | 频率限制，停止主动重试 |
| 服务端 `Code: 30002` | 配额耗尽，告知受影响能力 |

---

## 六、额度说明

- 默认统一额度项：全网搜索、知乎搜索、热榜、问题发现、直答、小工具、知识库、用户数据、创作能力。
- 问题推荐和回答摘要共用「问题发现」额度。
- 查询本身不消耗业务额度；用 `quota` 命令查看剩余额度。

---

## 七、环境记录（本机已装好，供参考）

本机 zhihu-cli 已安装并配置完毕：

- 二进制路径：`/Users/oo7/Library/Application Support/zhihu-cli/current/zhihu-cli`
- 凭证：已写入系统 Keychain，状态 `valid`
- 额度：全网/知乎搜索各 5000 次（当日）

> 以上为当前本机状态，换机器或换环境时需按本文件重新安装与配置。
