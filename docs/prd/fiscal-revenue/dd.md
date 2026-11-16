# 予算書・決算書の歳入を取り込み、自治体の頁で「何で賄う？」を出す

担当者: wwwyo / Claude
更新日: `2026-11-15`
状態: Draft（レビュー待ち）

## Summary

歳入は歳出と同じ選定の PDF に載り、選定はすでに会計ごとに歳入の頁を宣言している（`scope[].direction = revenue` が、PDF の頁範囲で 1,693 件、CSV を含めて 1,802 件）。取り込みは管理 JSON の `direction` で頁を選ぶので、`revenue.json` を置けば汎用の変換器がそのまま歳入の頁を読む。今は誰も `revenue.json` を書いていないだけで、dbt・API・web には歳入の表が無い。

この設計は次の5点を定める。

1. 取り込み: 歳入の木は款・項・目・節。説明・備考は節の内訳ではないので取り込まない（除外の宣言）。
2. 金額の段階: 決算は収入済額（executed）、当初予算は本年度予算額（approved）。調定額・不納欠損額・収入未済額は段階を付けず、取り込みの表にだけ残す。
3. dbt: 木を作る intermediate を方向で共通にし、marts は歳出と別の集約 `marts/revenue/` に置く。表は木と根で決まる列を持たない（ADR 0047）。
4. 歳入の区分: 款の名前から共通の区分を引く seed を置き、表に写さず API で引く。自治体の頁は「まちの税」と「国・都道府県から配られるお金」を分けて出す（2026-11-15 yuito）。
5. 範囲と順序: 品川区（131091）の R6〜R8 当初・R5〜R7 決算で通してから、取り込み済みの団体へ広げる。

## Goals / Non-Goals

- Goal: 自治体・年度・会計ごとに、歳入の款・項・目・節と金額を出典つきで引ける（表・REST・MCP）。
- Goal: 自治体のまとめタブに「何で賄う？」を出し、総額と「まちの税」「国・都から配られるお金」を出典の資料名つきで添える。
- Goal: 自治体をまたいで同じ物差しで比べられる区分（款の名前の辞書）を持つ。
- Non-Goal: 歳入の説明・備考（充当事業・補助基本額と率・調定額と収入率）。節の内訳ではなく、自治体ごとに書き方が違う。必要になったら注記として別に設計する。
- Non-Goal: 補正予算（ADR 0039）、CSV の歳入（132047 の `revenue.json` は既にあるが、CSV の staging は書式ごとなので PDF を通した後に足す）。
- Non-Goal: 会計間の繰入・繰出の消去（連結）。歳出側の `is_interfund_transfer` と対にする設計は別に行う。

## 品川で試した結果（2026-11-15、手元の dry-run）

| 対象 | 結果 | 要った変更 |
| --- | --- | --- |
| R8 当初・一般会計（冊の 26〜91 頁） | 木の検査・数字の網羅・単位の確かめが通った（ノード 599） | 説明の欄の除外、共通コード2点（下） |
| R7 決算・一般会計（冊1の 52〜171 頁） | 同じく通った（行 4,275） | 備考の欄の除外、2段の欄 `不納欠損額／収入未済額` を `columns.lines` で宣言、共通コード1点（下） |

宣言は歳出の宣言（同じ冊・同じ様式）を写し、歳入の欄だけを足した。

共通コードの変更（いずれも歳入に限らない読み違いの修正）:

- `tree.entries_of`: `1` `歳計現金利子` のように番号が名前と離れた語で、名前が「歳」で始まると、年齢（`1歳6箇月児…`）と取って番号を落としていた。番号が番号の欄に離れて印字されたときは番号にする（`COUNTED` の `spaced` と同じ扱い）。
- `stacked_titles.TITLE`: その年度に廃した款・項（`款 特別区債 … 0千円`）は番号を印字しない。金額を印字する見出しに限り、番号の無い見出しも読む。
- `repair._without_hidden`: 同じ字が同じ位置に隠れた写しと見える字の2回描かれていると、近さが同じときに隠れた方を選び、見出しの字を落としていた（決算書 p97 の `収入済額` が `済額` になった）。同じ近さに見える字があれば残す。

