# Cursor 連携

インストール版 Cursor のカスタム OpenAI 互換設定を使います。契約や全 hosted 機能を付与するものではありません。

ゲートウェイを起動し、許可上流・キー・`/v1/models` のモデルまたはコンボを用意します。

```text
Base URL: http://localhost:20128/v1
API key: 発行済みゲートウェイキー
Model: 正確な有効 ID または作成済みコンボ
```

プリセットを確認し、他設定を保持します。プロバイダーは `kitsunerouter`、実行コマンドは `kitsune-router`。UI 名は版で異なります。

エディターのサーバー上で動く機能は手元の localhost に接続できません。リモートには自己管理の認証 HTTPS を使い、無認証で公開しないでください。ツール・画像・構造化出力・文書はルート依存です。[他ツール](/ja/integration/other-tools/) · [診断](/ja/troubleshooting/)。
