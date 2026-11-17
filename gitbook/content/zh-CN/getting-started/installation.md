# 安装

启动器要求 **Node.js >=22.19.0**。

**1.0.8 已发布到 npm、GitHub Release 和规范 GHCR。** 此版本修复了 SQLite/tray 依赖保留问题；产物标识、验证结果和获取方式以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准。GHCR 匿名 pull-grant 观测到 HTTP 401，须与认证读取分开判断；仅凭该响应不能断言 visibility 为 private，也不能推断发布工作流缺少写入权限。

**1.0.7 发布历史与已知问题：** 从不可变源码 `b7f77d07` 发布到 npm、GHCR 和 GitHub Release 的 1.0.7，已确认存在顺序执行 `--no-save` 安装时 SQLite/tray 相互裁剪的问题。修复内容及各渠道的实际结果以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准；旧标签和历史产物保持不变。

**1.0.2 历史记录（当时的验证结果）：** **1.0.2 源码已验证，容器已私有发布，npm 受阻。** Runtime 固定于 `65c8b97d`。Recovery `40485038668` 发布 GHCR，认证摘要/来源/SPDX 读回及已发布镜像 smoke 通过。包仍为 **private**，Public 选择未确认，匿名 grant HTTP 401。可用源码或 [获授权私有容器](/zh-CN/deployment/cloud/)。npm `@bykitsune/router` 仍 E403/公开读回 HTTP 404，用户 token 替换未确认。下列命令仅 npm 发布/读回成功后适用，要求 **Node.js >=22.19.0**。见 [证据](/zh-CN/changelog/)。

## 1.0.8 启动器

```bash
npx @bykitsune/router@1.0.8
# 或：
npm install -g @bykitsune/router@1.0.8
kitsune-router
```

检查安装使用 `npm ls -g @bykitsune/router`；卸载使用 `npm uninstall -g @bykitsune/router`，不需要删除数据。

启动器默认可能监听所有网络接口；仅本地使用时添加 `--host 127.0.0.1`，用 `kitsune-router --help` 查看选项。本地优先不是网络隔离保证。

## 源码运行

在已确认规范仓库或现有工作副本的根目录执行，不存在 `app/` 子目录。

以下仅为**全新**安装生成一次私有 `kitsune-router.source.env` 密钥（POSIX shell/Node.js）。`next dev` 不运行启动器生成；缺少至少 32 字符强 `JWT_SECRET` 会登录失败。升级须按 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) 保留已有有效 JWT/API/身份秘密与绝对 `DATA_DIR`。其他公开示例值也仅在全新安装时替换；不提交或输出 `kitsune-router.source.env`。

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
# Keep runtime secrets outside the checkout and standalone build.
kitsune_env="$(dirname "$PWD")/kitsune-router.source.env"
node --input-type=module - "$kitsune_env" "$PWD/.data" <<'NODE'
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const values = {
  JWT_SECRET: randomBytes(32).toString("hex"),
  API_KEY_SECRET: randomBytes(32).toString("hex"),
  MACHINE_ID_SALT: randomBytes(32).toString("hex"),
  INITIAL_PASSWORD: randomBytes(24).toString("hex"),
  DATA_DIR: process.argv[3],
};
try {
  writeFileSync(process.argv[2], Object.entries(values).map(([key, value]) =>
    `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error.code !== "EEXIST") throw error; // Preserve an existing installation.
}
NODE
chmod 600 "$kitsune_env"
npm ci
npm run check:deps
# Parse env as data; keep --env-file out of Next worker NODE_OPTIONS.
node --env-file="$kitsune_env" -e '
const result = require("node:child_process").spawnSync(process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--port", "20128", "--hostname", "127.0.0.1"],
  { env: process.env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
'
```

生产源码方式使用 `npm run build` 后 `HOSTNAME=127.0.0.1 node --env-file="$kitsune_env" .next/standalone/custom-server.js`；`DATA_DIR` 必须是绝对路径。对外开放前设置强 `INITIAL_PASSWORD`。

默认状态为 `~/.kitsune-router` 或 Windows `%APPDATA%\kitsune-router`。活跃数据库是 `db/data.sqlite`，不是 `db.json`；保留密钥、身份和证书。旧版本须停止后整目录备份；显式 `DATA_DIR` 不搬迁。见 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)、[Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md) 和 [快速开始](/zh-CN/getting-started/quick-start/)。此文档不证明当前测试/构建通过。
