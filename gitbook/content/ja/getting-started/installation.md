# インストール

**1.0.2 ソース検証済み、コンテナは private で配布済み、npm ブロック中です。** Runtime は `65c8b97d` のまま。Recovery `40485038668` の認証付き digest/provenance/SPDX 読戻しと配布イメージ smoke に成功しました。最新確認は **private**、Public 選択は未確認、匿名 grant HTTP 401。下記のソース手順または [許可済み private コンテナ](/ja/deployment/cloud/) を利用してください。npm `@bykitsune/router` は E403/公開読戻し HTTP 404、token 交換未確認。以下のコマンドは npm 配布/readback 確認後のみ、**Node.js >=22.19.0** が必要です。[証拠](/ja/changelog/)。

## 公開後のランチャー

```bash
npx @bykitsune/router@1.0.2
# または:
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

確認は `npm ls -g @bykitsune/router`、削除は `npm uninstall -g @bykitsune/router`。データ削除は不要です。権限問題のために npm スクリプトを安易に sudo 実行しないでください。

ランチャーは既定で全インターフェースに bind する場合があります。ローカル限定は `--host 127.0.0.1` を追加し、`kitsune-router --help` で確認します。local-first はネットワーク隔離の保証ではありません。

## ソースから実行

確認済み正規リポジトリか既存チェックアウトのルートで実行し、`app/` は使いません。

**新規**だけで、非公開 `.env` に秘密を一度生成します（POSIX shell/OpenSSL）。`next dev` はランチャーの生成を使わず、32 文字以上の強い `JWT_SECRET` がなければログイン失敗します。更新時は既存の有効 JWT/API/識別秘密と絶対 `DATA_DIR` を [移行手順](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) で保持します。他の例の値は新規だけで見直し、`.env` を公開・コミットしません。

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

本番ソース実行は `npm run build` の後に `npm run start`。`DATA_DIR` は絶対パスとし、公開前に強い `INITIAL_PASSWORD` を設定します。

既定は `~/.kitsune-router`、Windows は `%APPDATA%\kitsune-router`。現行 DB は `db/data.sqlite` で、`db.json` ではありません。秘密・識別子・auth・証明書も保持します。旧状態は停止後に全体をバックアップし、明示 `DATA_DIR` は移動しません。[移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md) · [開始](/ja/getting-started/quick-start/)。現行テスト・ビルド成功は主張しません。
