# C. dbt側で保存済み取り込みJSONとParquetを読み、構築する

`pipeline/dbt/` は、入力準備（`scripts/prepare.py`）、staging（`models/staging/fiscal/`）、intermediate、marts、seeds、検査（`tests/`）を持つ。入口は `bun run --cwd pipeline dbt:build`（保存済みの表。未キャッシュなら `--remote`、候補は `--candidate-dir <dir>`）。入力準備は SHA・行数・会計名・未読と所属未確認0を検査し、失敗したら止める。slice の期待値は `uv run python pipeline/dbt/scripts/check_slice.py` で確かめる。

## 入力を確認する

1. `ingestion/fiscal/jurisdictions/<団体>/<年度>/<資料区分>/<方向>.json` を読み、そこで参照される保存済みParquetを `ingestion:restore` で復元して読む。`ingestion:check` で対象・原典選定・scope・fingerprintを検査する。
2. 原典の抽出やBの検査は再実行しない。階層はノードの表の親子、単位と金額欄の見出しは金額の表、会計と注記は管理JSONの `tables[]` から取り、不足を推定値・空表で補わない。段の名前は dbt の seed（`fiscal_level_map`）、見出しから金額の段階への対応は取り込みと共通の辞書 `pipeline/shared/fiscal_amount_map.csv` に宣言する（[ADR 0021](../../../../docs/adr/0021-level-and-phase-map-in-dbt-seed.md)）。PDFの表はすべてノードの表に移行済み（横持ちの表は削除済み）。CSVは原文の表を読む。

## 構築結果を確認する

- 原典行の対応、値と単位、欠落・二重収録、集約を確認する。stagingの行数一致だけで全値一致としない。単位・金額段階の根拠は原典から取り、宣言どうしの一致だけで済ませない。
- コード・宣言・判断はGitで管理する。DB・CSV・検査結果は再生成するローカル領域（`pipeline/.build/`）に置く。
- 構築成功を全公開資料の収録完了と扱わない。

## stagingを定義する

1. 対象の管理JSONと、SHA・サイズを照合したノードの表と金額の表を読む。値と親子は Parquet、会計・注記・対象は管理JSON、原典の情報は selection から確認する。通常はこの入力だけで定義し、意味が不足する場合だけ原典に戻る。設計は [dbt モデルの設計](../../../../docs/prd/fiscal-dbt-models/design-doc.md) を参照する。
2. 管理している PDF の表は支出の木の表だけで、支出額の集計に使わない補助表（総括・財源内訳・予備費充用・貸付金状況など）は取り込みの管理から外してある。文字観測など調査だけに使う表を歳出明細へ混ぜない。目の下の独立した分解（節の一覧と事業の説明など）は軸ごとの枝として保ち、軸の違うノードや親と子を足さない。
3. `pipeline/dbt/models/staging/fiscal/` にsourceと薄いSQLを置く。PDFのノードの表と金額の表は全団体で同じ形なので、書式ごとにSQLを分けず、対象を区別して `union all` で扱う。CSVの原文の表は書式ごとにstagingを作り、どの列が款・項・目・節の番号・名称・金額かをymlで宣言する。ノードの形への変換は intermediate で行う。取り込みの行と1対1を保ち、段の名前・金額の段階の対応、単位換算、表をまたぐ款・項・目のまとめ、共通分類は後段に置く。
4. 原文へ戻れる対応を保持し、利用する文字列は必ず共通の `trim_cell`、金額は `staging_amount` を通す。NFKC・前後trimを既定とし、個別SQLへ変換を複製しない。金額は原文列を残して数値列を追加する。変換できない値を黙ってNULLや0にしない。
5. 管理JSONから入力を固定し、対象モデルだけを構築・検査する。dbtには `--select <モデル>` を指定する。別の検証用DB・targetを使い、通常の構築結果を上書きしない。
6. 入力と出力の行の対応、重複を含む原文値の一致、識別情報、数値の型・単位を確認する。親の金額と子の金額を合計せず、同じ軸で子の和と親の金額を照合する。
7. チャットでモデルの場所、実行範囲、変換前後の例と実施した変換を短く伝える。コードから読める処理を別の説明表や文書へ重ねない。

stagingされた表をすべて配布・集計する必要はない。後段のconsumerと検査が、表ごとの役割を使い分ける。
