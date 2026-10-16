# サポート・プライバシー・利用規約の調査と運用方針

調査日: 2026-10-14。対象は匿名・無料・読取り専用の風土記 API/MCP、文書サイト、plugin。通常の不具合・訂正は GitHub Issues、非公開の相談・個別請求はユーザー指定の support@fudoki.dev で受け付ける。公開用の3ページを `apps/docs/content/` に作成し、通常の build に含める。制定日は2026-10-14。公開 URL を実際に確認してから提出 metadata へ登録する。

## 何を載せるか

| ページ | 載せる項目 | 風土記で特に必要な理由 |
| --- | --- | --- |
| support | 運営者・窓口、接続の案内、不具合の再現情報、原典付き訂正依頼、投稿時の注意、脆弱性窓口、対応範囲 | 数字の訂正と接続の問題では必要な情報が違う。Issue の添付に会話・秘密情報を含めさせない |
| privacy | 適用範囲、取得情報と目的、受領と保存の違い、ログ、ブラウザ内保存、委託・第三者・国外処理、保存期間、安全管理、利用者の選択・請求、変更 | 認証なしでも通信情報と問い合わせを扱う。AI クライアント側の会話保存と混同させない |
| terms | 提供範囲・料金、比較の条件、ライセンスと出典、API 利用と禁止行為、制限・停止、正確性と責任、変更、準拠法、窓口 | 原典・判断・コードの権利が異なる。未収録や二重集計を説明し、無制限利用・常時稼働を約束しない |

会員登録・有料プラン・決済・退会・投稿コンテンツの包括的権利許諾は現状の機能にないため入れない。商用利用や AI による分析を一律に禁止する規定も設けない。風土記の目的に反し、原典の許諾とも混同するためである。

## 一次資料と採用した考え方

### 提出先が求める公開文書

