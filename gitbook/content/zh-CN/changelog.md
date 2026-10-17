# 更新日志

## 0.9.11: 2026-10-17

本版修复定制 ZenRouter 网关的多轮视觉、推理参数、原生协议错误和缓存计费估算。

- 图片在工具结果、压缩后的历史、文本压缩及跨供应商转换中保持多模态类型，不再把 base64 序列化成普通文本。
- 保留 thinking 配置、工具 ID、签名及 SSE/JSON 错误。不支持的原生参数明确报错；无效请求不会让健康账户进入冷却。
- 按供应商产品及完整模型 ID 对照 10 月 17 日的 models.dev 数据，独立处理上下文、输入和输出上限，区分未知费用与免费零值。
- 价格编辑器只保存实际修改的覆盖项。Gemini 2.5 Pro 和 Flash-Lite 仍对已符合条件的项目保留展示；此前的全球退役结论不正确。

**安全警告：**应用和 CLI 仍包含未解决的 [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)，GitHub 尚未列出修复版本。协议测试不证明真实账户权限或实际账单。

[发布说明](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/releases/RELEASE_NOTES_v0.9.11.md) · [技术变更](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/docs/CHANGELOG_v0.9.11.md)

## 0.9.10 — 2026-10-16

本补丁版包含 0.9.9 发布后、对审计发现进行代码复核时所做的更改。npm 版本不可变，因此这些更改此前不在任何已发布版本中。无破坏性 API 变更；首次启动时会自动添加两个数据库列。

### 修复

**已停用模型不再被宣传。** `gemini-2.5-pro` 与 `gemini-2.5-flash-lite` 均返回 404 *"is no longer available to new users"* —— 分别复现 5/5 与 2/2，并有 30 天生产日志佐证。两者此前都被列出且看似可用。现在它们被隐藏，但 id 保留在注册表中，因此已保存的组合会解析为明确的失败而非 404。

**十五个 `deprecated` 模型仍在被提供。** 该标记存在且有文档，但仅被面板 UI 使用 —— API 路径上根本没有任何过滤。在一个 deepseek 连接处于活动状态时复现：两个已停用的兼容别名被列出。现已过滤，并有一个重要区分：**提供商级**的 `deprecated: true` 是针对 claude/codex/antigravity/… 的 ToS 风险提示，不得隐藏该提供商的模型。

**Gemini 上下文窗口是被扣留，而非未知。** 十一个记录声明窗口未验证，从而将其置空；由于 `/v1/models` 仅在值为有限数时才输出 `context_length`，**334 个模型中有 17 个**在到达客户端时完全没有窗口。models.dev 的官方条目为这些 id 公布了 1,048,576，且路由确实在提供服务，因此删除该数值是最差的选择。现在缺少窗口的模型降至 **12** 个，且每一个都是确实无法提供或确实未经验证。

**两个静默数据丢失的翻译缺陷。** `openai-to-cursor` 用硬编码的 32000 覆盖客户端的 `max_tokens` —— 请求 200 的客户端收到了 32000；该常量现在是下限而非覆盖。`openai-to-commandcode` 将格式错误的工具参数变成 `{}` 且没有任何提示，模型因此收到一个没有参数的工具调用，且没有任何迹象表明数据丢失。

### 新增

**TTFT 终于可测量。** 流式处理器早已计算首令牌时间并打印出来，但从未存储 —— 这正是审计必须解析 304 行日志才能报告 5,471 ms 中位数的原因。现在它被持久化到可空列（写入 NULL 而非 0，避免未测量的请求拉低中位数），并作为 `zenrouter_ttft_ms{quantile=...}` 在 `/api/metrics` 上公开。

### 说明

本版本有三项发现来自复核既有结论而非轻信：审计报告有 **3** 个模型 `context_length` 为空，实际为 **17** 个；`gemini-3.5-flash-lite` 与真正停用的模型一同出现，但返回 **HTTP 200**（此前的 429 是配额）；而 250,000 其实是 `claude-sonnet-4-6` 的 *Antigravity 桥接*上限，Anthropic API 窗口为 1,000,000。

## 0.9.9 — 2026-10-15

> **从 0.9.7 升级？本版本同时包含 0.9.8。** 0.9.8 批次于 2026-10-13 准备但当时未发布，后于 **2026-10-16 补发**为独立版本，各注册表的 `latest` 仍保持 0.9.9。0.9.9 是 `v0.9.7` 到 `v0.9.9` 之间的 45 个提交，因此包含 0.9.8 的全部内容——严重依赖告警清除与 Tier-1 上游移植——以及以下全部内容。**建议使用 0.9.9：** 0.9.8 不包含以下任何审计修复。

