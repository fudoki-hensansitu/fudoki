# ADR 0051: 取り込みの表の受領書は R2 の一覧に置き、merge 後の store が main のコードで変換して置く

状態: 採用（2026-11-16）。[ADR 0045](0045-ingestion-tables-uploaded-by-ci.md) と [ADR 0027](0027-refresh-fingerprints-by-table-content.md) の「管理 JSON に表を記録する」「指紋を書き換える PR を出す」を置き換える。設計は [受領書の設計](../prd/ingestion-receipts/dd.md)。

1. 管理 JSON（schema_version 2）は宣言と入力だけを持ち、`tables[]` を持たない。表の受領書（key・sha256・バイト数・行数・メタデータ・指紋・宣言の sha）は、非公開 R2 の `fiscal/ingestion/receipts.json` の一覧1つに置く。
2. 表の key は中身の sha256 の先頭16桁を含む（`<table_id>[-<kind>]-<sha16>.parquet`）。置き直しは別の key に書くので、build が読んでいる表を上書きしない。固定 key の表は、一覧から外れたものから cleanup が消す。
3. スレッドの `ingestion:convert` は宣言を書き、変換して関門を通ることを確かめるだけにする。表は手元の cache に置き、Git に受領書を書かない（会計を足す extend は宣言だけを書く）。
4. PR の `ingestion-store-check` は、宣言が変わった変換を main とマージした状態で回し、関門を通った表の受領書（`pending-receipts.json`）を一覧に重ねて dbt を build する。受領書との照合はしない。
5. merge 後の `ingestion:store` は、変わった管理 JSON のうち、一覧に無い・宣言の sha が違う変換を main のコードで変換し、関門を通った表を R2 と一覧に置く。そうした変換のある管理 JSON では、指紋が古い変換も一緒に変換する（部分の変換は今の指紋の表しか残せないため）。中身が前と同じなら指紋だけを書き換える。宣言は同じで中身だけが違う表（一緒に変換した変換器の差）も置き、`drifted` として報告する。宣言の変わった変換の無い管理 JSON は、指紋が古くても変換せず refresh-check に任せる（全管理 JSON に触れて宣言を変えない変更が、全表の変換にならないため）。関門に落ちた管理 JSON は何も置かず、前の受領書のまま build に残す。
6. 毎日の `refresh-check` は main で、中身が同じだった表の指紋を一覧に書き換える。書くのは比べる job と別の短い job で、store と同じ concurrency（`ingestion-store`）に入れる。差のある表は報告だけにし、main での手動実行に `accept` を付けたときだけ置き直して、その自治体の D1 同期を起動する。指紋の PR は出さない。
7. 一覧を書くのは store と refresh-check の書く job だけで、どちらも書く直前に一覧を読み直す。

## 理由

PR の check は走った時点の main で照合する。その後に変換器を変える PR が main に入ると、検査済みの取り込み PR の受領書が古いまま merge され、store が止まっていた（2026-11-15、#713・#749）。受領書を Git に置く限り、このすれ違いは Git を直す PR が merge されるまで本番の同期を止める。受領書を R2 に移し、merge 後に main のコードで変換して置けば、すれ違いは store の報告に変わり、1つの管理 JSON の失敗がほかを止めない。

## Considered Options

[受領書の設計の Alternatives Considered](../prd/ingestion-receipts/dd.md#alternatives-considered) を参照。宣言が同じで中身が違う表を止める案は、すれ違いのたびに取り込みの反映が止まるため採らず、`drifted` の報告と refresh-check の比較で拾う。

## Consequences

- Git の diff で表の中身の変化は見えなくなる。store の summary（placed・refreshed・drifted）と refresh-check の報告で見る。
- `tables[]` を持つ管理 JSON は読めなくなる（`manifest.read` が止める）。開いている取り込み PR は main を取り込み、`tables[]` を消す。
- R2 の取り込みの bucket に書くのは、main の store と refresh-check の書く job の2つになる。
