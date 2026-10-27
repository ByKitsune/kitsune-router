# Codex CLI 集成

命令为 `kitsune-router`，新提供商标识为 **`kitsunerouter`**。先连接有权使用的上游，创建/复制网关 key。这不会授予 Codex/OpenAI 订阅或所有原生功能。

## 配置

合并到 `~/.codex/config.toml`，不是 `config.json`：

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

先创建 `my-route` 组合，或换成准确启用模型 ID。环境变量保存已签发的网关 key，不会创建 key。仪表盘预设也可写静态 Authorization 头；将该文件视为秘密，保留其他设置，不替换整个配置目录。

## 检查

使用 `/api/health` 和认证的 `/v1/models` 检查网关，然后 `codex --model my-route`。远程使用自己的 HTTPS `/v1` 端点，localhost 不是云服务。目录不证明权限、吞吐或账单；不支持的文档/参数可能明确拒绝。见 [速度](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md)、[完整集成](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) 和 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
