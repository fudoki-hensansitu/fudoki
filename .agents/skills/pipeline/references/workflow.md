# 出典選定から取り込み・提供用データまで

## 工程と境界

| 工程 | 終点 | reference |
| --- | --- | --- |
| A. 出典の選定 | 1資料を選び、R2 に保存する | [source-selection](source-selection.md) |
| B. 取り込み | 表を作って検査を通し、管理 JSON に記録する（R2 には merge 後の CI が置く） | [ingestion](ingestion.md) |
| C. dbt | 保存済みの表から staging・intermediate・marts を作る | [dbt](dbt.md) |
| 本番への反映 | main への merge で自動 | 下記 |

- 取り込みの完了条件は形式で違う。CSV は全セルの一致、PDF は木の検査と単位の確かめ、text PDF はさらに数字の網羅を通ること。
- `ingestion:check` は管理情報・選定の検査で、財政の値の正しさは認定しない。
- 出典は source_selection、表と保存先は管理 JSON に置く。独立した provenance ファイルは作らない。
- dbt は管理 JSON と保存済みの表だけを読み、取り込みの検査をやり直さない。取り込みの成功と dbt の構築の成功は分けて扱う。
- 本番への反映は main への merge で自動に行う（`.github/workflows/sync-d1.yml` が記録された表を R2 に置き（`ingestion:store`）、変わった範囲だけを marts に build し、本番 D1 へ差分で写す。入口は `publish`）。取り込みの PR では R2 にも本番にも手で書かない。

## 手元で確かめることと CI に任せること

| 確かめること | どこで |
| --- | --- |
| 変換した表の保存の関門（木・網羅・単位） | 手元の `ingestion:convert` |
| 取り込んだ自治体の dbt の検査 | 手元の `dbt:build -- --jurisdiction <自治体コード>` |
| PR で記録した表が R2 の出典から同じに作り直せるか、変わった範囲の dbt の検査 | 管理 JSON を変えた PR の `ingestion-store-check.yml` |
| 指紋が古くなった保存済みの表が、今のコードで同じに作り直せるか（同じなら指紋を書き換える PR を出す） | 毎日の `refresh-check.yml`。merge 前に見たいときは PR の branch で手動実行する（比べるだけ） |
| Poppler の版を上げたあと、保存済みの全表が同じに作り直せるか | `refresh-check.yml` を `all` を付けて手動実行する |
| R2 への保存・marts の build・本番 D1 への同期 | merge 後の `sync-d1.yml` |

- 共通コードを変えても、手元で `ingestion:refresh` や全表の変換を回さない。
- 検査（`*_checks.py`）を厳しくしたら、保存済みの全表に `ingestion:verify --remote` を当てる。候補の対象範囲が要る検査（網羅・印字の合計）は `ingestion:convert` の候補に `ingestion:verify --candidate <dir>` を当てる（[ADR 0027](../../../../docs/adr/0027-refresh-fingerprints-by-table-content.md)）。

## 重い実行

OCR・多数の表の変換は重い。起動時にロック（`ingestion/lib/heavy_lock.py`）が同時実行を判定し、断られたら理由を出して終わるので、走っている実行の完了を待ってからやり直す。ロックファイルを消したり作り直したりしない。待つときは完了通知か出力ファイルで判定する。

## 後段で確かめること

収録漏れは、source_selection の選定済みの scope と取り込みの管理 JSON の有無を突き合わせて確かめる。金額の注記（流用・充用・不用額など）は原文と金額を持ち、段階を付けず、木の合計に足さない（[ADR 0024](../../../../docs/adr/0024-monetary-annotations-without-phase.md)）。
