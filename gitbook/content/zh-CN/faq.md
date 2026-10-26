# 常见问题

## 是什么？

Kitsune Router 是由 [ByKitsune](https://bykitsune.com) 维护/赞助的中立、本地优先 AI 网关，延续 ZenRouter/9Router。**Your models. Your routes.** 请求走你配置的上游，不自动发送到赞助方。

## 1.0.0 发布了吗？

它是首次重大品牌迁移版本提案，**验证与发布待完成**。命名空间、npm 授权、镜像访问和产物读回仍是发布门槛。见 [安装](/zh-CN/getting-started/installation/) 与 [日志](/zh-CN/changelog/)。0.x 仍是历史 ZenRouter 产物。

## 需要账户或指定顺序吗？

无需 ByKitsune 账户。按你选择的上游账户和组合顺序使用；各提供商权限、订阅、地域、条款仍适用。

## 免费或无限吗？

软件采用 MIT；上游、硬件、配额和可用性是独立成本/限制。无固定压缩节省或无限推理保证。估算不是账单，未知价格不是零。

## 配置如何变化？

包 `@bykitsune/router`、命令 `kitsune-router`、工具标识 `kitsunerouter`；项目变量 `KITSUNE_ROUTER_*`、扩展头 `x-kitsune-router-*`。标准 `/v1/*`、`/v1beta/*` 和端口 20128 不变，不要求旧别名。见 [集成](/zh-CN/integration/other-tools/)。

## 数据和云服务？

停止旧写入者后整目录备份。迁移验证快照/文件、保留原件、不覆盖目标，`DATA_DIR` 优先。保留秘密、身份、auth 和证书，不因改名换盐或信任根。云同步已移除，无默认托管服务；不是所有凭据都保证静态加密。见 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) 与 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。

历史测试数量不证明当前源代码；最终验证需绑定 SHA，合成测试也不证明实时权限或计费。
