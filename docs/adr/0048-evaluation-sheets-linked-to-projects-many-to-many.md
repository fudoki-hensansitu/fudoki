# ADR 0048: 評価シートは事業と多対多で、build のたびにつなぐ

状態: 採用（2026-11-15）。[事業のドメインモデル](../prd/jurisdiction-page-data/project-domain-model.md) の、評価シートが決算書の内訳（`expenditure_detail_id`）を1つ指し、そこから事業と年度を導く方式を置き換える。設計は [事業評価を整理する](../prd/evaluation-model/dd.md)。

1. 評価シートと事業のつながりは、つなぎの表 `evaluation_sheet_project`（シート×事業、年度、`method`）に持つ。1枚が複数の事業に、複数の枚が1つの事業に付く。
2. シートの目は、当初予算書と決算書の2列（`initial_expenditure_subject_id`・`settlement_expenditure_subject_id`）に持つ。`expenditure_subject_id`・`expenditure_detail_id` はやめる。
3. つなぎは dbt の Python model（`int_evaluation__sheet_subjects`・`int_evaluation__sheet_projects`）が build のたびに全シートに当てる。規則は `pipeline/ingestion/project/link_sheets.py` に置く。目は款・項・目の番号（無ければ名前）で決め、その目の下で事業名を比べる。目が決まらないシートは、自治体・年度の中で1つの事業にだけ当たるときにつなぐ。
4. 機械でつながらないものは seed `evaluation_sheet_link.csv` で直す。鍵はシートの出典と頁・位置、値は内訳の `detail_id` で、`project_id` は使わない（ADR 0046 で変わりうるため）。

2026-11-15 時点で、評価シートは44自治体・約2.8万枚あったが、事業につながるのは品川の630枚だけだった。つなぎ方が科目の名前を印字する様式でしか動かず、決算書に事業の内訳がある28自治体に限られ、読んだ款・項・目の番号を捨てていた。予算書は1つの事業を所管課ごとの行に分けて載せ（八王子）、品川の評価シートは小事業ごとに1枚あるので、シートと事業は1対1にならない。

## Considered Options

- **シートに `project_id` を1列持つ**: 所管課ごとの行・小事業のシートを表せない。代表の1つを選ぶ判断が要る。
- **決算書の内訳を指すまま、番号で当てる**: 当初予算書にしか事業の内訳が無い自治体（52のうち24）でつながらない。
- **名前の近さ（Dice 係数・Jev）でも当てる**: 一致で当たらないものの量を測ってから決める。

## Consequences

- 事業の内訳がある自治体では、取り込むだけで評価シートが事業につながる。規則を変えると全シートのつなぎが次の build で変わる。
- 前の年度を取り込んで事業ID が変わっても、seed は内訳を指すので壊れない。
- 公開 API は互換を保たない。シートは `project_ids` を返し、事業から評価シートを引くときは検索の `project_ids` で絞る。
- つながらなかったシートは「評価されていない事業」を意味しない。事業ごとに「評価なし」の印は付けない。
