# Kitsune Router

**Your models. Your routes.**

[ByKitsune](https://bykitsune.com) が保守・支援する、プロバイダー中立・ローカルファーストの AI ゲートウェイです。モデル、アカウント、フォールバック順序は利用者が選びます。ByKitsune アカウントやホスト型 API の購入は不要です。リクエストは設定した上流へ送信されるため、ローカルファーストはオフライン推論を意味しません。

[English](../README.md) · [リポジトリ](https://github.com/ByKitsune/kitsune-router) · [変更履歴](../CHANGELOG.md) · [移行](../docs/MIGRATION.md)

## 公式 ByKitsune プロバイダー

ByKitsune は主要な公式プロバイダーとして一覧の先頭に表示されます。**Providers** で **Connect ByKitsune** を選び、[ByKitsune のキー管理画面](https://bykitsune.com/dashboard?tab=keys)から取得したキーを追加して、**Fetch Models** を選択します。API ベース URL は `https://api.bykitsune.com/v1`、認証は Bearer です。取得した `bykitsune/<model-id>` ルートを使用してください。アカウントとルーティング順序は引き続き利用者が選択します。

この連携は現在のソースコード向けです。

## リリース状況とインストール

**1.0.2 コンテナは private で配布済み、匿名 pull は未確認、npm はブロック中です。** 不変ソース `65c8b97d`：9,041 成功、100 skip、失敗ゼロ。Recovery `40485038668` が GHCR `1.0.2`/`latest` を配布し、認証付き digest/provenance/SPDX 読戻しと配布イメージ独立 smoke に成功しました。最新確認では **private** のまま：所有者は Public 変更を選びましたが完了未確認、匿名 grant HTTP 401。npm は E403/公開読戻し HTTP 404、token 交換も未確認です。npm コマンドは npm 配布確認後のみ使用し、当面はソースか許可済み private コンテナアクセスを利用してください。GitHub Release・production 配備なし。[1.0.2 証拠](../releases/RELEASE_NOTES_v1.0.2.md) · [Docker](../DOCKER.md)。

旧タグは移動しません。`v1.0.1` は `74583402` で SSH/CI に成功しましたが、GHCR ゲートは login/push 前に失敗し、正規イメージは未公開です。npm publish も失敗し原因は未確定、2026-10-27 の公開読戻しは HTTP 404、GitHub Release も未作成です。`v1.0.0` は `390a6567` に固定され、移行テスト失敗後 npm/GHCR 未公開です。[1.0.1 記録](../releases/RELEASE_NOTES_v1.0.1.md) · [1.0.2 草案](../releases/RELEASE_NOTES_v1.0.2.md)。テスト用時計と npm 診断の改善は本番の並び順・所有権拒否を変えません。旧件数は新版の証拠ではなく、0.x 出典も保持します。

必要環境は **Node.js >=22.19.0**。公開後のみ使用してください。

```bash
npm install -g @bykitsune/router@1.0.2
kitsune-router
# または: npx @bykitsune/router@1.0.2
```

確認済みの正規リポジトリか既存チェックアウトから、ルートで実行します。`app/` サブディレクトリはありません。

**新規**インストールだけで、非公開 `.env` に秘密を一度生成します（POSIX shell/OpenSSL）。`next dev` はランチャーの生成処理を使わず、32 文字以上の強い `JWT_SECRET` がなければログイン失敗します。移行時は有効な既存 `JWT_SECRET`、`API_KEY_SECRET`、`MACHINE_ID_SALT` と絶対 `DATA_DIR` を保持します。例の値を変更するのは新規だけとし、`.env` を公開・コミットしないでください。

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

外部公開前に強い `INITIAL_PASSWORD` を設定してください。`http://localhost:20128/dashboard` で利用権のあるプロバイダーを接続し、ゲートウェイキーを作成・取得します。クライアントの基底 URL は `http://localhost:20128/v1`。実際の一覧からモデルを選びます。`/api/health` は上流の利用権を証明しません。

## 連携

実行コマンドは **`kitsune-router`**、プロバイダー識別子は **`kitsunerouter`** です。Codex は `~/.codex/config.toml` を使用します。

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

例の `my-route` は事前に作成するコンボです。環境変数には発行済みゲートウェイキーを入れます。変数設定だけでキーは作成されません。Claude Code は `ANTHROPIC_BASE_URL=http://localhost:20128` に `/v1/messages` を追加します。他の設定を残し、プリセットの変更を確認してください。[詳細例](../docs/INTEGRATIONS.md)。

## 移行と安全性

旧ゲートウェイと補助プロセスを停止し、非公開データディレクトリ**全体**をバックアップします。起動時に `~/.zenrouter` または `~/.9router` を `~/.kitsune-router` へ移行できます（Windows は `%APPDATA%` 内）。一貫した SQLite スナップショットとコピーを検証し、元データを残し、既存の移行先は上書きしません。明示的な `DATA_DIR` は優先され、移動しません。

`db/data.sqlite`、`secrets.json`、`machine-id`、`auth/`、`mitm/` を保持してください。改名のために暗号ソルトや信頼済みルート証明書を交換してはいけません。すべての認証情報の保存時暗号化は保証していません。新しい設定は `KITSUNE_ROUTER_*`、拡張ヘッダーは `x-kitsune-router-*`、識別子は `kitsunerouter`。`/v1/*` とポート 20128 は不変で、旧コマンド・識別子の互換エイリアスは必須ではありません。

Docker は有効 `DATA_DIR` に既存 volume/mount を保持します。既定 `/app/data` または対応する独自絶対パスで、linux/amd64 のみです。制限 Linux は停止・保存後に明示 `DATA_DIR` で移動せず使うか特権レビューを依頼し、権限エラーを無視しません。image を確認し mirror は任意。[インストール](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [運用](../docs/OPERATIONS.md)。

圧縮効果は処理内容次第です。固定削減率、無制限枠、常時稼働は保証しません。概算は請求書ではなく、不明な料金は無料ではありません。上流の権限・地域・規約は引き続き適用されます。既定のホスト型 Kitsune サービスはなく、旧クラウド同期は削除済みです。ソースやローカル成果物の検証は registry 公開の証明ではありません。[1.0.2 証拠](../releases/RELEASE_NOTES_v1.0.2.md)。

## 謝辞とライセンス

Joy を含む ZenRouter/9Router の作者・貢献者、および [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)、[RTK](https://github.com/rtk-ai/rtk)、[Caveman](https://github.com/JuliusBrussee/caveman)、[Ponytail](https://github.com/DietrichGebert/ponytail) に感謝します。上流の著作権表示と歴史的な出典を保持します。MIT: [LICENSE](../LICENSE)。
