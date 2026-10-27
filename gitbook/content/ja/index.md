# Kitsune Router へようこそ

**Your models. Your routes.** [ByKitsune](https://bykitsune.com) が保守・支援する、プロバイダー中立・ローカルファーストの AI ゲートウェイです。モデル、アカウント、フォールバック順序は利用者が選択します。ByKitsune アカウントやホスト型 API 購入は不要です。設定した上流へリクエストを送信するため、オフライン推論ではありません。

## 公開状況

**1.0.1 が次の候補で、最終 tag/SHA 検証・公開待ちです。** GitHub リポジトリは確認済み。npm は `bykitsune` 認証・Actions 更新済みですが、公開権限と成果物の証明ではありません。

| 対象 | 識別子 |
| --- | --- |
| リポジトリ | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| コマンド | `kitsune-router` |
| ツールのプロバイダーキー | `kitsunerouter` |
| 正規イメージ | `ghcr.io/bykitsune/kitsune-router` |

`v1.0.0` は `390a65677c06a30084386d2a2adf8b0c48709281` に固定し、non-root 所有権 scan の workflow 失敗で npm/GHCR は未公開です。旧候補の 9,029 件成功は 1.0.1 の証明ではありません。後続は合成プロセス分離テストとモバイル key 行修正で、本番の fail-closed は不変。[履歴](/ja/changelog/) · [1.0.1 草案](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.1.md)。0.x 出典は保持します。

## 機能と制限

ルート別制限を持つプロトコル変換、任意のコンボ・アカウント選択、ローカル SQLite、任意の圧縮を提供します。無制限枠、固定削減率、常時稼働は保証しません。概算は請求書ではなく、不明な価格は無料ではありません。旧クラウド同期は削除済みで、リモート利用は認証 HTTPS を備えた自己管理サービスです。

[開始](/ja/getting-started/quick-start/) · [インストール](/ja/getting-started/installation/) · [連携](/ja/integration/other-tools/) · [移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。MIT と上流の著作権表示、ZenRouter/9Router の貢献者への謝辞を保持します。[LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE)。
