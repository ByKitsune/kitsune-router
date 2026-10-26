# Kitsune Router

**Your models. Your routes.**

中立、多提供商、本地优先的 AI 网关，由 [ByKitsune](https://bykitsune.com) 维护和赞助。你选择模型、账户和回退顺序；无需 ByKitsune 账户，也不强制使用任何托管 API。推理请求仍会发送到你配置的上游，“本地优先”不代表离线推理。

[English](README.md) · [仓库](https://github.com/ByKitsune/kitsune-router) · [更新日志](CHANGELOG.md) · [迁移指南](docs/MIGRATION.md)

## 发布状态

**1.0.0 是首次重大品牌迁移版本的提案，尚待最终验证和发布。** 目标仓库为 `ByKitsune/kitsune-router`，npm 包为 `@bykitsune/router`，命令为 `kitsune-router`，规范镜像为 `ghcr.io/bykitsune/kitsune-router`。外部命名空间注册/所有权、npm 发布权限、镜像可见性及实际产物仍待确认。下面的包/镜像命令仅在成功发布后适用；目前可使用源码工作副本。

0.x 发布说明中的 ZenRouter 名称、包和镜像保留其历史含义，不能当作已发布的 Kitsune 0.x 产物。参阅 [1.0.0 发布草案](releases/RELEASE_NOTES_v1.0.0.md)。

## 安装和启动

启动器要求 **Node.js >=22.19.0**：

```bash
# 仅在 1.0.0 发布后：
npx @bykitsune/router@1.0.0
# 或：
npm install -g @bykitsune/router@1.0.0
kitsune-router
```

源码方式（在仓库根目录运行，没有 `app/` 子目录；目标仓库尚不可用时使用现有工作副本）：

以下生成密钥仅用于**全新源码安装**（POSIX shell 和 OpenSSL）。`next dev` 不经过启动器的自动密钥配置；`JWT_SECRET` 必须为至少 32 字符的强随机值，否则登录失败。升级/迁移必须保留原有有效 `JWT_SECRET`、`API_KEY_SECRET`、`MACHINE_ID_SALT` 和绝对 `DATA_DIR`，先阅读 [迁移](docs/MIGRATION.md)。

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

对外开放前，在私密环境中设置强 `INITIAL_PASSWORD`。打开 `http://localhost:20128/dashboard`，连接你有权使用的提供商，创建/复制网关 API key，然后从当前目录选择模型或创建组合。

启动前审阅 `.env`：全新安装使用可写绝对数据路径和私有 API/身份密钥，不使用公开示例值；升级保留旧值。不要提交 `.env` 或在日志/issue 输出秘密。

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

这里的 `KITSUNE_ROUTER_API_KEY` 是客户端保存已签发网关 key 的环境变量，不会自动创建 key。客户端 API 基址为 `http://localhost:20128/v1`。健康检查或模型列表不证明上游账号权限或实时可用性。

## 集成与路由

- 命令是 **`kitsune-router`**，外部工具的新提供商标识是 **`kitsunerouter`**，二者不能混用。
- Codex 使用 `~/.codex/config.toml` 中的 `model_provider = "kitsunerouter"` 和 `[model_providers.kitsunerouter]`，`wire_api = "responses"`。
- Claude Code 的 `ANTHROPIC_BASE_URL` 使用 `http://localhost:20128`，由客户端追加 `/v1/messages`；不要重复添加 `/v1`。
- 编辑器使用 OpenAI-compatible 模式和 `/v1` 基址。优先审阅仪表盘预设，保留已有提供商、代理和 MCP 配置。
- 组合和账户池由你配置，不强制“订阅→低价→免费”的顺序，也不绕过配额、地域限制或服务条款。

详见 [集成示例](docs/INTEGRATIONS.md)、[处理速度](docs/PROCESSING-SPEED.md) 和 [推理预算](docs/REASONING-BUDGETS.md)。

## 安全迁移与持久化

先停止旧网关、托盘以及 MITM/隧道辅助进程，并备份**整个私密数据目录**。未设置 `DATA_DIR` 时，首次启动可发现 `~/.zenrouter` 或 `~/.9router`，验证一致的 SQLite 快照和复制文件后创建 `~/.kitsune-router`；Windows 使用 `%APPDATA%` 下的对应目录。保留源文件，拒绝覆盖已有目标。显式 `DATA_DIR` 始终优先，不会自动搬迁。

除 `db/data.sqlite` 外，还须保留 `secrets.json`、`machine-id`、`auth/` 和 `mitm/`。加密派生常量和现有受信任证书根保持不变；不能为了改名删除密钥或重新生成证书。并非所有提供商凭据都保证静态加密。Docker 持久化 `/app/data`，迁移时继续使用原卷，不要创建空卷替代。

项目环境变量改为 `KITSUNE_ROUTER_*`，扩展头改为 `x-kitsune-router-*`；无前缀的密钥和 `DATA_DIR` 保持原含义和值。标准 `/v1/*`、`/v1beta/*` 和端口 **20128** 不变；不要求旧命令或旧提供商标识别名。先阅读 [迁移指南](docs/MIGRATION.md)。

## 能力与边界

提供协议转换、多账户/模型回退、用量统计，以及可选 RTK/Headroom 等压缩功能。支持情况取决于具体传输与模型；无法表示的参数或文档可能明确拒绝。没有固定节省比例、无限免费额度或不中断运行的保证。成本估算不是账单；未知价格不等于免费，订阅积分不等于 API 美元费用。

容器发布仅面向 **linux/amd64**。规范目标为 `ghcr.io/bykitsune/kitsune-router:1.0.0`，需先核实发布和访问权限；Docker Hub 镜像只是可选镜像源。远程部署须自行配置认证、HTTPS 和代理策略。云同步已移除，不存在默认托管 Kitsune 服务。详见 [安装](docs/INSTALLATION.md)、[Docker](DOCKER.md)、[运维](docs/OPERATIONS.md)、[架构](docs/ARCHITECTURE.md) 和 [测试说明](tests/README.md)。本次文档更新不声称已验证当前测试或构建。

## 致谢与许可证

延续 ZenRouter/9Router 的历史，感谢其作者和贡献者（包括 Joy），以及 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)、[RTK](https://github.com/rtk-ai/rtk)、[Caveman](https://github.com/JuliusBrussee/caveman) 和 [Ponytail](https://github.com/DietrichGebert/ponytail) 的实现和思路。ByKitsune 是现任维护方/赞助方；品牌迁移不替换上游版权声明、历史证据或原始产物来源。MIT 许可证，见 [LICENSE](LICENSE)。
