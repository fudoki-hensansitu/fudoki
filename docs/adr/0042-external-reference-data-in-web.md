# ADR 0042: 外部サービスから引く参照データは web の D1 に置き、api では配らない

状態: 採用（2026-11-11）。[ADR 0002](0002-repo-is-canonical.md) の正本と D1 の書き手の範囲を改める。

apps/api（REST・MCP）が配るのは、風土記が出典から構造化したデータだけにする。外部サービスが整えたデータを、画面の表示や計算のために使うときは、web の D1（本番 `fudoki-web`、preview `fudoki-web-preview`）に置く。

1. 最初の対象は住民基本台帳人口。出典は総務省「住民基本台帳に基づく人口、人口動態及び世帯数」の総計で、Queria の `e_stat.resident_registry.population` から読む。
2. 取得は `apps/web/scripts/sync-data/<名前>.py`（`bun run --cwd apps/web sync-data:<名前>`）に置く。Queria は DuckDB で ATTACH して読み、本番と preview の D1 の表を全行入れ替える。人口は住基の公表（毎年7月末）のあとに1回流す。
3. 外部のデータは R2 に写さず、資料の URL・版などの出典の記録も持たない。pipeline（取り込み・dbt・`serving:sync`）では扱わない。
4. web の D1 の表は `apps/web/migrations/` の migration で作り、deploy-web と preview-web が deploy の前に当てる。
5. api の自治体の応答（`/v1/jurisdictions`・`list_jurisdictions`）から `population` を外す。apps/api の D1 の `population`・`population_origin` は、web の deploy を確かめてから `serving:sync --drop-legacy` で消す。
6. 1人あたりの額は web が人口で割って出す。web のアシスタントは tool `get_population` で web の D1 の人口を読む。

## Considered Options

- **pipeline で取り込み、api の D1 に写す（今まで）**: 総務省の xlsx を R2 に保存し、dbt の marts を経て api が配っていた。風土記が構造化していないデータを、出典の記録ごと抱えて配ることになるため改める。
- **pipeline の外で Queria から api の D1 に入れる**: 取り込みはなくなるが、api が風土記の構造化していないデータを配り続けるため採らない。
- **Worker が表示のたびに Queria から読む**: Worker の中では DuckDB の DuckLake を動かせず、HTTP で問い合わせられるのは Queria の MCP だけで、無料の枠は週50回のため採らない。
- **アシスタントに Queria の MCP を渡す**: 回数の枠に加え、MCP のトークンでレポートの作成・削除もできるため採らない。

## Consequences

api の利用者は人口を風土記から得られなくなる。人口が要るときは Queria か総務省の資料を使う。

web の D1 が無い・読めないときは、頁は人口と1人あたりの額を出さずに描く。
