# 変更履歴

## 0.9.8 — 2026-10-13

デフォルトブランチの重大な依存関係アドバイザリを解消し、9router 上流同期分析の Tier-1 バッチを反映しました。20 件の変更をそれぞれ個別にコミット・テストしています。**Node.js >=22.19.0** が必要です。パッケージは `@joyccn/zenrouter`、バイナリは `zenrouter` のままです。破壊的な API 変更はありません。

### セキュリティ

**重大項目を解消:** `proxy-addr`（GHSA-jqcg-44mw-7w3h、IPv4-mapped IPv6 信頼サブネット経由の IP スプーフィング）は `express` 経由でのみ到達可能でしたが、`express` は `dependencies` に宣言されているだけでリポジトリ内のどこからもインポートされていませんでした。バージョン固定ではなく依存自体を削除し、ロックファイルから 40 個の推移的パッケージが減りました。`marked` と `selfsigned`（テスト専用、現在は devDependency）も削除しました。

**脆弱性ゼロのリリースではなく、そう主張しません。** `node-forge` GHSA-86w9-cpqp-85rv（高）には上流の修正版がありません（1.4.0 が最新）。本番での唯一の利用箇所は証明書の解析・生成・署名・シリアライズのみで、署名検証関数を呼び出さないため、影響を受ける RSA PKCS#1 v1.5 検証経路はこのコードベースから到達できません。これはコメントではなくテストで検証されます。

### 使用量と課金

OpenAI 互換のストリーミング呼び出しが `include_usage` を要求するようになり、キャッシュヒットは文字数推定ではなくキャッシュ料金で課金されます。Codex の画像リクエストは実際のトークンを使用履歴に記録します。effort 注釈付きモデル ID は `$0` ではなくベースモデルの料金で計算されます。

### ルーティングとフォールバック

「クレジット切れ」を意味する 400 はリクエストを失敗させる代わりにコンボの次のモデルへ進みます。チャットエンドポイントは `x-connection-id` によるアカウント固定と自動フォールバックに対応しました。モデル選択画面は、接続がすべて無効なプロバイダーを表示しなくなりました。

### 翻訳とプロトコル

`strict` ツール宣言が双方向の翻訳で保持されます。Chat の `response_format` は Responses の `text.format` にマップされ、Responses 専用の `text` フィールドは戻り時に削除されます。CommandCode の出力は実際の 200k スキーマ上限に制限されます。

### カタログ

Antigravity Claude Sonnet 5.5 / Opus 5.5、CodeBuddy CN の `kimi-k2.8-preview` と `deepseek-v4.1-flash`、LongCat 2.5、3.8 世代に合わせた MITM マップ、新規プロバイダー ParalonCloud。カタログ項目は宣言であり、アカウントの権利や実際の可用性を保証しません。

### 検証

分離テストスイート: **1,386 ファイル、4,335 ケース — 4,234 成功、100 スキップ、1 todo、0 失敗**（Node 24.19.0）。lint は警告ゼロ。レジストリのベースラインはバイト単位で一致。本番ビルドと分離 `DATA_DIR` での standalone スモークが成功。本番アカウントや課金対象の推論は使用していません。

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.8) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.8.md) · [Release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.8.md) · [Previous release 0.9.7 (historical)](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md)

---

## 0.9.7 — 2026-10-06

本リリースは既に統合済みの保守変更全体をまとめたものです。バージョン更新自体で独立した製品機能を追加しません。**Node.js >=22.19.0** が必要です。パッケージは `@joyccn/zenrouter`、コマンドは `zenrouter` のままです。

### カタログとクライアント識別情報

**120 件のプロバイダー/モデル項目**（チャット 100、画像 8、埋め込み 6、TTS 6）と **342 件の出典付きメタデータ**を追加しました。**既存の 827 項目は個別の再検証が未完了**です。API、IDE/OAuth、コーディングプランの制限・料金・不明値を区別します。プロバイダー/料金別名、モデル別通信方式、認証不要の検出、サービス種別をまたぐ同一 ID、実行時/運用者指定能力、入力/コンテキスト/出力上限、長文/カスタム料金を修正しました。非トークン課金をトークン料金に変換せず、不明な料金を無料扱いしません。調査済み識別情報と Gemini/Copilot のエンドポイント別ヘッダーを整合させますが、beta 権限は追加しません。

