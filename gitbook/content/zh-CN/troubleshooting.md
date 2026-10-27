# 故障排查

先收集当前版本/SHA、绝对 `DATA_DIR`、准确路由与脱敏错误。不要为名称差异删除状态、覆盖工具配置或公开秘密。

## 启动与迁移

- 包找不到：1.0.1 尚待发布，v1.0.0 标签未发布 npm/GHCR；npm 登录不证明发布权限。核实 `@bykitsune/router` 并先用 [源码安装](/zh-CN/getting-started/installation/)。
- 旧 Node：需 >=22.19.0，迁移须支持 Node/Bun 原生 SQLite 快照，不做不安全原始复制。
- 端口占用：仪表盘/API 共用 20128，识别拥有者并正常停止，不广泛 `pkill`/`kill -9`。
- 状态空白：先查绝对路径和 `/app/data` 挂载；显式 `DATA_DIR` 阻止搬迁。
- 迁移拒绝：停止源进程/辅助，查安全性、完整性、所有权及已有目标，不盲删锁。见 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
- 受限 Linux：生产不可读 same-UID 所有权仍拒绝继续，测试隔离不代表普遍允许非 root 搬迁。停止备份后，可显式 `DATA_DIR` 原地使用或请求特权审查，不能忽略权限。限定 UID 65534 smoke 不证明普遍支持或最终标签。

## 客户端

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

用网关 key，不用上游 refresh token。OpenAI-compatible 使用 `/v1`；Claude Code 用源站；Codex 用 TOML、`kitsunerouter` 和 Responses。命令仍是 `kitsune-router`，保留其他设置。

404/410 查准确模型；429/503 遵守重试/重置和取消；文档/参数不支持时显式换路由或请求，不静默删除。未知费用不是免费，估算不是账单。日志可含私密内容；不要上传目录、`.env`、密钥或证书。提交 [issue](https://github.com/ByKitsune/kitsune-router/issues) 时给最小脱敏复现。见 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。
