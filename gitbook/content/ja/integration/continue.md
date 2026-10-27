# Continue 連携

Continue の設定形式は版で異なります。現行 OpenAI 互換設定を使い、古い JSON/YAML で全体を上書きしないでください。

```text
API base: http://localhost:20128/v1
API key: 発行済みゲートウェイキー
Model: 有効な正確 ID または作成済みコンボ
```

許可上流・キー・`/v1/models` を確認します。役割ごとに設定し、チャットが埋め込み・補完も自動提供するとは考えません。

識別子 **`kitsunerouter`**、実行コマンド **`kitsune-router`**。他のプロバイダー・context・editor 設定を保ち、キーはコミットしません。

`/api/health` や一覧は権限・媒体対応を証明しません。実プロトコルを確認し、クライアントとゲートウェイで有料再試行を重複させないでください。リモートは自己管理 HTTPS `/v1` で ByKitsune 必須ではありません。[詳細](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [診断](/ja/troubleshooting/)。
