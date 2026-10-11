# 昭島の企業会計決算書

`convert.py` は昭島の罫線付き企業会計決算報告書・歳出明細書の測定済み書式を読む。年度は管理JSON、頁はoptionsから受け取り、年度ごとのコードを複製しない。2025下水道事業会計の物理4–7、24–28、30–31頁で構築を確認した。他の会計・書式への適用は未検証。

pipelineをcwdにし、通常の `ingestion:check --manifest <対象JSON>` と `ingestion:convert --manifest <対象JSON> --inputs <SHAとローカルパスのJSON> --output <未使用候補dir>` を実行する。原典はsource_selectionの保存済みPDFをSHA照合して復元する。

変換器の表IDは `table_prefix` に `-revenue-report`、`-capital-report`、`-revenue-detail`、`-capital-detail` を付ける。管理JSONの採用対象は明細2表であり、報告2表は補助出力。明細は共通の移行・木の検査を経てノードと金額のParquetの組になる。税抜の明細と税込の報告、予算額と決算額を同じ金額欄へ混ぜない。

## 組版と出力

`pdftotext -bbox-layout` の単語を読み、`pdftocairo -svg` が出すページ直下の罫線矩形から金額欄の行境界を取る。共通 `ingestion.lib.pdf_table` のrow bandsと列への割当を使い、見開き報告は左右の横罫線が一致することを確認して対応するセルを組み立てる。収入欄の行は出力しない。

報告は項を一行とし、款の原典値を `区分_款_` 補助列へ反復する。明細の款→項→目→企業会計の節は、印字見出し `款項` を軸にする木として宣言する。備考実績内訳はその節を親とする `備考` の枝、備考の `予算額` は節が持つ別の金額欄 `備考／予算額` として保持する。各段・備考実績の金額見出しは印字どおり `金額（円）`。備考の所属は罫線で囲まれたセルを根拠とし、隣り合う独立した欄をy位置だけで結合しない。

共通入口へ渡す中間Parquetでは、名称を `科目款_名称` 等の列に置き、各段の物理頁・印字矩形を粒度として宣言する。名前が同じ別の印字項目をまとめず、末端へ反復した祖先と節予算だけを重複排除する。収益的・資本的支出は独立した木なので、共通入口の `款_`・`項_`・`目_` による別表の科目補完には参加させない。公開する候補はノードと金額の組であり、この中間列は保存契約ではない。

文字は行内x順、折り返しはy順で復元する。中央配置された款・項・目番号は同じセルの名称より前に置く。通常の単語を文字へ分割しない。Popplerが続き頁の目/節境界を跨いで一単語にする `費修` / `費補` の二字だけ、罫線と字形の大きさで分ける。この条件に一致しない跨ぎ単語、欠落金額、不明な備考行、継続目の相違、報告の行・ヘッダー相違は停止する。

単位・注記はmetadata、印字矩形は表示頁上端左を原点とするpointで保持する。ノードと金額には原典の物理頁を持たせ、反復する祖先は最初の印字位置を保持する。空の備考・予算欄はNULL、印字された0は文字列 `0`。

候補dirの `enterprise-observations/` に各頁のbbox XML、SVG、元単語JSON、表別構築観測JSONを出す。元単語には境界分割前の文字を保持する。ローカル検査用であり正式R2の取り込み表や別provenanceファイルにしない。親agentは独立に原典と保存済みParquetを読み、文字・所属と階層合計を検査する。変換器の成功は独立検査の合格を意味しない。

## 構築と独立検査のコマンド例

保存した表の階層ごとの合計は、共通の `bun run --cwd pipeline ingestion:verify`（宣言は `132071/sum_checks/`）でも確かめる。

以下はpipelineをcwdとする。`candidate-new`、`origin-new`、`check-new` は毎回未使用のディレクトリを指定する。入力JSONは原典SHAから絶対ローカルPDFパスへのオブジェクトを持つ。

```sh
mise exec -- bun run ingestion:convert \
  --manifest ingestion/fiscal/jurisdictions/132071/2025/settlement/expenditure.json \
  --inputs ../.agent/2025-text-pdf-ingestion/001-akishima-sewer-settlement/inputs.json \
  --output .cache/ingestion/candidate-new
mise exec -- uv run python -m ingestion.fiscal.jurisdictions.132071.layouts.enterprise_statement.inspect_origin \
  --pdf .cache/objects/fiscal/source-selection/132071/2025/settlement.pdf \
  --out ../.agent/2025-text-pdf-ingestion/001-akishima-sewer-settlement/origin-new
mise exec -- uv run python -m ingestion.fiscal.jurisdictions.132071.layouts.enterprise_statement.validate_candidate \
  --pdf .cache/objects/fiscal/source-selection/132071/2025/settlement.pdf \
  --origin ../.agent/2025-text-pdf-ingestion/001-akishima-sewer-settlement/origin-new/origin.json \
  --manifest .cache/ingestion/candidate-new/manifest.json \
  --candidate .cache/ingestion/candidate-new \
  --out ../.agent/2025-text-pdf-ingestion/001-akishima-sewer-settlement/check-new
mise exec -- uv run python -m unittest ingestion.fiscal.jurisdictions.132071.layouts.enterprise_statement.convert_test
```

独立観測は `pdftohtml -xml` から文字ブロックを取得し、構築器や共通表組み立てmoduleをimportしない。検査は保存済みParquetのscalar列・原典文字・所属、反復親金額の一致と階層別合計を確認する。ノードの組を検査するときは保存済みの親リンクから比較用の行へ投影し、全ノードを照合したことも確認する。不一致・保留があれば非ゼロ終了し、全結果を `checks.json` に残す。2026-10-11の明細2表の候補検査では文字・所属1456セル、金額48比較が一致し、不一致・保留0。備考内訳がない57節と税込報告↔税抜明細2比較は検算不可。備考予算額18個は文字保持のみで、実績内訳から予算額を検算しない。

保存済みのノードの組は収益的明細119ノード・134金額、資本的明細41ノード・44金額。現在の木の検査はそれぞれ31比較・17比較が一致し、未読・所属未確認0件。目はそれぞれ11個・8個、目の実績合計は2,191,784,140円・1,183,207,844円で款の実績に一致する。独立検査と共通の木の検査の成功を確認し、正式R2保存を済ませた。

現在の共通検査は、同じ軸では段階が一致する金額を、独立した枝ではその枝に印字された段階と共通の見出しだけを比較する。予算内訳のない実績枝に予算額を0埋めして比較しない。2026-10-11に保存済みの収益的明細31件・資本的明細17件が全件一致し、ノードの組をR2へ保存・採用した。`ingestion:verify --manifest ingestion/fiscal/jurisdictions/132071/2025/settlement/expenditure.json` で再検査できる。
