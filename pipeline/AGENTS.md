# pipeline

出典から提供用データを作る層。作業の進め方は `.agents/skills/pipeline/`、自治体固有の実測・出典の癖は `ingestion/fiscal/jurisdictions/<自治体コード>/README.md` にある。

## 構造

| dir | 持つもの |
|---|---|
| `source_selection/` | 出典の選定（自治体ごとの JSON、`schema.ts`）と、検査 `check.ts`・保存 `archive.ts` |
| `ingestion/fiscal/` | 予算書・決算書の取り込み。管理 JSON（`jurisdictions/<自治体>/<年度>/<資料区分>/<方向>.json`、型は `manifest.schema.json`、対象間の制約は `manifest.py`）、書式別の変換器（`layouts/`）、自治体ごとの宣言（`jurisdictions/<自治体>/layouts/`） |
| `ingestion/generic/` | 自治体の書式を書かない汎用の変換器。固定した読み方は管理 JSON の `options.workflow`、選べる実装は `patterns/` |
| `ingestion/lib/` | 共通処理。木の検査・網羅の検査・OCR の入口（`scan_ocr.py`、[説明](ingestion/lib/scan_ocr.md)）・PDF の表の組み立て（`pdf_table.py`、[説明](ingestion/lib/pdf_table.md)） |
| `ingestion/project/` | 事業評価の評価シートと予算案のプレス発表の取り込み。様式ごとの読み方は `layouts/`、プレスの工程ごとのパターンは `press/` |
| `shared/` | 取り込みと dbt を横断する辞書。取り込みは直接読み、dbt は seed として読む |
| `dbt/` | 入力準備（`scripts/`）、staging・intermediate・marts、seeds、検査（`tests/`） |
| `serving/` | marts を D1 へ写す同期（`sync_d1.py`）、列の契約（`columns.py`）、配信の入口（`publish.py`）、Queria への配布 |
| `source_text/` | アシスタントが読む出典の頁の文字の組み方 |
| `verify/` | repo の決まりの検査（`bun run lint`） |

script はこの package の `package.json` が持つ。使い方は各 script の `--help`。

## 決まり

### 全体

- 自治体ごとの差は出典の選定の宣言と書式設定に置き、取得・変換の処理は自治体をまたいで使う。年度・会計だけでコードを複製しない
- schema・宣言は最小の形から始める。フィールドは原則 nullable にし、必須化・union 型・汎用の枠は実例が出てから足す
- commit した生成物には生成手段を残す。置き場は生成物と consumer の近く
- 観測は commit しない（`ingestion/fiscal/observations/`）。主張に使うときは実測日を添える
- ネットワークを叩く script は sandbox を外して回し、CI では回さない
- Python は 3.13 に固定する
- `.agent/` へ runtime・依存物・出典群・全量の warehouse を検証ごとに複製しない

### 保存

| 内容 | 保存先 | Git |
|---|---|---|
| 出典 CSV・PDF | 非公開 R2 の `fiscal/source-selection/` | 選定と保存の参照だけ |
| 取り込みの表（Parquet） | 非公開 R2 の `fiscal/ingestion/<対象>/<方向>/` | 管理 JSON だけ |
| scan PDF の OCR の観測 | 非公開 R2 の `fiscal/ingestion/<対象>/<方向>/ocr/<id>.json.gz` | 依頼と SHA（`ocr_inputs`）だけ |
| Jev の聞き直しの答え | 管理 JSON の隣の `<方向>.digit-recheck.jsonl` | 管理する |
| 出典の頁ごとの文字 | D1 の `source_page_text`（marts から写す） | 管理しない |
| 分類・名称のマスタ・判断の seed | dbt の seeds | 管理する |
| 復元した入力・キャッシュ | `pipeline/.cache/` | 管理しない |
| DuckDB・dbt manifest・検査結果 | `pipeline/.build/` | 管理しない |

- 取り込みの表は `ingestion:convert` が管理 JSON に記録し、R2 には merge 後の CI の `ingestion:store` だけが置く（[ADR 0045](../docs/adr/0045-ingestion-tables-uploaded-by-ci.md)）
- OCR は変換器の外で一度だけ取り、観測を固定する（[ADR 0019](../docs/adr/0019-freeze-scan-ocr-observations.md)）。エンジンは PaddleOCR を ONNX Runtime で動かす（[ADR 0032](../docs/adr/0032-paddle-onnx-for-new-scan-acquisitions.md)）。誤読は宣言で直し、観測は書き換えない
- 独立した provenance ファイルは作らない

### 取り込み

