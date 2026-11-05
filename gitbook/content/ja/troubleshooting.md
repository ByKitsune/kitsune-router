# トラブルシューティング

現行 version/SHA、絶対 `DATA_DIR`、正確なルート、秘密を除いたエラーを集めます。改名の不一致で状態削除・全設定置換・秘密公開をしません。

## 起動と移行

**配布履歴と修正準備:** 1.0.7 は不変ソース `b7f77d07` から npm・GHCR・GitHub Release に配布済みですが、逐次 `--no-save` インストールで SQLite/tray が互いに削除される既知の問題があります。1.0.8 は未公開で、正確なソース CI と通常インストール候補の検証待ちです。各チャネルの実結果と既知の問題は [公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)を参照してください。

- パッケージが見つからない：対象は `@bykitsune/router@1.0.8` です。[公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)で npm の公開と読戻しを確認し、未確認なら [ソース手順](/ja/getting-started/installation/)を使ってください。古い版の E403 を現在の原因と決めつけず、実際のレジストリー結果で判断します。token をチャットやログに共有しないでください。
- GHCR pull 拒否/見つからない：対象の `1.0.8` タグ、ダイジェスト、公開・読戻し結果、必要な権限を [公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)と [Docker ガイド](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)で確認してください。認証付き取得と匿名取得は別であり、権限による応答を未配布と決めつけないでください。
- 古い Node：>=22.19.0。移行は対応 Node/Bun の native SQLite snapshot が必要で、安全でない raw copy はしません。
- 使用中ポート：API/画面は 20128。所有者を調べ正常停止し、広範な `pkill`/`kill -9` を避けます。
- 空の状態：絶対パスと `/app/data` mount を先に確認。明示 `DATA_DIR` は自動移動しません。
- 移行拒否：旧 source/helper を停止し、安全・整合性・所有権・既存 target を確認。lock を盲削除しません。[ガイド](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。
- 制限 Linux：same-UID 読取不可は本番で fail-closed、テスト分離は non-root 移行の一般許可ではありません。停止・保存後に明示 `DATA_DIR` で移動せず使うか特権レビューを依頼し、permission を無視しません。限定 UID 65534 smoke は一般対応・最終 tag の証明ではありません。

### 1.0.2 のトラブル履歴（現在版の状態ではありません）

- パッケージなし：1.0.2 ソース検証済みですが npm publish は E403（2FA または bypass 2fa 有効の granular token）、公開読戻し HTTP 404。利用者の GitHub UI での secret 交換は完了未確認です。token を共有せず、公開/readback 確認までは [ソース](/ja/getting-started/installation/) を使用してください。1.0.1 npm 原因は依然不明です。
- GHCR pull 拒否/見つからない：1.0.2 は配布済みで認証読戻し/smoke に成功しましたが、最新確認では **private**、匿名 grant HTTP 401。所有者の Public 選択は完了未確認です。許可済み private 読取権限を使うか、Public 設定と匿名読戻しを待ち、権限拒否を未配布と扱わないでください。以前の preflight/context 失敗は [運用](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md#publication-recovery-without-moving-the-tag) に保持。token を共有しないでください。

## クライアント

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

上流 refresh token でなくゲートウェイキー。OpenAI は `/v1`、Claude Code は origin、Codex は TOML `kitsunerouter`/Responses。コマンドは `kitsune-router`、他設定を保持。

404/410 は正確なモデル、429/503 は reset/retry/cancel を確認。非対応文書・制御は明示変更し黙って捨てません。不明費用は無料でなく概算は請求書でありません。ディレクトリ・`.env`・キー・証明書を添付せず、[issue](https://github.com/ByKitsune/kitsune-router/issues) に最小の匿名化再現を記載。[運用](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。
