# ADR 0050: 事業の表は外部キーだけを持ち、名前・金額は API が JOIN で引く

状態: 採用（2026-11-15 yuito）。

1. `project_year` は `project_year_id`・`project_id`・`fiscal_year` と、当初予算・決算の事業の行（`initial_expenditure_detail_id`・`settlement_expenditure_detail_id`）だけを持つ。
2. `project` は名前・会計を持たない。
3. 事業の年度の名前・会計・款項目・科目・金額（`budget_yen`・`settled_yen`）は、指した内訳（`expenditure_detail`）から API が JOIN で引く。自治体は事業から引く。事業の名前・会計は最新の年度の行から引く。
4. API の行の形は変えない。表に無く JOIN で引く列の説明は `apps/api/src/columns.ts` に書く。

事業の年度の名前・款項目・金額は内訳の値の写しで、同じ値を2つの表で保つことになっていた（表どうしで値を写さない）。

## Considered Options

- **写しを残す**: 事業の一覧を自治体・年度の index だけで絞って並べられる。ただ、内訳を直すたびに写しも作り直す必要があり、2つの値がずれ得る。
- **配布用に平たい表を作る**: 写しの要る利用者には配布用の marts を別に作ればよい（ADR 0047 の考え方）。API はそれを使わない。

## Consequences

- 事業の一覧は、自治体の事業 → その年度の事業の年度 → 内訳の順に index で引く。品川区（事業 5,340）の手元の計測では、1年度の一覧（3,223件の数え上げと金額順の上位10件）が約30ms だった。読む行数は、写しで絞っていたときの3倍ほどになる。
- D1 の `project`・`project_year` は列が変わるので、merge 後の同期で作り直す。新しい API は古い表の列（の部分集合）しか読まないので、同期の前に deploy しても動く。