- PDF はノードの表と金額の表、CSV は原文の行と1対1の表にする（[ADR 0020](../docs/adr/0020-ingestion-outputs-node-tables.md)）
- 保存の関門: 木の検査（`ingestion/lib/tree_checks.py`）、text PDF の印字された数字の網羅（`coverage_checks.py`。Jev の聞き直しは止める方向だけ、[ADR 0026](../docs/adr/0026-jev-recheck-printed-digits-stop-only.md)）、単位の確かめ（[ADR 0028](../docs/adr/0028-unit-check-in-the-save-gate.md)）、決算の款の軸と支出済額（[ADR 0029](../docs/adr/0029-structural-check-in-the-save-gate.md)）
- 合否だけを決める検査のコードは `*_checks.py` に置き、指紋から外す。検査を厳しくしたら保存済みの全表に `ingestion:verify --remote` を当てる
- 指紋（`input_fingerprint`）は「変わったかもしれない」という合図で、古くても止めない。中身が同じなら `ingestion:refresh` で指紋だけを書き換え、違えば `ingestion:convert` で記録し直す（[ADR 0027](../docs/adr/0027-refresh-fingerprints-by-table-content.md)）。全表の確かめは定期の `refresh-check.yml` が流す
- PDF の読み方は書式ごとの固定した workflow（[ADR 0035](../docs/adr/0035-fixed-pdf-workflow-patterns.md)・[PDF workflow の設計](../docs/prd/pdf-workflow-patterns/dd.md)）。1つの書式のための判定は opt-in の quirk にする（[ADR 0043](../docs/adr/0043-format-quirks-are-opt-in.md)）。結び付きの強い読み方は `readings/`、独立に選べる部品は `components/`（[ADR 0036](../docs/adr/0036-shared-coupled-pdf-readings.md)）
- 金額の注記は段階を付けず、木の合計に足さない（[ADR 0024](../docs/adr/0024-monetary-annotations-without-phase.md)）
- 統計の決算・普通会計の表は取り込まない（[ADR 0037](../docs/adr/0037-do-not-ingest-statistical-settlements.md)）。補正予算は当面取り込まない（[ADR 0039](../docs/adr/0039-defer-supplementary-budget-ingestion.md)）
- 事業評価の評価シートと予算案のプレス発表は、どちらも出典の選定（`evaluation_selections`・`press_selections`）で保存した PDF を入力準備が読む。評価の結果の資料は取り込まない

### dbt

- 取り込みの表の一覧は build のたびに管理 JSON から作る（`dbt/scripts/fiscal_inputs.py`）。手で表を足さない
- PDF のノードの表・金額の表は全自治体共通の staging で読み、CSV は書式ごとの staging で読む
- 段の名前は共通の規則で付け（[ADR 0025](../docs/adr/0025-level-names-by-shared-rule.md)）、見出しから金額の段階への対応は共通の辞書に置く（[ADR 0021](../docs/adr/0021-level-and-phase-map-in-dbt-seed.md)）。会計の種類は語の辞書で付ける（[ADR 0023](../docs/adr/0023-account-kind-and-no-consolidation.md)）
- 内訳の欄の分け方は seed `fiscal_detail_breakdown` に宣言する。見出しが「節」の欄は既定で節
- marts は集約ごとの dir に置く（`marts/expenditure`・`evaluation`・`budget_proposal`・`project`・`jurisdiction`・`source`・`queria`）。設計は [集約ごとの作り直し](../docs/prd/aggregate-api/dd.md)
- 評価シート・施策・事業の行の紐付けは風土記の判断で、seed（`budget_measure_link`・`project_line`）に置き、列の説明に判断と書く。分野（COFOG）は表に写さず、紐付けた目・内訳から引く
- 自治体マスタは `packages/jurisdictions/jurisdictions.json`。人口は pipeline で扱わない（[ADR 0042](../docs/adr/0042-external-reference-data-in-web.md)）

### 配信

- marts の表を同名・同列のまま D1 に写す（[ADR 0022](../docs/adr/0022-serve-marts-via-worker-d1-rest-and-mcp.md)・[ADR 0038](../docs/adr/0038-split-serving-tables-by-grain.md)）。表名は集約の名前で始める
- 同期は変わった行だけを書く（[ADR 0040](../docs/adr/0040-sync-d1-by-row-diff.md)）。D1 に書くのは `serving/sync_d1.py` だけで、同時に2つ流さない。D1 には control 以外の表を migration で作らない
- main への merge で `sync-d1.yml` が変わった範囲を build し、本番 D1 へ写す（入口は `publish`）。取り込みの PR では R2 にも本番にも手で書かない
- Queria の公開データセットには、Queria 用の marts（`marts/queria/`）を同名・同列のまま写す。Queria の規約に合わせた形はこの marts で作り、写す側では変えない。手順は `.agents/skills/pipeline/references/queria.md`
