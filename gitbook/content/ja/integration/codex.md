# Codex CLI 連携

コマンドは `kitsune-router`、プロバイダーキーは **`kitsunerouter`**。許可された上流と発行済みゲートウェイキーが必要です。Codex/OpenAI 契約や全機能を付与するものではありません。

## 設定

`config.json` でなく `~/.codex/config.toml` にマージします。

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

先に `my-route` を作るか正確な有効 ID を指定します。非公開変数には発行済みキーを保持し、変数はキーを作成しません。プリセットは固定 Authorization を書く場合があるためファイルを秘密として扱い、他設定・ディレクトリ全体は置換しません。

`/api/health` と認証付き `/v1/models` を確認し、`codex --model my-route`。リモートは自己管理 HTTPS `/v1` で、localhost はクラウドではありません。モデル表は権限・速度・請求を証明せず、非対応文書・制御は拒否される場合があります。[連携詳細](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [速度](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md) · [移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
