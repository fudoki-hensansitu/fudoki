# 集約ごとに model・表・API を作り直す

担当者: wwwyo / Claude
更新日: `2026-11-10`
状態: Draft（別の agent のレビューを反映済み）

## Summary

[事業のドメインモデル](../jurisdiction-page-data/project-domain-model.md)で決めた6つの集約（自治体・人口・歳出・事業評価・予算案・事業）に合わせて、コードの置き場・提供用データ（marts）・D1 の表・公開 API（REST・MCP）を集約ごとに切り直す。互換は保たない（まだ利用者がいない。2026-11-10 yuito）。

1. 集約ごとに型を1か所に置く。型は厳密にし、形が変わる所は判別 union にする。api と web はこの型を使い、D1 の行から集約を組み立てる処理も集約の dir に置く。
2. marts・D1 の表名を集約の名前で揃える。出典の表は集約ごとに持つ。
3. REST・MCP の操作を集約ごとに切る。1つの集約を返す `get` は型の部分集合の入れ子の形で返し、行を探す `search` は平らな行で返す。
4. 事業の評価の AI Search（`search_evaluations`）は外し、評価シートを構造化した事業評価の集約で置き換える。

## Goals / Non-Goals

- Goal: 集約の境界を、コード・表・API の3か所で同じにする。集約の中の物は根を通して返す。
- Goal: 型を1つの正にする。ドメインモデルの TS の型とコードの型を1対1で対応させ、API の応答の型はその部分集合にする。
- Goal: 予算案・事業評価・事業を、API と MCP から引けるようにする（今は D1 にあるが操作が無い）。
- Non-Goal: 事業の年度またぎのうち Jev を使う手順4。規則で作る手順1〜3・5〜7だけを入れる。
- Non-Goal: 自治体の頁（apps/web）の表示を API の事業評価・予算案に切り替えること（[jurisdiction-page-data](../jurisdiction-page-data/dd.md) の範囲）。
- Non-Goal: 歳入・補正予算。
- Non-Goal: 構造化していない自治体の事業評価の資料を読むこと。AI Search の目録（46自治体・1,390資料）を外すので、出典の頁を読めるのは取り込んだ資料（今は品川）だけになる。

## 集約と置き場

| 集約 | 型 | marts の dir | D1 の表 | api の dir |
| --- | --- | --- | --- | --- |
| 自治体 | `apps/api/src/jurisdiction/model.ts` | `marts/jurisdiction/` | `jurisdiction` | `apps/api/src/jurisdiction/` |
| 人口 | `apps/api/src/population/model.ts` | `marts/population/` | `population`・`population_origin` | `apps/api/src/population/` |
| 歳出 | `apps/api/src/expenditure/model.ts` | `marts/expenditure/` | `expenditure`（根）・`expenditure_origin`・`expenditure_origin_link`・`expenditure_subject`・`expenditure_detail`・`expenditure_location` | `apps/api/src/expenditure/` |
| 事業評価 | `apps/api/src/evaluation/model.ts` | `marts/evaluation/` | `evaluation`（根）・`evaluation_origin`・`evaluation_sheet`・`evaluation_indicator`・`evaluation_indicator_value` | `apps/api/src/evaluation/` |
| 予算案 | `apps/api/src/budget-proposal/model.ts` | `marts/budget_proposal/` | `budget_proposal`（根）・`budget_proposal_origin`・`budget_measure` | `apps/api/src/budget-proposal/` |
| 事業 | `apps/api/src/project/model.ts` | `marts/project/` | `project`・`project_year` | `apps/api/src/project/` |

