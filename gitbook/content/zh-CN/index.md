# 欢迎使用 Kitsune Router

**Your models. Your routes.** 由 [ByKitsune](https://bykitsune.com) 维护和赞助的中立、多提供商、本地优先 AI 网关。模型、账户和回退顺序由你选择；不要求 ByKitsune 账户或购买托管 API。请求仍发送至所配置的上游，本地优先不代表离线推理。

## 发布状态

**1.0.1 是下一候选版本，尚待最终标签/SHA 验证和发布。** GitHub 组织/仓库已确认；npm 已认证 `bykitsune` 并更新 Actions 凭据，但发布权限、镜像和产物读回仍待验证。

| 项目 | 新标识 |
| --- | --- |
| 仓库 | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm 包 | `@bykitsune/router` |
| 命令 | `kitsune-router` |
| 工具提供商标识 | `kitsunerouter` |
| 规范镜像 | `ghcr.io/bykitsune/kitsune-router` |

`v1.0.0` 保留于 `390a65677c06a30084386d2a2adf8b0c48709281`，因非 root 所有权扫描工作流失败而未发布 npm/GHCR。旧候选 9,029 条通过不是 1.0.1 验证。接续工作是合成进程隔离回归测试与移动端 key 行换行，生产拒绝策略不放宽。见 [日志](/zh-CN/changelog/) 和 [1.0.1 草案](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.1.md)，0.x 原来源保持。

## 能力与边界

提供兼容协议转换、可配置组合/多账户回退、本地 SQLite 用量与可选压缩。支持情况取决于路由；没有无限额度、固定节省比例或持续可用性保证。估算不是账单，未知价格不等于免费。旧云同步已移除，远程访问须自行部署并设置认证与 HTTPS。

[快速开始](/zh-CN/getting-started/quick-start/) · [安装](/zh-CN/getting-started/installation/) · [集成](/zh-CN/integration/other-tools/) · [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。MIT 及上游版权声明保持不变，感谢 ZenRouter/9Router 作者和贡献者，见 [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE)。
