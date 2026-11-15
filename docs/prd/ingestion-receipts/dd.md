# 取り込みの表の受領書を Git から R2 へ移す

担当者: wwwyo / Claude
更新日: `2026-11-15`
状態: Draft（2回のレビューを反映）。採用したら [取り込み保存の設計](../ingestion-storage/dd.md) に畳み込み、[ADR 0045](../../adr/0045-ingestion-tables-uploaded-by-ci.md)・[ADR 0027](../../adr/0027-refresh-fingerprints-by-table-content.md) を置き換える ADR を足す

## Summary

管理 JSON（`ingestion/fiscal/jurisdictions/**/expenditure.json`）は、変換の宣言と入力だけを持つ。表の受領書（Parquet の sha256・バイト数・行数、会計名・注記・件数、`input_fingerprint`）は持たない。受領書は R2 の受領書の一覧に置き、書くのは main の `ingestion:store` と refresh-check の書き込みの job だけにする。

本番に出る表は「main のコードで変換し、保存前の関門（木・単位・網羅・会計名と scope の検査）と dbt の検査を通ったもの」と定める。スレッドの手元の変換結果と同じバイトであることは求めない。

## Background

ADR 0045 では、スレッドが変換結果の受領書を管理 JSON に記録する。merge 後の store は main のコードで変換し直し、受領書と一致したときだけ R2 に置く。

PR の check は、走った時点の main とマージした状態で照合する。そのあと変換器を変える PR が main に入ると、検査済みの取り込み PR の受領書が古いまま merge され、store が止まる。2026-11-15 には次のことが起きた。

- 13:49 に #713（132012 R5 当初）の check が通った
- 13:56 に変換器を変える #725 が main に入った
- 14:15 に #713 が merge された

その後、#736 で記録を直すまで sync-d1 の store が落ち続け、D1 の同期が止まった。R2 に表が無いので、ほかの取り込み PR の check も 404 で落ちた。

受領書が Git にある利点は2つだった。

- (a) 本番の表のバイトが変わったことが、Git の diff に出る
- (b) スレッドと CI の変換が同じことを照合できる

(b) は本番の数字の正しさを足さない。正しさは保存前の関門と dbt の検査が担っている。(a) は、store と refresh-check が「R2 にある前の表との差」を報告することで代わりに担う。

## Goals / Non-Goals

- 変換器の変更と取り込み PR がすれ違っても、main の store が止まらない
- PR の check が通った後に、check をやり直さなくてよい
- 1つの管理 JSON の失敗で、ほかの自治体の保存と同期を止めない
- 本番の表が、main のコードと保存前の関門を通ったものであることは保つ
- 表の中身が変わったことは、変わったときに報告で見える
- 入力（出典の sha256・OCR 結果の sha256・Jev の答え）の記録と検証は変えない
- 補正予算・歳入・事業 PDF の取り込みの設計は変えない

## Design

### 管理 JSON は宣言と入力だけを持つ

- `tables[]` を消す。残すのは次の4つ
  - `schema_version`
  - `target`
  - `direction`
  - `conversions`（`inputs`・`ocr_inputs`・options・`expected_tables`）
- 表の一覧は `conversions[].expected_tables` から決める
  - R2 の key は宣言からは決まらない。表の中身の sha を含む key にし（下記）、一覧が今の key を指す
  - PDF（`-nodes`/`-amounts` の組）か CSV（単一の `object`）かは、変換器（`converter`）から決める
- `manifest.schema.json` の版を上げ、`tables` を拒否する
  - 計測用の計画（`manifest.py` の `measurement_*`、`docs/prd/generic-node-builder/scan/plans/`）は `tables: []` を前提にしているので、同じ変更で直す
- `ingestion:check` は、宣言の構造と選定との対応だけを確かめる
  - 会計名と scope の照合は、変換のときの関門で行う（今の `manifest.py` の照合を `storage.prepare_save` に移す）

### 受領書は R2 の一覧1つにまとめる

```text
fiscal/ingestion/receipts.json   # 表（自治体・年度・資料・方向・表ID）→ 受領書
fiscal/ingestion/<自治体>/<年度>/<資料>/<方向>/<表ID>-{nodes,amounts}-<sha256 の先頭16桁>.parquet
```

