# 変更履歴

## 未リリース — 2026-10-29 のソース追補

これらは 1.0.2 の成果物とは別のソース変更です。リリース、デプロイ、
実アカウントでの利用可否や請求額の一致を証明するものではありません。

- GPT-6.1 Terra を OpenAI と Codex のカタログに追加。OpenAI の経路は
  ツールを保持するため Responses を使用します。API 価格は推定であり、Codex の請求額ではありません。
- CommandCode の 1.88 ヘッダーを反映し、変換リクエストのセッションを分離して、
  再試行中は同じ識別子を保持します。
- Google スキーマの有効な配列境界を保持し、観測された Copilot のコンテキスト超過を
  アカウントのクォータ不足と区別します。
- 確定した使用量更新をまとめ、選択期間の統計とグラフを再取得します。古いデータは
  元の期間を表示し、失敗時には再試行できます。リクエストのライブ情報は別に配信されます。
  元のブラウザー問題の原因は未確認です。
- Ollama Local の音声と埋め込みには有効な接続が必要で、API キーは任意です。
  音声は WAV が既定で、PCM と JSON 内の WAV に対応し、MP3 を拒否します。
  一覧のタグや埋め込み候補はインストール済みの証明ではありません。
- スコープ不明の汎用価格を使わないため、以前は数値だった一部のサブスクリプションや
  ゲートウェイの今後の料金は不明になります。保存済み履歴は変わりません。
  プロバイダーとモデルを特定した価格参照は請求書ではなく、推定に使うのは
  一部のテキスト用データのみで、取得から24時間以内に限ります。

