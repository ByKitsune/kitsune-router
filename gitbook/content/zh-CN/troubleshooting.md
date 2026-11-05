# 故障排查

先收集当前版本/SHA、绝对 `DATA_DIR`、准确路由与脱敏错误。不要为名称差异删除状态、覆盖工具配置或公开秘密。

## 启动与迁移

**1.0.8 已发布到 npm、GitHub Release 和规范 GHCR。** 此版本修复了 SQLite/tray 依赖保留问题；产物标识、验证结果和获取方式以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准。GHCR 匿名 pull-grant 观测到 HTTP 401，须与认证读取分开判断；仅凭该响应不能断言 visibility 为 private，也不能推断发布工作流缺少写入权限。

**1.0.7 发布历史与已知问题：** 从不可变源码 `b7f77d07` 发布到 npm、GHCR 和 GitHub Release 的 1.0.7，已确认存在顺序执行 `--no-save` 安装时 SQLite/tray 相互裁剪的问题。修复内容及各渠道的实际结果以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准；旧标签和历史产物保持不变。

- 包找不到：`@bykitsune/router@1.0.8` 的 npm 发布与 registry 读回已确认。请对照[发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)核对精确版本、所用 registry 及网络／代理设置；不要将旧版 E403 当作当前原因，也不要在聊天或日志中分享 token。
- GHCR 拉取拒绝/找不到：`1.0.8` 已发布。请在[发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)及 [Docker 指南](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)核对标签、摘要与所需权限。匿名 pull-grant 的 HTTP 401 不证明 visibility 设置，须与已完成的认证发布验证分别看待。
- 旧 Node：需 >=22.19.0，迁移须支持 Node/Bun 原生 SQLite 快照，不做不安全原始复制。
- 端口占用：仪表盘/API 共用 20128，识别拥有者并正常停止，不广泛 `pkill`/`kill -9`。
- 状态空白：先查绝对路径和 `/app/data` 挂载；显式 `DATA_DIR` 阻止搬迁。
- 迁移拒绝：停止源进程/辅助，查安全性、完整性、所有权及已有目标，不盲删锁。见 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
- 受限 Linux：生产不可读 same-UID 所有权仍拒绝继续，测试隔离不代表普遍允许非 root 搬迁。停止备份后，可显式 `DATA_DIR` 原地使用或请求特权审查，不能忽略权限。限定 UID 65534 smoke 不证明普遍支持或最终标签。

### 1.0.2 故障历史（不代表当前版本状态）

- 包找不到：`@bykitsune/router@1.0.8` 的 npm 发布与 registry 读回已确认。请对照[发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)核对精确版本、所用 registry 及网络／代理设置；不要将旧版 E403 当作当前原因，也不要在聊天或日志中分享 token。
- GHCR 拉取拒绝/找不到：`1.0.8` 已发布。请在[发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)及 [Docker 指南](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)核对标签、摘要与所需权限。匿名 pull-grant 的 HTTP 401 不证明 visibility 设置，须与已完成的认证发布验证分别看待。

## 客户端

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

用网关 key，不用上游 refresh token。OpenAI-compatible 使用 `/v1`；Claude Code 用源站；Codex 用 TOML、`kitsunerouter` 和 Responses。命令仍是 `kitsune-router`，保留其他设置。

404/410 查准确模型；429/503 遵守重试/重置和取消；文档/参数不支持时显式换路由或请求，不静默删除。未知费用不是免费，估算不是账单。日志可含私密内容；不要上传目录、`.env`、密钥或证书。提交 [issue](https://github.com/ByKitsune/kitsune-router/issues) 时给最小脱敏复现。见 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。
