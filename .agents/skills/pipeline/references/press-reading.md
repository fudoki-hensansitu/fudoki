# 予算案のプレス発表を読む

予算案のプレス発表（`press_selections` で保存済みの PDF）から施策（`project_budget_measure` の1行）を読む手順。読み方は `pipeline/ingestion/project/layouts/`、宣言は `pipeline/ingestion/project/origins.json` の `press`。

## 読み方を選ぶ

自治体を足すときは、まず書式の型ごとの共通の読み方で宣言する。

| 書式 | layout | 主な宣言のキー |
| --- | --- | --- |
| 「事業名 金額」の行の一覧 | `press_lines` | `item`（組 `name`・`tag`・`amount`）、`amount_next`・`lookahead`・`join`、`start`・`end`、`point`、`previous` |
| 罫線のある表（1行1件） | `press_table` | `columns`（役割 → 見出しの正規表現）、`carry`、`fill`、`also`、`skip`、`page` |
| 1頁1件のカード（「事業名」「予算額」の札） | `press_card` | `name`・`amount`（札の語）、`pair_height`、`strip`、`new` |

キーの意味は各 layout の docstring が正。どの型にも収まらない（頁の図形の位置・字の大きさで読む、年度ごとに様式が違うなど）ときだけ `<自治体>_press.py` を書く。既存の個別の読み方を無理に共通の読み方へ寄せない。手順が同じ団体が複数あるときに型へまとめる。

宣言の例:

```json
{
  "jurisdiction": "132128",
  "layout": "press_table",
  "rules": {"columns": {"name": "^事業名称", "tag": "^経費", "amount": "予算額"}, "new": ["新規"], "skip": "^\\d+\\.?(?=\\D)"},
  "note": "読む章・読まない頁・0 件で正しい理由など資料の癖"
}
```

- `note` に、読む章・読まない頁・0 件や件数不足が正しい理由を書く
- 年度で様式が違うときは、`years` で年度を絞った宣言を複数置ける
- 金額は千円で持つ。億・万・千・円を含む印字は `press.amount_text`、数だけは `unit`（`千円`・`百万円`）で読む

## 確かめる

1. `bun run --cwd pipeline project:save` は評価の結果だけを取る。プレス発表の PDF は出典の選定で R2 に保存済みのものを `ingestion.fiscal.storage.fetch(reference, remote=True)` で取る
2. 宣言を書いたら、その自治体の資料を `run.layout(layout).read(path, rules)` で読み、頁・施策名・予算額・新規の印を出典の PDF と見比べる
3. 読んだ結果は PDF の sha・読み方のコード・`rules` の指紋ごとに `.cache/project/` に置かれる。宣言を変えれば読み直される

## 共通の読み方を変えるとき

`press.py`・`press_lines.py`・`press_table.py`・`press_card.py` を変えると、その読み方で宣言した全団体の結果が変わりうる。変える前に全資料の読み取り結果をスナップショットにし、変えた後に全資料を読み直して1件ずつ比べる。

- 比べるキーは（出典の sha、頁、施策名）と、予算額・新規の印・names・points・position
- 差が出た件は、出典と照らして良くなった・悪くなった・同じ意味の言い換えに分け、PR 本文に書く
- 施策の紐付け（seed `budget_measure_link`）の主キーは（出典, 頁, position）。position が変わる団体に紐付けがあれば seed も直す
