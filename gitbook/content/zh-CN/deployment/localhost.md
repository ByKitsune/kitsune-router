# 本地部署

仪表盘和 API 共用 **20128**，不是 3000。1.0.2 源码已在不可变标签 `65c8b97d` 验证，registry 发布受阻。先用 [源码安装](/zh-CN/getting-started/installation/)，要求 Node.js >=22.19.0。标签与本地测试不证明 registry 可用，发布/读回验证后再用包命令 `kitsune-router`。

- 仪表盘：`http://localhost:20128/dashboard`
- API 基址：`http://localhost:20128/v1`
- 健康检查：`http://localhost:20128/api/health`
- 默认状态：`~/.kitsune-router` 或 `%APPDATA%\kitsune-router`

```bash
DATA_DIR=/absolute/private/path kitsune-router
```

显式 `DATA_DIR` 优先且不搬迁。使用启动器或 `Ctrl+C` 正常停止，避免广泛杀进程或并发写入。停止后备份整个目录，含 SQLite、秘密、机器身份、auth 和证书。不要覆盖活跃状态或放宽权限。

默认迁移可验证复制停止的 `~/.zenrouter`/`~/.9router`，保留原件、拒绝覆盖目标。阅读 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)，保留加密派生输入和受信任根。对外开放前设置强初始密码。源码需绝对数据路径；参阅 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md) 和 `.env.example`，不采用旧 Node 20/`db.json` 指令。