- 型は API の interface なので api の中に置く。各集約の dir の `model.ts` に、zod の schema と、そこから導く TS の型を置く。ドメインの型（集約の全体）と、API の応答の型（`ExpenditureSummary`・`EvaluationSummary` などの部分）を同じ file に並べる。共通の値（出典・年度・円・自治体コード）は `apps/api/src/shared/model.ts`。web は `@fudoki/api` の exports から型を import する（package を増やさない）。
- `model.ts` は副作用・I/O を持たない（zod と型だけ）。web が import しても Worker の処理を引き込まないようにする。
- 既存の `@fudoki/fiscal`（COFOG・節のマスタ）と `@fudoki/jurisdictions`（自治体の registry）はマスタとして残し、`model.ts` から参照する。
- 列の説明の正は dbt の `_models.yml`（→ `columns.json`）の1つにする。zod の schema は列の説明を `columns.json` から引いて `.describe()` に付ける。型と `_models.yml` の照合（列の集合・nullable・accepted_values）は、warehouse を使わず yml と TS を突き合わせる静的な検査にし、CI の verify で回す。
- api の各集約の dir は `model.ts`（zod の schema と型）・`routes.ts`（Hono の route）・`tools.ts`（MCP の tool）・`queries.ts`（SQL）・`assemble.ts`（D1 の行から応答の型を組み立てる）を持つ。REST は `@hono/zod-openapi` の `createRoute` と `.openapi()` を集約ごとに書き下ろし、`app.route()` でまとめて `AppType` を export する（今は操作の一覧からループで登録しているので型が外に出ない）。web は Hono RPC（`hc<AppType>`）に Service Binding の `fetch` を渡して型付きで呼ぶ。MCP の tool は同じ zod の schema と `queries.ts` を使って登録する。1つの schema から REST・OpenAPI・MCP の tool・web の型が出る。検索の共通部品（`search.ts` の where の組み立て・上限）と、3つの出典の表を `sha256`・`origin_id` で引く照会は `apps/api/src/shared/` に置く。

## 型の名前

ドメインモデルの型の名前は日本語、コードは英語にする（判別 union の判別子はすべて `kind`）。

| モデル | コード | 判別 union |
| --- | --- | --- |
| 出典 | `Origin` | |
| 歳出 / 会計 | `Expenditure` / `Account` | |
| 款・項・目 | `Kan`・`Kou`・`Moku` | |
| 分野 | `Field` | `classified`（確定・暫定）・`unclassified`（分類できない・対象外） |
| 内訳 | `Detail` | `project`（事業）・`other`（節・その他） |
| 印字の位置 | `Location` | `pdf`・`csv` |
| 事業評価 | `Evaluation` | `with_result`（評価結果の資料と件数がある）・`sheets_only` |
| 評価シート / 指標 | `EvaluationSheet` / `Indicator` | |
| 予算案 / 施策 | `BudgetProposal` / `Measure` | |
| 事業 / 事業の金額 | `Project` / `ProjectYear` | `both`・`initial`・`settlement` |
| 始めた年度 / 終えた年度 | `ProjectStart` / `ProjectEnd` | `confirmed`・`before_coverage` / `confirmed`・`latest`・`unknown` |
| 歳出の行の参照 | `LineRef` | `detail`・`moku` |

ドメインモデルの直し（この PR で文書も合わせる）:

- 事業評価は、評価結果の資料が無い年度（シートだけ）があるので、出典と件数を持つかで union にする（評価結果だけの年度は、シートが空の `with_result`）。
- 人口の出典は資料名・SHA256 を持たない（総務省の集計の URL と基準日だけ）ので、人口の出典は `{ 基準日, URL }` の型にする。

## 表

今の表からの対応。列は今の列を基本にし、ドメインモデルで決めた変更だけを入れる。主キーは1列（sync の制約）。

