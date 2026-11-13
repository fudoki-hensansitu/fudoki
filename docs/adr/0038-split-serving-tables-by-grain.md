# ADR 0038: 配信する歳出の表を、印字の木から粒度ごとの表に分ける

状態: 採用（2026-11-06）。[ADR 0022](0022-serve-marts-via-worker-d1-rest-and-mcp.md) のデータの形・操作・表名を置き換える（Worker・D1・一つの操作定義で REST と MCP に出す構成はそのまま）。

これまでの marts と D1 は、資料区分ごとの印字の木（`settlement_expenditure_node`・`initial_expenditure_node`）を1表ずつ配っていた。木は出典をそのまま写すので、同じ親に事業と節がぶら下がり、`axis` で絞らずに子を足すと二重計上になる。事業を引く列が無く、同じ「事業」の欄が資料ごとに違う見出し（決算は備考、当初予算は説明）で入っていた。

歳出を粒度ごとの表に分ける。

- 科目の表 `fiscal_expenditure_subject`: 款・項・目。同じ資料の `is_leaf` の行の和が総額。COFOG は目に付ける。
- 内訳の表 `fiscal_expenditure_detail`: 目（目の無い項）の下の枝。枝の根の見出しから分け方 `breakdown`（事業・節・その他）を継ぎ、同じ科目・同じ分け方の `depth = 1` の和が科目の額になる。所管課（名称末尾の【】）を `department` に持つ。
- 印字の位置 `fiscal_expenditure_location`: 行ごとの出典の頁と枠。検索の行を軽くするため分けた。

決算と当初予算は同じ表に入れ、`document_kind`・`amount_phase` で分ける。見出しをどの分け方と読むかは風土記の判断として、出典（自治体・年度・資料区分）と見出しごとに seed `fiscal_detail_breakdown` で宣言する。同じ「備考」でも、経費の品目を並べる自治体があるためである。

表名は「領域_中身」にそろえる（`fiscal_origin`・`fiscal_coverage`・`jurisdiction`・`population`）。公開 API も新しい表に合わせ、パスを `/v1/fiscal/expenditure/{subjects,details}`・`/v1/fiscal/origins/{origin_id}/pdf`、MCP の tool を `search_expenditure_subjects`・`search_expenditure_details`・`get_expenditure_subject`・`get_expenditure_detail` にする。旧いパス・tool の互換は持たない。

設計の詳細と比べた案は [配信する表の設計](../prd/fiscal-serving-tables/dd.md)。

## Consequences

足してよい組を、列の組合せではなく表・`level`・`breakdown` で決められる。`describe_expenditure_columns` の `sum_rules` もこの規則で書く。

新しい出典を取り込むたびに、内訳の見出しの宣言が要る。見出しが「節」の枝は既定で `節` とし、それ以外の宣言の無い見出しは dbt の検査で止まる（手順は `.agents/skills/pipeline/references/dbt.md`）。

切り替えは、本番の D1 に新しい表を写してから merge し（旧い表は残る）、api と web の deploy の後に `serving:sync --drop-legacy` で旧い表を消す。api と web は別々に deploy されるので、数分は旧い web が新しい api を呼んで失敗しうる。利用者が少ないので、この窓は許容する。

ID は `subject_id`・`detail_id` が資料区分ごとに一意で、`node_key`（旧い `node_id`）は同じ年度の決算と当初予算の対応にだけ使う。年度をまたぐ同一性は今までどおり保証しない。
