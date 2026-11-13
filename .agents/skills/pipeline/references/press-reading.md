# 予算案のプレス発表を読む

予算案のプレス発表（`press_selections` で保存済みの PDF）から施策（`project_budget_measure` の1行）を読む。読み方は `pipeline/ingestion/project/press/`（パターン）、宣言は `pipeline/ingestion/project/origins.json` の `press`。

## 読み方を選ぶ

- 自治体を足すときは、工程（読む範囲 `scope`・件の見つけ方 `find`・名前と金額の組み立て `assemble`・札と説明 `marks`）ごとにパターンを選んで組み合わせる宣言（`workflow`）で書く。キーの意味は各パターンの docstring が正。
- 組み合わせに収まらないときだけ、自治体別の読み方（`layouts/<自治体>_press.py`）を書く。
- 宣言の `note` に、読む章・読まない頁・0 件が正しい理由など資料の癖を書く。年度で様式が違えば `years` で分ける。
- 読んだら、頁・施策名・予算額・新規の印を出典の PDF と見比べる。

## パターンを変えるとき

パターンを変えると、それを選んだ全自治体の結果が変わりうる。変える前後で全資料を読み、1件ずつ比べて、差を良くなった・悪くなった・言い換えに分けて PR 本文に書く。施策の紐付け（seed `budget_measure_link`）の主キーに position が入るので、position が変わる自治体は seed も直す。
