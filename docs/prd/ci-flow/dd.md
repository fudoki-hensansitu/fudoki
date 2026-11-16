# PR の CI 待ちを数分にする

担当者: wwwyo / Claude
更新日: `2026-11-15`
状態: 1・2・3を実装（2026-11-16）。2は下の「実装した形」で設計から簡単にした

## Summary

PR の check が待たせているのは、dbt ではなく **build の前処理（`prepare.py`）** と **変換し直し**だった。前処理は、取り込みの表（約3,200個の Parquet）と事業評価の出典 PDF（約2,700個）を毎回手元にそろえ、キャッシュが無いと PDF を読み直す。#731 の後、dbt の build は全件でも約6.5分になっている。

本書は次の順で直す。

1. **すぐ直せるもの**: 全件に倒れる誤判定を直す。事業評価の PDF は、読んだ結果が手元にあるときは取りに行かない。Actions のキャッシュを分けて小さくし、追い出されないようにする
2. **R2 を土台にする**: build が読むもの（取り込みの表と、事業評価の PDF を読んだ結果）を、中身の sha で名前を付けた束にして R2 に置く。Actions のキャッシュが消えても、R2 から数回読めば戻る
3. **merge の順でやり直さない**: [受領書の設計](../ingestion-receipts/dd.md) の段階3まで進める

dbt の `state:modified+` で build を絞る案は採らない。dbt は6.5分で、待ちの大半を占める前処理を縮めないからである。

## Background

### 2026-11-15 の実測

UTC の 0 時から 16 時までに回った run を数えた。

| workflow | 成功 | 失敗 | 取り消し |
|---|---|---|---|
| ingestion-store-check（PR） | 31 | 17 | 10 |
| sync-d1（main） | 7 | 6 | 24 |

sync-d1 の取り消しの多くは、concurrency で新しい run に席を譲ったもので、失敗ではない。

成功した全件の PR の check の内訳は次のとおり。

| run | キャッシュ | 合計 | 前処理 | dbt |
|---|---|---|---|---|
| 43712196734 | 無し | 112分 | 72分 | 36分 |
| 43728561730（#731 の後） | 一部（1.5GB） | 26分 | 18分 | 6.5分 |

- キャッシュがある sync-d1 では、前処理は2〜8分だった（43720282266、43711794522）
- 43712196734 の前処理の大半は、事業評価のシートを読み直す時間（「事業名が読めない」の処理）だった
- 43728561730 の前処理は、最初の8.5分が R2 からの取得、残り約8分が PDF の読み直しだった
- #731 の後、dbt の `main.project` は約2秒になった
- 自治体単位の check でも25分かかった回がある（43721020397）。うち21分が `ingestion:store --dry-run` の変換し直しで、publish は2分だった

### 遅い理由

1. **build のたびに全部の入力をそろえる**: `prepare.py` は取り込みの表をすべて warehouse に読み込む。`project.load(remote=True)` は、読んだ結果がキャッシュにあっても、事業評価の出典 PDF を全部 `fetch` する（`ingestion/project/run.py`）。キャッシュが無いと約6,000回 `cf` で取りに行き、PDF も読み直す
2. **Actions のキャッシュが追い出される**: `pipeline-cache` は約4.4GB ある。sync-d1 は新しいキーで保存してから古いキーを消すので、一時的に約8.8GB になる。generic-observation・d1-snapshot（361MB）・mise（392MB）と合わせると、repo の上限の10GB を超える。2026-11-15 14:40 に消え、そのあとの run は Cloudflare REST API の上限（アカウント全体で5分に1,200リクエスト）に当たって 429 で落ちた（#745 で、待って取り直すようにした）
3. **全件の誤判定**: `ingestion/lib/node_tables.py` が `coverage_checks` を import している。そのため build の import に変換器の library（`coverage_checks`・`tree_checks`・`scan_ocr`・`paddle_ocr`・`vlm_ocr` など）が入り、それらを変えた PR が全件になる。43712196734 が全件になった理由は `pipeline/ingestion/lib/coverage_checks.py` だった
4. **DuckDB が1スレッド**: `profiles.yml` で `threads: 1` にしている。duckdb 2.0.0 の不具合を避けるためで、dbt も前処理も1スレッドで回る
5. **merge 順のすれ違い**: 変換器の PR（#725）が、check の済んだ取り込み PR（#713）より先に main に入った。#713 の記録が古くなり、main の store が止まった。R2 に表が無いので、他の PR の check も 404 で落ちた