- Parquet の key に中身の sha を入れ、上書きしない。表の切り替えは一覧の差し替えだけで起き、前の表は一覧が指さなくなっても読めるまま残る
  - 置いている途中で落ちても、前の run の build 中に次の store が置いても、build は一覧が指す表を最後まで読める
  - 一覧が指さない Parquet は cleanup が消す（一覧を確定してから、一定時間より古いものだけ）

- 受領書1件の中身は、今の `tables[]` の1件と同じにする
  - `nodes`/`amounts`（CSV は `object`）の key・sha256・バイト数・行数
  - `account`・`division`・`notes`・`unread_amount_count`・`unresolved_parent_count`
  - `input_fingerprint`
  - `inputs`: その変換が使った出典・OCR 結果の sha256 と options の sha256（コードは含めない）。宣言の入力と合うかを読む側が確かめる
  - 変換した commit は書かない。独立した証跡を持たない決まりのため（pipeline/AGENTS.md）。いつの run で置いたかは、Actions の run と store の log で辿る
- 一覧を1つにまとめる理由は2つ
  - 読む側が1回の取得で全表の受領書を得られる（1,500件を1件ずつ取らない）
  - 書く側が store と refresh-check の書き込みの job だけで、順に流れるので衝突しない
- 書く順
  1. 変換した表の Parquet を、sha 入りの新しい key に置く（並列の変換の各プロセスが置いてよい）
  2. 全部の変換が終わったら、親のプロセスだけが一覧を読み直し、置いた表の受領書を差し替えて、一覧を1回だけ置く

  一覧を置く前に落ちたときは、どこからも指されない Parquet が残るだけで、読む側は前の表を読む。次の store が同じ表を置き直す。
- 読む側（`prepare.py`・`ingestion:restore`・`ingestion:verify`・refresh・convert の保持）の取り方
  - 一覧は毎回 R2 から取る。手元の cache の一覧は使わない
  - Parquet の cache は sha 入りの key なので、古い表と取り違えない。今と同じく受領書の sha256 でも確かめる
  - 受領書の `inputs` が今の宣言の入力と合わない表は読まない（出典を差し替えた宣言の下で、古い出典の表を読まない）
- R2 を読めない手元（token が無い）では、build はできない。今も `prepare.py --remote` は R2 から表を取っているので、条件は変わらない

### スレッドは宣言を書き、変換して検査が通ることを確かめる

- `ingestion:convert` は、検査の通った候補を手元の cache に置くだけにする。管理 JSON には何も書かない
- PR に入るのは、管理 JSON の宣言と Jev の答え（`*.digit-recheck.jsonl`）だけ
- convert が一部の変換だけをやり直すとき、ほかの表は R2 の一覧から保持する
  - 今の「指紋の古い表は保持できず止まる」は残す
  - 指紋は一覧の `input_fingerprint` と比べる
- extend（`--extend-plan`）は、今の `plan['tables'] == []` の前提を「一覧にまだ無い表」に読み替える
- 前の受領書の metadata を流用する経路（`table_receipt` の前回の metadata、`unchanged_legacy_receipt`）は、移行の前に消す
  - 今 `metadata` を持つ表は無い

### PR の check は変換と検査だけを回す

`ingestion-store-check` は、宣言が変わった管理 JSON の変換を、PR を main とマージした状態で回す。

1. 保存前の関門を通った表を、候補の dir に置く
2. `publish --dry-run` で dbt を build する
   - PR が作った表は候補の dir から読む
   - ほかの表は R2 の一覧から読む
   - 重ね方は `prepare.py --candidate-dir` を使う
3. 受領書との照合はしない

### merge 後の store は main のコードで変換して置く

- `ingestion:store --since <最後に成功した同期>` の動き
  - その間に宣言が変わった管理 JSON の、すべての変換を main のコードで回す
  - 関門を通った表を、上の書く順で R2 に置く
  - 古い指紋の変換も、関門を通れば置く。すれ違いもこれで吸収する
- 置く前に、R2 にある前の表と中身を比べる（refresh と同じ比較）。差の扱いは、変換の宣言が変わったかで分ける
  - 宣言（その変換の `inputs`・options・`expected_tables`）が変わった変換、または前の表が無い変換: 差があっても置き、増えた・消えた・変わった行の数を summary に出す。差は宣言の変更の結果なので
  - 宣言は同じで指紋だけが古い変換（同じ管理 JSON の別の変換が変わって一緒に回ったもの）: refresh-check と同じく、中身が同じなら指紋だけ書き換え、差があれば置かずに報告して止める。変換器の意図しない退行を、報告だけで本番に出さないため
  - #713 の場合、132012 R5 当初は新しい変換なので、main のコードの結果をそのまま置く
