# pipeline

原典から提供用データを作る層。実行手順と、原典調査・取り込み・PDF抽出・dbt構築のハマりどころは `.agents/skills/pipeline/` を参照する。

## Scripts

script はこの package が所有する。実行は `bun run --cwd pipeline <name>`（または `pipeline/` で `bun run <name>`）。

| group | scripts |
|---|---|
| 取り込み・保存 | `ingestion:schema` / `ingestion:check` / `ingestion:originals` / `ingestion:convert` / `ingestion:restore` / `ingestion:refresh`（指紋が古い管理 JSON の表を再変換して保存済みの表と中身で比べ、同じなら指紋だけを書き換える。R2 は読むだけ。`--remote`・`--dry-run`）/ `ingestion:cleanup` |
| 取り込み表の合計検査 | `ingestion:verify`（ノードの表・金額の表の全段の木の検査（保存済み可）と印字された数字の網羅の検査（候補の scope 付きのみ。弱い規則で通した数字と帯の外の数字を Jev が金額と読めば止める。convert が聞いて保存した答えを verify は API なしで再現し、無ければ止める）を保存済み・候補の表に当てる。CIでは回さない） |
| dbt | `dbt:prepare`（入力準備だけ）/ `dbt:build`（入力準備から marts まで。候補は `--candidate-dir`、保存済みで未キャッシュなら `--remote`） |
| 配信 | `serving:columns`（`apps/api/src/columns.json` を warehouse の列と `_models.yml` の説明から生成。`--check` で最新か検査）/ `serving:sync`（marts の表を D1 へ同名・同列で写す。`--database-id <uuid>` か `--local`、`--persist-to`、`--dry-run`。ネットワーク・cf を使うので sandbox 外） |
| 検査 | `test`（bun）/ `test:python`（unittest）/ `test:dbt`（入力準備の unittest） |

原典選定は `bun pipeline/source_selection/check.ts` と `archive.ts`。dbt は入力準備（`dbt/scripts/`）、staging・intermediate・marts のモデル、seeds を持つ。

## 生成物・観測・取得の規約

- **commit した生成物には生成手段を残す。** 生成物だけ残して作り方を消すと、作り直せず検証もできない出所不明のデータになる。置き場は調査スクリプト置き場ではなく、生成物と consumer の近く。
- **観測は commit しない。** `ingestion/fiscal/observations/` に書き出し、主張に使うときは実測日を添える。
- **ネットワークを叩く script はサンドボックスを外して回し、CI では回さない。** 開発環境の HTTP プロキシが応答を途中で切り `IncompleteRead` が出る（取得元の問題と取り違えない。実測の詳細は `.agents/skills/pipeline/references/ingestion.md`）。

## 技術スタック

