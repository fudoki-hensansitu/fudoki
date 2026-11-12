# 出典の頁の文字

web のアシスタントが `read_source_page` で読む頁の文字（非公開 R2 の `source-text/<sha256>.json`）を作る。設計は [docs/prd/source-reading/dd.md](../../../../docs/prd/source-reading/dd.md)。

## 新しい種類の資料を足す・抜き出し方を変えるとき

R2 に書く前に、最初の数頁と表のある頁を目で確かめる。表の行と列の対応が崩れていると、アシスタントは同じ頁から回ごとに違う数字を答える（#553）。

1. 出典 PDF を手元に置き、`bun run --cwd pipeline source-text:preview <pdf> [頁…]` で頁の文字を出す（頁を省くと最初の3頁）
2. 同じ頁を画像にして（`pdftoppm -f <頁> -l <頁> -r 100 -png <pdf> <出力>`）、文字と見比べる
   - 表の1行（指標・科目など）の値が、1行に左から年度・列の順に並んでいる
   - 列の見出し（年度など）と値の位置が揃っている
   - 見開き・2段組みが左右に分かれ、左の段から読める
   - 文字の抜けや重複が無い
3. 崩れていたら `pipeline/source_text/layout.py` を直し、同じ頁で確かめ直す。資料の種類ごとの書き分けは足さず、どの資料にも効く直し方にする
4. `bun run --cwd pipeline source-text:save -- --write`（抜き出し方を変えたときは `--refresh` も）で R2 に置く
