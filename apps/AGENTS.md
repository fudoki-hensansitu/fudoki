# apps

公開 web は**一時的に HTTP 500 を返す**。API・MCP は ADR 0022 の構成（Worker + D1）に置き換わった。`availability.test.ts` が web の 500 を確認し、root の `bun run test` から実行される。

- `api/`（`@fudoki/api`）: Cloudflare Workers + D1。`src/operations.ts` で操作を一度だけ定義し、`src/app.ts` が REST（`/v1/expenditure/*`、`/openapi.json`）と MCP（`/mcp`）に登録する。検索の入力（構造化 JSON）の schema と SQL の組み立ては `src/search.ts`、D1 の migration は `migrations/`、公開列の契約は生成物 `src/columns.json`。デプロイ・運用のハマりどころは `.agents/skills/cloudflare-api-ops/`
- `web/`（`@fudoki/web`）: Cloudflare Workers。`deploy/cloudflare.config.ts` が `../worker.ts` を entrypoint にし、現在は全パスで 500 を返す。brand・map の資産生成（`build:brand` / `fetch:boundaries`）はこの package の script。DESIGN.md とデプロイ後の確認は `.agents/skills/web-frontend-ops/`
- `docs/`（`@fudoki/docs`）: API・MCP の利用者向け文書（docs.fudoki.dev）。Blume で `content/` の MDX を静的に書き出し、Worker のコードを持たない assets だけの Worker で配る（`workers.dev`・preview URL は閉じる）。API リファレンスは build の前に `apps/api` の route 定義から書き出す `openapi.json`（`apps/api/openapi.ts`）から生成するので、操作の説明は `apps/api/src/operations.ts` を直す。ページに書くのは接続方法・データの読み方など schema に無いことだけ

## 公開 web の配信

**公開 web は `https://fudoki.dev/` で配信する。** これは派生物であって正本ではない。公開 web の絶対 URL（`canonical` / `og:image`）はこのドメインを指す。

- 置き場は Cloudflare。
- 配信は Cloudflare Workers（`web/deploy/cloudflare.config.ts`、`domains: ['fudoki.dev']`）。現在は `web/worker.ts` が 500 を返す
- build/deploy は公開 app のコードだけを扱い、dbt・原典の全量生成は実行しない
- api・docs は main に入ると GitHub Actions がデプロイする（`.github/workflows/deploy-api.yml`・`deploy-docs.yml`、パスで対象を分ける）。認証は repo の secret `CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`。手元の `deploy:*` は手動で出し直すときだけ使う。D1 の migration とデータの投入は自動では行わない
- 公開 app は `pipeline/` を import しない（`pipeline/verify/boundaries.ts` が検査する）
