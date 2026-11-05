# 本地部署

仪表盘和 API 共用 **20128**，不是 3000。

**1.0.8 已发布到 npm、GitHub Release 和规范 GHCR。** 此版本修复了 SQLite/tray 依赖保留问题；产物标识、验证结果和获取方式以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准。GHCR 匿名 pull-grant 观测到 HTTP 401，须与认证读取分开判断；仅凭该响应不能断言 visibility 为 private，也不能推断发布工作流缺少写入权限。

**1.0.7 发布历史与已知问题：** 从不可变源码 `b7f77d07` 发布到 npm、GHCR 和 GitHub Release 的 1.0.7，已确认存在顺序执行 `--no-save` 安装时 SQLite/tray 相互裁剪的问题。修复内容及各渠道的实际结果以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准；旧标签和历史产物保持不变。

**1.0.2 历史记录（当时的验证结果）：** 仪表盘和 API 共用 **20128**，不是 3000。Runtime 1.0.2 固定于 `65c8b97d`，容器已 **私有发布**，匿名访问待确认，npm 受阻。可用 [源码安装](/zh-CN/getting-started/installation/)（Node.js >=22.19.0）或 [获授权私有容器](/zh-CN/deployment/cloud/)。下列启动器命令仅 npm 发布/读回成功后适用。

## 1.0.8 本地使用

- 仪表盘：`http://localhost:20128/dashboard`
- API 基址：`http://localhost:20128/v1`
- 健康检查：`http://localhost:20128/api/health`
- 默认状态：`~/.kitsune-router` 或 `%APPDATA%\kitsune-router`

```bash
DATA_DIR=/absolute/private/path kitsune-router
```

显式 `DATA_DIR` 优先且不搬迁。使用启动器或 `Ctrl+C` 正常停止，避免广泛杀进程或并发写入。停止后备份整个目录，含 SQLite、秘密、机器身份、auth 和证书。不要覆盖活跃状态或放宽权限。

默认迁移可验证复制停止的 `~/.zenrouter`/`~/.9router`，保留原件、拒绝覆盖目标。阅读 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)，保留加密派生输入和受信任根。对外开放前设置强初始密码。源码需绝对数据路径；参阅 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md) 和 `.env.example`，不采用旧 Node 20/`db.json` 指令。
