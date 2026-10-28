# 公開提出の準備

状態: Claudeは2026-10-16にMCP connector（slug `fudoki`、認証なし、6 tool）を審査に提出した。Plugin bundle は2026-10-16に `wwwyo/fudoki` で提出したが、2026-10-25に repo を `fudoki-hensansitu/fudoki` へ移したため出し直した（`plugins/fudoki`、main を追跡、push webhook あり。Publish requested で審査待ち）。申請のソースは repo を変えられず、旧申請はリダイレクトで読めても push webhook が `wrong_repository`（422）で拒否されたので、旧申請は取り下げた。OpenAIは2026-10-21に発行者の本人確認（Individual）が通り、ドメイン確認（`api.fudoki.dev/.well-known/openai-apps-challenge`）を済ませてZIPを提出し、In reviewになった。提出画面はpositive 5件・negative 3件ちょうどを求める。提出時にカテゴリの確認とMCP checksのnon-blockingの警告が出ており、未対応。録画URLは#197より前のUIの記録。仕様確認日: 2026-10-14。

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
| Support URL・連絡先 | https://docs.fudoki.dev/support （2026-10-15 HTTP 200）。support@fudoki.dev（転送設定は有効）。GitHub Issues |
| Privacy URL | https://docs.fudoki.dev/privacy （2026-10-15 HTTP 200） |
| Terms URL | https://docs.fudoki.dev/terms （2026-10-15 HTTP 200） |
| アイコン | plugins/fudoki/assets/icon.png（256×256 PNG、既存markから作成） |
| package | .build/plugins/fudoki-0.2.0.zip（再生成可能、未提出の準備用） |
| 録画デモURL（暫定・提出用の正本ではない） | https://youtu.be/VX8z8EbJDyU （ChatGPTの北区の操作、89秒。2026-10-14に#197より前のUIで撮影）。現行の6 tool・描画toolのみUIの挙動で撮り直し、置き換える |
| 掲載用スクリーンショット | Claudeで撮影済み（検索3件・節の内訳・COFOG 10の集計）。gitの外の `.agent/claude-submission-shots/` に置く |

