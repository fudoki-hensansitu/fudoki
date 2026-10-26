# pipeline

出典から提供用データを作る層。実行手順と、出典調査・取り込み・PDF抽出・dbt構築のハマりどころは `.agents/skills/pipeline/` を参照する。

## Scripts

script はこの package が所有する。実行は `bun run --cwd pipeline <name>`（または `pipeline/` で `bun run <name>`）。

| group | scripts |
|---|---|
| 取り込み・保存 | `ingestion:schema` / `ingestion:check` / `ingestion:originals` / `ingestion:convert` / `ingestion:restore` / `ingestion:refresh`（指紋が古い管理 JSON の表を再変換して保存済みの表と中身で比べ、同じなら指紋だけを書き換える。R2 は読むだけ。`--remote`・`--dry-run`。`--plan` は指紋の比較だけで対象を列挙し、変換も書き換えもしない）/ `ingestion:cleanup` |
| 取り込み表の合計検査 | `ingestion:verify`（ノードの表・金額の表の全段の木の検査（保存済み可）と印字された数字の網羅の検査（候補の scope 付きのみ。弱い規則で通した数字と帯の外の数字を Jev が金額と読めば止める。convert が聞いて保存した答えを verify は API なしで再現し、無ければ止める）を保存済み・候補の表に当てる。CIでは回さない） |
| dbt | `dbt:prepare`（入力準備だけ）/ `dbt:build`（入力準備から marts まで。候補は `--candidate-dir`、保存済みで未キャッシュなら `--remote`） |
| 配信 | `serving:columns`（`apps/api/src/columns.json` を warehouse の列と `_models.yml` の説明から生成。`--check` で最新か検査）/ `serving:sync`（marts の表を D1 へ同名・同列で写す。`--database-id <uuid>` か `--local`、`--persist-to`、`--dry-run`。ネットワーク・cf を使うので sandbox 外） |
| 評価の検索 | `evaluation:index`（保存済みの評価資料を R2 から取り、1頁ずつの PDF にして AI Search `fudoki-evaluation-v2` へ登録する。既定は計画の表示だけ、`--write` で書き、全 item が completed で数と metadata が計画と一致した出典の記録を `evaluation_search/instance.json` に書く。分割 PDF は保存しない。ネットワーク・cf を使うので sandbox 外）/ `serving:evaluation-catalog`（登録の記録があり指紋が今の選定と設定に一致する出典だけを `apps/api/src/evaluation-catalog.json` に生成。`--check` で最新か検査し、CI で回す） |
| 検査 | `test`（bun）/ `test:python`（unittest）/ `test:dbt`（入力準備の unittest） |

出典選定は `bun pipeline/source_selection/check.ts` と `archive.ts`。事業の評価の資料（`evaluation_selections`）は `archive.ts --evaluation` で決算書とは別の key（`.../evaluation-settlement[-<n>].pdf`）に保存する。`settlement-` で始めると決算書の保存が消す。dbt は入力準備（`dbt/scripts/`）、staging・intermediate・marts のモデル、seeds を持つ。

## 生成物・観測・取得の規約

- **commit した生成物には生成手段を残す。** 生成物だけ残して作り方を消すと、作り直せず検証もできない出所不明のデータになる。置き場は調査スクリプト置き場ではなく、生成物と consumer の近く。
- **観測は commit しない。** `ingestion/fiscal/observations/` に書き出し、主張に使うときは実測日を添える。
- **ネットワークを叩く script はサンドボックスを外して回し、CI では回さない。** 開発環境の HTTP プロキシが応答を途中で切り `IncompleteRead` が出る（取得元の問題と取り違えない。実測の詳細は `.agents/skills/pipeline/references/ingestion.md`）。

## 技術スタック

