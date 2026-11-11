# 予算案のプレス発表を読む

予算案のプレス発表（`press_selections` で保存済みの PDF）から施策（`project_budget_measure` の1行）を読む手順。読み方は `pipeline/ingestion/project/press/`（パターン）と `layouts/<自治体>_press.py`（個別）、宣言は `pipeline/ingestion/project/origins.json` の `press`。

## 読み方を選ぶ

自治体を足すときは、まず工程ごとにパターンを選んで組み合わせる宣言（`workflow`）で書く。工程は4つで、どの自治体も同じ順に通す。

| 工程 | 宣言のキー | パターン |
| --- | --- | --- |
| 読む範囲 | `scope` | `page`（読む頁）、`start`・`end`（読む行の区切り。頁をまたぐ） |
| 件の見つけ方（1つ選ぶ） | `find` | `lines`（「事業名 金額」の行）、`table`（罫線のある表の1行）、`card`（1頁1件の「事業名」「予算額」の札） |
| 名前と金額の組み立て（順に足す・無くてよい） | `assemble` | `amount_next`（金額を次の行から）、`name_after`（名前の折り返し）、`name_around`（名前を上下の行から）、`group_name`（見出しを別名に） |
| 札と説明 | `marks` | `new`・`new_mark`・`tag`・`strip`・`point`・`also`・`skip`・`require_amount`・`no_amount`・`unit` |

キーの意味は各パターンの docstring（`press/__init__.py`・`press/find/*.py`・`press/assemble/*.py`）が正。組み合わせに収まらない（頁の図形の位置・字の大きさで読む、件ごとに組み方が違うなど）ときだけ `<自治体>_press.py` を書き、宣言は `"layout": "<自治体>_press"` にする。既存の個別の読み方を無理に組み合わせへ寄せない。同じ手順の団体が複数あるときに、足りない工程のパターンを足して寄せる。

宣言の例:

```json
{
  "jurisdiction": "132128",
  "workflow": {
    "find": {"pattern": "table", "options": {"columns": {"name": "^事業名称", "tag": "^経費", "amount": "予算額"}}},
    "marks": {"new": ["新規"], "skip": "^\\d+\\.?(?=\\D)"}
  },
  "note": "読む章・読まない頁・0 件で正しい理由など資料の癖"
}
```

- `note` に、読む章・読まない頁・0 件や件数不足が正しい理由を書く
- 年度で様式が違うときは、`years` で年度を絞った宣言を複数置ける
- 金額は千円で持つ。億・万・千・円を含む印字は `press.amount_text`、数だけは `marks.unit`（`千円`・`百万円`）で読む

## 確かめる

1. `bun run --cwd pipeline project:save` は評価の結果だけを取る。プレス発表の PDF は出典の選定で R2 に保存済みのものを `ingestion.fiscal.storage.fetch(reference, remote=True)` で取る
2. 宣言を書いたら、その自治体の資料を `press.read(path, workflow)`（個別は `run.layout(layout).read(path)`）で読み、頁・施策名・予算額・新規の印を出典の PDF と見比べる
3. 読んだ結果は PDF の sha・読み方のコード（選んだパターンだけ）・宣言の指紋ごとに `.cache/project/` に置かれる。宣言を変えれば読み直される

## パターンを変えるとき

`press/__init__.py`・`layouts/press.py`・パターンのファイルを変えると、そのパターンを選んだ全団体の結果が変わりうる。変える前に全資料の読み取り結果をスナップショットにし、変えた後に全資料を読み直して1件ずつ比べる。

- 比べるキーは（出典の sha、頁、施策名）と、予算額・新規の印・names・points・position
- 差が出た件は、出典と照らして良くなった・悪くなった・同じ意味の言い換えに分け、PR 本文に書く
- 施策の紐付け（seed `budget_measure_link`）の主キーは（出典, 頁, position）。position が変わる団体に紐付けがあれば seed も直す
