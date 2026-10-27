# 组合与回退

组合是包含所选模型的命名路由，让客户端使用稳定名称。它不会创建提供商账户、权限或额外额度。

## 创建

1. 连接允许使用的上游并查看启用模型。
2. 在仪表盘 Combos 创建独立名称，如 `my-route`。
3. 添加准确模型 ID，选择当前版本提供的策略/顺序，检查每个成员的能力与权限。
4. 保存后，将组合名用作客户端模型。

```json
{
  "model": "my-route",
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": true
}
```

这是请求示例，不是导入/数据库结构。须先创建组合；避免递归或循环。嵌套组合应采用保守能力限制，不能假设所有成员拥有最大上下文或工具支持。

任何提供商类别/赞助方均无强制位置。未知价格/限制保持未知；回退有界，可能产生额外费用，不保证连续服务或硬性金额上限。见 [路由](/zh-CN/features/smart-routing/) 与 [用量](/zh-CN/features/quota-tracking/)。迁移保留组合，不要为改名清空数据库，先阅读 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
