# Roo 連携

使用版 Roo の OpenAI 互換モードを使います。ルーティング・変換であり、契約や万能な機能対応ではありません。

```text
Base URL: http://localhost:20128/v1
API key: 発行済み Kitsune Router キー
Model: 有効な正確 ID または作成済みコンボ
```

先に許可上流を接続しキーを作ります。`my-route` はコンボ作成後のみ存在します。認証付き `/v1/models` を確認します。

他設定を保持してプリセットを確認します。プロバイダー **`kitsunerouter`**、コマンド **`kitsune-router`**。OAuth 秘密を issue・例に入れません。

`/api/health` は推論の証明ではありません。ツール・媒体を確認し、再試行・キャンセルを守ります。リモートは自己 HTTPS で、既定 Kitsune クラウドではありません。[他ツール](/ja/integration/other-tools/) · [診断](/ja/troubleshooting/) · [移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
