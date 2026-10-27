# VPS とコンテナー

リモートは**自己管理**ゲートウェイで、付属 hosted サービスではありません。localhost は要求するマシンです。ByKitsune や固定プロバイダー順序は不要です。

## ソースサービス

Node.js >=22.19.0、固定依存、ルート build を [手順](/ja/getting-started/installation/) に従って使います。管理サービスに非公開の絶対 `DATA_DIR`、安定秘密、強い初期パスワードを設定し、unit・image に秘密をコミットしません。

## コンテナー

**1.0.2 は最終 SHA/tag、検証ゲート・公開待ち**。旧試行の正規 GHCR イメージはありません。1.0.1 は login/push 前、1.0.0 は移行テストで失敗しました。アクセス・digest・読戻しを確認し、タグや npm login を公開成功と扱わないでください。linux/amd64 のみです。

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