本版本回应一次外部审计（11 份文档）以及对 [models.dev](https://models.dev) 的全量目录校验。每一处问题在修改前都已在运行中的网关上复现，每个修复都附带回归测试。需要 **Node.js >=22.19.0**。包名仍为 `@joyccn/zenrouter`，命令仍为 `zenrouter`。无破坏性 API 变更。

### 安全

**单个客户端不再能耗尽所有上游。** `apiKeys` 表完全没有配额列，`validateApiKey()` 只返回布尔值，因此没有任何东西限制*客户端*的消耗——唯一的限制是面板登录限流和*上游*账户冷却。`/v1` 现在按密钥限流（600 RPM、120/秒突发，可用 `V1_RATE_LIMIT_RPM`/`V1_RATE_LIMIT_BURST` 调整），桶标识经过哈希、计数器表有上限，429 返回 `Retry-After` 与 `x-ratelimit-*`。默认值来自实测流量（峰值约 246 请求/分钟 → 约 30 倍余量）。

**内部路由细节不再泄漏。** 生产环境返回 `"No active credentials for provider: openai"`，暴露了上游提供商。图像、视频、搜索、tts、stt、embeddings、fetch 与 Gemini 原生处理程序中都存在同样措辞。客户端现在收到中性消息；Zen 自身生成的机器可读诊断（`output_budget_exhausted` 等）仍会转发。

**账户邮箱已从日志中移除。** journald 中有 589 行包含 27 个唯一邮箱，因为 `connectionName` 解析为 `displayName || name || email || id`。身份现在是加盐的短哈希——仍可检索和区分，但不可逆。

**被吊销的令牌按永久处理，而非临时。** `token_revoked` 不匹配任何规则，落入通用 401 冷却，于是一个已失效的账户每 2 分钟被重试一次：生产环境 8 小时内 31 次事件，其中一个账户被重试 16 次。现在改为 1 小时冷却并带有 `needs_reauth` 状态。刷新尝试被有意保留：与组织策略拒绝不同，被吊销的令牌仍可能通过有效的刷新令牌恢复。

**基础安全响应头与显式 CORS 白名单。** 网关通过 Cloudflare 隧道对外发布（`zen.hlcyn.xyz` → `127.0.0.1:20128`），因此这不是表面文章。

### 修复

**自动更新恢复可用。** 代码使用未注册（返回 404）的裸名称 `zenrouter` 查询 npm，因此 `/api/version` 始终报告 `latestVersion: null`，更新器的安装命令也会失败。现在带作用域的 `@joyccn/zenrouter` 是版本路由、更新器与落地页共用的唯一常量。

### 路由与错误

**上下文溢出不再被报告为 502。** 过长的提示在 200 OK 的 SSE 流内以 `context_length_exceeded` 形式到达，并被转换成 503 → 502。ByKitsune 会重试 502，于是一个永远不可能成功的提示被反复重试，同时每个健康账户依次被锁定 30 秒。现在返回 400 与 `invalid_request_error`，且不轮换账户。

**上下文窗口被低报最多 778k token。** `/v1/models` 把 Codex CLI 的上限（872,000；GPT-5.6 为 272,000）作为 `context_length` 发布。实测：宣称 272,000 的模型实际接受 402,486 token，宣称 872,000 的接受 902,486 token，真实上限为 922,000。GPT-6/GPT-5.6 现在报告 API 规范（1,050,000 / 922,000 / 128,000）；CLI 上限保留在 `limits.cliDefaultContext`/`cliMaxContext`。

**流中途失败现在会标记账户。** 此前在 200 响应头之后失败的账户仍留在轮换中，导致每个请求都返回 200 与截断内容且从不故障转移——这是基于状态码的监控看不到的故障。客户端断开无法进入该分支。

**上游的 `Retry-After` 曾是死代码。** `checkFallbackError` 接受一个 `Response` 来读取该响应头，但没有任何调用方传入，因此返回 `Retry-After: 3600` 的上游在几秒后就被重试。

**意外异常会被记录。** 一个裸 `catch {}` 返回通用 500，同时给客户端一个在日志中根本不存在的 `serverRequestId`。现在会连同该 id 记录错误名称、消息与堆栈。提示与响应内容永不记录。

### 翻译

`top_p`、`stop`/`stop_sequences`、`seed` 与 `metadata.user_id` 在多段转换中丢失，因此设置 `stop: ["</end>"]` 的客户端在网关路由到 Claude 时会收到未截断的输出。工具失败结果通过 OpenAI 工具消息并不存在的非标准 `is_error` 字段传达，接收模型可能据此认为工具执行成功；现在改为内容内的 `[tool_error]` 标记。

### 目录

依据 models.dev 官方厂商条目修正了五个窗口：`gpt-4.1*`（1,000,000 → 1,047,576）、`command-a-translate-08-2025`（128,000 → 8,000，超报 16 倍）、`ministral-3b/8b/14b`（128,000 → 131,072/262,144）、`codestral-latest`（128,000 → 256,000）。朴素比较报告了 206 处差异，排除单位惯例（256000 与 262144）和网关自有上限后，真实差异为 5 处。ChatGPT 账户拒绝的四个 Codex 路由（`gpt-5.5`、`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.3-codex-spark`）现在带有 `routeAvailable: false` 与机器可读原因。

### 新端点

`GET /api/health` 现在是真正的探针：真实读取数据库，存储不可用时返回 **503**，并报告运行时长、版本、被锁定账户数与需重新认证数。`GET /api/metrics` 提供 Prometheus 文本（使用的模型、按状态码的失败数、在途请求），需令牌访问且严格聚合。

### 校验与限制

隔离测试套件：**1,436 个文件、4,525 个用例 — 4,424 通过、0 失败**；`npx eslint .` 干净。注册表基线逐字节一致。已在隔离 `DATA_DIR` 上运行时验证：健康 JSON、安全响应头、CORS 白名单、带 `Retry-After` 的 429，以及未认证时 metrics 返回 401。目录工作属于元数据：不构成账户权益或实时可用性保证，且有 448 行在 models.dev 中没有参照。本版本并非无漏洞：`node-forge` 公告仍无上游修复，其受影响路径仍不可达，这一点由测试断言。

## 0.9.8 — 2026-10-13

清除默认分支上的严重依赖告警，并合入 9router 上游同步分析的 Tier-1 批次。二十项变更，每项独立提交并测试。需要 **Node.js >=22.19.0**。包名仍为 `@joyccn/zenrouter`，命令仍为 `zenrouter`。无破坏性 API 变更。

### 安全

**已清除严重项：** `proxy-addr`（GHSA-jqcg-44mw-7w3h，通过 IPv4 映射 IPv6 信任子网进行 IP 欺骗）仅来自 `express`，而后者虽在 `dependencies` 中声明却从未被导入。该依赖被移除而非固定版本；锁文件减少 40 个传递依赖。`marked` 与 `selfsigned`（仅测试使用，现为 devDependency）一并移除。

**本版本并非无漏洞，也不作此声明。** `node-forge` GHSA-86w9-cpqp-85rv（高危）上游尚无补丁（1.4.0 为最新）。其唯一生产消费者只解析、生成、签发和序列化证书，从不调用签名验证函数，因此受影响的 RSA PKCS#1 v1.5 验证路径在此代码库中不可达 —— 现由测试断言。

### 用量与计费

OpenAI 兼容的流式请求现在发送 `include_usage`，缓存命中按缓存价格计费而非按字符估算。Codex 图像请求将真实 token 计入用量历史。带 effort 后缀的模型按基础模型价格计费，而非 `$0`。

### 路由与回退

表示"额度耗尽"的 400 现在会继续尝试组合中的下一个模型。聊天端点支持 `x-connection-id` 账户固定并自动回退。模型选择器不再展示连接全部禁用的提供商。

### 翻译与协议

`strict` 工具声明在双向翻译中保留。Chat 的 `response_format` 映射为 Responses 的 `text.format`，Responses 专有的 `text` 字段在返回时移除。CommandCode 输出被限制在其真实的 200k schema 上限。

### 目录

Antigravity Claude Sonnet 5.5 / Opus 5.5、CodeBuddy CN `kimi-k2.8-preview` 与 `deepseek-v4.1-flash`、LongCat 2.5、对齐 3.8 世代的 MITM 映射，以及新增的 ParalonCloud 提供商。目录条目仅为声明，不代表账户权益或实际可用性。

### 验证

隔离测试套件：**1,386 个文件、4,335 个用例 —— 4,234 通过、100 跳过、1 todo、0 失败**（Node 24.19.0）；lint 零警告。注册表基线逐字节一致。生产构建与隔离 `DATA_DIR` 的 standalone 冒烟测试通过；未使用生产账户或计费推理。

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.8) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.8.md) · [Release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.8.md) · [Previous release 0.9.7 (historical)](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md)

