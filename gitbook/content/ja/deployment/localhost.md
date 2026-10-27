# ローカル配置

画面と API は **20128** を共有し、既定 3000 ではありません。Node.js >=22.19.0、1.0.2 は最終 SHA/tag、検証ゲート・公開待ちです。旧タグは不変の試行記録で、registry 利用可能性の証明ではありません。[インストール](/ja/getting-started/installation/)。公開確認後 `kitsune-router`。

- Dashboard: `http://localhost:20128/dashboard`
- API: `http://localhost:20128/v1`
- Health: `http://localhost:20128/api/health`
- State: `~/.kitsune-router` または `%APPDATA%\kitsune-router`

```bash
DATA_DIR=/absolute/private/path kitsune-router
```

明示 `DATA_DIR` は優先され、移動しません。ランチャーか `Ctrl+C` で停止し、広範囲 kill・同時書き込みを避けます。SQLite・秘密・識別子・auth・証明書を停止後に全体保存し、稼働中への復元や権限緩和をしません。

移行は停止済み `~/.zenrouter`/`~/.9router` を検証コピーし、原本保持・上書き拒否します。[ガイド](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。ソルト・信頼根を保持し、強い初期パスワードを設定します。ソースは絶対パスを使い、古い Node 20/`db.json` 手順でなく [運用](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md) と `.env.example` を参照してください。
