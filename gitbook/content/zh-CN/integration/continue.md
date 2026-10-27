# Continue 集成

Continue 不同版本的配置格式不同。使用已安装版本的 OpenAI-compatible 设置，不用旧 JSON/YAML 示例覆盖整个配置。

```text
API base: http://localhost:20128/v1
API key: 已签发的 Kitsune Router 网关 key
Model: 准确启用模型 ID 或已创建组合
```

先连接允许的上游、创建 key 并查看 `/v1/models`。按需为每个模型角色配置路由；聊天路由不自动提供嵌入或补全，需分别选择支持的端点/模型类型。

需要时自定义标识为 **`kitsunerouter`**，命令为 **`kitsune-router`**。审阅预设，保留其他提供商/上下文/编辑器设置，不提交密钥。

`/api/health` 只检查网关。用小请求测试实际协议；目录不保证工具/媒体或账号权限。避免客户端和网关叠加付费重试。远程使用自己的认证 HTTPS `/v1`，无必需 ByKitsune 账户。见 [完整集成](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) 和 [排查](/zh-CN/troubleshooting/)。
