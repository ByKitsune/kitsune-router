# Kitsune Router へようこそ

**Your models. Your routes.** [ByKitsune](https://bykitsune.com) が保守・支援する、プロバイダー中立・ローカルファーストの AI ゲートウェイです。モデル、アカウント、フォールバック順序は利用者が選択します。ByKitsune アカウントやホスト型 API 購入は不要です。設定した上流へリクエストを送信するため、オフライン推論ではありません。

## 公開状況

**1.0.2 が承認済みの次期候補で、最終 SHA/tag、検証ゲート、npm/GHCR 公開は未完了です。** パッケージ・イメージのコマンドは公開と registry 読戻しの確認後に使用し、それまではソースを利用してください。

| 対象 | 識別子 |
| --- | --- |
| リポジトリ | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| コマンド | `kitsune-router` |
| ツールのプロバイダーキー | `kitsunerouter` |
| 正規イメージ | `ghcr.io/bykitsune/kitsune-router` |

旧タグは不変です。`v1.0.1` は `74583402` で SSH/CI に成功しましたが、GHCR は login/push 前のゲートで失敗し正規イメージは未公開。npm publish も失敗、原因は未確定、2026-10-27 の公開読戻しは HTTP 404、GitHub Release も未作成です。`v1.0.0` は `390a6567` で移行テスト失敗後 npm/GHCR 未公開です。1.0.2 はテスト時刻と npm 公開診断の改善で、本番の順序・fail-closed 所有権検査は不変。旧件数は新版を検証しません。[履歴](/ja/changelog/) · [1.0.2 草案](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md)。0.x 出典を保持します。

## 機能と制限

ルート別制限を持つプロトコル変換、任意のコンボ・アカウント選択、ローカル SQLite、任意の圧縮を提供します。無制限枠、固定削減率、常時稼働は保証しません。概算は請求書ではなく、不明な価格は無料ではありません。旧クラウド同期は削除済みで、リモート利用は認証 HTTPS を備えた自己管理サービスです。

[開始](/ja/getting-started/quick-start/) · [インストール](/ja/getting-started/installation/) · [連携](/ja/integration/other-tools/) · [移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。MIT と上流の著作権表示、ZenRouter/9Router の貢献者への謝辞を保持します。[LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE)。