---

## 0.9.7 — 2026-10-06

本版本汇总此前已合并的全部维护变更；版本号升级本身不增加独立产品功能。需要 **Node.js >=22.19.0**。包名仍为 `@joyccn/zenrouter`，命令仍为 `zenrouter`。

### 目录与客户端身份

新增 **120 个提供商/模型条目**（100 个聊天、8 个图像、6 个嵌入、6 个 TTS）及 **342 条有来源的元数据记录**；**827 个历史条目仍未逐项验证**。区分 API、IDE/OAuth 和编程套餐的限制、价格及未知值。修复提供商/定价别名、模型传输选择、免认证发现、跨服务类型重复 ID、实时/自定义能力、输入/上下文/输出限制及长上下文/自定义定价。非 token 计费不伪装成 token 单价，未知价格不代表免费。更新已研究的客户端身份和 Gemini/Copilot 端点专用请求头，不赋予额外 beta 权限。

### 推理与用量

显式及可空输出上限和提供商原生思考模式保留到最终序列化，不暗中提高付费上限。保留 Responses 推理字段，并依据 Claude 实际出站交错支持处理预算，包括 beta 被拒后的重试。记录预算耗尽尝试的真实用量，Gemini 思考 token 只合并一次；保留未完成终态、部分输出和拒绝，避免终态后取消的重复持久化及组合流被误判为空而重放。不新增自动扩大预算的重试。Codex OAuth、OpenCode Muse 和 Cursor 仍不执行公开 API 的上限；token 上限不是总金额预算。