### 推論と使用量

明示的/nullable な出力上限とプロバイダー固有の思考設定を最終シリアライズまで保持し、有料の上限を黙って増やしません。Responses 推論フィールドと Claude の実際の交錯対応を保持し、beta 拒否後の再試行も考慮します。予算枯渇した試行の実使用量を記録し、Gemini の思考トークンは一度だけ合算します。未完了終端、部分出力、拒否を保持し、終端後のキャンセルによる二重保存や、空と誤判定されたコンボの再実行を防ぎます。予算を増やす自動再試行は追加しません。Codex OAuth、OpenCode Muse、Cursor は引き続き公開 API の上限を適用しません。トークン上限は総支出上限ではありません。

### 根拠付きウェブ検索

単独のプロバイダー名と `provider/search` はサービス既定値を選択し、上流モデル名にはなりません。明示指定/コンボメンバーの所属を送信前に検証します。Antigravity は専用 sandbox、実際のプロジェクト/request/session ID、モデル/思考マッピング、Google Search、アカウント別厳格プロキシを使用します。`thought: true` を回答と引用文脈から除外します。特定の Gemini モデル 404 は 1 アカウントだけ試行し、完全一致する曖昧な Antigravity リソース 404 は最大 **3 アカウント**に限定し、正常な認証情報へクールダウンを書きません。成功時は対応する検索スコープのみ解除し、他の認証/クォータのフォールバックは維持します。

### 依存関係、インストーラー、画面

React **19.3.0**、ESLint **10.12.0**、Vitest **5.0.3**/Vite **8.3.2**、Undici **8.11.2** に更新しました。Node 22 dispatcher、CONNECT、DNS 固定、キャンセル、厳格プロキシ失敗時の直接接続禁止を維持し、未使用依存を削除しました。インストーラーは正確な最小ランタイムと新しくリンクした CLI を検証します。Monaco **0.57.0** と同一オリジン worker を同梱し、文書 markdown/言語切替と React 警告を修正しつつ、下書きと hydration の安全性を維持します。限定的 ESM 境界は CommonJS ランチャーを変更せず、任意の SQLite フォールバックも残します。

### 公開保護

手動 npm/Docker フローは実在する安定タグと正確なコミットを要求し、npm provenance は dispatch ref/SHA とも一致させます。公開前に元の tarball を保存し、再試行では registry SHA512 を検証して復元します。全体の直列化と数値バージョン比較により旧版の再試行が新しい `latest` を上書きすることを防ぎ、元 artifact がない場合は安全に停止します。

### 検証、安全性、更新時の制約

既存検証には隔離テスト、警告ゼロの lint、アプリ/CLI ビルド、文書出力、ブラウザー確認、実際の loopback/standalone SQLite による検索/使用量の受け入れ試験が含まれます。最終ローカル検証：Node 22.23.2 で **494 テストファイル、4,091 件成功、100 件スキップ、1 件 todo、失敗ゼロ**。lint はエラー/警告ゼロで、CLI パッケージと Docker スモーク試験も成功しました。運用アカウント、実際の上流推論、新たな有料再試行、自動デプロイは使用していません。カタログ調査は **アカウントの利用権限や実際の可用性を証明しません**。

TLS 検証は有効のままです。自己署名証明書の例外は個別のテスト要求のみで、全体設定ではありません。**node-forge と braces のセキュリティ勧告は未解決**であり、脆弱性ゼロを主張しません。公開後は `@joyccn/zenrouter@0.9.7` または固定イメージ `joyccn/zenrouter:0.9.7` を使用してください。コンテナー公開は **linux/amd64 のみ**です。**/app/data** を永続化し、更新前にバックアップしてください。この文書は公開完了やタグの可用性を保証しません。

---

[GitHub リリース](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.7) · [完全な変更履歴](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [技術詳細](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.7.md) · [リリースノート](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md) · [前バージョン 0.9.6（履歴）](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.6.md)
