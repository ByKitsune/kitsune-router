# Kitsune Router

**Your models. Your routes.**

由 [ByKitsune](https://bykitsune.com) 维护和赞助的中立、多提供商、本地优先 AI 网关。你选择模型、账户与回退顺序；无需 ByKitsune 账户或购买托管服务。请求仍会发送到配置的上游，本地优先不等于离线推理。

[完整中文说明](../README.zh-CN.md) · [English](../README.md) · [仓库](https://github.com/ByKitsune/kitsune-router) · [更新日志](../CHANGELOG.md)

## 发布与安装

**1.0.0 为首次重大品牌迁移版本提案，尚待最终验证与发布。** 外部命名空间注册/所有权、npm 发布授权、镜像访问和实际产物仍待确认。目标为 `ByKitsune/kitsune-router`、`@bykitsune/router`、命令 `kitsune-router` 和规范镜像 `ghcr.io/bykitsune/kitsune-router`；不能把历史 0.x 产物改写为已发布的 Kitsune 包。

要求 **Node.js >=22.19.0**。以下仅在发布后使用：

```bash
npm install -g @bykitsune/router@1.0.0
kitsune-router
# 或：npx @bykitsune/router@1.0.0
```

源码运行（目标仓库不可用时使用现有工作副本，在根目录操作）：

以下仅为**全新**安装生成一次私有 `.env` 密钥（POSIX shell/OpenSSL）。`next dev` 不运行启动器密钥生成；缺少至少 32 字符的强 `JWT_SECRET` 会导致登录失败。迁移保留已有有效 `JWT_SECRET`、`API_KEY_SECRET`、`MACHINE_ID_SALT` 和绝对 `DATA_DIR`。审阅文件，仅全新安装替换公开示例值；不提交或输出 `.env`。

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

对外开放前设置强 `INITIAL_PASSWORD`，打开 `http://localhost:20128/dashboard`，连接有权使用的提供商，创建/复制网关 key。客户端基址为 `http://localhost:20128/v1`，从 `/v1/models` 选择实际模型；`/api/health` 不是上游可用性证明。

## 集成

命令为 **`kitsune-router`**，提供商标识为 **`kitsunerouter`**。Codex 使用 `~/.codex/config.toml`：

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

`my-route` 是须自行创建的组合；环境变量保存已签发的网关 key，不会创建 key。Claude Code 使用 `ANTHROPIC_BASE_URL=http://localhost:20128`，由客户端追加 `/v1/messages`。审阅预设时保留其他工具配置。参阅 [集成](../docs/INTEGRATIONS.md)。

## 迁移与安全

停止旧网关及辅助进程并备份整个目录。默认可将 `~/.zenrouter` 或 `~/.9router` 验证迁移至 `~/.kitsune-router`（Windows 为 `%APPDATA%`）；源文件保留，不覆盖已有目标。显式 `DATA_DIR` 优先。保留 SQLite、`secrets.json`、`machine-id`、`auth/`、`mitm/`，不能仅备份数据库或为改名更换加密盐/受信任根证书。不要假设所有凭据都已静态加密。

项目变量为 `KITSUNE_ROUTER_*`、扩展头为 `x-kitsune-router-*`、新工具标识为 `kitsunerouter`。标准 `/v1/*` 和端口 20128 不变；不要求旧命令/标识别名。Docker 继续挂载原卷到 `/app/data`，仅发布 linux/amd64。参阅 [迁移](../docs/MIGRATION.md)、[安装](../docs/INSTALLATION.md)、[Docker](../DOCKER.md) 与 [运维](../docs/OPERATIONS.md)。

压缩节省因工作负载而异；没有无限额度、永久免费服务或零停机保证。成本估算不是账单，未知不等于免费；账号权限、上游条款和地域限制仍适用。没有默认托管服务，旧云同步已移除。本次文档更新不证明当前测试/构建通过；见 [发布草案](../releases/RELEASE_NOTES_v1.0.0.md)。

## 致谢与许可证

感谢 ZenRouter/9Router 作者与贡献者（包括 Joy），以及 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)、[RTK](https://github.com/rtk-ai/rtk)、[Caveman](https://github.com/JuliusBrussee/caveman)、[Ponytail](https://github.com/DietrichGebert/ponytail)。保留上游版权与历史产物来源。MIT，见 [LICENSE](../LICENSE)。