- 失敗の扱いは、管理 JSON ごとに分ける
  - 関門に落ちた管理 JSON は、どの表も置かない（一覧を差し替えない）
  - prepare は、管理 JSON の単位で、すべての表に受領書があり `inputs` が今の宣言と合うときだけ build に入れる
    - 合わない管理 JSON でも、前の受領書が今の宣言の表をすべて持ち `inputs` も合うなら、前の表で入れる。D1 の行は消えない
    - それ以外（新しい資料、出典を差し替えた資料、表を足した資料）は、その資料ごと build から外す。外した資料の行は D1 の同期で消さない
    - 外した資料は sync の失敗として報告する
  - store は、ほかの管理 JSON を置き終えてから job を落とす。sync job はそれでも流す（`needs` で store の成否を見ず、store の output で落ちた資料を受け取って報告する）
  - sync-d1 の run は失敗のままなので、範囲の起点（最後に成功した run）は進まない。次の run が同じ範囲を拾い直すので取りこぼしは無いが、直すまで workflow は赤く、範囲は広がり続ける
  - 落ちる原因は、宣言か変換器の不具合、または main の変換器が出した新しい数字に Jev の答えが無いことなど。直す PR を出し、次の store で置く
- R2 の一覧に、今の宣言・コードと同じ `input_fingerprint` の表があれば、変換し直さない（今の `stored` の代わり）

### 変換器の変更は refresh-check が R2 に反映する

main の refresh-check を、比べる job と書く job に分ける。

- **比べる job**（concurrency の外）
  - 一覧の `input_fingerprint` が今のコードと違う表を作り直す
  - R2 の表と中身を比べ、結果を artifact に置く
- **書く job**（concurrency `ingestion-store`。短く終わる）
  - 中身が同じ表は、一覧の `input_fingerprint` だけを書き換える。Parquet は置き直さない
  - 差がある表・関門に落ちる表は、R2 を変えずに報告して job を落とす（今と同じ）
  - 書く直前に一覧を読み直し、比べたときから受領書が変わっていないことを確かめる。変わっていれば、その表は書かない
- 指紋を書き換える PR（branch `refresh-check/fingerprints`）はやめる。指紋は R2 の一覧にしか無いため

変換器の変更で表の中身を意図して変えるとき（#725 の「○」のように）は、次の2つの道がある。

- **変えたい表の宣言にも触れる**: store が merge の run で置き直し、差を summary に出す
- **触れない**: 翌朝の refresh-check が差を報告する。意図どおりなら、`refresh-check` を `accept: true` で手動実行する
  - 手動の実行で R2 に書けるのは `github.ref == 'refs/heads/main'` のときだけにする。branch のコードが本番の R2 を書かないようにするため
  - ADR 0045 の「手動の実行は R2 に置かない」を、この例外つきで置き換える
  - 書く job は置き直した自治体を output に出し、同じ workflow の中で sync-d1 を自治体を絞って起動する

### publish の範囲

- 宣言の変更は、今と同じくその自治体だけ build する
- 変換器のコードだけの変更は、今も全件に倒していない（`publish.py` の `INGESTION and not in build`）。これは変えない
- R2 の表を Git の diff なしに置き直すのは、refresh-check の書く job だけになる。その job が sync-d1 を起動する

### 書き換える文書とコード

- コード
  - `fiscal_inputs.py`（PDF/CSV の分け方）
  - `prepare.py`（`ingestion.tables` の `account`・`division`・`notes`・行数を一覧から入れる）
  - `run.py`（convert の保持・extend・verify の `verify_sums`/`verify_coverage`・restore）
  - `store.py`
  - `refresh.py`（`rewrite_fingerprints` をやめる）
  - `storage.py`（cleanup が一覧にない Parquet を消す。一覧から外す → Parquet を消す の順）
  - `manifest.py`
  - `manifest.schema.json`
  - `migrate_workflows.py`
  - `jurisdictions/132071/.../validate_candidate.py`
