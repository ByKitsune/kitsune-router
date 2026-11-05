# よくある質問

## 何ですか？

[ByKitsune](https://bykitsune.com) が保守・支援する中立・ローカルファーストのゲートウェイで、ZenRouter/9Router を継続します。**Your models. Your routes.** 設定した上流を使い、スポンサーへ自動送信しません。

## 1.0.8 の公開状況は？

GitHub Release、npm、GHCR は別々に公開・検証されます。[1.0.8 の公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)で各チャネルの結果と取得可否を確認してください。公開と読戻しが確認された成果物に限って [インストール手順](/ja/getting-started/installation/)を使います。ソースの検証や既存タグだけでは、公開、匿名アクセス、実プロバイダーの利用権を証明しません。

**配布履歴と修正準備:** 1.0.7 は不変ソース `b7f77d07` から npm・GHCR・GitHub Release に配布済みですが、逐次 `--no-save` インストールで SQLite/tray が互いに削除される既知の問題があります。1.0.8 は未公開で、正確なソース CI と通常インストール候補の検証待ちです。各チャネルの実結果と既知の問題は [公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)を参照してください。

## 1.0.2 の公開履歴（当時の確認）

**コンテナは配布済みですが private、npm はブロック中です。** Recovery `40485038668` が不変 runtime `65c8b97d` を配布し、認証付き digest/provenance/SPDX 読戻しと配布イメージ独立 smoke に成功しました。所有者の Public 選択は完了未確認、匿名 grant は最新確認で HTTP 401。許可済み private アクセスかソースを使い、匿名 pull を前提にしないでください。npm は E403/公開読戻し HTTP 404、token 交換未確認。GitHub Release 1.0.2・production 配備はなく、旧タグと 1.0.1 npm 原因不明の証拠を維持します。[インストール](/ja/getting-started/installation/) · [証拠](/ja/changelog/)。

## 必須アカウントや順序は？

ByKitsune は不要。上流アカウント・コンボは自由ですが、権限・契約・地域・規約は適用されます。

## 無料・無制限？

MIT はソフトのライセンスで、上流・機材費や枠をなくしません。圧縮に固定削減率はなく、概算は請求書でなく、不明はゼロではありません。

## 何が変わる？

パッケージ `@bykitsune/router`、コマンド `kitsune-router`、キー `kitsunerouter`、変数 `KITSUNE_ROUTER_*`、ヘッダー `x-kitsune-router-*`。`/v1/*`、`/v1beta/*`、20128 は不変で旧エイリアスは必須ではありません。[連携](/ja/integration/other-tools/)。

## データとクラウドは？

旧 writer を止めて全体保存。移行は snapshot/file を確認し原本を保持、上書きせず明示 `DATA_DIR` を優先します。秘密・識別子・auth・ソルト・証明書を維持。旧同期や既定 hosted はなく、全資格情報の保存時暗号化は保証しません。[移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [運用](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。

過去テストは現行ソースの証明ではなく、最終 SHA の証拠が必要です。合成試験も実権限や請求を証明しません。