[OpenAI Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)は、privacy に取得情報の種類・利用目的・受領者・保存期間・利用者の制御を求め、support の連絡先も求める。[提出手順](https://developers.openai.com/plugins/deploy/submission)では公開レビュー対象のリモート MCP に website/support/privacy/terms の4 URL が必要。ZIP の形式検査を通ることと、公開提出に必要な URL が揃うことは別である。

[Claude の connector 提出要件](https://claude.com/docs/connectors/building/submission)にもプライバシー・文書要件がある。README と manifest の具体的な privacy 要件の節は **local connector** 向けなので、匿名リモート MCP に同じ必須条件が適用されるとは断定しない。今回のページは利用者への説明と OpenAI の提出要件を満たすために用意する。

### 日本で個人情報を扱う場合の説明

[個人情報保護委員会の通則編](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/)の利用目的、安全管理、保有個人データの公表・開示等を参照した。問い合わせに含まれる識別可能な情報も検討対象とする。保有個人データに該当する場合、事業者の氏名・住所等は本人が知り得る状態に置く必要があり、単に運営者名だけを載せれば十分とは扱わない。

通則編3-8-1は、本人の求めに応じて遅滞なく回答する方法も認めている。公開のサービス名はユーザー指定の「風土記」とし、運営者の氏名・住所等は support@fudoki.dev への照会に対して遅滞なく回答する方針を、privacy 本文に明記する。

[外国第三者提供編](https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/)も参照した。Cloudflare/GitHub のポリシーへのリンクは参考になるが、それだけで国外委託・提供に必要な措置を完了した証明にはならない。適用関係は、実際に扱う情報と契約・提供形態に基づいて確認する。

### ログを「取得なし」としない

[Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)は、実行ごとに要求・応答等の metadata を記録し、プランに応じて標準3日/7日保持する。この上限は Workers Logs の範囲に限る。Cloudflare 全体の通信・セキュリティ情報の保存、手動の複製、Logpush 等の転送先を含む上限とは書かない。

[Cloudflare のプライバシーポリシー](https://www.cloudflare.com/privacypolicy/)では、利用者の IP アドレス等の通信情報と国外での処理を説明している。風土記のアプリが IP アドレスを利用者データベースに保存しなくても、配信基盤の処理を隠さない。

### 公開 Issues と非公開報告を分ける

[GitHub のプライバシー声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)と[非公開脆弱性報告の手順](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately)を参照した。公開問い合わせは運用が簡単で不具合・訂正の知識を共有できる。一方でアカウントを要し、個人情報の詳細を安全に受け付ける窓口にはならない。非公開脆弱性報告を一般のプライバシー相談へ転用しない。

[Issue 本体の削除](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/deleting-an-issue)は管理権限を要する。[編集履歴](https://docs.github.com/en/communities/moderating-comments-and-conversations/tracking-changes-in-a-comment)にも元の情報が残り得るため、本文の編集と履歴の削除を分けて案内する。

### オープンデータの利用条件と免責

[e-Stat の利用規約](https://www.e-stat.go.jp/terms-of-use)を、公開データサービスの例として確認した。出典、加工の表示、第三者の権利と外部 API の条件を分ける考え方を採用した。e-Stat の許諾は風土記の原典には適用されないので、その文言や自由利用の許諾をコピーしない。数値等が著作権の対象でない場合まで新たな許可を要求しない。

[消費者庁の消費者契約法第8条の解説](https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/annotations/assets/consumer_system_cms203_230915_13.pdf)を参照した。「一切責任を負わない」や「無料なので賠償上限0円」といった条項は採用しない。故意・重過失だけを例外にした全部免責も十分ではないため、保証の範囲の説明と法令上の責任を分けた。

## 実装と設定から確認したこと

- `apps/api/cloudflare.config.ts` は observability を有効にし、headSamplingRate は1。`app.ts` は想定外の例外を console.error に出す。検索入力全体の専用保存・利用者別履歴の書込み処理はないが、例外に含まれる情報までゼロとは断定しない。
- API はアカウント・OAuth・決済を持たず、D1 の公開財政データを読む。外部の生成 AI を要求処理から呼ぶコードはない。開発時の agent セッション記録（Langfuse）と、公開サービスの利用者要求の記録を混同しない。
- PDF 表示用中継は宣言済み公開 URL を取得する。利用者の IP/Cookie を転送するコードはない。公開 PDF の24時間保持は利用者の検索履歴の保存期間ではない。
- 文書サイトは Blume 2.1.3。設定に analytics はない。標準検索は端末内の索引検索で、表示テーマ等には localStorage を使う。独立した広告・解析タグは設定されていない。
- `mise exec -- gh api repos/wwwyo/fudoki --jq '{has_issues,html_url}'` で Issues が有効、`gh api repos/wwwyo/fudoki/private-vulnerability-reporting` で `enabled=true` を確認した。設定変更や報告の投稿は行っていない。
- root LICENSE・plugin LICENSE・ADR 0006・README に従い、コードは MIT、原典由来の列は原典の条件、風土記の判断は配布物で明示された条件を参照する。予定の CC BY を現時点の一律の許諾にしない。

初回の確認では Cloudflare 環境変数がなく本番設定を取得できなかったが、既存 `cf` の OAuth 認証で取得できた。`cf accounts subscriptions get` で Workers Paid、`cf logpush account-jobs list` で account の Logpush job が0件であることを確認した。通常 Worker の設定取得コマンドはインストール済み CLI に見つからないため、[Script Settings API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/)を読取りで使った。zone の Logpush job も0件。認証情報は出力・追加せず、利用者のログ本文は取得していない。

| 本番 Worker | 実行ログ | 自動転送 |
| --- | --- | --- |
| fudoki-api | logs.enabled/persist/invocation_logs=true、sampling=1。traces=false | logpush=false、tail consumer 0件 |
| fudoki-docs | observability=null（有効化なし） | logpush=false、tail consumer 0件 |
| fudoki | observability=null（有効化なし）。web は500応答 | logpush=false、tail consumer 0件 |

Workers Paid の Workers Logs は標準7日保持なので、privacy には最大7日と記載した。query のマスクは false であり、URL に含まれる情報が記録され得るため、秘密情報を送らせない案内を維持する。[Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)も確認した。契約の個別の締結状態や法的適合性を、設定取得だけで証明したとは扱わない。

Email Routing は `cf email-routing settings get --zone fudoki.dev` で enabled=true/status=ready。`cf email-routing addresses list` で検証済みの転送先が1件、`cf email-routing rules list-account --zone fudoki.dev` で support@fudoki.dev からそのアドレスへの有効な forward ルールを確認した。確認時には既に設定されていたため、重複して作成していない。転送先は Gmail であり、個人のアドレスは文書・Git に記載しない。2026-10-16に別のアドレスから support@fudoki.dev へ送り、転送先で受信できることを確かめた。同じ Gmail から送ると、転送されたコピーは重複として表示されないので、試験は別のアドレスから送る。

[Email Routing の設定](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)、[メールの活動記録](https://developers.cloudflare.com/email-service/observability/logs/)、[Google のプライバシーポリシー](https://policies.google.com/privacy)を確認し、privacy にはメールで受け取る情報・転送と受信の提供元・目的・削除方針を追加した。メールの活動記録と Workers Logs の保持期間を混同しない。

## 公開文面で定めた運用

- API のログは Workers Logs の7日保持を使い、自動転送は設定しない。障害調査のためログの複製を取り出すときは、必要な情報だけに絞り、取得日と削除期限を管理し、30日以内に削除する。これは自動削除機能の実装ではなく、運営者の取扱いのルールである。
- 非公開脆弱性報告は GitHub の非公開スレッドで扱う。[GitHub の権限](https://docs.github.com/en/code-security/reference/permissions/repository-security-advisory)に従い、不要な参加者を追加しない。対応完了時に本文・添付・コメントを点検し、不要な個人情報を編集・削除可能な範囲で90日以内に取り除く。報告者名を公開する場合は本人の意向を確認する。技術情報と GitHub 自体が管理する metadata を、消去を約束する個人情報の範囲と混同しない。
- 非公開の照会と開示・訂正・削除等の請求は support@fudoki.dev で受け付ける。希望する対応と対象を特定する最小限の情報を受け取り、対象データに応じて既存の GitHub アカウントやメールアドレス等で本人を確認する。追加の確認が必要な場合は目的と情報を案内し、確認した本人へ非公開で回答する。自分の投稿の訂正・削除は同じアカウントからの Issue、非公開報告は既存の非公開スレッドでも受け付ける。対象と本人を特定できない場合は理由を説明し、必要な確認を法令に従って行う。受付手数料なし。運営者の法定公表事項の照会もメールで受け付ける。[個人情報保護委員会の本人確認に関するQ&A](https://www.ppc.go.jp/all_faq_index/faq1-q9-26/)に従い、保有データに比して過剰な本人確認情報を求めない。
- 問い合わせメールとその複製は対応終了後90日以内に削除し、ごみ箱からも除く。手動の期限管理であり、自動削除機能を追加したものではない。法令上の保持義務があるものは必要期間に限って保持する。Gmail/Cloudflare 自体の保管・バックアップは提供元の方針に従う。
- ログ設定・取扱い・提供条件を変更するときは、privacy/terms を先に見直す。公表文面を法的適合性の保証や portal の compliance 同意とは扱わない。

`mise exec -- bun run build:docs` は3ページと共通フッターを含む。main への反映で自動 deploy される。HTTPS の `/support`・`/privacy`・`/terms` が実際に閲覧できてから plugin metadata と submission.md を更新する。公開が必要な提出 URL は維持し、本文はフッターから開く。

文書は `content/(usage)/`（接続・使い方）、`content/(data)/`（データ）、`content/(help)/`（ヘルプ）、`content/(legal)/`（フッターから開く法的文書）に配置する。括弧付きフォルダは Blume のグループであり、URL に階層を追加しない。privacy/terms はサイドバー・前後ページのリンクから外す。

## 最終状態の検証

- 文書 package の型検査に成功。
- `bun run build:docs` に成功。通常 build に既存12ページと追加3ページを含み、cf の dry-run も成功。公開用 HTML に support@fudoki.dev とフッターの2リンクが含まれ、個人名・草案注記・公開前のTODOが残っていないことを確認した。
- Orca のローカル preview で `/support`・`/privacy`・`/terms` の見出し・注記・リンクを確認。横方向のはみ出しはなく、privacy の画面も視認した。
- サイドバーは「接続・使い方」「データ」「ヘルプ」に分かれ、privacy/terms が含まれないことを確認した。従来のページの URL は維持している。
- `bun run --cwd apps/docs doctor` は15ページ、No problems found。`git diff --check` も成功。
- plugin の schema・共通/Claude manifest 一致・marketplace 等の検査と ZIP の再生成に成功。Claude plugin/marketplace の strict 検査も errors/warnings なし。作業用 uv 環境が未導入だったため、既存 lock に従って宣言済み依存を同期した。依存宣言・lock の変更はない。
- 文章と内容を別の Codex reviewer で確認し、公開投稿の注意を冒頭へ移動、本番ログの断定を回避、非公開報告の情報・目的を補足、Issue の削除権限・編集履歴の案内を訂正した。

メール受付を追加後の内容レビューでは、非公開の本人確認・回答手順に関する指摘が解消したことを確認した。文章レビューの2件（Issues の受付方法、メール削除対象の範囲）も反映した。手動デプロイ・push・提出 URL の metadata 登録はまだ行っていない。

最新の origin/main を fetch し、`git rebase --autostash origin/main` を実行した。元から main と同じ HEAD で、作業中の変更は自動退避・復元された。検証済み転送先と cf アカウントのメールアドレスを、Git 管理・今回追加したテキストから検索し、個人アドレスの掲載は0件だった。plugin の共通/Claude manifest と Claude/Cursor marketplace の公開発行者名は「風土記」、連絡先は support@fudoki.dev に揃えた。