- **汎用層として作る**: 自治体ごとの差は出典選定の宣言・書式設定に置き、取得・変換の処理を再利用できる形にする。「他自治体でも動く」をコードで示す。
- **schema・宣言は最小形から始める**: フィールドは原則 nullable にし、必須化・union 型化・汎用 scope 枠のような拡張は実例が出てから足す。最初から過剰な提案を出すとユーザーに削らせる往復になる（2026-10、source_selection schema の scope/inspection を連続して削らせた観測）。
- **取り込み**: Bは選定済みのCSV/PDFと対象情報を受け取り、ローカルParquetへ変換する。管理JSONはschema_version 1で入出力と変換だけを持ち、型は `ingestion/fiscal/manifest.schema.json`、対象間の制約は `manifest.py`。自治体の書式を書かない text PDF は汎用の変換器 `ingestion/fiscal/layouts/generic_text`（実体は `ingestion/generic/convert.py`。会計・表IDと `options.workflow` の固定した読み方を使い、頁は選定の scope）が `{nodes, amounts}` を直接返し、`run.py` が wide 表の移行を通さずに検査する。木の検査は表の作り手によらず `ingestion/lib/tree_checks.py` の `check_tree` の1つで、子（と同じ軸の子孫）が金額を1つも印字しない親は比べない（細節が金額を省く作り。一部の子だけ印字が無ければ今までどおり不一致）。CLIとCIで `ingestion:check` を実行する。PDF表の合計検査は `ingestion:verify` でノードの表・金額の表の全段の木の検査（`check_tree`）、同じ出典PDFの同じ頁を読む全表の採用金額・ノードを集めた網羅の照合と印字された数字の網羅の検査（`ingestion/lib/coverage_checks.py` の `check_digit_coverage`、text PDF の金額帯の取りこぼしは保存前に停止。弱い規則で非金額とした数字と帯の外の数字は `ingestion/lib/digit_recheck.py` で Jev に聞き直し、金額と読んだものを同じく停止する。Jev は止める方向だけに使い、通す判断には使わない）を当てる。非採用範囲は既存の観測用の読み分けから実行時に生成し、種類の語彙は `node_tables.EXCLUSION_KINDS` に置く。人は種類と理由だけを定める。単位の確かめ（款の和＝印字の歳出合計、会計が一般会計なら合計の桁が単位に合うこと。木の検査は全段が同じ倍率で間違うと検出できない）は、変換器を問わず全ての PDF 表の保存の関門（`convert`・`prepare_save`・`verify`）に当てる（`ingestion/fiscal/unit_checks.py`。規則は汎用の組み立ての `generic/units.py` の `check` と同じ。印字の合計は変換器の対象範囲（`<表ID>.coverage.json`）の歳出合計の行から、同じ頁の款の金額の右端に揃う列に置く。対象範囲を持たない scan と保存済みの表、置けない表は桁だけを確かめ、分冊は報告だけ。指紋の外なので、厳しくしたときは `ingestion:convert`（ローカルの候補）→ `ingestion:verify --candidate <候補dir>` で当て直す。[ADR 0028](../docs/adr/0028-unit-check-in-the-save-gate.md)）。木と網羅だけでは支出済額の段階や款が丸ごと欠けた表を素通りさせるため、決算・歳出のうち公営企業会計以外は保存の前に款の軸と目の支出済額の過半も確かめる（`ingestion/fiscal/subject_checks.py`。止まった理由は `unit_checks.describe` が「款の科目軸がない」「款の支出済額がない」「目の支出済額が過半に満たない」として返す。[ADR 0029](../docs/adr/0029-structural-check-in-the-save-gate.md)）。汎用PDFの固定した読み方は `options.workflow`、候補の比較は `generic/discovery.py`、選択実装は `generic/patterns/`。指紋は共通コードと選んだ実装・参照する辞書を含み、未選択パターンの追加・変更では変わらない。設定・移行・検証の境界は [PDF workflow の設計](../docs/prd/pdf-workflow-patterns/dd.md) を参照する。指紋（`input_fingerprint`）はコード・設定・入力の内容のハッシュで、「変わったかもしれない」という合図である。古ければ `ingestion:check`・`restore` は止まる。共有のコードを直す PR は `ingestion:refresh --remote` を回し、保存済みの表と中身が同じ表の指紋だけを更新した管理 JSON を含める。中身が違う表は本当の変更なので、差分を示して許可を取り `ingestion:convert --remote` で保存し直す。表を作らず合否だけを決める検査のコード（`tree_checks.py`・`coverage_checks.py`・`fiscal/unit_checks.py`・`fiscal/subject_checks.py`）は `*_checks.py` に置き、指紋から外す（`manifest.dependencies` が、表を書く関数・呼び出しがあれば停止する。検査の戻り値で段のパターンを選ぶ汎用の組み立てだけは `manifest.RESULT_SHAPES_TABLE` で `tree_checks.py` を指紋に残す）。外した検査を厳しくした PR は、指紋では保存済みの表が古く見えないので、`ingestion:verify --remote` を全表に当てる（[ADR 0027](../docs/adr/0027-refresh-fingerprints-by-table-content.md)）。配置と保存の手順は [ingestion手順](../.agents/skills/pipeline/references/ingestion.md)、判断は [保存設計](../docs/prd/ingestion-storage/dd.md) を参照する。
- **金額の注記**: 流用元・流用先や不用額、基準額の文言と金額・単位・印字位置を「注記」軸で保持する。`shared/fiscal_annotation_map.csv` の共通の見出しで種類を解き、phaseを付けず、木の合計・歳出のintermediateから外す。同じ備考欄の折返しだけを継承し、月額は既存の月額セル、回数単価は同じ括弧内の円付き金額に限定する（[ADR 0024](../docs/adr/0024-monetary-annotations-without-phase.md)）。
- **共通辞書**: 取り込みと dbt を横断する辞書は `shared/` に置き、取り込みは直接読み、dbt は seed として読む。
- **コード配置**: 共通処理は `ingestion/lib/`、書式別の共通処理は `ingestion/fiscal/layouts/`、採用中のPDFの読み方は `ingestion/generic/patterns/` の共有ルールに置き、自治体ごとの実測・訂正のJSON宣言は `ingestion/fiscal/jurisdictions/<自治体>/layouts/` に置く。結び付きの強い文字PDFの読み方は `readings/`、独立に選べる部品は `components/`。独立検査・未採用資料の支持コードは自治体側に保持する（[ADR 0036](../docs/adr/0036-shared-coupled-pdf-readings.md)）。年度・会計だけでコードを複製しない。
- **OCR**: 新しいBの共通入口は `ingestion/lib/scan_ocr.py`。エンジンはPaddleOCR PP-OCRv6 smallをONNX Runtime（CPU）で動かす `paddle_ocr.py`（依頼は `engine: "paddle"`。頁の縦分割数・検出解像度は `config`。[ADR 0032](../docs/adr/0032-paddle-onnx-for-new-scan-acquisitions.md)）。Apple Visionの処理は全冊の移行後に消した。取得時にOCRの箱にも罫線にも覆われない墨を探して、その範囲を同じエンジンで、残りを行の文脈ごとVLM（`vlm_ocr.py`）で読み直し、観測に固定する。名称と金額の誤読は `ocr_names.py` の宣言で直し、生の観測は書き換えない。OCRは変換器の外で `ingestion:ocr` が取得し、観測のSHAを管理JSONの `ocr_inputs` に書く。観測は表と一緒に非公開R2へ保存し、変換器へ渡す（[ADR 0019](../docs/adr/0019-freeze-scan-ocr-observations.md)）。設定と検証範囲は [OCRの説明](ingestion/lib/scan_ocr.md)、実行と欠落セルの再読は `.agents/skills/pipeline/references/ingestion.md` を参照する。
- **変換**: dbt-duckdb。入力宣言は `dbt/scripts/generate_sources.py` が管理 JSON から生成する。PDF はノードの表・金額の表を全自治体共通の staging 2モデルで読み、CSV（当初予算・決算の歳出）は書式ごとの staging で読み、金額の列名と単位（円・千円）は変換の宣言（`amount_column`・`amount_unit`）で決める。intermediate で段の名前（共通規則）・資料区分ごとの金額の段階の選択（決算は支出済額・当初予算は当初予算額）・表をまたぐ款項目の統合・円換算・COFOG を行い、marts（`settlement_expenditure_node`（PDF と CSV の決算を同じ表に union）・`initial_expenditure_node`・`origin`、木の表から作る収録範囲 `expenditure_coverage`、自治体マスタ `jurisdiction_master`）を作る。自治体マスタは `packages/jurisdictions/jurisdictions.json` を入力準備が読み、都道府県の名称は seed から引く。木の表は出典の位置（`origin_id`・`source_page`・印字の枠 `source_x0`ほか、金額は `amount_source_*`。座標は PDF だけで、複数の印字を足した金額は NULL）を持ち、`origin.sha256` までたどれる。比較は木の表を目（`is_subject and node_kind='目'`）で絞って行う。設計は [dbt モデルの設計](../docs/prd/fiscal-dbt-models/dd.md)。
- **配信**: `serving/` が marts の表（`jurisdiction_master`・`origin`・`settlement_expenditure_node`・`initial_expenditure_node`・`expenditure_coverage`）を同名・同列のまま D1 に写す（[ADR 0022](../docs/adr/0022-serve-marts-via-worker-d1-rest-and-mcp.md)）。列の契約は `serving/columns.py`、同期は `serving/sync_d1.py`（`<表>__new` に全件投入し、行数と金額の和が合ったときだけ rename。書き込むのはこの script だけで同時に2つ流さない）。D1 には control 以外の表を migration で作らない（`apps/api/migrations/`）。`--local` の状態は `apps/api/.cloudflare/state`（gitignore 済み）。反映後の収録は REST の `/v1/jurisdictions?page_size=100` で確かめる（MCP の `list_jurisdictions` は既定 20 件で、全件は `next_page_token` を辿らないと見えない）。収録団体数は宣言の grep では数えられない — CSV から取り込んだ対象は `conversions[].options.account` を持たず、marts 全体を数えると都外の団体が混じる。`expenditure_coverage` を年度・資料区分・会計で切り分けて数える。
- **保存**: Git はコード・宣言・判断・入力一覧、非公開 R2 は出典・取り込み表。`.cache/` と `.build/` は再生成可能なローカル作業領域。

  | 内容 | 保存先 | Git |
  |---|---|---|
  | 出典 CSV/PDF | 非公開R2の `fiscal/source-selection/` | 選定・保存参照だけ |
  | 取り込みParquet | 非公開R2の `fiscal/ingestion/<対象>/<方向>/` の固定key | 対象別JSONだけ |
  | scan PDFのOCR観測 | 非公開R2の `fiscal/ingestion/<対象>/<方向>/ocr/<id>.json.gz` | 依頼とSHA（`ocr_inputs`）だけ |
  | Jev の聞き直しの答え（入力の fingerprint と確率。出典の文字は持たない） | `ingestion/fiscal/jurisdictions/<自治体>/<年度>/<資料区分>/<方向>.digit-recheck.jsonl` | 管理する |
  | 変換設定・現在の表・ハッシュ・保存先 | `ingestion/fiscal/jurisdictions/<自治体>/<年度>/<資料区分>/<方向>.json` | 管理する |
  | 評価資料の索引の設定と登録の記録（出典ごとの sha256・頁数・指紋・確認日時） | `evaluation_search/instance.json` | 管理する |
  | 評価資料の頁ごとの PDF・chunk | AI Search `fudoki-evaluation-v2` の built-in storage | 管理しない（R2 の出典から `evaluation:index` で作り直す） |
  | Worker が引く評価資料の一覧 | `apps/api/src/evaluation-catalog.json`（生成物） | 管理する |
  | 分類・名称のマスタ | dbt seeds | 管理する |
  | 復元済み入力・PDF/OCR キャッシュ | `pipeline/.cache/` | 管理しない |
  | DuckDB・dbt manifest・検査結果・ローカル報告 | `pipeline/.build/` | 管理しない |

  再構築に必要な出典・取り込み表・コード・宣言を保持する。独立したprovenanceファイルは生成・保存しない。
  scan測定の観測は `docs/prd/generic-node-builder/scan/plans/` の `tables=[]`・`ocr_inputs` 付き管理JSONで宣言し、取得時にR2へ保存できる。掃除はこの参照も保護し、採用時は正規管理JSONへ移して測定用から外す（[ADR 0019](../docs/adr/0019-freeze-scan-ocr-observations.md)）。
- **一時検証の保存**: `.agent/` へ runtime・依存物・出典群・キャッシュ・全量 warehouse を検証ごとに複製しない。ハッシュ固定した既存出典を読み取り参照し、変更コードのスナップショット・ハッシュ一覧・対象範囲の再抽出と検査結果を保存する。全件走査・全ファイルのハッシュ計算は対象を絞る。採用後の再生成可能な一時DB・重複CSVは整理するが、未採用の出典・取り込み表・支持コード・証跡は保持する。

**Python の版は 3.13 に固定してある。** dbt-duckdb 1.11.0 が classifiers で 3.14 を宣言していないため（`requires-python` は `>=3.10` なので入りはするが、テストされていない組み合わせになる）。

## 参照

- 自治体固有の実測・出典の癖 → `ingestion/fiscal/jurisdictions/<自治体コード>/README.md`
- パイプライン（選定・取り込み・PDF抽出・dbt）の手順 → `.agents/skills/pipeline/`
