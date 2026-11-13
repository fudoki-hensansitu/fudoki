# ADR 0044: web は api の内部の口だけを使い、公開の REST・MCP は認証つきにする

状態: 採用（2026-11-13）。[ADR 0022](0022-serve-marts-via-worker-d1-rest-and-mcp.md) の「認証なしで公開する」を置き換える。web が公開 API を使い web 専用の口を作らないとした 2026-11-12 の方針（[aggregate-api の dd](../prd/aggregate-api/dd.md) の Hono RPC の項）も置き換える。

1. web（サーバーの loader・アシスタント）は、apps/api の内部の RPC（`WorkerEntrypoint`、HTTP の route を持たない）だけを Service Binding で呼ぶ。出典の頁の文字の RPC（`SourcePages`）と同じ形にし、web 用の口は一つの entrypoint にまとめる。
2. ブラウザから `api.fudoki.dev` を呼ばない。頁を開くときのデータは loader が渡し、頁を開いたあとに遷移せずに取るデータ（事業一覧の続きの頁・事業の詳細など）は web 自身の GET の route（`/data/*`）を経由する。
3. web のアシスタントも内部の口を使う。tool の処理は公開の MCP と同じ問い合わせ（`queries.ts`・`model.ts`）を呼ぶ。
4. 公開の REST と MCP は認証を必須にする。REST は API キー、MCP は OAuth で受ける。キー・OAuth の client の発行には登録を要する。発行の仕組みは dd で決める。
5. 公開側の呼び出しは、利用者（キー・OAuth の client）ごとに記録し、流量の上限も利用者ごとにかける。
6. 公開の REST・MCP の契約は外部の利用者のために決め、web の画面の都合では変えない。内部の口は web と同じ PR で変え、互換を保たない。
7. 問い合わせの処理は両方の口で共有し、口ごとに分けるのは入口（route・tool・RPC の method）だけにする。

2026-11-13 時点で、web のサーバーは Service Binding で公開の `/v1/*` と `/mcp` を呼び、事業一覧の無限スクロールと事業の詳細はブラウザが `api.fudoki.dev` を直接呼んでいた（CORS は `*`）。api はエラーしかログに出さず、呼び出し元を記録していなかった。外部の利用の件数は web の閲覧と混ざって数えられず、WAF の流量の制限（IP あたり 20回/10秒）は住民のブラウザにもかかっていた。web の画面を直すたびに公開 API の形も変わっていた。

## Considered Options

- **口は一つのまま、呼び出し元を判定して記録する**: Service Binding か・Origin が web か・それ以外かで数えられる。WAF の制限が住民のブラウザにかかることと、web の都合で公開の契約が変わることは残る。
- **同じ HTTP に内部用のパス（`/internal/*`）を作り、Service Binding からだけ受ける**: RPC より変更は少ないが、HTTP の route を二つ持ち、インターネットから届かないことを route ごとに守る必要がある。
- **公開側を匿名のまま残し、API キーは任意（付けると上限が上がる）にする**: 試しに使う摩擦は小さいが、利用者ごとの把握と制限が任意の人にしか効かない。誰でも自由に使う面は web が担うので、公開 API には登録の摩擦があってよい。

## Consequences

- 移行は、内部の口を作って web を移す → ブラウザの直接の呼び出しを `/data/*` に移す → 公開側に認証をかけ CORS を絞る、の順に行う。認証をかけるまでは公開側は匿名のまま動く。
- claude.ai・ChatGPT などのコネクタは OAuth で繋ぐことになる。docs.fudoki.dev・llms.txt・`/.well-known/mcp/server-card.json`・AI 向けの案内（agent readiness）の記述を、認証つきに合わせて直す。
- 公開側の利用者の記録と、利用者ごとの流量の上限の置き場（Analytics Engine・Rate Limiting binding など）は dd で決める。
