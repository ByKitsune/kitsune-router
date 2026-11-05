# 快速开始

**Your models. Your routes.** 无需 ByKitsune 账户或固定顺序；启动器要求 Node.js >=22.19.0。

**1.0.8 已发布到 npm、GitHub Release 和规范 GHCR。** 此版本修复了 SQLite/tray 依赖保留问题；产物标识、验证结果和获取方式以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准。GHCR 匿名 pull-grant 观测到 HTTP 401，须与认证读取分开判断；仅凭该响应不能断言 visibility 为 private，也不能推断发布工作流缺少写入权限。

**1.0.7 发布历史与已知问题：** 从不可变源码 `b7f77d07` 发布到 npm、GHCR 和 GitHub Release 的 1.0.7，已确认存在顺序执行 `--no-save` 安装时 SQLite/tray 相互裁剪的问题。修复内容及各渠道的实际结果以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准；旧标签和历史产物保持不变。

**1.0.2 历史记录（当时的验证结果）：** **Your models. Your routes.** 无需 ByKitsune 账户或固定顺序。**1.0.2 容器已私有发布，匿名拉取待确认，npm 受阻。** Runtime 固定于 `65c8b97d`。先用 [源码](/zh-CN/getting-started/installation/) 或 [获授权私有容器](/zh-CN/deployment/cloud/)；下列命令仅 **npm** 发布/读回成功后适用，要求 Node.js >=22.19.0。容器发布不等于 npm 启动器已发布。

## 1.0.8 启动器

```bash
npx @bykitsune/router@1.0.8
```

## 配置

1. 对外开放前在私密环境设置强 `INITIAL_PASSWORD`，打开 `http://localhost:20128/dashboard`。
2. 连接有权使用的 OAuth/API-key 提供商。网关不授予上游订阅或无限额度。
3. 创建/复制网关 key，在客户端环境保存为 `KITSUNE_ROUTER_API_KEY`。变量本身不会创建 key。
4. 从真实模型列表选择路由，或创建名为 `my-route` 的示例组合。

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

健康检查只检查网关/存储，不证明上游权限。OpenAI-compatible 基址为 `http://localhost:20128/v1`。新工具提供商标识是 **`kitsunerouter`**，命令是 **`kitsune-router`**。见 [Codex](/zh-CN/integration/codex/) 与 [Claude Code](/zh-CN/integration/claude-code/) 的不同配置。

升级前停止旧网关及辅助进程，备份整个私密状态并阅读 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。不要为了改名新建空卷或更换加密盐/受信任证书。