`tree.entries_of` と `repair._without_hidden` は全ての PDF の変換で通り、`stacked_titles` は 131091・131164・132241・131130 が使う。保存済みの歳出の表が変わりうるので、PR 1 の branch で `refresh-check.yml` を手で実行し（比べるだけ）、変わった表の一覧と、それを記録し直すかを PR に書く。`stacked_titles` の番号の無い見出しは、金額を印字するものだけを読み、`header.title_amount` が無ければ今と同じく止まる（131164 は番号つきの running title で、この行に当たらないことを refresh-check で確かめる）。

## 1. 取り込み

- 管理 JSON は `jurisdictions/<自治体>/<年度>/<資料区分>/revenue.json`。形は歳出と同じで、`direction: revenue`。conversion の id・table_id は歳出と同じ会計の名前（`general-initial` など）にし、方向は管理 JSON の置き場で分ける。table_id で引く seed（`fiscal_budget_amendment` など）は歳出の表だけに効かせる（下の dbt）。
- 読み方の宣言は歳出の宣言を出発点にし、歳入の頁で違う欄だけを足す。
  - 説明（当初）・備考（決算）: `columns.<見出し>.excluded`。除外の種類は閉じた語彙（`EXCLUSION_KINDS`）に `歳入の説明` を足し、管理 JSON もそれで書く（試しでは `財源内訳` を借りた）。
  - 決算の2段の欄: `columns.不納欠損額収入未済額.lines`。
  - 決算の備考の見出しに `注 △印は減` を印字する頁としない頁があり、見出しは印字のまま突き合わせるので、除外の宣言を両方の見出しに書く（`備考` と `備考注△印は減`）。reason にもそう書く。
- 総括（款の一覧）は選定の範囲に入れたままにする。歳出と同じく、総括の款と頁の上の款は node_id が同じになり dbt で1つになる。総括の `歳入合計` が単位の確かめの合計になる。
- 単位の確かめは合計の行を `歳出合計` の語で探している（`units.check`・`unit_checks.printed_totals`・`coverage_checks.TOTAL_LABELS`）。表は1つの方向の頁だけを読むので、語に `歳入合計`・`歳入総計` を足せば方向を渡さずに済む。

## 2. 金額の段階

収入済額（executed）・本年度予算額・当初予算額・予算現額は共有の辞書 `shared/fiscal_amount_map.csv` に既にある。調定額・不納欠損額・収入未済額は、段階を空にした行として辞書に足す（印字した金額の見出しは全て辞書に載っていることを `tests/fiscal_amounts_contract.sql` が確かめるため）。段階が無いので取り込みの表にだけ残り、marts には入らない。

- 決算の節の欄 `節／金額` は予算現額（adjusted）で、節の収入済額は欄 `収入済額` にある。歳出と同じく決算は executed を選ぶ。
- 調定額と収入未済額は「税をどれだけ取り切れたか」を表すが、評価に読まれやすく、今の目的（何で賄う？）に要らない。marts には出さない。

## 3. dbt

### intermediate を方向で共通にする

`int_fiscal__settlement_expenditure_rows` は `t.direction = 'expenditure'` で絞っているだけで、木の組み立て（段の名前・金額の段階・分冊の和・議会の修正）は方向によらない。これを方向の列を持つ共通の model にし、歳出・歳入の intermediate はそこから方向で選ぶ。

| model | 今 | 変更 |
| --- | --- | --- |
| `int_fiscal__rows` | `int_fiscal__settlement_expenditure_rows` | 改名し、`direction` を出す。絞りを外す |
| `int_fiscal__nodes` | `int_fiscal__settlement_expenditure_nodes` | 改名し、`direction` を持つ |
| `int_fiscal__expenditure_nodes` ほか歳出の model | そのまま | `direction = 'expenditure'` で選ぶ |
| `int_fiscal__revenue_rows` | 新規 | 歳入の木を科目（款・項・目）と節に振り分ける。COFOG・節のマスタ・事業・繰出の印は持たない |

共通化で歳出の表を1行も変えない。

