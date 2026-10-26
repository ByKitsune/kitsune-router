# Roo 集成

使用当前 Roo 版本支持的 OpenAI-compatible 模式。Kitsune Router 提供路由/转换，不提供上游订阅或所有功能保证。

```text
Base URL: http://localhost:20128/v1
API key: 已签发的 Kitsune Router 网关 key
Model: 准确启用模型 ID 或已创建组合
```

先启动网关、连接有权使用的提供商并创建 key。`my-route` 只有创建为组合后可用。从认证的 `/v1/models` 查看实际目录。

审阅预设并保留其他设置。提供商标识是 **`kitsunerouter`**，执行命令是 **`kitsune-router`**；不要把上游 OAuth 秘密放入示例或 issue。

健康检查 `/api/health` 不证明实时推理；单独测试工具/媒体并遵守重试/取消规则。远程须使用自己的认证 HTTPS，没有默认 Kitsune 云端点。见 [其他工具](/zh-CN/integration/other-tools/)、[排查](/zh-CN/troubleshooting/) 和 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
