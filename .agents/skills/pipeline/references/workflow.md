# 原典選定から取り込み・提供用データまで

## フローを原典の形式で分ける

取り込みのフローは、原典選定・保存 → 形式別の取り込みと検査 → 取り込み表・管理情報の保存まで。dbt側は保存済みParquetと管理情報を読み、入力準備・モデル構築を行う。

| 原典の形式 | 取り込み完了の条件 | 実装の状態 |
| --- | --- | --- |
| ヘッダー付きCSV | 原典を読み直した全セル・列・行順・重複・空欄・物理行範囲がParquetと一致する | 共通CSV変換で自動検査。不一致は保存前に停止する |
| text PDF | 文字保持・原典との対応を確認し、ノードの表・金額の表にして全段の木の検査（印字された親＝子の値の和）→不一致の修正→再検査を行う | 木の検査は `ingestion/lib/node_tables.py` の共通処理で、保存の前に必須（通らない表は保存しない）。比べる金額の段階は `pipeline/shared/fiscal_amount_map.csv`。表をまたぐ照合は `jurisdictions/<団体>/sum_checks/` の宣言を `ingestion:verify` で当てる |
| scan PDF | OCRの観測と表への対応を確認し、text PDFと同じ木の検査→不一致の修正→再検査を行う | OCR・再読の手順はある。木の検査と保存前の停止はtext PDFと同じ |

取り込みと形式別の検査は [ingestion](ingestion.md) を読む。

## 保存と採用の境界

- 変換と保存の入口は `ingestion:convert`。ローカル実行は候補Parquet・候補manifest・形式別の検査結果を返し、`--remote` は全表の保存成功後に対象別JSONを更新する。手順は [ingestion](ingestion.md#管理jsonを確認して変換する)。
- `ingestion:check` は管理情報・選定・scope・fingerprintと合計検査の宣言ファイルの型の検査で、財政値の正しさを認定しない。PDF表の木は保存時に必ず検査され、`ingestion:verify` で保存済み・候補の表に当て直せる。
- 原典はsource_selection、表は対象・方向別のingestion領域に保存し、保存先と原典参照は対象別JSONに置く。独立したprovenanceファイルは作らない。
- C（dbt）は対象別JSONと保存済みParquetを読む。入口は `dbt:build`（[dbt](dbt.md)）。

## 後段で確認すること

年度・会計・単位・金額段階の解釈、staging、単位換算・分類・集約は [dbt](dbt.md) で確認する。取り込みの保存成功と後段の構築成功を分ける。収録漏れは、source_selection の選定済みscopeと取り込みの宣言（`<方向>.json`）の有無を突き合わせて確認する。
