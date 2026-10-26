# 订阅与 OAuth 提供商

Kitsune Router 可连接受支持 OAuth/订阅服务以及 API-key、本地兼容服务。“订阅”是连接/计费类别，不是强制的第一优先级。

## 连接账户

1. 在 `http://localhost:20128/dashboard` 的 Providers 选择实际受支持产品（如 Codex、Claude Code、Gemini CLI 或 Copilot）。
2. 按其 OAuth/设备授权流程登录，检查账户状态和实际模型。
3. 上游令牌被撤销时重新授权，而非删除整个网关数据。
4. 客户端使用网关 key，不使用上游 refresh token；按你的顺序添加组合。

公开 API、编程套餐与 IDE 权限不可混用。本文不保证固定价格、每月额度或通用模型权限；须核实提供商当前条款、地域和自动化许可。路由不创造权限，也不绕过限制。

配额按实际账户/路由观察，未知保持未知。速度档位可能消耗更多额度，API 美元参考价不是订阅账单。见 [用量](/zh-CN/features/quota-tracking/)。无需 ByKitsune 账户，赞助方不优先；其他 [API-key](/zh-CN/providers/cheap/) 或 [免费/本地](/zh-CN/providers/free/) 路由可自由排序。

[迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) 时保留 OAuth 和秘密状态，不保证所有凭据都静态加密。
