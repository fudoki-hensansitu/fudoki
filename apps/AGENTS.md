# apps

公開 web・docs は**一時的に HTTP 500 を返す**。API・MCP は ADR 0022 の構成（Worker + D1）に置き換わった。`availability.test.ts` が web・docs の 500 を確認し、root の `bun run test` から実行される。

- `api/`（`@fudoki/api`）: Cloudflare Workers + D1。`src/operations.ts` で操作を一度だけ定義し、`src/app.ts` が REST（`/v1/expenditure/*`、`/openapi.json`）と MCP（`/mcp`）に登録する。検索の入力（構造化 JSON）の schema と SQL の組み立ては `src/search.ts`、D1 の migration は `migrations/`、公開列の契約は生成物 `src/columns.json`。デプロイ・運用のハマりどころは `.agents/skills/cloudflare-api-ops/`
- `web/`（`@fudoki/web`）: Cloudflare Workers。`deploy/cloudflare.config.ts` が `../worker.ts` を entrypoint にし、現在は全パスで 500 を返す。brand・map の資産生成（`build:brand` / `fetch:boundaries`）はこの package の script。DESIGN.md とデプロイ後の確認は `.agents/skills/web-frontend-ops/`
- `docs/`（`@fudoki/docs`）: ドキュメント app。同じく一時的に 500

## 公開 web の配信

**公開 web は `https://fudoki.dev/` で配信する。** これは派生物であって正本ではない。公開 web の絶対 URL（`canonical` / `og:image`）はこのドメインを指す。

- 置き場は Cloudflare。
- 配信は Cloudflare Workers（`web/deploy/cloudflare.config.ts`、`domains: ['fudoki.dev']`）。現在は `web/worker.ts` が 500 を返す
- build/deploy は公開 app のコードだけを扱い、dbt・原典の全量生成は実行しない
- 公開 app は `pipeline/` を import しない（`pipeline/verify/boundaries.ts` が検査する）