- node_id は自治体・年度・会計・款の番号などから作り、方向を含まない。歳入の款1と歳出の款1が同じ id にならないよう、歳入のときだけ hash の材料の末尾に `revenue` を足す。歳出の hash は今のままにし、`subject_id`・`detail_id`・`line_id`・事業の年度の内訳の ID を変えない。
- window・join のキー（分冊の和の partition、議会の修正の経路、is_leaf、兄弟の数え方 `sibling_scope`）に direction を足す。歳入の目が歳出の兄弟に数えられて `sibling_ordinal` がずれるのを防ぐ。
- 方向を持たない seed（`fiscal_budget_amendment`・`fiscal_subject_name_fill`・`fiscal_kan_name_identity`・`fiscal_kan_code_fill`）は、`direction = 'expenditure'` の行だけに効かせる。歳入で要る自治体が出たら、そのときに seed に direction 列を足す（宣言は最小の形から）。
- 確かめ: 共通化の前後で、全自治体の歳出の marts を build して全行一致を比べる（PR #702 と同じ手順）。

カウンターファクト: 歳入用に rows・nodes を複製すれば歳出の model を触らずに済むが、同じ規則（段の名前・金額の選び方・分冊の和）が2か所になり、片方だけ直す事故が起きる。改名で歳出の model の参照を直す手間を取る。

### marts（`marts/revenue/`）

ADR 0047 に従い、木と根で決まる列（自治体・年度・款の名前・is_leaf など）を表に持たない。

| 表 | 主キー | 列 |
| --- | --- | --- |
| `revenue` | `revenue_id` | 根。自治体・年度・資料区分・補正号・会計・会計の種類。総額（款の和、歳出の根の `total_yen` と同じく ADR 0047 の例外として持つ。頁の一覧で全根の総額を JOIN なしで返すため） |
| `revenue_subject` | `subject_id` | `revenue_id`・`parent_subject_id`・`level`（款・項・目）・`code`・`name`・`amount_yen`・`origin_id` |
| `revenue_detail` | `detail_id` | 節。`subject_id`・`parent_detail_id`・`depth`・`code`・`name`・`amount_yen`・`origin_id` |
| `revenue_location` | `line_id` | 印字の位置（歳出の `expenditure_location` の PDF の列。歳入は PDF だけを読むので `kind`・行番号の列は持たない） |
| `revenue_origin_link` | `link_id` | 根と出典（冊）を結ぶ |

- 出典の冊は歳入と歳出で同じ。`expenditure_origin` は今も `fiscal_metadata.origin` を方向で絞らずに全部読んでいて、同じ行の `revenue_origin` を作ると写しになる。`expenditure_origin` を `fiscal_origin` に改名し、`expenditure_origin_link`・`revenue_origin_link` がそれを指す（aggregate-api のドメインの型名も `fiscal_origin`）。aggregate-api の dd の表の行と、api の `shared/` の「3つの出典の表」の照会も同じ PR で直す。
- 節は歳出と同じく「内訳」の表に置く。歳入の節は法定の歳出の節マスタに入れない（ドメインモデルどおり）。
- 検査: 款の和＝`歳入合計`（印字があれば）、木の釣り合い（子の和）、`amount_yen` not null。歳出の検査の SQL は方向を引数にした macro にして共有する。

### 歳入の区分（seed `fiscal_revenue_category`）

款の名前は地方自治法施行規則で決まっていて、自治体をまたいで揃う（特別区は `特別区税`・`特別区交付金` など名前が違う）。款の名前から区分を引く辞書を seed に置き、区分は表に写さず API で引く。範囲は市区町村の一般会計に絞る（都道府県の税は「まちの税」ではなく、特別会計の保険料などを足すと割合の意味が変わる）。

| 区分 | 款の名前（例） |
| --- | --- |
| まちの税 | 市町村税・特別区税・市税・町税・村税 |
| 国・都道府県から配られるお金 | 地方譲与税・利子割交付金・配当割交付金・株式等譲渡所得割交付金・分離課税所得割交付金・地方消費税交付金・環境性能割交付金・法人事業税交付金・ゴルフ場利用税交付金・地方特例交付金・地方交付税・特別区交付金・交通安全対策特別交付金・自動車取得税交付金（旧年度）ほか |
| 国・都道府県の支出金 | 国庫支出金・都支出金・道支出金・府支出金・県支出金 |
| 借入れ | 市債・町債・村債・特別区債 |
| その他 | 分担金及び負担金・使用料及び手数料・財産収入・寄附金・繰入金・繰越金・諸収入 |

