# 事業評価とプレス発表を、出典の PDF から D1 に取り込む — 設計

担当者: wwwyo / Claude
更新日: `2026-11-11`
状態: Done（取り込み・D1・API・web まで実装済み。web の手書きの定数は #511 で消した）

## Summary

品川区のページのうち、次の節は web の中の手書きの定数（`apps/web/jurisdiction/profiles.ts`・`budget-press.ts`）から出していた（#511 で削除）。

- 事業評価から取った節: 新しく何を始めた？・やめたこと・見直したことは？
- プレス発表から取った節: 新しく何を始める？

この設計では、この値を **出典の PDF から pipeline で読み、dbt の marts を通して D1 に入れる**。手で起こした値を入力に移すのではなく、読み方をコードにする。

> 出典の PDF（非公開 R2）→ 入力準備で読む（`ingestion/project/layouts/`）→ dbt の marts → D1

1. 事務事業評価シート・事務事業評価の結果・予算案のプレス発表を、様式ごとの読み方で PDF の文字の層から読む。
2. 出典に無い値（決算書の目・事業への紐付け、COFOG、新しくできた事業の印、施策の予算書の内訳への紐付け）は **風土記の判断** として、列の説明にそう書く。施策の紐付けは Jev を使うので seed に置き、取り込みのときに一度だけ作る。
3. marts の6表を D1 に写す。公開 API の操作と、web を D1 から組み立てる切り替えは次の段階で行う。

## Goals / Non-Goals

