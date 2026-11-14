# ADR 0045: 取り込みの表は merge 後の CI だけが R2 に置く

状態: 採用（2026-11-13）。[取り込み保存の設計](../prd/ingestion-storage/dd.md) の「`ingestion:convert --remote` が R2 に保存してから管理 JSON を更新する」を置き換える。

1. `ingestion:convert` は、検査が通った表を管理 JSON に記録し（key・sha256・バイト数・行数・メタデータ）、手元の object cache（`pipeline/.cache/objects`）の同じ key に置く。R2 には書かない。記録しないで候補だけを作るときは `--dry-run` を付ける。`--remote` は手元に無い入力と保存済みの表を R2 から戻すだけで、書き込みはしない。
2. 表の Parquet は git に入れない。PR に入るのは管理 JSON の記録と、Jev の聞き直しの答え（`*.digit-recheck.jsonl`）だけにする。
3. `ingestion:store --since <commit>` が、その commit から参照が変わり、R2 にまだ記録どおりのバイトが無い表を、R2 にある出典と OCR 結果から変換し直す。そして記録と照らす。照らすのは指紋を除く記録の全体で、sha256・バイト数・行数・メタデータを含む。全部が一致した管理 JSON の表だけを R2 に置く。一致しない表が1つでもあれば、その管理 JSON の表は置かずに止める。
4. 指紋（`input_fingerprint`）は照らさない。古い指紋は [ADR 0027](0027-refresh-fingerprints-by-table-content.md) のとおり refresh が書き換えるまで許す。指紋が古い変換は、変換し直す対象に含めるが R2 には置かない。
5. Jev には聞かない。答えは git の jsonl から読み、答えの無い数字があれば止める。CI は Jev の key を持たない。
6. merge 後の `sync-d1` は、publish の前に `ingestion:store` を流す。範囲は publish と同じで、最後に成功した同期の head からの差分にする。手動の実行（workflow_dispatch）は R2 に置かない。
7. 管理 JSON を変える PR では、`ingestion-store-check` が同じ変換を `--dry-run` で流し、merge 前に食い違いを止める。続けて、一致した表を手元の cache に置き、`publish --dry-run` で merge 後と同じ範囲の dbt を build し、検査の落ちも merge 前に止める。R2 と D1 は読むだけにする。
8. OCR 結果は CI で作り直さない。PaddleOCR の結果は環境で揺れるおそれがあるため。スレッドが `ingestion:ocr --save` で R2 に置く。これがスレッドに残る唯一の R2 への書き込みになる。出典の保存（source_selection）は、自治体のサイトが海外の IP・ブラウザ以外を弾くことがあり、差し替え前に押さえる必要もあるので、今までどおり選定のときにスレッドが行う。

2026-11-13 時点で、スレッドが `convert --remote` で表を R2 に上げるたびに、auto mode の許可待ちで止まっていた。表の R2 の key は自治体・年度・表で決まり sha を含まないので、`--remote` を付けた試しの変換が保存済みの表を上書きする事故も起きた（2026-11-05 の新宿区）。同じ入力・同じ版の依存なら変換のバイトは同じになる（あきる野 R8 を2回変換し、R2 の sha256 と一致することを確かめた）。

## Considered Options

- **PR の CI が変換して R2 に置く**: merge 前に置くと、本番が読んでいる同じ key の表を上書きする。閉じた PR の表も残る。
- **PR の CI が作った表を Actions の cache に置き、merge 後はそれを上げるだけにする**: 変換は1回で済む。ただし cache が消えたときや、PR の後に main が動いたときの扱いが要る。変換は1件あたり数分なので採らない。
- **表を git（LFS）に入れる**: Git はコード・宣言・判断・入力一覧、R2 は出典・取り込み表という保存の大原則に反する。

## Consequences

- merge から本番への反映が、変換し直す時間だけ延びる。
- 変換の結果が環境で変わる依存（Poppler・mupdf など）は、手元・クラウド・CI で版を揃え続ける必要がある。揃っていなければ `ingestion-store-check` が merge 前に止める。
- CI の `CLOUDFLARE_API_TOKEN` に、取り込みの bucket への書き込みが要る。同じ token は同じ repo の branch の PR（`ingestion-store-check`・`deploy-preview-web`）にも渡る。branch を push できる人は PR の workflow を書き換えて secret を使えるので、渡る範囲は push の権限と同じとみなす。fork の PR には渡らない。
- merge から store までの間、R2 の同じ key には前の表が残り、管理 JSON の sha と合わない。publish は store の後に流すので、本番の build は前の表を読まない。
