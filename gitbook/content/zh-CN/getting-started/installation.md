# 安装

**Kitsune Router 1.0.2 已授权，最终 SHA/标签、验证门槛和 npm/GHCR 发布待完成。** 包名 `@bykitsune/router`，要求 **Node.js >=22.19.0**。v1.0.1 固定于 `74583402`：GHCR 门槛在登录/推送前失败，npm publish 失败且原因未知，2026-10-27 公开读回 HTTP 404，无规范镜像或 GitHub Release。v1.0.0 固定于 `390a6567`，未发布 npm/GHCR。标签不移动；发布验证前用源码，见 [日志](/zh-CN/changelog/)。

## 发布后的启动器

```bash
npx @bykitsune/router@1.0.2
# 或：
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

检查安装使用 `npm ls -g @bykitsune/router`；卸载使用 `npm uninstall -g @bykitsune/router`，不需要删除数据。

启动器默认可能监听所有网络接口；仅本地使用时添加 `--host 127.0.0.1`，用 `kitsune-router --help` 查看选项。本地优先不是网络隔离保证。

## 源码运行

在已确认规范仓库或现有工作副本的根目录执行，不存在 `app/` 子目录。

以下仅为**全新**安装生成一次私有 `.env` 密钥（POSIX shell/OpenSSL）。`next dev` 不运行启动器生成；缺少至少 32 字符强 `JWT_SECRET` 会登录失败。升级须按 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) 保留已有有效 JWT/API/身份秘密与绝对 `DATA_DIR`。其他公开示例值也仅在全新安装时替换；不提交或输出 `.env`。

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

生产源码方式使用 `npm run build` 后 `npm run start`；`DATA_DIR` 必须是绝对路径。对外开放前设置强 `INITIAL_PASSWORD`。

默认状态为 `~/.kitsune-router` 或 Windows `%APPDATA%\kitsune-router`。活跃数据库是 `db/data.sqlite`，不是 `db.json`；保留密钥、身份和证书。旧版本须停止后整目录备份；显式 `DATA_DIR` 不搬迁。见 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)、[Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md) 和 [快速开始](/zh-CN/getting-started/quick-start/)。此文档不证明当前测试/构建通过。
