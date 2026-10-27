# Combos and Fallback

A combo is a named route containing models you select. It lets clients use one stable name while the gateway applies the configured selection/fallback strategy. It does not create provider accounts, grants or extra quota.

## Create a route

1. Connect permitted upstreams and inspect currently enabled models.
2. Open the dashboard's Combos section and create a distinct name, for example `my-route`.
3. Add exact model IDs and select the strategy/order exposed by your installed version. Review capabilities and account eligibility for every possible member.
4. Save, then request `my-route` as the model in an OpenAI-compatible client or a dashboard tool preset.

```json
{
  "model": "my-route",
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": true
}
```

This is a request example, not a database/import schema. Create the combo first. Avoid recursive/cyclic configurations; review nested routes and their conservative limits rather than assuming the largest member's context or tools apply to every member.

## Choose deliberately

No provider category or sponsor has a mandatory position. A lower-priced model may not support the same media, structured output or tools. Unknown cost/limits stay unknown. The gateway may reject an unsupported request rather than remove its intent. Fallback is bounded and does not promise uninterrupted service or a monetary spending cap.

Use [smart routing](/en/features/smart-routing/) and [quota/cost tracking](/en/features/quota-tracking/) to understand errors and incurred usage. Migration preserves saved combos; do not recreate a blank database to rename the product. Read [migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
