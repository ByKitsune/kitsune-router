# VPS とコンテナー

リモートは**自己管理**ゲートウェイで、付属 hosted サービスではありません。localhost は要求するマシンです。ByKitsune や固定プロバイダー順序は不要です。

## ソースサービス

Node.js >=22.19.0、固定依存、ルート build を [手順](/ja/getting-started/installation/) に従って使います。管理サービスに非公開の絶対 `DATA_DIR`、安定秘密、強い初期パスワードを設定し、unit・image に秘密をコミットしません。

## コンテナー

**1.0.2 ソースは `65c8b97d` で検証済み、GHCR 公開はブロック中です。** Run `40469972099` は gate/login 成功後、欠落 manifest の誤判定により build/push 前に停止。認証読戻し HTTP 404 / `MANIFEST_UNKNOWN`。独立 recovery はソース/版/タグを変えず、正規イメージはまだありません。以下は digest/provenance/SBOM/readback 確認後のみ使用してください。linux/amd64 のみで、ローカル再起動検証は公開イメージの証拠ではありません。

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.2
    platform: linux/amd64
    ports:
      - "127.0.0.1:20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:?Set a strong dashboard password}
```

有効 `DATA_DIR` の既存 volume/mount を保持します。既定 `/app/data`、対応する独自パスも維持できます。新しい空 volume は移行ではありません。Docker Hub ミラーは任意。[Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)。

## 信頼境界

認証 HTTPS、firewall、有限 body/timeout と SSE buffering 無効化を使います。信頼プロキシは実 peer を `X-Forwarded-For` に追加し、入力をそのまま転送しません。Headroom/MITM 制御を公開しません。`https://router.example.com/v1` は自己配置の例です。全状態を停止後に保存し、パス・秘密・証明書を保持します。[移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [運用](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。デプロイ・スキャン成功の主張ではありません。
