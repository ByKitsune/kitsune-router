# トラブルシューティング

現行 version/SHA、絶対 `DATA_DIR`、正確なルート、秘密を除いたエラーを集めます。改名の不一致で状態削除・全設定置換・秘密公開をしません。

## 起動と移行

- パッケージなし：1.0.0 公開待ち。`@bykitsune/router` を確認し、裸名や架空 Kitsune 0.x を使いません。[ソース](/ja/getting-started/installation/)。
- 古い Node：>=22.19.0。移行は対応 Node/Bun の native SQLite snapshot が必要で、安全でない raw copy はしません。
- 使用中ポート：API/画面は 20128。所有者を調べ正常停止し、広範な `pkill`/`kill -9` を避けます。
- 空の状態：絶対パスと `/app/data` mount を先に確認。明示 `DATA_DIR` は自動移動しません。
- 移行拒否：旧 source/helper を停止し、安全・整合性・所有権・既存 target を確認。lock を盲削除しません。[ガイド](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。

## クライアント

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

上流 refresh token でなくゲートウェイキー。OpenAI は `/v1`、Claude Code は origin、Codex は TOML `kitsunerouter`/Responses。コマンドは `kitsune-router`、他設定を保持。

404/410 は正確なモデル、429/503 は reset/retry/cancel を確認。非対応文書・制御は明示変更し黙って捨てません。不明費用は無料でなく概算は請求書でありません。ディレクトリ・`.env`・キー・証明書を添付せず、[issue](https://github.com/ByKitsune/kitsune-router/issues) に最小の匿名化再現を記載。[運用](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。
