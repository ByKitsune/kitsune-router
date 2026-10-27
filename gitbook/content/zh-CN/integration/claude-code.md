# Claude Code 集成

启动 Kitsune Router、连接有权使用的上游并创建/复制网关 key；选择支持 Messages 的模型或组合。无需 ByKitsune 账户。`my-route` 是需要自行创建的示例组合。

## 配置客户端

Claude Code 自行追加 `/v1/messages`，基址应使用**不带 `/v1` 的源站**：

```bash
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="$KITSUNE_ROUTER_API_KEY"
claude --model my-route
```

变量保存已签发的网关 key，不会创建 key，也不应包含上游 refresh token。测试时只在当前会话设置，保留原有设置。

仪表盘修改 `~/.claude/settings.json` 中的 `env`，不是虚构顶级 `baseUrl`/`defaultModel`。先审阅和备份。Claude Desktop 是另一产品，本文不是其通用配置方法。

`/api/health` 与认证 `/v1/models` 只检查网关/目录，不证明工具、媒体、文档能力或账户权限。远程使用自己的 HTTPS 源站，不附加 `/v1`，没有默认 Kitsune 托管端点。见 [完整集成](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) 和 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