| 新しい表 | 今の表 | 主キー | 変更 |
| --- | --- | --- | --- |
| `jurisdiction` | `jurisdiction` | `jurisdiction_code` | なし |
| `population`・`population_origin` | 同じ | 今と同じ | なし |
| `expenditure` | `fiscal_coverage` | `expenditure_id` | 根。1行 = 自治体・年度・資料区分・補正号・会計 |
| `expenditure_origin` | `fiscal_origin` | `origin_id` | 冊ごとに1行。会計は持たない（1冊が最大18会計にまたがる） |
| `expenditure_origin_link` | なし | `link_id` | 根と冊を結ぶ（品川など 245冊・359根・456組） |
| `expenditure_subject`・`expenditure_detail` | `fiscal_expenditure_*` | 今と同じ | `expenditure_id` を足す。根で決まる列（`fiscal_year`・`document_kind`・`account_name` など）は検索のために残す |
| `expenditure_location` | `fiscal_expenditure_location` | `row_id` | `kind`（`pdf`・`csv`）を足し、CSV は行番号の列にする |
| `evaluation` | `project_evaluation_result` | `evaluation_id` | 1行 = 自治体・事業を行った年度。シートだけの年度も1行（件数の列は空） |
| `evaluation_origin` | `project_origin`（`sheets`・`result`） | `origin_id` | `evaluation_id` と資料の種類を持つ |
| `evaluation_sheet`・`evaluation_indicator`・`evaluation_indicator_value` | `project_evaluation_*` | 今と同じ | シートに `evaluation_id` を足す |
| `budget_proposal` | なし | `budget_proposal_id` | 1行 = 自治体・予算の年度 |
| `budget_proposal_origin` | `project_origin`（`press`） | `origin_id` | `budget_proposal_id` を持つ |
| `budget_measure` | `project_budget_measure` | `measure_id` | `budget_proposal_id` を足す |
| `project` | なし | `project_id` | ドメインモデルの「表の案」のとおり |
| `project_year` | なし | `project_year_id` | 同上 |

- 根の ID（`expenditure_id`・`evaluation_id`・`budget_proposal_id`）と結ぶ表・事業の年度の ID（`link_id`・`project_year_id`）は、主キーの組の sha256 の16進にする。NULL（補正号の無い当初・決算）は空文字にして hash に入れる。`evaluation_id`・`budget_proposal_id` は組の先頭に集約の名前（`evaluation`・`budget_proposal`）を入れて hash し、自治体・年度だけの組が他の根の ID と重ならないようにする。`expenditure_id` は組に資料区分・会計を含むので集約の名前を入れない。
- `project_id` は seed に足すときに一度だけ振る16進の乱数（32桁）。sync の読み戻しは主キーの先頭1文字で分けるので、接頭辞を付けない。
- index（`pipeline/serving/columns.py` の `INDEXES`）: `expenditure_subject`・`expenditure_detail` の `expenditure_id`、`expenditure_origin_link` の `expenditure_id`・`origin_id`、`evaluation_sheet` の `evaluation_id`、`budget_measure` の `budget_proposal_id`、`project_year` の `project_id`・`budget_detail_id`・`settlement_detail_id`。今ある index は新しい表名で引き継ぐ。
- D1 の schema は sync（`pipeline/serving/sync_d1.py`）が作るので、表の migration は作らない（今と同じ）。`columns.py` の `TABLES`・`PRIMARY_KEYS`・`INDEXES`・`MODELS` と `columns.json` を新しい表で作り直し、旧表は `LEGACY_TABLES` に移す。
- 名前の変わらない `jurisdiction`・`population`・`population_origin` は、merge の前に sync すると古い Worker も新しい表を読む。この3表は列を変えない。

## API

MCP の tool は11にする（今は8）。人口・収録の範囲・収録した事業評価と予算案の年度は、自治体ごとに呼ばずに済むよう `list_jurisdictions` の要約に入れ、集約ごとの `list_*` は作らない。

