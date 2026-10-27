# 其他工具与 SDK

使用 OpenAI-compatible 客户端、`http://localhost:20128/v1`、已签发网关 key 和实际启用模型/组合。提供商标识为 **`kitsunerouter`**，不是命令 **`kitsune-router`**。

## Python 示例

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20128/v1",
    api_key=os.environ["KITSUNE_ROUTER_API_KEY"],
)
response = client.chat.completions.create(
    model=os.environ["KITSUNE_ROUTER_MODEL"],
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)
```

私下设置两个客户端变量，分别保存已有 key 与模型，不会自动创建 key。不要放入上游 refresh token。

OpenCode 旧预设使用 `provider.kitsunerouter` 和模型 `kitsunerouter/my-route`；V2 使用 `providers`/`package`/`settings`，不能混用。见 [完整集成](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) 的 JavaScript、Codex TOML 和 Claude Code 源站示例。

远程须使用自己的 HTTPS 地址，没有默认 Kitsune 托管端点。健康路径 `/api/health`，目录 `/v1/models`；测试不证明实时权限/账单，遵守配额与取消。见 [排查](/zh-CN/troubleshooting/) 和 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
