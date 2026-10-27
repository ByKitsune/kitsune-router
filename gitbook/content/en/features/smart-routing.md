# Smart Routing

Kitsune Router routes to the models and accounts **you configure**. There is no mandatory subscription → cheap → free ladder, no preference for ByKitsune and no required ByKitsune account.

## Model and account selection

A direct model request selects that route. A named combo expands its configured members and strategy, then account selection applies within the selected provider. Use the dashboard's actual supported controls; a direct model does not automatically gain an unrelated global fallback chain.

```text
Client requests my-route
  → configured member A → eligible account
  → eligible retry/fallback when permitted
  → configured member B, or a truthful terminal error
```

Create `my-route` yourself and select exact currently enabled models. Order can reflect capability, privacy, latency or cost; category labels do not enforce an order. See [combos](/en/features/combos/).

## Failure boundaries

- Respect account/model-scoped quota/reset data and retry deadlines. Unknown quota is not unlimited quota.
- Malformed requests and cancellation are not reasons to drain account pools. Context or unsupported-control fallback retains explicit intent rather than silently raising a paid output cap.
- Existing partial output and incurred usage must not be disguised as a free retry or successful empty response.
- Routing does not bypass provider terms, regional restrictions, billing or entitlement. Multiple providers can all be unavailable.

Review [usage](/en/features/quota-tracking/) and the [architecture](https://github.com/ByKitsune/kitsune-router/blob/master/docs/ARCHITECTURE.md) for implementation details. Costs are estimates; retries can incur upstream usage. No zero-downtime, never-exceed-budget or fixed-savings guarantee is made.
