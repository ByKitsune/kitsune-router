# Cline 集成

Kitsune Router 可通过 OpenAI-compatible 端点服务 Cline。使用已安装版本的设置格式；原生上游登录可能绕过网关。

## 连接

先启动网关、连接允许的提供商、创建/复制网关 key 并选择启用模型/组合，然后在 Cline 选择 OpenAI Compatible：

```text
Base URL: http://localhost:20128/v1
API key: 已签发的网关 key
Model ID: 启用模型或已配置组合
```

审阅预设变更，保留编辑器其他设置并保护凭据。新提供商标识为 `kitsunerouter`，命令为 `kitsune-router`。

先小请求，再测试所需工具/视觉流程。目录不保证每个账户权限或转换参数。压缩节省取决于任务，没有固定比例。遵守 429/503 重试时间；远程用自己的认证 HTTPS 服务，无需 ByKitsune 账户。见 [完整示例](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) 和 [排查](/zh-CN/troubleshooting/)。
