# その他のツールと SDK

OpenAI 互換基底 `http://localhost:20128/v1`、発行済みキー、有効モデル・コンボを使います。プロバイダー **`kitsunerouter`** とコマンド **`kitsune-router`** を混同しないでください。

## Python

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20128/v1",
    api_key=os.environ["KITSUNE_ROUTER_API_KEY"],
)
response = client.chat.completions.create(
    model=os.environ["KITSUNE_ROUTER_MODEL"],
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)
```

両変数は既存キー・ルートを非公開で保持し、上流 refresh token を入れません。変数はキーを作りません。

旧 OpenCode は `provider.kitsunerouter` と `kitsunerouter/my-route`、V2 は `providers`/`package`/`settings` です。形式を混ぜないでください。[詳細](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) に JavaScript、Codex TOML、Claude Code origin の例があります。

リモートは自己 HTTPS で、既定 hosted ではありません。ヘルス `/api/health`、一覧 `/v1/models`。試験は権限・請求の証明ではなく、枠・取消を守ります。[診断](/ja/troubleshooting/) · [移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
