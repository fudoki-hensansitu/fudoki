# ADR 0053: web のアシスタントは MCP を使わず、内部の口を AI SDK の tool に包んで渡す

状態: 採用（2026-11-19）。[ADR 0044](0044-separate-web-and-public-api.md) の決定3の実装を決める。

1. web のアシスタントは apps/api の MCP に繋がない。apps/api の内部の口（entrypoint `Web`）が、アシスタントに渡す tool の定義（名前・説明・入力の JSON Schema）を `tools()` で、呼び出しを `runTool()` で返し、web が AI SDK の tool に包んで AI に渡す。
2. 渡す tool は、公開の MCP の tool（同じ説明・schema）に、web の内部の口だけにある操作を足したもの。今は評価シートを方向性の区分ごとに数える `count_evaluation_sheets`。web だけのデータ（人口・決算状況調の財政の指標）と、出典の頁・許可したドメインの頁を読む tool は web が持つ。
3. 表とグラフ（MCP Apps の View、iframe とその器 `/view-frame`、View の tool を中継する `/api/mcp`）はやめる。会話の画面に表やグラフを出す形は別に決める。

## Considered Options

- **今のまま MCP に繋ぐ**: 公開の MCP の tool と同じものしか渡せず、web だけの操作を足すと公開の MCP の契約にも出てしまう。会話ごとに MCP の client を作り、JSON-RPC の往復と View の中継を持つ。
- **web が api の tool の定義を import する**: 要求ごとの往復は減るが、web に api の問い合わせのコードが入り、`pipeline/verify/boundaries.ts` の境界を崩す。
- **内部の口が tool の定義と呼び出しを返す（この ADR）**: 説明と schema の正本は api に残り、公開の MCP と同じ文を使える。web だけの操作を公開の契約に出さずに足せる。会話ごとに定義を引く RPC が1回増える。

## Consequences

- 公開の MCP（`/mcp`）と描画 tool・View は外部の client 向けにそのまま残る。web からは呼ばない。
- 次の質問の候補（`fudoki.dev/suggestions`）は `runTool()` が結果と一緒に返し、web が MCP の結果と同じ `_meta` に載せる。
- 手元で WEB binding が無いときだけ、tool の定義と呼び出しを公開の MCP に読み替える。
- PR の preview の web は本番の api に繋ぐので、api を deploy するまで preview のアシスタントは tool を引けない。