- Goal: 品川区の事業評価（R5・R6 実施分の全シート）・評価の結果（R6〜R8 予算）・予算案のプレス発表（R7・R8）を、出典の PDF から作り直せる形で D1 に入れる。
- Goal: 今のページの手書きの値を、読んだ値と規則で再現できることを確かめる。
- Goal: 出典の値と風土記の判断を、列の説明で区別する（[fiscal-serving-tables](../fiscal-serving-tables/dd.md) と同じ）。
- Non-Goal: 公開 API の操作と web の切り替え。表が入ってから別の PR で行う。
- Non-Goal: 品川区以外の自治体。読み方は様式ごとの部品にし、宣言で選ぶ。
- Non-Goal: 評価シートの文章（目的・取組・課題）とプレス発表の背景・事業概要。利用条件が転載を禁じているので読まない（[利用条件](#cross-cutting-concerns)）。
- Non-Goal: 分かりやすい言い換え（今の `title`・`what`）。画面には資料の事業名をそのまま出す（2026-11-09 決定）。
- Non-Goal: 既存の事業の中で始めた取り組みの一文（今の `initiatives`）。文章を読む判断なので、この段階では入れない。

## Background

### 今のページの値と、この設計で作る値

| ページの値 | 元の出どころ（削除済み） | 作る表・列 |
| --- | --- | --- |
| 新しくできた事業（名前・決算額・指標・評価・方向性・頁） | `profiles.ts` の `projects` | `project_evaluation_sheet`（新しくできた事業かは事業の始めた年度で決める。事業を作るまでは出さない）・`project_evaluation_indicator`・`project_evaluation_indicator_value` |
| 新しくできた事業の分野 | `profiles.ts` の `cofog` | `project_evaluation_sheet.subject_id` の目の `cofog_code`（`fiscal_expenditure_subject` から引く） |
| やめた事業・A〜C の一覧 | `profiles.ts` の `scrap.exits`・`graded` | `project_evaluation_sheet`（`grade_code`・`direction`） |
| 評価した数・A〜D の数 | `profiles.ts` の `scrap` | `project_evaluation_result` |
| 予算の年度の新しい施策 | `budget-press.ts` | `project_budget_initiative` と seed `project_budget_initiative_link` |

### 確かめたこと（2026-11-08）

- **評価シート**: R6 実施分（令和7年度評価、652枚）と R5 実施分（令和6年度評価、669枚）をすべて読めた。A〜D の数は、評価の結果の資料の合計の行（R6: 16・339・271・26、R5: 34・271・319・45）と一致した。
- **手書きの値との一致**: R6 の新しい事業15件と取り組み10件のうち、名前・決算額・評価区分は全件一致した。違ったのは、手で言い換えた方向性1件と、指標名を手で詰めた1件だけ。
- **新しくできた事業の規則**: 「事業期間が実施年度から始まる・前年度の行政費用が0・前年度までの指標の実績が無い」で R6 は16件になり、手書きの15件をすべて含んだ。多い1件（p173）は手で外したもの。
- **決算書への紐付け**: R6 の652枚すべてが、予算科目（会計・款・項・目の名前）で決算書の目に1つずつ当たった。事業の名前では630枚が内訳（事業）に当たった（2026-11-10 の規則で、うち319枚は子孫の事業に小事業名で当たり、311枚は予算科目の事業に付く）。付いた614事業のうち、1枚だけ付いて決算額の差が1,000円未満のものは592件。R5 は風土記に品川の R5 決算書が無いので当たらない。
- **プレス発表**: R7 89件・R8 71件の施策をすべて読めた。手書きの値と見出し・事業名・新規の印・予算額・POINT が一致したのは157件で、残りは語の間の空白と、事業名の行の分け方の違いだけ。
- **出典の差し替え**: R6 の評価シートは、今サイトにある PDF の sha256 が保存済みのもの（2026-10-14）と違う。読むのは保存済みのもので、頁は同じだった。

## Design

### 全体の流れ

1. `project:save` が、`ingestion/project/origins.json` の評価の結果の PDF を取得し、宣言の sha256 と同じときだけ非公開 R2 の `project/<種類>/<自治体>/<年度>/<sha256>.pdf` に置く。評価シートは出典の選定（`evaluation_selections`）、プレス発表は出典の選定（`press_selections`）で保存済みのものを使う。
2. 入力準備（`dbt/scripts/prepare.py`）が PDF を宣言の様式で読み、`ingestion` スキーマの表にする。読んだ結果は PDF と読み方のコードの指紋ごとに `.cache/project/` に置く（評価シート1冊を読むのに約1分かかる）。
3. dbt の marts が、出典の値に判断の列を足す。施策の紐付けは seed `project_budget_initiative_link` を読む。
4. `serving:sync` が marts の6表を D1 に写す。

### 領域

評価シートも予算案の施策も、行き先は予算書・決算書の事業（内訳）なので、1つの領域 `project`（事業）にまとめる（`ingestion/project/`・`marts/project/`）。行は資料の粒度のまま（評価シート1枚、施策1件）にする。評価シートは小事業の単位で1つの事業に複数付くことがあり、年度をまたいで同じ事業と決める判断もまだ無いので、事業そのものの表は作らず、各行が予算書・決算書の事業（`detail_id`）を指す。

年度と資料をまたぐ事業そのもののモデルは [事業のドメインモデル](project-domain-model.md)（案）に書く。

### 宣言

`ingestion/project/origins.json` に、評価の結果は自治体・年度・様式（`layout`）・URL・sha256 を書く。評価シートとプレス発表は自治体と様式だけを書き、どの PDF を読むかは出典の選定に従う。

評価の結果は、人口（`ingestion/population/origins.json`）と同じく出典の選定の schema に入れない。金額の表ではなく、`fiscal_coverage` の対象にもしないため。プレス発表は自治体・年度ごとに資料を選ぶので、出典の選定の `press_selections` で選ぶ。

### 読み方（`ingestion/project/layouts/`）

| 様式 | 読む欄 | 止める条件 |
| --- | --- | --- |
| `shinagawa_sheet` | 小事業名・会計/款/項/目/事業・担当・予算・決算の計・指標（名前・単位・定義・年度ごとの目標と実績・最終目標）・最終評価の区分と方向性 | 欄が見つからない、指標の見出しが5列でない、目標と実績の段が揃わない |
| `shinagawa_result` | 合計の行（「合計」「全体集計」）の評価した数・削減額と、その上の A〜D の数 | 合計の行が1つでない、A〜D の和が評価した数と合わない |
| `shinagawa_press` | 見出しと副題・事業名（1行1つ、括弧書きと「および」の行は前の行に続ける）・新規の印・予算額・POINT | 事業名が読めない |

座標は A3 横の幅に揃える。R5 のシートは A4 横で出ている。

### 表

| 表 | 1行 | 主キー |
| --- | --- | --- |
| `project_origin` | 資料（PDF）1つ。`document_type` は sheets・result・press | `origin_id`（sha256） |
| `project_evaluation_sheet` | 評価シート1枚 | `sheet_id`（出典と頁） |
| `project_evaluation_indicator` | シートの指標1つ | `indicator_id`（シートと順） |
| `project_evaluation_indicator_value` | 指標の1年度の目標と実績 | `value_id`（指標と年度） |
| `project_evaluation_result` | 評価の結果の資料1つ | `origin_id` |
| `project_budget_initiative` | 予算案の施策1件（品川はプレス発表の1頁） | `initiative_id`（出典と頁） |

金額は千円の印字を円にする。指標の値は単位や「令和8年度」を含むのでシートの表記のまま文字列で持つ。プレス発表の事業名は JSON の文字列の配列で、POINT の箇条書きは改行でつないだ説明（`description`）で持つ。

### 判断の列

| 列 | 決め方 |
| --- | --- |
| `project_evaluation_sheet.subject_id` | 予算科目の会計・款・項・目の名前が、同じ年度の決算書の目に1つだけ当たるとき |
| `project_evaluation_sheet.detail_id` | その目の下で、予算科目の事業と同じ名前（内訳の末尾の【所管課】以降を除く）の内訳（分け方が事業）が1つだけあるとき。さらにその子孫に、シートの事業名と同じ名前の事業が1つだけあれば、そちら |
| `project_budget_initiative.detail_id`・`link_method`・`link_confidence` | seed `project_budget_initiative_link`（下記） |

施策の紐付けは [link-to-budget-detail](../../../.agents/skills/pipeline/references/link-to-budget-detail.md) の手順を `project:link-initiatives` にした。名前と額で直接当たるものを先に決め、残りは単語の Dice 係数の上位12件から Jev に選ばせ、確信度 0.6 以上だけを採る。seed に行がある施策は聞き直さない。R7・R8 の160行は `budget-press.ts` の紐付け（同じ手順で作ったもの）を移した。`--refresh` で作り直すと、Jev の答えの揺れで25行が変わる（2026-11-08）。

## Alternatives Considered

### 手書きの値を入力（JSON・seed）に移す

最初の案（この文書の前の版）。ページの出力が今と同じになることは確かめやすいが、ほかの年度・自治体に広げるたびに手で起こすことになる。読み方をコードにすれば、同じ様式の年度は宣言を足すだけで入る。

### 読んだ表を Parquet にして R2 に保存する（取り込み表と同じ）

財政の取り込み表は、読み方の変更で値が変わらないことを指紋で守っている。事業評価は行数が少なく、読み直しても約1分なので、入力準備のたびに読む（キャッシュはローカルだけ）。読み方を直して値が変わったときは、marts の差分で確かめる。

### 判断を別の表に置く

fiscal-serving-tables と同じく、判断も列に置き、列の説明で区別する。

## Cross-Cutting Concerns

- **出典の利用条件**: 品川を含む10自治体のどこも、サイト全体を CC BY で開いていない（[調査記録](../../survey/evaluation-sheet-formats.md)）。配る列は事実の記録（名前・金額・指標・区分・件数）と、プレス発表の見出し・事業名・POINT に限る。目的・取組・課題の文章、プレス発表の背景・事業概要は読まない。法的な判断は専門家に確かめていない。
- **プライバシー**: 品川のシートには部課名だけで、担当者の個人名は無い。担当係は読まない。
- **費用**: 1年度で評価シート約650行・指標約1,300行。Jev は紐付けの無い施策1件あたり約1,000トークン。

## Validation / Rollout

1. ローカルで `dbt:build` → `serving:sync --local` を流し、上の「確かめたこと」の数を D1 の行で確かめる。
2. 本番 D1 へは yuito の go を取ってから `serving:sync` を流す。新しい表を足すだけで、今の表と API は変わらない。
3. 公開 API の操作（検索）を足し、web の節を D1 から組み立てて `profiles.ts`・`budget-press.ts` を消す（#511 で完了）。画面の事業名は資料の表記（小事業名）を出す。取り組みの一文は、その前に作り方を決める。

## Open Questions

- 取り組みの一文（`initiatives`）を、判断として seed に置くか、出さないか。
- やめた事業の区分（今の `exits.result` の「廃止・移管・統合・完了」）は評価の結果の資料の表にあり、シートの方向性とは言い方が違う。表を読むか、シートの方向性で出すか。
- R5 の評価シートを決算書に紐付けるには、品川の R5 決算書を取り込む必要がある。