- workflow
  - `sync-d1.yml`
  - `ingestion-store-check.yml`
  - `refresh-check.yml`
- 文書
  - `docs/prd/ingestion-storage/dd.md`
  - `pipeline/AGENTS.md`（受領書・指紋・保存の節）
  - pipeline skill
  - ADR 0045・0027 の状態行と、置き換える ADR

### 移行

段階を分け、各段階で取り込み PR を止めずに済むようにする。

1. **両方に持つ**: store が、Git の `tables[]` に加えて R2 の一覧にも書く（スレッドの convert は R2 に書かない）。今の全管理 JSON の `tables[]` から一覧を作って置く。この段階では Parquet の key は今の固定 key のままにし、一覧はそれを指す
   - 確かめること: 一覧の件数が Git の表の数と同じであること、R2 の Parquet の sha がすべて一覧と合うこと
2. **読む側を切り替える**: prepare・restore・verify・convert の保持を一覧から読むようにする
   - しばらくは Git の `tables[]` とも照らし、ずれを報告する
3. **Git から消す**: 管理 JSON から `tables[]` を消し、schema の版を上げる。store・ingestion-store-check・refresh-check を新しい流れにし、新しく置く Parquet から sha 入りの key にする（固定 key の表は、置き直されたものから順に cleanup が消す）

## Alternatives Considered

| 案 | 採否 |
| --- | --- |
| **受領書を R2 に移す**（この設計） | すれ違いで main が止まらない。1つの管理 JSON の失敗でほかを止めない。Git の diff で表の変化は見えなくなり、store と refresh-check の報告に頼る |
| 受領書は Git に置いたまま、記録の指紋が古いときだけ照合を飛ばして関門で置き、Git の sha を直す PR を自動で出す | 変更は小さい。ただし自動の PR が merge されるまで、prepare が Git の sha で R2 の表を読めず同期が止まる。自動の PR は取り込み PR と同じ管理 JSON に触れて衝突しやすい |
| merge 前に main の最新で check を回し直す（branch を最新に必須） | main が動くたびに、全取り込み PR の check がやり直しになる。並行して取り込みを merge する今の進め方では重すぎる |
| merge queue | merge が1本ずつ並び、取り込みスレッドの待ちが増える |
| 変換器のコードが main に入ったときだけ、開いている取り込み PR の check を回し直す | すれ違いは merge 前に赤くなる。ただし記録を直す手間はスレッドに残り、merge の直前に変換器が入る競合も残る |
| 受領書を表ごとの JSON にする | 読む側が表の数だけ取得し、cache の古い受領書の扱いも要る。一覧1つより重い |

## Cross-Cutting Concerns

- **本番の数字の保証**: 保存前の関門と dbt の検査は、main で変換した表に毎回当たる。関門は今と同じ `storage.prepare_save` を使い、会計名と scope の照合も加える
- **入力の検証**: 出典・OCR 結果の sha256 と Jev の答えは Git の管理 JSON に残し、変換の前に照合する。CI は Jev に聞かない
- **決定性への依存**
  - 今は Poppler などの版のずれが「記録と違う」になり、store を止めていた
  - 新しい流れでは、store の summary や refresh-check に、前の表との差として出る
  - 版は手元・クラウド・CI で揃え続ける。スレッドの検査と本番の結果がずれないようにするため
- **R2 の書き込み**: main の store と refresh-check の書く job だけが書く。どちらも concurrency `ingestion-store` で順に流す。refresh-check の比べる処理（約1時間）は、この concurrency の外で回し、merge 後の store を待たせない

## Validation / Rollout

- 段階1で、一覧の件数と sha がすべて一致することを確かめる
- 段階2で、`prepare.py`（全件）と `ingestion:restore` が今と同じ表を読むことを確かめる
- store の単体テスト（`store_test.py`）を照合から次の内容に書き換える
  - 関門を通ったら置く
  - 落ちたら置かず、前の表を残す
  - 一覧は親だけが最後に1回書く
  - 宣言が同じで指紋だけ古い変換に差が出たら置かない
  - 管理 JSON ごとの失敗の分離
- 段階3の後、次の手順で確かめる
  1. 変換器を変える PR と取り込み PR を続けて merge する
  2. store が止まらないことを確かめる
  3. store の summary に差が出ることを確かめる
  4. refresh-check が差を報告することを確かめる
