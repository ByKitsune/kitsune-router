# よくある質問

## 何ですか？

[ByKitsune](https://bykitsune.com) が保守・支援する中立・ローカルファーストのゲートウェイで、ZenRouter/9Router を継続します。**Your models. Your routes.** 設定した上流を使い、スポンサーへ自動送信しません。

## 1.0.1 は公開済み？

次の候補で **最終 tag/SHA 検証・公開待ち**。v1.0.0 は `390a65677c06a30084386d2a2adf8b0c48709281` に固定し、所有権 scan 失敗で npm/GHCR 未公開です。GitHub 確認・npm `bykitsune` 認証と公開権限/readback は別です。[インストール](/ja/getting-started/installation/) · [履歴](/ja/changelog/)。0.x 歴史は保持します。

## 必須アカウントや順序は？

ByKitsune は不要。上流アカウント・コンボは自由ですが、権限・契約・地域・規約は適用されます。

## 無料・無制限？

MIT はソフトのライセンスで、上流・機材費や枠をなくしません。圧縮に固定削減率はなく、概算は請求書でなく、不明はゼロではありません。

## 何が変わる？

パッケージ `@bykitsune/router`、コマンド `kitsune-router`、キー `kitsunerouter`、変数 `KITSUNE_ROUTER_*`、ヘッダー `x-kitsune-router-*`。`/v1/*`、`/v1beta/*`、20128 は不変で旧エイリアスは必須ではありません。[連携](/ja/integration/other-tools/)。

## データとクラウドは？

旧 writer を止めて全体保存。移行は snapshot/file を確認し原本を保持、上書きせず明示 `DATA_DIR` を優先します。秘密・識別子・auth・ソルト・証明書を維持。旧同期や既定 hosted はなく、全資格情報の保存時暗号化は保証しません。[移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [運用](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。

過去テストは現行ソースの証明ではなく、最終 SHA の証拠が必要です。合成試験も実権限や請求を証明しません。
