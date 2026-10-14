# 公開提出の準備

状態: 未提出。ローカルpackageは検査済みだが、提出に必要なURL・録画・host検証が不足しているため、提出可能とは扱わない。仕様確認日: 2026-10-14。

## 掲載する内容

| 項目 | 値・状態 |
| --- | --- |
| 名称 | 風土記(fudoki)（package ID: fudoki） |
| 発行者 | 風土記。本人確認は提出画面で未実施 |
| 提供国 | 日本（JP） |
| 課金・購入 | なし |
| MCP URL | https://api.fudoki.dev/mcp |
| 認証 | 不要。公開データの読取りのみ |
| Website / Documentation | https://docs.fudoki.dev （2026-10-14 HTTP 200、内容を確認） |
| Support URL・連絡先 | support@fudoki.dev（転送設定は有効）。GitHub Issues。/support のデプロイ後にURLを登録 |
| Privacy URL | 公開用ページを作成済み。/privacy のデプロイ後にURLを登録 |
| Terms URL | 公開用ページを作成済み。/terms のデプロイ後にURLを登録 |
| アイコン | plugins/fudoki/assets/icon.png（256×256 PNG、既存markから作成） |
| package | .build/plugins/fudoki-0.1.0.zip（再生成可能、未提出の準備用） |
| 録画デモURL | 空欄。台本は下記、録画・公開未実施 |
| 掲載用スクリーンショット | 下記3場面を撮影する。実hostの提出用画像は未作成 |

OpenAIの英語subtitleは `Compare municipal spending`、日本語は「自治体の歳出を比較し原典を確認」。本文・starter prompts・5 positive / 3 negative case・課金なし・JP・release notesはportable manifestの `extensions.com.openai` に入れた。support/privacy/terms と録画URLは値を捏造せず、省略している。[OpenAIの提出metadata](https://developers.openai.com/plugins/deploy/submission)

support/privacy/terms の項目調査・本番設定との照合・運用方針は [ポリシーの調査](policies.md)を参照する。ページは通常の公開 build に含める。ページの作成を、デプロイ後の公開 URL の確認や提出の完了とは扱わない。

Claudeの掲載文案:

> 自治体の当初予算・決算の歳出を、事業の単位で検索し、内訳と原典を確認できます。比べたい年度・会計が収録されているかを確かめ、同じ条件で比較します。COFOG分類は風土記の判断で、暫定分類を含みます。個別取引、歳入、書込みには対応しません。

カテゴリ候補はProductivity。各社の提出画面で選択できる値を確認する。connectorの原典リンクは自治体の第三者ドメインを含むため、発行者所有のURIとしてallowlistへ入れない。確認ダイアログが出る扱いを維持する。[Claude connectorのリンク条件](https://claude.com/docs/connectors/building/submission#allowed-link-uris)

## レビュー用の接続とcase

既存URLへ匿名で接続する。風土記用のアカウント、API key、test passwordは不要。レビューhost側の接続設定を済ませ、4つのtool、うち3つのUI、原典のリンクが使えることを確認する。公開PDFの中継には既存のサイズ・時間・頻度上限があり、取得時の内容が取り込み時と同じとは保証しない。

実行caseの正本は `plugins/fudoki/plugin.json` の `review.test_cases`。5件のpositiveは収録範囲・条件検索・内訳・原典・COFOG集計、3件のnegativeは個別取引/銀行口座・歳入・書込み。prompt、必要な前提、期待toolと引数、期待結果を記した。前の結果のnode_idは捏造せず、実際に返された値を使う。

| case | ChatGPT | Claude | Codex / Claude Code / Cursor package |
| --- | --- | --- | --- |
| 収録範囲・3件の検索・内訳・原典 | 旧UIの個人用接続で確認済み。新packageを導入したreview実行は未実施 | 接続・対話型tool認識まで。応答・描画未確認 | インストールとskill実行は未実施 |
| COFOG集計 | 未実施 | 未実施 | 未実施 |
| negative 3件 | 未実施 | 未実施 | 未実施 |

MCPのHTTP要求だけの確認、manifest検査、skill本文のレビューは、会話内のtool選択や描画を確かめた結果とは区別する。実行結果は [検証記録](verification.md) に追記する。新UIのデプロイと公開hostでの検証は別担当・別操作として残る。

## 撮影する3場面

1. 収録範囲。「中野区で収録されている年度、当初予算・決算、会計、原典を教えて」の応答の表。
2. 検索と内訳。「中野区の2025年度決算一般会計の目を金額の大きい順に3件見せて」の結果と、最初の目の内訳。
3. 原典。「この明細の項目と金額を原典で確認したい」の結果からPDFを開き、取得情報と頁・枠を示す。

Claudeの掲載画像はPNG、幅1000px以上、3〜5枚で、promptを画像に入れずapp応答だけにcropする。prompt本文は別に提出する。今あるローカル試験hostの合成PDF画像や、実画面未確認のmockupを実hostの掲載画像として使わない。UI移行後に、Claudeの応答が実際に出てから撮影する。[Claude screenshot仕様](https://claude.com/docs/connectors/building/submission#carousel-screenshots-for-mcp-apps)

## 録画手順

個人用の接続「風土記」はChatGPTとClaudeに残っている。重複作成せず、利用可能な接続を選ぶ。公開するUI版がhostで利用できる状態になったら、画面録画の開始・停止を利用者が行い、上記3場面と「この決算を書き換えて保存して」の対応範囲の説明を撮る。実際に呼ばれたtoolと結果が読める速度で操作し、会話履歴・アカウント情報・他のタブを映さない。

Computer pluginでの操作補助も可能だが、録画機能とは別である。録画は未実施で、この文書は録画そのものではない。保存後は再生して字幕・数字・成功した操作を確認し、利用者が選んだレビュー閲覧可能な場所へ公開する。外部への公開は禁止されている本作業では行わない。公開リンクの再生とアクセス権を確認できてから `review.demo_recording_url` をmanifestに追加し、ZIPを再生成する。

## 後日、外部で行うこと

OpenAIは公開用ZIPをDeveloper PortalのPluginsへ読み込み、既存MCP URLを接続する。登録済みapp IDや `.app.json` はauthor提供ZIPには含めない。掲載URL、発行者、レビュー情報、録画、国設定を確認し、portal検査を完了してから提出する。個人用custom MCP接続は公開提出を兼ねない。[OpenAIの提出](https://developers.openai.com/plugins/deploy/submission)

Claudeは `claude.ai/directory/manage` でMCP connectorとPlugin bundleをそれぞれ準備する。pluginのrepoは `wwwyo/fudoki`、pathは `plugins/fudoki`。GitHub連携・push権限の確認、連絡先、公開ポリシー、実機確認、portalのdata handling・complianceが残る。既存connectorとpluginを組み合わせる提出として扱う。[Claude connector](https://claude.com/docs/connectors/building/submission)・[Claude plugin](https://claude.com/docs/plugins/submit)

公開ポリシーには実際のデータ収集・保存・利用・削除・第三者への共有・連絡先を確認して記す。匿名接続であっても、Cloudflareやhostを含めたデータ取扱いを未確認のまま「一切保存しない」などと宣言しない。現時点では法的文書・complianceへの同意・公開URLを用意したとは扱わない。
