# 欢迎使用 Kitsune Router

**Your models. Your routes.** 由 [ByKitsune](https://bykitsune.com) 维护和赞助的中立、多提供商、本地优先 AI 网关。模型、账户和回退顺序由你选择；不要求 ByKitsune 账户或购买托管 API。请求仍发送至所配置的上游，本地优先不代表离线推理。

## 发布状态

**1.0.2 源码已验证，npm/GHCR 发布受阻。** 不可变标签 `65c8b97d`：9,041 通过、100 跳过、断言/套件零失败，严格 lint 与 app/docs 构建通过。npm publish 被 E403 拒绝（2FA 或启用 bypass 2fa 的 granular token），公开读回 HTTP 404；GHCR 门槛/登录通过，但缺失 manifest 被误分类，在构建/推送前停止。用户将在 GitHub UI 替换 token，尚未确认；独立容器恢复不改版本/标签。暂无规范镜像或 GitHub Release。包/镜像命令仅发布读回验证后适用，目前可用源码。

| 项目 | 新标识 |
| --- | --- |
| 仓库 | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm 包 | `@bykitsune/router` |
| 命令 | `kitsune-router` |
| 工具提供商标识 | `kitsunerouter` |
| 规范镜像 | `ghcr.io/bykitsune/kitsune-router` |

旧标签不移动：`v1.0.1` 在 `74583402`，SSH/CI 通过，但 GHCR 门槛在登录/推送前失败，未发布规范镜像；npm publish 失败，原因尚未知，2026-10-27 公开读回 HTTP 404，未创建 GitHub Release。`v1.0.0` 在 `390a6567`，迁移测试失败后未发布 npm/GHCR。1.0.2 控制测试时间戳并改善 npm 发布诊断，不改变生产排序或所有权 fail-closed 策略；旧数量不验证新版。见 [日志](/zh-CN/changelog/) 和 [1.0.2 草案](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md)，0.x 来源保留。

## 能力与边界

提供兼容协议转换、可配置组合/多账户回退、本地 SQLite 用量与可选压缩。支持情况取决于路由；没有无限额度、固定节省比例或持续可用性保证。估算不是账单，未知价格不等于免费。旧云同步已移除，远程访问须自行部署并设置认证与 HTTPS。

[快速开始](/zh-CN/getting-started/quick-start/) · [安装](/zh-CN/getting-started/installation/) · [集成](/zh-CN/integration/other-tools/) · [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。MIT 及上游版权声明保持不变，感谢 ZenRouter/9Router 作者和贡献者，见 [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE)。