### 有依据的网络搜索

裸提供商名称与 `provider/search` 选择服务默认值，而非上游模型名。派发前验证显式选择及组合成员所属关系。Antigravity 使用独立 sandbox、真实项目/request/session ID、模型/思考映射、Google Search 和每账户严格代理策略。从答案和引用上下文中排除 `thought: true`。特定 Gemini 模型 404 只尝试一个账户；准确匹配但含义不明的 Antigravity 资源 404 最多尝试 **三个**，不为健康账户写入冷却。成功只清除对应搜索范围，其他认证/配额回退不变。

### 依赖、安装器与界面

升级 React **19.3.0**、ESLint **10.12.0**、Vitest **5.0.3**/Vite **8.3.2**、Undici **8.11.2**。保留 Node 22 dispatcher、CONNECT、DNS 固定、取消和严格代理失败时禁止直连的策略，移除未使用依赖。安装器验证准确的最低运行时和新链接的 CLI。打包 Monaco **0.57.0** 及同源 worker，修复文档 markdown/语言切换和 React 警告，同时保留草稿与 hydration 安全。有限 ESM 边界不改变 CommonJS 启动器；保留可选 SQLite 回退。

### 发布保护

手动 npm/Docker 流程要求真实稳定标签及精确源提交；npm provenance 也必须匹配 dispatch ref/SHA。发布前保存原始 tarball，重试时根据 registry SHA512 校验恢复。全局串行化和数字版本比较阻止旧版本重试覆盖更新的 `latest`；缺少原始恢复 artifact 时安全停止。

### 验证、安全与升级限制

既有验证覆盖隔离测试、零警告 lint、应用/CLI 构建、文档导出、浏览器检查及真实 loopback/standalone SQLite 搜索与用量验收。最终本地发布验证：Node 22.23.2 上 **494 个测试文件，4,091 项通过，100 项跳过，1 项 todo，零失败**；零错误/警告 lint、CLI 打包与 Docker 冒烟测试均通过。未使用生产账户、真实上游推理、新增付费重试或自动部署。目录研究 **不证明账户权限或上游实际可用性**。

TLS 验证保持开启；自签名例外仅限具体测试请求，不是全局设置。**node-forge 和 braces 的安全公告仍未解决**，不宣称本版本没有漏洞。发布后可安装 `@joyccn/zenrouter@0.9.7` 或使用固定镜像 `joyccn/zenrouter:0.9.7`。容器发布流程仅面向 **linux/amd64**；持久化 **/app/data** 并在升级前备份。文档不证明发布已完成或标签已可用。

---

[GitHub 发布](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.7) · [完整变更日志](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [技术详情](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.7.md) · [发布说明](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md) · [上一版本 0.9.6（历史记录）](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.6.md)