[ソース追補と検証の限界](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/21-upstream-9router-2026-10-29.md#2026-10-29-source-follow-up)

## Kitsune Router 1.0.2 — private コンテナ配布済み、匿名 pull 未確認、npm ブロック中

不変タグ **`65c8b97d783becab3f1e1210d2ab9ce67992e13b`**、PR #2 merge `23375bf1`。exact-source SSH は **9,041 成功、100 skip、assertion/suite 失敗ゼロ**、strict lint、18 docs tests/static export、app build、pack 成功。CI `40468830176` は同一ソースツリーで成功。ローカル tarball の install/runtime/upgrade、六つのコンテナ再起動と exact-source browser 検証は記録範囲で成功しました。mock は子 `Date` のみで本番順序は不変、warning logging は publish のみで pack 不変です。

npm `40469972263` は gate/docs/pack 後 **E403**（2FA または bypass 2fa 有効の granular token が必要）、公開読戻し HTTP 404。原本 CI 成果物 `12718343077`、SHA-256 `a52d736ade6b8cbcf17ba114c9b55018956a7f1b35c4280edcae2912de8a3114` はローカル tarball と別バイトですが、双方独立 help/version/runtime/upgrade smoke に成功し原本状態/キー保持、secret 0600、終了 0。GitHub UI token 交換は未確認、1.0.1 npm 原因は不明のままです。

以前の GHCR `40469972099` は build/push 前に失敗、初回 recovery `40483141695` は caller `GITHUB_SHA` context で registry 前に停止。PR #4 merge `802c61bf` で明示 API ソース検証を採用。成功 recovery **`40485038668`** が同 tooling で不変 runtime `65c8b97d` を配布し、9,041 成功/100 skip/失敗ゼロ、labels/SLSA v1/SPDX と `latest` promotion 成功。独立認証読戻しで両タグ index **`sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b`** を確認。配布 image `af6416b6` は16層/rootfs検証・六つの実 SSH start/restart に成功、健康な1.0.2、キー安定/0600。最新 package は **private**、Public 選択未確認、匿名 grant HTTP 401。npm ブロック中、GitHub Release/production 配備なし、preview 未更新。以前の失敗、tooling/runtime、各成果物は別証拠のままです。[1.0.2 証拠](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md) · [技術詳細](https://github.com/ByKitsune/kitsune-router/blob/master/docs/CHANGELOG_v1.0.2.md)。

## Kitsune Router 1.0.1 — 不変の試行、公開成功は未確立

`v1.0.1` は **`745834026a5a9f55dffce40c0ad01bf3106e8237`** に固定、PR #1 は master `ce752a9f` に統合。SSH は **9,039 成功、100 skip、失敗ゼロ**、CI `40463259397` 成功。GHCR `40465152324` は exact-source ゲートで **9,038 成功、一件失敗**（`db-scoped-cache:216`）、login/push 前に停止し正規 1.0.1 イメージは未公開です。

npm `40465152995` は exact gate/docs build/pack 成功後 publish 失敗。冗長出力で最終エラーが切れ、原因未確定です。保存原本 `12716498091`、tarball SHA-256 `f00e2f581631065a9afa4719999487bf2f5eba31c096393d2a9141fb13bd55e8`。2026-10-27 公開読戻し HTTP 404、GitHub Release 1.0.1 未作成。[試行記録](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.1.md)。移行テストは **計58件に拒否8件を含みます**。本番所有権検査は fail-closed、限定 UID 65534 Linux 証拠は一般 non-root 対応を示さず、ネイティブ Windows/macOS 移行は未検証。ByKitsune PR #6 は `73a14982` に統合、production 配備なし。旧件数は 1.0.2 の証明ではありません。

## Kitsune Router 1.0.0 — 試行タグ保持、npm/GHCR 未公開

不変タグ `v1.0.0` は `390a65677c06a30084386d2a2adf8b0c48709281`。non-root ownership workflow 失敗で公開に至りませんでした。**9,029 件成功**は旧候補の証拠で、1.0.1 の検証ではありません。以下に当時の範囲を保持します。

**Your models. Your routes.** [ByKitsune](https://bykitsune.com) が保守・支援し、アカウント・プロバイダー順序は強制しません。対象 `ByKitsune/kitsune-router`、npm `@bykitsune/router`、コマンド `kitsune-router`、キー `kitsunerouter`、image `ghcr.io/bykitsune/kitsune-router`。

writer 停止・全体保存後、`~/.zenrouter`/`~/.9router` → `~/.kitsune-router` を検証コピーし、原本保持・既存 target 上書き拒否。明示 `DATA_DIR` 優先。秘密/auth/ソルト/信頼証明書を維持。変数 `KITSUNE_ROUTER_*`、ヘッダー `x-kitsune-router-*`、`/v1/*` と 20128 は不変です。

この試行は npm/GHCR を公開していません。旧 tag・範囲・証拠を保持し、現行 1.0.2 の検証・公開は未完了です。[試行記録](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.0.md) · [当時の技術履歴](https://github.com/ByKitsune/kitsune-router/blob/master/docs/CHANGELOG_v1.0.0.md) · [移行](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)。

> **歴史資料：** 以下は当時の ZenRouter 名称・成果物・URL・検証を保持します。Kitsune 0.x 公開や現行ソースの検証ではありません。[現行インストール](/ja/getting-started/installation/) を使い、旧更新コマンドを使わないでください。下の Unreleased 作業はリブランド提案以前の記録です。

## リブランド前の履歴 — 10月の整合性修正

- Next.js の fetch ラッパーとゲートウェイ転送層の再帰呼び出しを修正し、チャット・OAuth 更新・使用量・一覧取得を復旧します。アカウントやプロキシの方針は変更しません。
- ソースのビルドとテスト前に直接依存と lockfile の一致を確認します。古い Next.js/Undici を同梱せず、`npm ci` で再インストールします。公開済み 0.9.13 成果物は変更しません。

[転送層の復旧と再現可能なソースビルド](https://github.com/ZenRouter/ZenRouter/blob/master/docs/audit/20-fetch-transport-recovery-2026-10.md)

- 検証済みの安定版クライアント識別情報とモデル一覧を更新し、提供元別価格とメディア固有の課金単位を監査します。時間帯料金と公表済みの変更料金は記録された利用時刻で選択し、その後に利用者の上書きを適用します。
- 全登録モデルの有効または不明な料金を表示し、編集を保持する検索を追加します。契約プラン、利用クライアント、サブスクリプションクレジットを API 請求と混同しません。
- TokenHarbor の正確な無料ルートと実際に提供された速度階層の料金を修正し、キャッシュ書き込み寿命・不明な料金・明示的な上書きを区別します。
- 既知の小計と未価格リクエスト数を表示し、不明な総額を小計で置き換えたり履歴を再計算したりしません。
- 認可、非公開ストレージ、キャンセルとプロキシ、推論制限、失敗メトリクスを整合させ、再現された10月の上流プロトコル・CLI 修正を選択的に適用します。
- ソース検証と公開保護を統一します。変更は不変の0.9.13成果物に遡及せず、実サービスの利用権限や請求一致を証明しません。

[範囲・出典・検証の限界](https://github.com/ZenRouter/ZenRouter/blob/master/docs/audit/17-october-reconciliation-2026-10.md)

## 0.9.13: 2026-10-19

- Antigravity Claude のモデルテストで誤った thinking 予算エラーを修正。プロバイダの thinking 既定値を保存し、実際のクライアントが指定した出力上限は変更しません。
- OpenAI/Codex に Auto・Standard・Fast・Ultrafast の独立した設定を追加。ネイティブ `service_tier` と正しい Responses 経路を使用します。
- アップロードファイルとツール添付を保持。条件を満たさないアカウントだけを当該リクエストで除外し、正常性ペナルティや速度の引き下げを行いません。
- 古い非同期応答による設定の上書きや別条件のテスト成功表示を防止。要求・実際の速度と不明な追加料金を区別します。
- 実装検証：Node 22/24 で各 6,248 件の通常テスト成功、3 件の想定された失敗、100 件の任意スキップ。合成テストは実際の権限・速度・請求を保証せず、高速な設定では費用が増える場合があります。

[リリースノート](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/releases/RELEASE_NOTES_v0.9.13.md) · [技術詳細](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/docs/CHANGELOG_v0.9.13.md)

## 0.9.12: 2026-10-19

- ネイティブ・変換リクエストでツール画像の型と thinking 設定を保持し、Ollama・CommandCode も対象にしました。
- OpenCode JSONC を保持し、DB インポート後に認証・モデル・クォータのキャッシュを更新します。
- node-forge 依存チェーンを削除し、プロキシ/DNS の境界を強化。キャンセル時は再試行を停止します。
- Antigravity Argon CLI/クォータ対応と根拠のある料金・ライフサイクル修正を追加。コンテキストや出力上限を推測で拡大しません。
- 実装検証：Node 22/24 で各 6,052 件成功、任意の 100 件をスキップ、失敗ゼロ。4 lockfile の監査で警告ゼロですが、実プロバイダへのアクセスや安全性の保証ではありません。

[リリースノート](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/releases/RELEASE_NOTES_v0.9.12.md) · [技術詳細](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/docs/CHANGELOG_v0.9.12.md)

## 0.9.11: 2026-10-17

本版は、カスタマイズされた ZenRouter の複数ターン画像処理、推論設定、ネイティブエラー、キャッシュ料金の推定を修正します。

- ツール結果、圧縮済み履歴、テキスト圧縮、プロバイダ間変換で画像の型を保持し、base64 を通常のテキストに変換しません。
- thinking 設定、ツール ID、署名、SSE/JSON エラーを保持します。未対応のネイティブ設定は明示的に失敗し、無効なリクエストで正常なアカウントをクールダウンしません。
- 10 月 17 日の models.dev データと製品・完全なモデル ID ごとに照合し、コンテキスト、入力、出力の上限を分離します。不明な料金と無料のゼロ値も区別します。
- 料金編集では変更した上書きだけを保存します。Gemini 2.5 Pro と Flash-Lite は、既存の利用条件を満たすプロジェクト向けに表示を維持します。以前の全世界での廃止という結論は誤りでした。

**セキュリティ警告：**アプリと CLI の [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) は未解決で、GitHub に修正版は掲載されていません。プロトコル試験は、実アカウントの権限や請求額を検証するものではありません。

[リリースノート](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/releases/RELEASE_NOTES_v0.9.11.md) · [技術詳細](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/docs/CHANGELOG_v0.9.11.md)

## 0.9.10 — 2026-10-16

0.9.9 の公開後に、監査の指摘をコードに対して再検証する中で行った変更のパッチリリースです。npm のバージョンは不変のため、これらは公開済みバージョンには含まれていませんでした。破壊的な API 変更はなく、初回起動時にデータベース列が 2 つ自動追加されます。

### 修正

**廃止されたモデルが宣伝されなくなりました。** `gemini-2.5-pro` と `gemini-2.5-flash-lite` はどちらも 404 *"is no longer available to new users"* を返します — 5/5 と 2/2 で再現し、30 日分の本番ログでも裏付けられています。どちらも一覧に表示され、利用可能に見えていました。ID はレジストリに残したまま非表示にするため、保存済みのコンボは 404 ではなく明確な失敗になります。

**15 件の `deprecated` モデルが依然として提供されていました。** フラグは存在し文書化されていましたが、消費していたのはダッシュボード UI のみで、API 経路にはフィルタが一切ありませんでした。deepseek 接続を 1 つ有効にすると、廃止された互換エイリアス 2 件が一覧に表示されることを再現しました。現在はフィルタされます。重要な区別として、**プロバイダ単位**の `deprecated: true` は claude/codex/antigravity/… に対する ToS リスク通知であり、そのプロバイダのモデルを隠してはなりません。

**Gemini のコンテキストウィンドウは不明ではなく、意図的に伏せられていました。** 11 件のレコードがウィンドウを未検証と宣言し、それが null 化していました。`/v1/models` は有限値のときのみ `context_length` を出力するため、**334 モデル中 17 件**がウィンドウなしでクライアントに届いていました。models.dev の公式エントリはこれらの ID に 1,048,576 を掲載しており、ルートも提供されているため、数値を削除するのは最悪の選択でした。現在ウィンドウを持たないのは **12 件**で、いずれも実際に提供不可か、実際に未検証です。

**翻訳における 2 件の静かなデータ損失。** `openai-to-cursor` はクライアントの `max_tokens` を固定の 32000 で上書きしていました — 200 を要求したクライアントが 32000 を受け取っていました。現在この定数は下限であり、上書きではありません。`openai-to-commandcode` は不正なツール引数を通知なしに `{}` に変換していたため、モデルはパラメータなしのツール呼び出しを受け取り、損失を示すものは何もありませんでした。

### 追加

**TTFT がついに測定可能になりました。** ストリーミングハンドラは初回トークンまでの時間を計算して出力していましたが、保存していませんでした — 監査が 5,471 ms の中央値を報告するために 304 行のログを解析する必要があったのはそのためです。現在は NULL 許容の列として永続化され（未測定を中央値に引きずらせないよう NULL で書き込み、0 にはしません）、`/api/metrics` で `zenrouter_ttft_ms{quantile=...}` として公開されます。

### 注記

本リリースの 3 件の知見は、以前の結論を信じるのではなく再確認することで得られました。監査は `context_length` が null のモデルを **3** 件と報告しましたが実際は **17** 件でした。`gemini-3.5-flash-lite` は廃止モデルと並んで記録されていましたが **HTTP 200** を返します（以前の 429 はクォータでした）。また 250,000 は `claude-sonnet-4-6` の *Antigravity ブリッジ*の上限であり、Anthropic API のウィンドウは 1,000,000 でした。

## 0.9.9 — 2026-10-15

> **0.9.7 からのアップグレードですか？本リリースには 0.9.8 も含まれます。** 0.9.8 のバッチは 2026-10-13 に用意されましたが当時は公開されず、**2026-10-16 に別リリースとして公開**されました（各レジストリの `latest` は 0.9.9 のまま）。0.9.9 は `v0.9.7` から `v0.9.9` までの 45 コミットにあたるため、0.9.8 の内容（重大な依存関係アドバイザリの解消と Tier-1 上流ポート）をすべて含みます。**0.9.9 を推奨します。** 0.9.8 には以下の監査修正は含まれません。

外部監査（11 件の文書）と [models.dev](https://models.dev) に対するカタログ全体の検証に対応したリリースです。すべての指摘は変更前に稼働中のゲートウェイで再現し、各修正には回帰テストを付けています。**Node.js >=22.19.0** が必要です。パッケージは `@joyccn/zenrouter`、バイナリは `zenrouter` のままです。破壊的な API 変更はありません。

### セキュリティ

**1 つのクライアントが全プロバイダを枯渇させることはできなくなりました。** `apiKeys` テーブルにはクォータ列が一切なく、`validateApiKey()` は真偽値しか返していませんでした。つまり*クライアント*の消費量を制限するものが何もなく、唯一の制限はダッシュボードのログイン制限と*上流*アカウントのクールダウンだけでした。`/v1` はキー単位のレート制限（600 RPM、120/秒バースト、`V1_RATE_LIMIT_RPM`/`V1_RATE_LIMIT_BURST`）を備え、バケットキーはハッシュ化、カウンタ表は上限付き、429 には `Retry-After` と `x-ratelimit-*` を返します。既定値は実測トラフィック（ピーク約 246 req/分 → 約 30 倍の余裕）から決めています。

**内部のルーティング情報が漏れなくなりました。** 本番は `"No active credentials for provider: openai"` を返し、上流プロバイダ名を明かしていました。同じ文言が画像・動画・検索・tts・stt・embeddings・fetch・Gemini ネイティブの各ハンドラにもありました。クライアントには中立なメッセージを返し、Zen 自身が生成する機械可読な診断（`output_budget_exhausted` など）は引き続き転送します。

**アカウントのメールアドレスがログから消えました。** journald には 589 行・27 件の一意なアドレスが含まれていました（`connectionName` が `displayName || name || email || id` に解決されるため）。識別子はソルト付きの短いハッシュになり、検索性と識別性を保ちつつ復元できません。

**失効したトークンは一時的ではなく恒久的に扱います。** `token_revoked` はどのルールにも一致せず汎用の 401 クールダウンに落ちるため、死んだアカウントが 2 分ごとに再試行されていました。本番では 8 時間で 31 件、1 つのアカウントが 16 回再試行されました。現在は 1 時間のクールダウンと `needs_reauth` ステータスになります。更新の試行は意図的に残しています。組織ポリシーによる拒否と違い、失効したトークンは有効なリフレッシュトークンで復旧できる可能性があるためです。

**基本セキュリティヘッダーと明示的な CORS 許可リスト。** ゲートウェイは Cloudflare トンネル（`zen.hlcyn.xyz` → `127.0.0.1:20128`）で公開されているため、見た目だけの話ではありません。

### 修正

**自動更新が再び機能します。** コードは未登録の（404 になる）単純名 `zenrouter` で npm に問い合わせていたため、`/api/version` は常に `latestVersion: null` を返し、アップデータのインストールコマンドも失敗していました。スコープ付きの `@joyccn/zenrouter` を単一の共有定数とし、バージョンルート・アップデータ・ランディングページが参照します。

### ルーティングとエラー

**コンテキスト超過が 502 として報告されなくなりました。** 長すぎるプロンプトは 200 OK の SSE ストリーム内で `context_length_exceeded` として届き、503 → 502 に変換されていました。ByKitsune は 502 を再試行するため、決して成功しないプロンプトが再試行され、その間に健全なアカウントが順番に 30 秒ロックされていました。現在はアカウントをローテーションせず 400 と `invalid_request_error` を返します。

**コンテキストウィンドウは最大 778k トークン少なく報告されていました。** `/v1/models` は Codex CLI の上限（872,000、GPT-5.6 では 272,000）を `context_length` として公開していました。実測では、272,000 と宣伝されたモデルで 402,486 トークン、872,000 と宣伝されたモデルで 902,486 トークンが受理され、実際の上限は 922,000 でした。GPT-6/GPT-5.6 は API 仕様（1,050,000 / 922,000 / 128,000）を報告し、CLI の上限は `limits.cliDefaultContext`/`cliMaxContext` に残ります。

**ストリーム途中の失敗がアカウントをマークします。** 従来は 200 ヘッダー後に失敗したアカウントもローテーションに残るため、すべてのリクエストが 200 で切り詰められた内容を返し、フェイルオーバーも起きませんでした。ステータス監視では見えない障害です。クライアント切断はこの経路に到達しません。

**プロバイダの `Retry-After` はデッドコードでした。** `checkFallbackError` はヘッダーを読むために `Response` を受け取る設計でしたが、どの呼び出し元も渡していなかったため、`Retry-After: 3600` を返すプロバイダが数秒で再試行されていました。

**予期しない例外が記録されます。** 裸の `catch {}` は汎用 500 を返しつつ、ログのどこにも現れない `serverRequestId` をクライアントに渡していました。現在はエラー名・メッセージ・スタックをその id とともに記録します。プロンプトと応答の内容は決して記録しません。

### 翻訳

`top_p`、`stop`/`stop_sequences`、`seed`、`metadata.user_id` が複数の経路で失われていたため、`stop: ["</end>"]` を設定したクライアントは、ゲートウェイが Claude にルーティングしたときだけ切り詰められていない出力を受け取っていました。失敗したツール結果は OpenAI のツールメッセージに存在しない非標準の `is_error` フィールドで通知されていたため、受け取ったモデルはツールが成功したと判断しかねませんでした。現在は内容内の `[tool_error]` マーカーです。

### カタログ

models.dev の公式ベンダー項目に対して 5 つのウィンドウを修正しました：`gpt-4.1*`（1,000,000 → 1,047,576）、`command-a-translate-08-2025`（128,000 → 8,000、16 倍の過大表示）、`ministral-3b/8b/14b`（128,000 → 131,072/262,144）、`codestral-latest`（128,000 → 256,000）。素朴な比較では 206 件の差分が報告されましたが、単位の慣習（256000 と 262144）とゲートウェイ固有の上限を除外すると実際は 5 件でした。ChatGPT アカウントが拒否する 4 つの Codex ルート（`gpt-5.5`、`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.3-codex-spark`）は、機械可読な理由とともに `routeAvailable: false` を持ちます。

### 新しいエンドポイント

`GET /api/health` は実際のプローブになりました。データベース読み取り、ストレージが応答しない場合は **503**、さらに稼働時間、バージョン、ロック中のアカウント数と再認証が必要な数。`GET /api/metrics` は Prometheus テキスト（使用中のモデル、ステータス別の失敗、処理中のリクエスト）を提供し、トークンで保護され、厳密に集約されています。

### 検証と制限

分離スイート：**1,436 ファイル、4,525 ケース — 4,424 成功、0 失敗**。`npx eslint .` はクリーン。レジストリのベースラインはバイト単位で一致。分離した `DATA_DIR` で実行検証済み：ヘルス JSON、セキュリティヘッダー、CORS 許可リスト、`Retry-After` 付き 429、未認証で 401 を返す metrics。カタログ作業はメタデータであり、利用権や稼働中の可用性を保証せず、448 行は models.dev に参照がありません。脆弱性がないわけではありません。`node-forge` の勧告は上流に修正がなく、影響経路は到達不能なままで、これはテストで表明されています。

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