| 集約 | REST | MCP |
| --- | --- | --- |
| 自治体 | `GET /v1/jurisdictions`（要約: 人口の推移・歳出の収録の年度と会計・事業評価と予算案の年度）・`GET /v1/jurisdictions/{code}`（会計ごとの出典まで） | `list_jurisdictions` |
| 歳出 | `POST /v1/expenditures/subjects:search`・`POST /v1/expenditures/details:search`・`GET /v1/expenditures/lines/{line_id}`（科目か内訳と、その直下。印字の位置と出典まで）・`GET /v1/expenditures/origins/{origin_id}/pdf` | `search_expenditure_subjects`・`search_expenditure_details`・`get_expenditure_line` |
| 事業評価 | `GET /v1/evaluations/{evaluation_id}`（根・件数・シートの要約。シートはページ）・`GET /v1/evaluations/sheets/{sheet_id}`（指標まで）・`POST /v1/evaluations/sheets:search` | `get_evaluation`・`get_evaluation_sheet`・`search_evaluation_sheets` |
| 予算案 | `GET /v1/budget-proposals/{budget_proposal_id}`（施策まで）・`POST /v1/budget-proposals/measures:search` | `get_budget_proposal`・`search_budget_measures` |
| 事業 | `GET /v1/projects/{project_id}`（年度と、付いた評価シート・施策の ID まで）・`POST /v1/projects:search` | `get_project`・`search_projects` |

- `get_expenditure_line` は `line`（`kind` が `subject` か `detail` の union。列は表の行のまま）・`child_subjects`（科目のときの子の科目）・`details`（科目なら直下、内訳なら子を breakdown ごとに。ページ）・`locations`・`origins` を返す。科目と内訳の取得を1つにし、View の drill（行を押して直下を開く）を1回の呼び出しで描けるようにした。`locations` は表の行（`kind` と頁・枠・行番号の列）のままにし、ドメインの `Location` の union には組み直さない（View の出典の表示がこの列を読む）。
- 自治体の一覧の行は要約（人口の推移・収録範囲・事業評価と予算案の ID と年度。`evaluations`・`budget_proposals` が `{evaluation_id|budget_proposal_id, fiscal_year}` の配列で、`get_evaluation`・`get_budget_proposal` に渡す ID をここで引ける）にし、会計ごとの出典は `GET /v1/jurisdictions/{jurisdiction_code}` だけが返す（今の `view=FULL` はなくす）。MCP には一覧だけを出す（出典は検索の結果の `origins` に載る）。
- API の行の schema（`SubjectRow` など）は zod で列ごとに手で書き、説明だけを `columns.json` から付ける（`described`）。列の集合・型・null の可否・accepted_values が `columns.json` と合うかは `model.test.ts` で照合する。
- `get` は応答の型（`model.ts` の部分の型）で検査してから返し、OpenAPI と MCP の出力 schema もその schema から作る。1回の応答が CPU の上限（200ms）と D1 の行数に収まるよう、子が多いもの（事業評価のシート、品川で年652枚）はページにする。歳出の根を丸ごと返す `get` は作らない（1つの根の内訳が最大9,300行）。
- `search` は今の構造化 JSON の入力（必須の条件・where・order_by・ページ）を共通の部品で受ける。応答は平らな行で、行の列は `columns.json` の契約のまま。列の説明は入力・出力の schema に `.describe()` で付け、足し方の決まり（今の `sum_rules`）はその tool の description に書く。列の説明を返すだけの操作（今の `describe_expenditure_columns`）は作らない。
- 事業評価・予算案の `get` も歳出と同じく表の行のまま返す（`EvaluationOutput` は `evaluation`・`sheets`（ページ）・`origins`、`SheetOutput` は `sheet`・`indicators`・`indicator_values`・`origins`、`BudgetProposalOutput` は `budget_proposal`・`measures`（1,000 件まで）・`origins`）。ドメインの型（`Evaluation` など）には組み直さない。
- kill switch・流量・入力の上限は今の仕組みを全操作に掛ける。
- MCP Apps の View（`apps/api/ui/`）は tool 名と応答の形で描き方を決めている（`ui/types.ts` の `toolFor`、`render_expenditure_view`、web の `VIEW_TOOLS`・`bridge.ts`）。新しい tool 名に付け替え、`src/gen/view.ts` を作り直す。`render_expenditure_view` は名前を残す。
- web の呼び出し（MCP と REST）は同じ PR で新しい名前に直し、jurisdiction の cache の版（`jurisdiction-vN`）を上げる。

