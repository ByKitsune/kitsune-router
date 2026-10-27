# サブスクリプション・OAuth プロバイダー

対応 OAuth・契約製品を API キー・ローカル互換サービスと併用できます。これは接続・請求カテゴリであり、強制の最優先ルートではありません。

1. `http://localhost:20128/dashboard` の Providers で実製品（例 Codex、Claude Code、Gemini CLI、Copilot）を選びます。
2. OAuth・デバイス手順を実行し、そのアカウントの状態・モデルを確認します。
3. 上流が資格情報を取り消したら再認証し、ゲートウェイ全体を消さないでください。
4. クライアントは上流 refresh token でなくゲートウェイキーを使用し、コンボ順序は自由に決めます。

公開 API、コーディング契約、IDE 権限は互換ではありません。固定月額・枠・全モデル利用を保証せず、現行規約・地域・自動化許可を確認します。ルーティングは権限や制限回避を与えません。

不明な枠は不明のままです。高速階層は多く消費する場合があり、API 米ドル価格は契約請求ではありません。[使用量](/ja/features/quota-tracking/)。ByKitsune 必須・スポンサー優先なし。[API キー](/ja/providers/cheap/) · [無料・ローカル](/ja/providers/free/)。

[移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) で OAuth 秘密を保持してください。すべての資格情報の保存時暗号化は保証しません。
