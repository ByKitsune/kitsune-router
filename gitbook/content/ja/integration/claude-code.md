# Claude Code 連携

ゲートウェイを起動し、許可された上流・ゲートウェイキーと Messages 対応ルートを選びます。`my-route` は事前作成するコンボです。ByKitsune アカウントは不要です。

## クライアント環境

Claude Code が `/v1/messages` を追加するので、基底は **`/v1` なしの origin** です。

```bash
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="$KITSUNE_ROUTER_API_KEY"
claude --model my-route
```

変数は発行済みゲートウェイキーで、上流 refresh token ではなく、キー作成設定でもありません。試験は当該セッションに限定し、既存設定を保持します。

プリセットは `~/.claude/settings.json` の `env` を変更し、架空のトップレベル `baseUrl`/`defaultModel` は使いません。確認・バックアップしてください。Claude Desktop は別製品であり、これは汎用 Desktop 手順ではありません。

`/api/health` と認証 `/v1/models` はツール・文書・権限を証明しません。リモートは自己 HTTPS origin を `/v1` なしで使います。既定の Kitsune hosted はありません。[詳細](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
