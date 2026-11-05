# クイックスタート

**Your models. Your routes.** ByKitsune アカウントや固定の順序は不要です。ランチャーは Node.js >=22.19.0 が必要です。

**1.0.8 は npm・GitHub Release・正規 GHCR に公開済みです。** SQLite/tray の依存保持を修正しています。公開物の識別子、検証結果と取得方法は [公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)を参照してください。GHCR の匿名 pull-grant では HTTP 401 を観測しており、認証付き取得とは別に扱います。この応答だけでは visibility が private とも、公開ワークフローの書込権限が不足したとも判断しません。

**1.0.7 の配布履歴と既知の問題:** 不変ソース `b7f77d07` から npm・GHCR・GitHub Release に配布された 1.0.7 では、逐次 `--no-save` インストールで SQLite/tray が互いに削除される問題が確認されました。修正内容と各チャネルの実結果は [公開確認記録](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)を参照してください。旧タグと成果物の履歴は変更しません。

**1.0.2 の履歴（当時の確認）:** **Your models. Your routes.** ByKitsune アカウント・固定順序は不要。**1.0.2 コンテナは private で配布済み、匿名 pull 未確認、npm ブロック中です。** Runtime は `65c8b97d` のまま。[ソース手順](/ja/getting-started/installation/) か [許可済み private コンテナ](/ja/deployment/cloud/) を利用してください。以下は **npm** 配布/readback 確認後のみ、Node.js >=22.19.0 で使用します。コンテナ配布は npm launcher の配布を意味しません。

## 1.0.8 ランチャー

```bash
npx @bykitsune/router@1.0.8
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