- **汎用層として作る**: 団体ごとの差は原典選定の宣言・書式設定に置き、取得・変換の処理を再利用できる形にする。「他自治体でも動く」をコードで示す。
- **schema・宣言は最小形から始める**: フィールドは原則 nullable にし、必須化・union 型化・汎用 scope 枠のような拡張は実例が出てから足す。最初から過剰な提案を出すとユーザーに削らせる往復になる（2026-10、source_selection schema の scope/inspection を連続して削らせた観測）。
- **取り込み**: Bは選定済みのCSV/PDFと対象情報を受け取り、ローカルParquetへ変換する。管理JSONはschema_version 1で入出力と変換だけを持ち、型は `ingestion/fiscal/manifest.schema.json`、対象間の制約は `manifest.py`。団体の書式を書かない text PDF は汎用の変換器 `ingestion/fiscal/layouts/generic_text`（実体は `ingestion/generic/convert.py`、options は会計と表IDだけ。頁は選定の scope）が `{nodes, amounts}` を直接返し、`run.py` が wide 表の移行を通さずに検査する。木の検査は表の作り手によらず `node_tables.check_tree` の1つで、子（と同じ軸の子孫）が金額を1つも印字しない親は比べない（細節が金額を省く作り。一部の子だけ印字が無ければ今までどおり不一致）。CLIとCIで `ingestion:check` を実行する。PDF表の合計検査は `ingestion:verify` でノードの表・金額の表の全段の木の検査（`ingestion/lib/node_tables.py` の `check_tree`）、同じ原典PDFの同じ頁を読む全表の採用金額・ノードを集めた網羅の照合と印字された数字の網羅の検査（`check_digit_coverage`、text PDF の金額帯の取りこぼしは保存前に停止。弱い規則で非金額とした数字と帯の外の数字は `ingestion/lib/digit_recheck.py` で Jev に聞き直し、金額と読んだものを同じく停止する。Jev は止める方向だけに使い、通す判断には使わない）を当てる。非採用範囲は既存の観測用の読み分けから実行時に生成し、種類の語彙は `node_tables.EXCLUSION_KINDS` に置く。人は種類と理由だけを定める。指紋（`input_fingerprint`）はコードの中身のハッシュで、「変わったかもしれない」という合図である。古ければ `ingestion:check`・`restore` は止まる。共有のコードを直す PR は `ingestion:refresh --remote` を回し、保存済みの表と中身が同じ表の指紋だけを更新した管理 JSON を含める。中身が違う表は本当の変更なので、差分を示して許可を取り `ingestion:convert --remote` で保存し直す。表を作らず合否だけを決める検査のコードは `*_checks.py` に置き、指紋から外す（`manifest.dependencies` が、表を書く関数・呼び出しがあれば停止する）。外した検査を厳しくした PR は、指紋では保存済みの表が古く見えないので、`ingestion:verify --remote` を全表に当てる（[ADR 0027](../docs/adr/0027-refresh-fingerprints-by-table-content.md)）。配置と保存の手順は [ingestion手順](../.agents/skills/pipeline/references/ingestion.md)、判断は [保存設計](../docs/prd/ingestion-storage/dd.md) を参照する。
- **金額の注記**: 流用元・流用先や不用額、基準額の文言と金額・単位・印字位置を「注記」軸で保持する。`shared/fiscal_annotation_map.csv` の共通の見出しで種類を解き、phaseを付けず、木の合計・歳出のintermediateから外す。同じ備考欄の折返しだけを継承し、月額は既存の月額セル、回数単価は同じ括弧内の円付き金額に限定する（[ADR 0024](../docs/adr/0024-monetary-annotations-without-phase.md)）。
- **共通辞書**: 取り込みと dbt を横断する辞書は `shared/` に置き、取り込みは直接読み、dbt は seed として読む。
- **コード配置**: 共通処理は `ingestion/lib/`、書式別の共通処理は `ingestion/fiscal/layouts/`、団体固有のコードと宣言は `ingestion/fiscal/jurisdictions/<団体>/layouts/`。年度・会計だけでコードを複製しない。
- **OCR**: 新しいBの共通入口は `ingestion/lib/scan_ocr.py`。既定はApple Vision（`vision_ocr.py`）で、PaddleOCR smallの縮小検出・原解像度認識は `backend="paddle"` で選ぶ。Visionは単独の0・横棒の「一」・行まるごとを読み落とすことがあり、取得時にOCRの箱にも罫線にも覆われない墨を探して、その範囲をVisionで、残りを行の文脈ごとVLM（`vlm_ocr.py`）で読み直し、観測に固定する。名称と金額の誤読は `ocr_names.py` の宣言で直し、生の観測は書き換えない。OCRは変換器の外で `ingestion:ocr` が取得し、観測のSHAを管理JSONの `ocr_inputs` に書く。観測は表と一緒に非公開R2へ保存し、変換器へ渡す（[ADR 0019](../docs/adr/0019-freeze-scan-ocr-observations.md)）。設定と検証範囲は [OCRの説明](ingestion/lib/scan_ocr.md)、実行と欠落セルの再読は `.agents/skills/pipeline/references/ingestion.md` を参照する。
- **変換**: dbt-duckdb。入力宣言は `dbt/scripts/generate_sources.py` が管理 JSON から生成する。PDF はノードの表・金額の表を全団体共通の staging 2モデルで読み、CSV（当初予算の歳出）は書式ごとの staging で読む。intermediate で段の名前（共通規則）・資料区分ごとの金額の段階の選択（決算は支出済額・当初予算は当初予算額）・表をまたぐ款項目の統合・円換算・COFOG を行い、marts（`settlement_expenditure_node`・`initial_expenditure_node`・`origin`）を作る。木の表は原典の位置（`origin_id`・`source_page`・印字の枠 `source_x0`ほか、金額は `amount_source_*`。座標は PDF だけで、複数の印字を足した金額は NULL）を持ち、`origin.sha256` までたどれる。比較は木の表を目（`is_subject and node_kind='目'`）で絞って行う。設計は [dbt モデルの設計](../docs/prd/fiscal-dbt-models/dd.md)。
- **配信**: `serving/` が marts の表（`settlement_expenditure_node`・`initial_expenditure_node`・`origin`）を同名・同列のまま D1 に写す（[ADR 0022](../docs/adr/0022-serve-marts-via-worker-d1-rest-and-mcp.md)）。列の契約は `serving/columns.py`、同期は `serving/sync_d1.py`（`<表>__new` に全件投入し、行数と金額の和が合ったときだけ rename。書き込むのはこの script だけで同時に2つ流さない）。D1 には control 以外の表を migration で作らない（`apps/api/migrations/`）。`--local` の状態は `apps/api/.cloudflare/state`（gitignore 済み）。
- **保存**: Git はコード・宣言・判断・入力一覧、非公開 R2 は原典・取り込み表。`.cache/` と `.build/` は再生成可能なローカル作業領域。

  | 内容 | 保存先 | Git |
  |---|---|---|
  | 原典 CSV/PDF | 非公開R2の `fiscal/source-selection/` | 選定・保存参照だけ |
  | 取り込みParquet | 非公開R2の `fiscal/ingestion/<対象>/<方向>/` の固定key | 対象別JSONだけ |
  | scan PDFのOCR観測 | 非公開R2の `fiscal/ingestion/<対象>/<方向>/ocr/<id>.json.gz` | 依頼とSHA（`ocr_inputs`）だけ |
  | Jev の聞き直しの答え（入力の fingerprint と確率。原典の文字は持たない） | `ingestion/fiscal/jurisdictions/<団体>/<年度>/<資料区分>/<方向>.digit-recheck.jsonl` | 管理する |
  | 変換設定・現在の表・ハッシュ・保存先 | `ingestion/fiscal/jurisdictions/<団体>/<年度>/<資料区分>/<方向>.json` | 管理する |
  | 分類・名称のマスタ | dbt seeds | 管理する |
  | 復元済み入力・PDF/OCR キャッシュ | `pipeline/.cache/` | 管理しない |
  | DuckDB・dbt manifest・検査結果・ローカル報告 | `pipeline/.build/` | 管理しない |

  再構築に必要な原典・取り込み表・コード・宣言を保持する。独立したprovenanceファイルは生成・保存しない。
- **一時検証の保存**: `.agent/` へ runtime・依存物・原典群・キャッシュ・全量 warehouse を検証ごとに複製しない。ハッシュ固定した既存原典を読み取り参照し、変更コードのスナップショット・ハッシュ一覧・対象範囲の再抽出と検査結果を保存する。全件走査・全ファイルのハッシュ計算は対象を絞る。採用後の再生成可能な一時DB・重複CSVは整理するが、未採用の原典・取り込み表・支持コード・証跡は保持する。

**Python の版は 3.13 に固定してある。** dbt-duckdb 1.11.0 が classifiers で 3.14 を宣言していないため（`requires-python` は `>=3.10` なので入りはするが、テストされていない組み合わせになる）。

## 参照

- 団体固有の実測・原典の癖 → `ingestion/fiscal/jurisdictions/<団体コード>/README.md`
- パイプライン（選定・取り込み・PDF抽出・dbt）の手順 → `.agents/skills/pipeline/`
