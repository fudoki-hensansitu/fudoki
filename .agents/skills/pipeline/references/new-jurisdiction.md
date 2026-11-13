# 新しい自治体を取り込む

1自治体の予算・決算・事業評価・プレス発表を、調査から PR まで1本の流れで取り込む手順。各工程の規則は工程の reference にあり、ここは順序・並べ方・よく出る直し方だけを持つ。基準の例は真岡市 092096（`pipeline/ingestion/fiscal/jurisdictions/092096/README.md`）。

## 取る範囲

- 資料は当初予算・決算（歳出）・事業評価・プレス発表。補正予算は取らない。
- 年度は R6〜R8 を必ず選び、同じ様式（同じ宣言で読める）で公開されている過去の年度も足す。様式が変わる年度の手前で止める。資料の種類ごとに判断する（予算書は R7 から、評価シートは R2 から、など揃わなくてよい）。公開されていない年度は欠けたままにする。
- 様式が別の会計（公営企業の決算書、別冊の企業会計の予算書など）は、読み方を別に書く必要があるなら選定の scope だけ入れて取り込みを見送り、issue に残す。

## 流れ

1. **調査（30分以内に区切る）** — 市の財政・予算・決算・行政評価・記者発表の頁と、議会の議案の頁を見る。予算書・決算書は議案の別冊として議会の頁にだけあることが多い。資料ごとに、公開年度・text か scan か・1冊か分冊か・会計の頁の範囲を1表にする。決めた範囲（年度・資料・見送る会計）は作業の前に依頼者へ1回だけ伝える。
2. **登録** — `packages/jurisdictions/jurisdictions.json` に自治体コードをキーにして `name`・`ocdId`（`ocd-division/country:jp/prefecture:<2桁>/city:<code>`）・`slug`（ローマ字）を足す。`ocdId` が無いと `dbt:prepare` が止まる。
3. **選定と保存** — `pipeline/source_selection/<code>.json` に選定を書き（[source-selection](source-selection.md)）、`archive.ts` で保存する（下の「コマンド」。`--write` を付けないと計画だけで終わる）。評価シートが1事業1ファイルだと数百〜千件になる。自治体のサーバーは短い間隔の接続を切ることがあるので、一覧の取得とダウンロードは再試行つきのループにし、取れない件（404 など）は選定の `reason` と README に件数・ID を残す。
4. **OCR を先に走らせる** — scan PDF があれば、まず scan の管理 JSON（`<年度>/initial/expenditure.json`）に `ocr_inputs` を書き、`ingestion:originals` で出典と入力パス JSON を用意して、`ingestion:ocr` をバックグラウンドで起動する（[ingestion](ingestion.md#scan-pdf)）。OCR は排他で長いので、待つ間に text PDF の決算・評価・プレスを進める（OCR 中も `convert` は起動できる。[workflow](workflow.md#重い実行の判定と待ち合わせ)）。
5. **text PDF（決算など）** — 1年度・1会計で宣言を書いて候補変換し、木の検査が通ったら同じ宣言を他の年度・会計へ写す。1冊に全会計が載るなら、同じ PDF を会計ごとの scope で読む。款の和を各会計の歳出合計と突き合わせる。
6. **scan PDF（当初予算）** — OCR が終わったら同じく1会計で試す。全会計が同じ様式なら `workflow` を共通にする。直しは下の「scan でよく出る直し」から当てる。款の和を市の「会計別予算」などの総括の額と全会計で突き合わせる。
7. **事業評価・プレス** — `pipeline/ingestion/project/origins.json` に `sheets`・`press` を足す（[press-reading](press-reading.md)）。数件の PDF を目で読んで正規表現を書き、全件に当てて欠けた欄の件数を見て直す。
8. **保存** — 全表が候補で通ったら `ingestion:convert --remote` で保存する。診断のために一時的に足した print などは、`--remote` の前に `git checkout` で消す。
9. **dbt の入力** — `pipeline/dbt/seeds/fiscal/fiscal_detail_breakdown.csv` に内訳の分け方を足し（決算は節、予算は節と説明→事業など）、`_sources.yml` と `fiscal_pdf_relations.sql` を作り直す（下の「コマンド」）。
10. **README と PR** — `ingestion/fiscal/jurisdictions/<code>/README.md` に資料・年度・様式・決めたこと・取れなかったものを書き、見送った会計は issue にする。refresh は回さない（全部 merge した後に1回）。

## コマンド

`archive.ts` は repo root、ほかは pipeline/ で実行する。Jev（数字の聞き直し）が `TYPESAFE_API_KEY` を使うので convert は fnox 経由にする。

```bash
# repo root
mise x -- bun pipeline/source_selection/archive.ts --write --jurisdiction <code>
mise x -- bun pipeline/source_selection/archive.ts --evaluation --write --jurisdiction <code>
mise x -- bun pipeline/source_selection/archive.ts --press --write --jurisdiction <code>

# pipeline/
bun run ingestion:originals --manifest <対象JSON> --output <入力パスJSON> --remote   # 保存済みの出典を戻す
bun run ingestion:ocr --manifest <対象JSON> --inputs <入力パスJSON>                    # scan だけ
mise x -- fnox exec --if-missing error -- bun run ingestion:convert --manifest <対象JSON> --inputs <入力パスJSON> --output <候補dir>            # 候補
mise x -- fnox exec --if-missing error -- bun run ingestion:convert --manifest <対象JSON> --inputs <入力パスJSON> --output <候補dir> --remote   # 保存
bun run ingestion:check
uv run python dbt/scripts/generate_sources.py
uv run python -c "import sys,yaml; sys.path.insert(0,'dbt/scripts'); from prepare import write_relations, DBT; write_relations(yaml.safe_load((DBT/'models/staging/fiscal/_sources.yml').read_text())['sources'])"
```

最後の行が `macros/fiscal_pdf_relations.sql` を書く。`_sources.yml` だけ作り直して macro を忘れると、新しい表が dbt に入らない。

## scan でよく出る直し

宣言の書き方は [ingestion](ingestion.md#pdfの表の組み立てtext--scan共通)。真岡市の当初予算で出たもの:

- **見出しの読みの揺れ** — OCR が同じ見出しを「本年度の財源内／訳」「本年度の財源／内訳」のように切り方を変えて読む。`layout.options.columns` の `excluded`・`heading` を読みごとに並べる。
- **欄の名前** — 款項目の欄の見出しが「科目」などと違うと「no breakdown pattern for axis」で止まる。`heading` で欄に名前を付ける。
- **款の名前の折り返し** — 「農林水産業／費」の続きの行が目の行と読まれ「subject depth gap」で止まる。続きの読みを `dropped_readings` で除き、1行目に `name_corrections` で続きを足す。subject の軸には `line_starts` を書けない。
- **説明の頭の「一」** — 「一般管理費」などは名前の始まりが右にずれ、上の事業の内訳と読まれる。説明の軸の `quirks.line_starts` で欄の左にそろえる。対象は「一」「般」で始まる名前に絞る。
- **△と罫線** — △を左の罫線や隣の数字と1語に読んだ金額は `amount_corrections`（observed と corrected）で戻す。
- **カタカナの後の「一」** — 「センタ一費」などは `name_corrections` で「ー」に直す。dbt の正規化（`fiscal_cofog_name`）が直すのは COFOG の照合だけで、配る名前には残る。
- **直さなくてよいもの** — 旧字（產→産）は OCR が直す。訂正を書いて 0 件に当たったら、すでに直っているので消す。

## 関連文書

- 年度・会計の選び方、未公表の扱い → [source-selection](source-selection.md)
- 取り込みと検査の規則 → [ingestion](ingestion.md)
- dbt の入力と構築 → [dbt](dbt.md)