ingestion-store-check は、管理 JSON（`jurisdictions/**/*.json`）を変える PR でしか回らない。dbt や seed だけを変える PR には、build の check が無い。

## Goals / Non-Goals

- PR の check を、キャッシュがあれば数分、無くても10分前後にする
- Actions のキャッシュが消えても、check と同期が落ちない
- 他の PR が merge されても、check の済んだ PR をやり直さなくてよい
- 本番に出る数字の検査（保存前の関門と dbt の検査）は弱めない
- D1 への同期の方式（写しとの差分）は変えない
- 出典・OCR 結果の保存と、変換し直しの方式は変えない
- dbt や seed だけを変える PR に build の check を足すかは、本書では決めない

## Design

### 1. すぐ直せるもの

どれも設計の判断を要さず、1つずつの PR にできる。

- **全件の誤判定**: `NODE_COLUMNS`・`AMOUNT_COLUMNS` を、何も import しない葉の module に移す。変換器の library を変えても、build の import に入らなくなる
- **事業評価の PDF を遅く取る**: `project.load` は、読んだ結果（`project/<sha>-<layout>-<fp>.json`）と頁のテキスト（`source-page-text/<sha>-<fp>.json`）がキャッシュにあれば、PDF を取りに行かない。どちらかが無いときだけ `fetch` する
- **キャッシュを分ける**: `pipeline-cache` を、build が読む小さなもの（`objects/` の Parquet 約93MB と、事業評価の読んだ結果）と、出典 PDF などの大きなものに分ける。どちらも、保存する前に古いキーを消す
- **DuckDB のスレッド**: 不具合を直した版が cooldown を過ぎたら上げ、`threads` を戻す

### 2. build の入力を R2 の束にする

1のキャッシュが消えたときに、R2 から数回で戻せるようにする。

**束の中身**: 取り込みの表の Parquet（受領書の一覧が指すもの）と、事業評価の読んだ結果・頁のテキストの JSON（宣言済みの評価シートのうち手元にあるもの）。出典 PDF は入れない。数GB あり、`cf` の REST の上限（1オブジェクト300MB）を超えるからである。表の束と事業評価の束は分け、それぞれ300MB 以内に収める。

**実装した形**（`pipeline/ingestion/bundle.py`）:

- **置き方**: main の sync job が、build の後に毎回 `ingestion:bundle save` を回す。束の名前は中身（ファイル名と sha の並び）の sha で、`fiscal/ingestion/bundles/<tables|project>-<sha16>.tar.gz`。中身が前と同じなら置き直さない。2つの束を指す `bundles/index.json` を最後に書き、そのあと前の束を消す。置けなくても同期は失敗にしない（束は戻り道にすぎない）
- **読み方**: Actions の build の cache が無い回だけ、sync job と PR の check が `ingestion:bundle restore` で束を読む。手元に既にあるファイルは上書きしない（PR の候補の表を潰さない）。build は今までどおり表を1つずつ受領書と照合し、束に無いもの・合わないものだけを1個ずつ取る。refresh-check は cache を持たないので、毎回 `restore tables` で表の束を読む（比べる表を1個ずつ取っていた）
- **設計から変えた点**: 束の目印を受領書の一覧の sha にせず、index を1つ置いた（事業評価の束は受領書と関係なく変わるため、どちらの束にも同じ読み方を使う）。変わった表だけの入れ替えはせず、毎回手元から作り直す（sync job の手元には build が読んだ表が全部ある）。zstd ではなく gzip にした（Python 3.13 の標準に zstd が無く、Parquet はもう圧縮されている）。書くのは store ではなく sync job にした（事業評価の読んだ結果は build で作られる）。index と束を書くのは sync job だけで、concurrency `sync-d1` で順に流れる
- **読んでいる途中で消えたとき**: restore は index を読んでから束を取る。その間に新しい束に替わって前の束が消えると、その束の取得が失敗する。restore は失敗を報告するだけで落ちず、build が1個ずつ取る