### AI Search を外すときに消すもの

- `apps/api/src/evaluations.ts`・`evaluation-quota.ts`・`evaluation-limits.ts`・`evaluation-catalog.json` とそのテスト
- `cloudflare.config.ts` の AI Search の binding と Durable Object `EvaluationSearchQuota`（export・binding と、class を消す migration）
- `control` の `evaluation_search*` の行を消す D1 の migration（`0003`）
- `pipeline/evaluation_search`・`serving:evaluation-catalog` と CI の `--check`
- docs の `(data)/02-evaluations.mdx` の AI Search の案内（新しい tool の案内に書き換え、URL `/evaluations` は残す）、plugin の `compare-expenditure` の評価の手順、web のチャットの指示（`server/chat.ts`）とツールの表示名（`chat/conversation.tsx`）
- `read_source_page`（`source-pages.ts`）は目録の代わりに3つの出典の表を引く

## 事業を作る

ドメインモデルの「事業を作る」の手順1〜3・5〜7を作る。dbt は seed に書けないので、`project:link-measures` と同じく Python の script が判断して seed の CSV を書く。

- script `project:link-projects` が、手順1〜3（名前の並びで決まる規則）で前年度と結び、seed（`project_line`: 自治体・年度・資料区分・会計・款・項・目・名前の並び → `project_id`）に書く。2回目からは seed を正にし、seed に無い行だけを新しく判断して足す。手順4に回る事業は新しい事業として始める。
- 事業の行と鍵（名前の並び。同じ親・同じ名前は印字の順で `#2` を付ける）は dbt の `int_project__lines` が作り、script はそれを読んで判断し、dbt はその鍵で seed と結ぶ（鍵の作り方を1か所に置く）。対象の自治体は seed `project_jurisdiction`（今は品川だけ）。
- 手順4（Jev）はまだ使わず、手順3で決まらない事業は新しい事業にする。
- `project_year` は検索に使うので、ドメインモデルの表の案より列を足し、名前・会計・款・項・目・当初予算額・支出済額を持つ。`search_projects` はこの表を年度で引く（事業の表は年度を持たないため）。
- dbt は seed と `expenditure_detail` を名前の並びで結んで `project`・`project_year` を作る。seed の行が `expenditure_detail` のどの行にも当たらない（取り込みを直して名前が変わった）ときは dbt の検査で止め、script を流し直す。

## 本番の切り替え

1. merge の前に、本番 D1 へ新しい表を sync する（旧表は残る）。
2. merge で api・web が deploy される。deploy-web の発火の paths に `apps/api/src/rpc.ts`・`apps/api/src/*/model.ts` を足す（web が api の型を import するため）。web が先に出ると新しい path で古い api を叩くので、deploy-api も動く push では deploy-web は自分では出さず、deploy-api の成功（`workflow_run`）から出す。
3. 新しい Worker の動作を確かめてから `serving:sync --drop-legacy` で旧表を消す。

本番 D1 への書き込みは yuito の go を取ってから行う。

## PR の分け方

1. **型と表**: 6集約の `model.ts`、marts・sync・`columns.json` の作り直し。api は新しい表を読むが、操作の名前は今のまま。
2. **api の操作の切り替え**: 自治体・歳出の操作を新しい interface にし、web・View・docs・plugin・テスト（`testing.ts`・`tests/fixture.ts`・各 test）を付け替える。
3. **事業評価・予算案**: 2つの集約の操作を足し、AI Search を外す。
4. **事業**: 事業の seed の script・dbt・操作。

## まだ決めていないこと

- `search` の応答も集約の型の一部（例: 歳出の行の `Location` の union）で返すか。今は平らな行のままにする。
- 事業の手順4（Jev）を足す時期。
