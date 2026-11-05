# VPS とコンテナー

リモートは**自己管理**ゲートウェイで、付属 hosted サービスではありません。localhost は要求するマシンです。ByKitsune や固定プロバイダー順序は不要です。

## ソースサービス

Node.js >=22.19.0、固定依存、ルート build を [手順](/ja/getting-started/installation/) に従って使います。管理サービスに非公開の絶対 `DATA_DIR`、安定秘密、強い初期パスワードを設定し、unit・image に秘密をコミットしません。

## コンテナー

**現在のコンテナー対象は `ghcr.io/bykitsune/kitsune-router:1.0.8`、プラットフォームは linux/amd64 です。** 以下は対象イメージの公開、読戻し、必要なアクセス権が [公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)で確認された後に使用してください。認証付き取得の成功だけで匿名 pull を利用可能とみなさないでください。1.0.8 のダイジェストは同記録にある実際の値を使い、下記の歴史的な 1.0.2 ダイジェストを流用しません。

**配布履歴と修正準備:** 1.0.7 は不変ソース `b7f77d07` から npm・GHCR・GitHub Release に配布済みですが、逐次 `--no-save` インストールで SQLite/tray が互いに削除される既知の問題があります。1.0.8 は未公開で、正確なソース CI と通常インストール候補の検証待ちです。各チャネルの実結果と既知の問題は [公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)を参照してください。

**1.0.2 の履歴（当時の確認）:** **GHCR 1.0.2 は配布済みですが private です。** Recovery `40485038668` は tooling `802c61bf` と不変 runtime `65c8b97d` を使用し、認証付き digest/provenance/SPDX 読戻しと配布イメージ smoke に成功。`1.0.2`/`latest` index は `sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b`。以下は許可済み private GHCR アクセス、または Public 設定・匿名読戻し確認後のみ使用してください。Public 選択は未確認、匿名 grant は HTTP 401。**linux/amd64 のみ**。[Digest pin と証拠](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)。

### 1.0.8 の構成例（GHCR 確認後）

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.8
    platform: linux/amd64
    ports:
      - "127.0.0.1:20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:?Set a strong dashboard password}
```

有効 `DATA_DIR` の既存 volume/mount を保持します。既定 `/app/data`、対応する独自パスも維持できます。新しい空 volume は移行ではありません。Docker Hub への公開は、この GHCR 記録から推定しません。[Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)。

## 信頼境界

認証 HTTPS、firewall、有限 body/timeout と SSE buffering 無効化を使います。信頼プロキシは実 peer を `X-Forwarded-For` に追加し、入力をそのまま転送しません。Headroom/MITM 制御を公開しません。`https://router.example.com/v1` は自己配置の例です。全状態を停止後に保存し、パス・秘密・証明書を保持します。[移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [運用](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。デプロイ・スキャン成功の主張ではありません。