**カウンターファクト**:
- *R2 の S3 互換 API で読む*: 1,200リクエストの上限は無くなる。ただし約6,000回の往復は残り、R2 の Access Key を GitHub secret に置く手間も要る。束なら新しい secret は要らない
- *Actions のキャッシュを守るだけ*: 1で分けて小さくすれば追い出されにくくなる。ただし上限は repo 全体で分け合っていて、PR の branch ごとのキャッシュも増える。消えたときの戻り道として、束も持つ
- *束をやめて warehouse（DuckDB）ごと置く*: 300MB を超える見込みで S3 API が要る。前処理の検査（受領書や出典との照合）も飛ばすことになる

**読み直しが要る場合**: 事業評価の読んだ結果の指紋には、`generic/page_words.py` と `observe.py` が入っている。これらを変えると、約2,700件の読んだ結果がすべて古くなる。束があってもなくても読み直しになるので、これらの変更は複数の直しをまとめて1回にする。

### 3. merge の順でやり直さない

[受領書の設計](../ingestion-receipts/dd.md) の段階3まで進めると解ける。段階2だけでは解けない。段階2の store は、まだ Git の `tables[]` と照合しているからである。

- 段階3では、main の store が今のコードで変換し、関門を通ったものを置く。check の後に変換器が main に入っても、記録が古くなって止まることがない
- 段階3では、build が受領書の一覧から表を選ぶ。merge されたがまだ保存されていない管理 JSON は、前の受領書のまま build するか、build から外して報告する。404 では落ちない
- 段階3の key には sha が入るので、束の中の名前もその key にする。1個ずつの取得と新しい store が同じ key を取り合うこともなくなる
- 段階3で、`prepare.py` が `--remote` と `--candidate-dir` を一緒に受け付けるようにする（今は排他）。受領書の一覧に PR の候補を重ねるのに要る

### 4. 変換し直しの時間

自治体単位の check でも、変換し直しが20分を超えることがある。#733 で、PDF の字の読み出し（generic-observation）を PR の check でもキャッシュするようにした。1でキャッシュを分けたあと、PR の check の変換し直しの時間を測り直す。それでも長い PR が残れば、何に時間がかかっているかを調べてから別に設計する。

### 採らない案: dbt の `state:modified+`

変えたモデルとその下流だけを build する案は採らない。

- dbt は全件でも6.5分で、待ちの大半は前処理である。前処理は build を絞っても縮まない
- 全件になる理由の多く（`prepare.py`・`ingestion/project`・serving のコード・`columns.json`・`uv.lock` や duckdb の版）を、`state:modified` は検出しない
- `--defer` は、本番と PR の warehouse が同じ名前（`warehouse`）なので、そのままでは main の表を指せない

### 進める順

1. 1の「すぐ直せるもの」（全件の誤判定、事業評価の PDF を遅く取る、キャッシュを分ける）
2. 受領書の段階2・3（合意済み）
3. 2の束
4. 4の測り直し

## Risks

- **束の作り直しの重さ**: 入れ替えは変わった表だけだが、zstd の圧縮し直しは毎回全体にかかる。最初の実装で時間を測り、重ければ束を自治体ごとに分ける
- **キャッシュを分けたあとの初回**: 新しいキーには中身が無いので、初回は R2 から取ることになる。束より先にキャッシュの分割を入れると、その回は #745 の待ちで遅くなる。その回だけなので許す
- **事業評価の読んだ結果の束**: 指紋が変わると、束の中身もすべて入れ替わる。そのときは読み直しの時間がかかるが、これは束が無くても同じである
