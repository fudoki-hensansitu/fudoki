# ADR 0047: 歳出の表には、木と根から求まる列を持たない

状態: 採用（2026-11-15）。表・API の変更は未実装。[ADR 0022](0022-serve-marts-via-worker-d1-rest-and-mcp.md) の「ノードの行に所属する款・項の名前を marts に持つ」と、[ADR 0038](0038-split-serving-tables-by-grain.md) の表の列（[配信する表の設計](../prd/fiscal-serving-tables/dd.md) の列の表）を置き換える。

1. 科目の表 `expenditure_subject` と内訳の表 `expenditure_detail` には、同じ表の別の行や別の表から決まる値を持たせない。
   - 所属する款・項・目（`kan_code`・`kan_name`・`kou_code`・`kou_name`・`moku_code`・`moku_name`）は持たない。親を辿って求める。
   - 子を持たないか（`is_leaf`）は持たない。子の有無から求める。
   - 根 `expenditure` が持つ値（`jurisdiction_code`・`fiscal_year`・`document_kind`・`amendment_number`・`amount_phase`・`account_name`・`account_kind`）は持たない。`expenditure_id` で引く。
2. 科目の表に残すのは、ID と木（`subject_id`・`node_key`・`parent_subject_id`・`expenditure_id`）、印字の値（`level`・`code`・`name`・`amount_yen`）、風土記の判断（COFOG・繰出の列）、出典（`origin_id`）である。`level` は段の数からも求まるが、出典に印字された段の種類なので残す。
3. 内訳の行が属する科目（`subject_id`）・分け方（`breakdown`）・深さ（`depth`）は、木から求まる値でも内訳の表の全行に持つ。内訳の木は段の数が決まらないので、子孫の値を出すには根から再帰で辿ることになる。分け方で絞る検索（事業の内訳を全自治体から引くなど）で毎回それをやると、D1 が内訳の表を全行読む。
4. API・MCP の検索で款の名前や末端で絞りたいときは、受け口をインターフェース（`apps/api/src/<集約>/model.ts`）に置き、SQL の中で JOIN する。表の列と API の入出力は一対一にしない。
5. 1行で款・項・目まで読める平たい形が要る配布物（自治体別の CSV など）は、配布用の marts を別に作って JOIN で組み立てる。

ADR 0022 は、API の検索が JOIN を持たないことを前提にしていた。そのため款・項の名前を行に焼き込み、名前の辿り方が dbt と API の2か所に分かれるのを避けた。その後は「表どうしでデータを写さず、API の SQL で JOIN する」方針になった。写しを持つと、同じ値を2か所で保つことになる。根の値と行の値が食い違っても、それを止める検査は無い。

## Considered Options

- **今のまま写しを持つ**: API は1表の where だけで済み、D1 の読み取りも1表に収まる。その代わり、写しの作り方が mart の SQL に散らばる。`moku_name` は `level` から作っており、`level` と `is_leaf` も他の列から求まる。
- **`level` も消す**: 段の数（親を辿った回数）から求まる。ただし、目が款の直下にある資料では段の数と種類が食い違うので、印字の種類として残す。

## Consequences

- API の SQL は、科目の絞り込みで親・祖父母への自己 JOIN（目が款の直下にある資料があるので coalesce）、`expenditure` への JOIN、末端の判定の `NOT EXISTS` を持つ。`parent_subject_id` の index で引く。
- 根の総額・COFOG の額（`expenditure` の列）は、mart の中で子の有無を求めてから足す。
- web（`apps/web/server/app-data.ts` の分野の振り分け）と api（`suggestions.ts`）は、`is_leaf` を API の応答から読む。そのため応答には残し、値は SQL で求める。
- 列の説明（`_models.yml`・`columns.json`）と、MCP の `where`・`order_by` で使える列は、表の列ではなくインターフェースで決める。