- seed の名前は出典の印字を `fiscal_name` で整えた款の名前と突き合わせる。表記の揺れは seed の行を足して吸収し、似た名前で寄せない。
- 辞書に無い款の名前は、dbt test（`tests/fiscal_revenue_category_coverage.sql`）で build を止める（黙って「その他」にしない）。
- 区分は風土記の判断なので、列の説明でそう書く。頁では区分の名前だけを出し、良し悪しの言葉を添えない。頁の行は「まちの税」と「国・〇から配られるお金」で、〇は自治体の都道府県の名前の末尾（都・道・府・県）から作る。

## 4. API・web

- api: `apps/api/src/revenue/`（`model.ts`・`queries.ts`・`routes.ts`・`tools.ts`）。操作は歳出に揃え、根を返す `get_revenue` と、科目・節を探す `search_revenue_subjects`。区分は `queries.ts` で seed の表を JOIN して返す。D1 には seed の区分も写す（`fiscal_revenue_category`）。
- web: まとめタブに「何で賄う？」の節（「何に使う？」は予算・決算のタブへ移した）。開いた年度の当初予算（無ければ決算）の一般会計で、総額・まちの税・国・〇から配られるお金と、款の内訳を出す。どちらの資料の額かを「R8 当初予算」「R6 決算」のように添え、出典は資料名と頁へのリンク。歳入の無い年度は節ごと出さない（「未収録」の札は出さない。歳出のタブとは違い、まとめの一節のため）。
  - 2026-11-16 変更: まとめタブの「何で賄う？」はやめ、予算・決算タブの頭に「入る→使う」（入る＝歳入の款、使う＝歳出の分野の流れ）を置いた。入るの1人あたりは、まちの税の款の和を人口で割った1人あたりの税金。

## 5. 範囲と順序

1. PR 1（取り込み）: 共通コード3点、`歳入の説明` の語彙、合計の行の語、品川の R6〜R8 当初・R5〜R7 決算の全会計の `revenue.json`。branch で refresh-check を回して保存済みの表への影響を比べる。
2. PR 2（dbt）: intermediate の共通化、`marts/revenue/`、区分の seed、検査、`fiscal_origin` への改名（api の参照も）。dbt の入力（`scripts/fiscal_inputs.py`）は歳入の PDF の表を読み、relation 名に `revenue_` を挟んで歳出の表と分ける。共通の会計の表は `int_fiscal__accounts` に改名し、歳入の会計も持つ。確かめ: 7自治体（131091・131148・131211・132047・132080・132098・133639）で前後の marts を比べ、歳出・事業・事業評価・Queria の表が全行一致した。
3. PR 3（api・web）: revenue の API とまとめタブ。
4. その後: 取り込み済みの団体へ、自治体ごとに1 PR で広げる（歳出の宣言を写して歳入の欄を足す）。

## 決めたこと（2026-11-16 yuito）

- 冊の表は `fiscal_origin` に改名して歳出・歳入で1つにする。改名は歳出の API の表名も変える。
- まとめタブの「何で賄う？」で行として出すのは総額・まちの税・国・〇から配られるお金だけにし、国・都道府県の支出金と借入れは款の内訳の中に置く。

## レビューで直したこと（2026-11-15、別の Claude）

- 共通化で node_id に方向を入れると歳出の公開 ID が全部変わる → 歳出の hash は今のまま、歳入だけ材料を足す。partition・兄弟の数え方・方向を持たない seed も方向で分ける。
- 共通コード3点の影響を merge 後に任せていた → PR の branch で refresh-check を手で回して比べる。
- 款の名前の誤り（`道府県支出金`）、都道府県の扱い、「国・都から」の言い方、国庫支出金を「補助」と呼んでいた点を直した。
- 冊の表は `fiscal_origin` に改名する形で決めた（写しを作らない）。
