# Cline 連携

現行 Cline の OpenAI Compatible を選びます。ネイティブログインはゲートウェイを迂回する場合があります。先に上流・発行済みキー・有効ルートを準備します。

```text
Base URL: http://localhost:20128/v1
API key: 発行済みゲートウェイキー
Model ID: 有効モデルまたは設定済みコンボ
```

プリセットを確認し、エディターの他設定と秘密を保持します。プロバイダー `kitsunerouter`、コマンド `kitsune-router`。

小さな要求の後、必要なツール・画像を試します。カタログは権限・全変換制御の証明ではありません。圧縮に固定削減率はなく、429/503 の期限を守ります。リモートは自己管理の認証 HTTPS、ByKitsune アカウントは不要です。[詳細](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [診断](/ja/troubleshooting/)。