OpenAIの英語subtitleは `Compare municipal spending`、日本語は「自治体の歳出を比較し出典を確認」。本文・starter prompts・5 positive / 3 negative case（2026-10-14に事業の評価の検索を各1件足し、2026-10-21にOpenAIの「positiveはちょうど5件・negativeはちょうど3件」に合わせて内訳と出典を1件にまとめ、pluginを呼ぶべき評価資料の金額のcaseをnegativeから外した）・課金なし・JP・release notesはportable manifestの `extensions.com.openai` に入れた。support/privacy/terms と録画URLは公開を確認してから入れた。[OpenAIの提出metadata](https://developers.openai.com/plugins/deploy/submission)

support/privacy/terms の項目調査・本番設定との照合・運用方針は [ポリシーの調査](policies.md)を参照する。ページは通常の公開 build に含める。ページの作成を、デプロイ後の公開 URL の確認や提出の完了とは扱わない。

Anthropic MCP Directory の英語掲載文案（MCP connector 用。Plugin bundle・OpenAI の別申請とは区別する。2026-10-28 のレビュー対応としてローカルで準備。公開反映・申請画面の更新・審査担当への返信は未実施）:

> Search Japanese municipal initial-budget and settlement expenditure data down to individual projects. Check which fiscal years, document kinds and accounts are covered, compare spending on consistent terms, and inspect breakdowns and sources. For covered municipalities and years, also find pages that may contain project evaluations; results provide source locations and short excerpts, and evaluation content must be verified in the original source. COFOG classifications are judgments made by 風土記 and include provisional classifications. Access is read-only and requires no authentication. Individual transactions, revenue data and write operations are not supported. On clients supporting MCP Apps, expenditure search results and node breakdowns can be shown as tables and charts.

日本語の併記案:

> 自治体の当初予算・決算の歳出を、事業の単位で検索し、内訳と出典を確認できます。比べたい年度・会計が収録されているかを確かめ、同じ条件で比較します。COFOG分類は風土記の判断で、暫定分類を含みます。個別取引、歳入、書込みには対応しません。

カテゴリ候補はProductivity。各社の提出画面で選択できる値を確認する。connectorの出典リンクは自治体の第三者ドメインを含むため、発行者所有のURIとしてallowlistへ入れない。確認ダイアログが出る扱いを維持する。[Claude connectorのリンク条件](https://claude.com/docs/connectors/building/submission#allowed-link-uris)

## レビュー用の接続とcase

既存URLへ匿名で接続する。風土記用のアカウント、API key、test passwordは不要。レビューhost側の接続設定を済ませ、6つのtool、うちUIを持つのは描画tool（render_expenditure_view）1つ、出典のリンクが使えることを確認する。データtoolは画面を出さず、モデルが描画toolを呼んだときだけUIが出る。公開PDFの中継には既存のサイズ・時間・頻度上限があり、取得時の内容が取り込み時と同じとは保証しない。

実行caseの正本は `plugins/fudoki/plugin.json` の `review.test_cases`。5件のpositiveは収録範囲・条件検索・内訳と出典・COFOG集計・事業の評価の頁の検索、3件のnegativeは個別取引/銀行口座・歳入・書込み。prompt、必要な前提、期待toolと引数、期待結果を記した。前の結果のnode_idは捏造せず、実際に返された値を使う。

| case | ChatGPT | Claude | Codex / Claude Code / Cursor package |
| --- | --- | --- | --- |
| 収録範囲・3件の検索・内訳・出典 | #197後の6 toolで描画を確認（「ツールを更新」が必要だった） | 合格。収録範囲だけ描画toolが呼ばれずUIが出なかった | インストールとskill実行は未実施 |
| COFOG集計 | 未実施 | 合格 | 未実施 |
| 事業の評価の頁 | 録画で確認 | 合格 | 未実施 |
| negative 4件 | 未実施 | 合格（歳入は検索toolを1回呼んでから対象外と回答） | 未実施 |

MCPのHTTP要求だけの確認、manifest検査、skill本文のレビューは、会話内のtool選択や描画を確かめた結果とは区別する。実行結果は [検証記録](verification.md) に追記する。新UIのデプロイと公開hostでの検証は別担当・別操作として残る。

## 撮影する3場面

1. 収録範囲。「中野区で収録されている年度、当初予算・決算、会計、出典を教えて」の応答の表。
2. 検索と内訳。「中野区の2025年度決算一般会計の目を金額の大きい順に3件見せて」の結果と、最初の目の内訳。
3. 出典。「この明細の項目と金額を出典で確認したい」の結果からPDFを開き、取得情報と頁・枠を示す。

Claudeの掲載画像はPNG、幅1000px以上、3〜5枚で、promptを画像に入れずapp応答だけにcropする。prompt本文は別に提出する。今あるローカル試験hostの合成PDF画像や、実画面未確認のmockupを実hostの掲載画像として使わない。UI移行後に、Claudeの応答が実際に出てから撮影する。[Claude screenshot仕様](https://claude.com/docs/connectors/building/submission#carousel-screenshots-for-mcp-apps)

## 録画手順

個人用の接続「風土記」はChatGPTとClaudeに残っている。重複作成せず、利用可能な接続を選ぶ。公開するUI版がhostで利用できる状態になったら、画面録画の開始・停止を利用者が行い、上記3場面と「この決算を書き換えて保存して」の対応範囲の説明を撮る。実際に呼ばれたtoolと結果が読める速度で操作し、会話履歴・アカウント情報・他のタブを映さない。

Computer pluginでの操作補助も可能だが、録画機能とは別である。現行UIでの提出用の録画は未実施。manifestの `review.demo_recording_url` には2026-10-14の#197より前のUIの記録を暫定で入れてあり、提出用の正本とは扱わない。保存後は再生して字幕・数字・成功した操作を確認し、利用者が選んだレビュー閲覧可能な場所へ公開する。外部への公開は禁止されている本作業では行わない。撮り直した公開リンクの再生とアクセス権を確認できたら `review.demo_recording_url` を置き換え、ZIPを再生成する。

## 後日、外部で行うこと

OpenAIは公開用ZIPをDeveloper PortalのPluginsへ読み込み、既存MCP URLを接続する。登録済みapp IDや `.app.json` はauthor提供ZIPには含めない。掲載URL、発行者、レビュー情報、録画、国設定を確認し、portal検査を完了してから提出する。個人用custom MCP接続は公開提出を兼ねない。[OpenAIの提出](https://developers.openai.com/plugins/deploy/submission)

Claudeは `claude.ai/directory/manage` でMCP connectorとPlugin bundleをそれぞれ準備する。pluginのrepoは `fudoki-hensansitu/fudoki`、pathは `plugins/fudoki`。repo を移すときは申請を出し直す（ソースの repo は変えられない）。GitHub連携・push権限の確認、連絡先、公開ポリシー、実機確認、portalのdata handling・complianceが残る。既存connectorとpluginを組み合わせる提出として扱う。[Claude connector](https://claude.com/docs/connectors/building/submission)・[Claude plugin](https://claude.com/docs/plugins/submit)

### Claudeへの提出（2026-10-16）

- connector: 掲載名「風土記(fudoki)」、作者・会社のサイトは https://fudoki.dev、連絡先は support@fudoki.dev（転送の着信を確認済み）。提出画面は tool の `annotations.title` を見るため、最上位の `title` と同じ値を入れた（#213）。custom connector をつなぎ直すと、提出画面の掲載名と認証の選択が初期値に戻るので、提出前に見直す。アイコンは fudoki.dev のファビコンを Google 経由で表示するため、古いマークが出ることがある。
- plugin: `.claude-plugin/plugin.json` に privacyPolicyUrl・termsOfServiceUrl・supportUrl・documentationUrl を入れた（#217・#218）。新しい版は main の定期チェックか、portal の「Check for new commits」で取り込まれる。更新時は `version` を上げる。

公開ポリシーには実際のデータ収集・保存・利用・削除・第三者への共有・連絡先を確認して記す。匿名接続であっても、Cloudflareやhostを含めたデータ取扱いを未確認のまま「一切保存しない」などと宣言しない。掲載URL（support/privacy/terms）は公開済みだが、法的文書としてのレビューとportalのcomplianceへの同意は未完了で、公開によって法的適合性やcomplianceを確認したとは扱わない。
