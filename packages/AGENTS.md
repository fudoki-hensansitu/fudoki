# packages

- `fiscal/`（`@fudoki/fiscal`）: 歳出・歳入の純粋な型と名称。`cofog-master`（COFOG のコードと名称）と `setsu-master` を export する。歳出の節マスタ（地方自治法施行規則の区分と適用期間）の Git 定義を持つ
- `jurisdictions/`（`@fudoki/jurisdictions`）: 団体コードと自治体の名称を対応付ける団体マスタ。`jurisdictions.json` の registry を export する。コードは総務省の全国地方公共団体コード（6桁・チェックディジット含む）。**団体の同一性（名称・ocdId）の正本は `jurisdictions/jurisdictions.json`** — 財政データ・調達を同じキーで束ねるので、どれか1層のファイルに同居させない

- `ui/`（`@fudoki/ui`）: 共有のshadcn/ui部品・スタイル。Reactの表示部品とその依存を持ち、appがsource exportをbundleする。団体一覧・App bridge・PDF描画などapp固有の処理はappに置く。pipelineから依存しない

pipeline が依存する `fiscal/`・`jurisdictions/` は、副作用・I/Oを持たせず、型と名称の定義に留める。
