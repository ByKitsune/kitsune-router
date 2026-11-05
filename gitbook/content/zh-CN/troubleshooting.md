# 故障排查

先收集当前版本/SHA、绝对 `DATA_DIR`、准确路由与脱敏错误。不要为名称差异删除状态、覆盖工具配置或公开秘密。

## 启动与迁移

**发布历史与修复准备：** 1.0.7 已从不可变源码 `b7f77d07` 发布到 npm、GHCR 和 GitHub Release，但存在顺序执行 `--no-save` 安装时 SQLite/tray 相互裁剪的已知问题。1.0.8 尚未发布，正在等待精确源码 CI 与常规安装候选验证；各渠道的实际结果与已知问题以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准。

- 包找不到：当前目标为 `@bykitsune/router@1.0.8`。先在 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)确认 npm 发布和读回；未确认时使用 [源码安装](/zh-CN/getting-started/installation/)。不要把旧版 E403 当作当前失败原因，应以实际 registry 结果判断，也不要在聊天或日志中分享 token。
- GHCR 拉取拒绝/找不到：请在 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)及 [Docker 指南](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)核对 `1.0.8` 标签、摘要、发布／读回结果与所需权限。认证读取与匿名读取是不同检查，不应将权限遮蔽的响应直接认定为未发布。
- 旧 Node：需 >=22.19.0，迁移须支持 Node/Bun 原生 SQLite 快照，不做不安全原始复制。
- 端口占用：仪表盘/API 共用 20128，识别拥有者并正常停止，不广泛 `pkill`/`kill -9`。
- 状态空白：先查绝对路径和 `/app/data` 挂载；显式 `DATA_DIR` 阻止搬迁。
- 迁移拒绝：停止源进程/辅助，查安全性、完整性、所有权及已有目标，不盲删锁。见 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
- 受限 Linux：生产不可读 same-UID 所有权仍拒绝继续，测试隔离不代表普遍允许非 root 搬迁。停止备份后，可显式 `DATA_DIR` 原地使用或请求特权审查，不能忽略权限。限定 UID 65534 smoke 不证明普遍支持或最终标签。

### 1.0.2 故障历史（不代表当前版本状态）

- 包找不到：1.0.2 源码已验证，但 npm publish 被 E403 拒绝（2FA 或启用 bypass 2fa 的 granular token），公开读回 HTTP 404。用户将在 GitHub UI 自行替换 secret，尚未确认完成；不要分享 token。先用 [源码安装](/zh-CN/getting-started/installation/)，等待发布/读回验证。1.0.1 npm 原因仍未知。
- GHCR 拉取拒绝/找不到：1.0.2 已发布且认证读回/smoke 通过，但最近包仍 **private**，匿名 grant HTTP 401。所有者选择 Public 但未确认完成；请用获授权私有读取，或等待 Public 和无认证读回确认，不把隐藏权限拒绝误判为未发布。早期 preflight/context 失败保留于 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md#publication-recovery-without-moving-the-tag)。不要分享 token。

## 客户端

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

用网关 key，不用上游 refresh token。OpenAI-compatible 使用 `/v1`；Claude Code 用源站；Codex 用 TOML、`kitsunerouter` 和 Responses。命令仍是 `kitsune-router`，保留其他设置。

404/410 查准确模型；429/503 遵守重试/重置和取消；文档/参数不支持时显式换路由或请求，不静默删除。未知费用不是免费，估算不是账单。日志可含私密内容；不要上传目录、`.env`、密钥或证书。提交 [issue](https://github.com/ByKitsune/kitsune-router/issues) 时给最小脱敏复现。见 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。
