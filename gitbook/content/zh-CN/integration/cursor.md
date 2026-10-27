# Cursor 集成

使用当前 Cursor 版本支持的自定义 OpenAI-compatible 设置。这不会提供 Cursor 订阅或让所有托管功能自动支持。

## 设置

启动网关、连接有权使用的提供商、创建网关 key，并从 `/v1/models` 选择模型/组合。

```text
Base URL: http://localhost:20128/v1
API key: 已签发的网关 key
Model: 准确启用模型 ID 或已创建组合
```

审阅仪表盘预设并保留其他设置；需要提供商标识时使用 `kitsunerouter`，执行命令则为 `kitsune-router`。界面标签随版本不同。

托管服务器执行的功能不能访问你电脑的 localhost。远程服务需自行配置认证与 HTTPS，不能为连接公开无认证仪表盘。工具、视觉、结构输出和文档支持取决于具体路由；见 [其他工具](/zh-CN/integration/other-tools/) 和 [故障排查](/zh-CN/troubleshooting/)。
