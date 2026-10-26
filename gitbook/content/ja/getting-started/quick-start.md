# クイックスタート

**Your models. Your routes.** ByKitsune アカウントや固定プロバイダー順序は不要です。1.0.0 は検証・公開待ちのため、現在は [ソース手順](/ja/getting-started/installation/) を使えます。公開後のみ、Node.js >=22.19.0 で実行します。

```bash
npx @bykitsune/router@1.0.0
```

## 設定

1. 非公開環境に強い `INITIAL_PASSWORD` を設定し、`http://localhost:20128/dashboard` を開きます。
2. 利用権のある上流を OAuth/API キーで接続します。ゲートウェイは契約や無制限枠を付与しません。
3. ゲートウェイキーを発行・取得し、クライアント環境の `KITSUNE_ROUTER_API_KEY` に保持します。変数自体はキーを作りません。
4. 実際に有効なモデルか、事前に作成した `my-route` コンボを選びます。

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

ヘルスはゲートウェイ・ストレージの確認であり、上流権限の証明ではありません。OpenAI 互換基底 URL は `http://localhost:20128/v1`。キー識別子は **`kitsunerouter`**、コマンドは **`kitsune-router`**。[Codex](/ja/integration/codex/) と [Claude Code](/ja/integration/claude-code/) の違いを確認してください。

移行前に旧ゲートウェイと補助プロセスを止め、非公開状態全体をバックアップして [移行ガイド](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) を読んでください。改名のために空ボリュームや新しいソルト・ルート証明書へ交換しないでください。
