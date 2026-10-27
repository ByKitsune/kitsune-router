# 配额与用量

Kitsune Router 在本地记录用量，并显示受支持上游提供的配额/重置数据。用量估算、提供商额度和账单不是同一概念。

## 正确理解数据

- 按路由使用真实输入、输出及缓存计数；缺失值不虚构为零。
- 配额可能按账户、模型、服务或窗口划分。探测失败不等于重新获得额度或账户无效。
- **未知价格不等于免费。** 已知小计加未定价请求数不是完整总额。
- 实际速度档位可能不同于请求档位；订阅积分不是 API 美元账单。见 [速度](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md)。
- 重试可能计费；客户端取消不证明上游已停止计费。token 上限不是完整金额预算。

## 存储与监控

配置和活跃用量共享 `${DATA_DIR}/db/data.sqlite`。`usage.json`/`db.json` 仅是历史迁移输入。使用绝对路径，停止后备份整个目录，包括密钥、身份与证书。见 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。

先检查当前需认证的 `/api/metrics` 输出再写告警，勿对滚动窗口快照盲用 `rate()`/`increase()`。`/api/health` 不验证实时上游权限，历史测试数量也不证明当前版本。压缩没有固定节省比例，真实费用以上游账单为准。
