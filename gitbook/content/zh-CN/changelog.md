# 更新日志

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
