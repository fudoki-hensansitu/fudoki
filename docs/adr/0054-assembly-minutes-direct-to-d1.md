# ADR 0054: 議会の会議録は手元の script から D1 に差分で直接書く

状態: 採用（2026-11-24）。D1 に書くのを `serving/sync_d1.py` だけに絞る決まり（[ADR 0040](0040-sync-d1-by-row-diff.md) の運用）の例外を決める。

1. 議会の会議録は、`pipeline/assembly/ingest.py` が議会のサイトから取り、発言に切って D1 の `assembly_meeting`・`assembly_speech`・`assembly_member` に書く。R2・dbt・marts・`sync_d1.py` を通さない。
2. 書くのは入れる先の D1 にまだ無い会議だけ（差分）。取り直し（`--refetch`）は取った HTML の hash が変わったときだけ入れ替える。表は script が `create table if not exists` で作り、migration は置かない。
3. 外部のサイトから取るので、手元で人が流す。CI・Actions では回さない。
4. 推定でしか決まらない項目（問いと答弁の対応・款・理事者の役職）は持たない。議員のフルネームは名簿で1人に決まるときだけ入れる。

## Considered Options

- **fudoki の流れに乗せる**: 取った HTML を R2 に置き、dbt で表にし、merge 後の同期が D1 に写す。決まりは守れるが、取り込みの宣言・staging・marts・列の契約を一通り足すことになり、同期の範囲の判定にも入る。
- **手元から D1 へ直接書く（この ADR）**: 足すのは script 1本。同期は自分の表（`TABLE_ORDER`）しか触らないので、`assembly_*` は消されない。代わりに、取った HTML は手元の `pipeline/.cache/assembly/` にしか残らず、R2 から作り直すことはできない。

## Consequences

- 本番に入れるときは `--database-id` を付けて手元から流す。書き込みは新しい会議の分だけ（中央区の3年分で約4万行）。
- 自治体ごとに会議録のシステムが違うので、自治体を足すときは `SOURCES` に読み方を足す。
- 手元の HTML が無い環境で入れ済みの会議を作り直すには、`--refetch` で議会のサイトから取り直す。
