# ADR 0047: 歳出の表には、木と根から求まる列を持たない

状態: 採用（2026-11-15）。次の3つを置き換える。

- [ADR 0022](0022-serve-marts-via-worker-d1-rest-and-mcp.md) の「ノードの行に所属する款・項の名前を marts に持つ」と「marts の列はすべて公開する」（科目・内訳の検索の列について）
- [ADR 0038](0038-split-serving-tables-by-grain.md) の表の列（[配信する表の設計](../prd/fiscal-serving-tables/dd.md) の列の表）
- [集約ごとの作り直し](../prd/aggregate-api/dd.md) の「表」の節の「根で決まる列は検索のために残す」

1. 科目の表 `expenditure_subject` と内訳の表 `expenditure_detail` には、同じ表の別の行や別の表から決まる値を持たせない。
   - 所属する款・項・目（`kan_code`・`kan_name`・`kou_code`・`kou_name`・`moku_code`・`moku_name`）は持たない。親を辿って求める。
   - 子を持たないか（`is_leaf`）と、末端でない科目の直下の枝か（内訳の `is_subject_remainder`）は持たない。子の有無から求める。
   - 根 `expenditure` が持つ値（`jurisdiction_code`・`fiscal_year`・`document_kind`・`amendment_number`・`account_name`・`account_kind`）は持たない。`expenditure_id` で引く。金額の段階（`amount_phase`）は `document_kind` と1対1なので、どの表にも持たない。
2. 科目の表に残す列は次のとおり。
   - ID と木: `subject_id`・`node_key`・`parent_subject_id`・`expenditure_id`
   - 印字の値: `level`・`code`・`name`・`amount_yen`
   - 風土記の判断: COFOG・繰出の列
   - 出典: `origin_id`

   `level` は段の数からも求まるが、目が款の直下にある資料では段の数と種類が食い違うので、印字された段の種類として残す。`amount_yen` は、印字の無い款・項では子の和になる。それでも残すのは、金額をこの表の段階で必ず入れる（not_null）ためである。欠けを下流のそれぞれで補わない。
3. 内訳の行が属する科目（`subject_id`）・分け方（`breakdown`）・深さ（`depth`）は、木から求まる値でも内訳の表の全行に持つ。内訳の木は段の数が決まらないので、子孫の値を出すには枝の根まで再帰で辿ることになる。分け方で絞る検索（事業の内訳を全自治体から引くなど）では、根を年度・資料区分で引いたあと、内訳を `(expenditure_id, breakdown)` の index で引く。再帰すると、この index が使えない。
4. API・MCP の科目・内訳の検索と取得の応答は、外した列も含めた今の平たい行のままにする。値は SQL の中で根・親・祖父母・子を JOIN して求める（`apps/api/src/columns.ts` の `SUBJECT_TABLE`・`DETAIL_TABLE`）。`columns.json` は D1 の表の契約のままにし、表に無い列の型と説明は `columns.ts` に置く。`model.test.ts` は、API の行の schema をこの検索の列と照合する。
5. 1行で款・項・目まで読める平たい形が要る配布物（Queria の表など）は、配布用の marts を別に作って JOIN で組み立てる。

ADR 0022 は、API の検索が JOIN を持たないことを前提にしていた。そのため款・項の名前を行に焼き込み、名前の辿り方が dbt と API の2か所に分かれるのを避けた。その後は「表どうしでデータを写さず、API の SQL で JOIN する」方針になった。写しを持つと、同じ値を2か所で保つことになる。根の値と行の値が食い違っても、それを止める検査は無い。

## Considered Options

- **今のまま写しを持つ**: API は1表の where だけで済み、D1 の読み取りも1表に収まる。その代わり、写しの作り方が mart の SQL に散らばる。`moku_name` は `level` から作っており、`level` と `is_leaf` も他の列から求まる。
- **`level` も消す**: 段の数（親を辿った回数）から求まる。ただし、目が款の直下にある資料では段の数と種類が食い違うので、印字の種類として残す。

## Consequences

- 根 `expenditure` は、科目・内訳の表に行がある取り込みの行（`int_fiscal__expenditure_rows`）から作る。
- dbt で所属する款・項・目と子の有無が要る所（根の COFOG の額、事業の行、評価シートの紐付け、Queria の表、検査）は、ephemeral の `int_fiscal__subject_path` を JOIN する。自治体・年度・資料区分が要る所（評価シート・予算案の施策の紐付けなど）は、根 `expenditure` を JOIN する。
- D1 の index は、根を `(fiscal_year, document_kind, jurisdiction_code)` で引き、科目を `(expenditure_id, level)`、内訳を `(expenditure_id, breakdown)` で引く形にする。年度・資料区分の絞り込みは、根への JOIN で保つ。
- 表の列と index が変わるので、merge 後の同期で D1 の科目・内訳の表を作り直す（全行を書き直す）。
- web（`apps/web/server/app-data.ts` の分野の振り分け）と api（`suggestions.ts`）は、`is_leaf` を API の応答から読む。値は SQL で求めるので、web 側の変更は要らない。
- 内訳の `is_leaf` は、取り込みの行の印（CSV の節は常に末端）ではなく、同じ表の子の有無から求めるようになる。細節を持つ節や区分（東京都・武蔵野市・小平市の当初予算と決算など）は、これまで子があるのに末端とされていた。12自治体で比べると、これに当たる 8,076行だけが変わり、ほかの列と表は一致した。
