# 中野区の決算書の独立検査

共有ルール `ingestion/generic/patterns/readings/facing_columns.py` が作った候補の表を、構築コードを使わずに出典から観測した値と照合する検査。変換器ではなく、管理JSONからは参照しない。

1. `inspect_origin.py --pdf <出典PDF> --output <観測JSON>`: 出典の見開きを Poppler で独立に観測する。
2. `inspect_notes.py --pdf <出典PDF> --origin <観測JSON> --output <備考JSON>`: 印字された水平罫線から備考の所属を決める。
3. `validate_candidate.py --origin <観測JSON> --notes <備考JSON> --parquet <候補Parquet> --output <結果JSON>`: 候補の表を読み戻し、観測と照合する。`hierarchy.py` は款・項・目・節の独立した印字金額との照合に使う。

保存した表の階層ごとの合計は、共通の `bun run --cwd pipeline ingestion:verify`（`ingestion/lib/tree_checks.py` の木の検査 `check_tree`）で確かめる。
