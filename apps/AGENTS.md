# apps

公開 web・API・MCP・docs は**一時的に HTTP 500 を返す**。パイプライン完成後に公開・反映の方式を検討する。`availability.test.ts` がその確認で、root の `bun run test` から実行される。

- `api/`（`@fudoki/api`）: Cloudflare Workers。現在は全パスで 500 を返す `worker.ts` だけを持つ。デプロイ・運用のハマりどころは `.agents/skills/cloudflare-api-ops/`
- `web/`（`@fudoki/web`）: Cloudflare Workers。`deploy/cloudflare.config.ts` が `../worker.ts` を entrypoint にし、現在は全パスで 500 を返す。brand・map の資産生成（`build:brand` / `fetch:boundaries`）はこの package の script。DESIGN.md とデプロイ後の確認は `.agents/skills/web-frontend-ops/`
- `docs/`（`@fudoki/docs`）: ドキュメント app。同じく一時的に 500

## 公開 web の配信

**公開 web は `https://fudoki.dev/` で配信する。** これは派生物であって正本ではない。公開 web の絶対 URL（`canonical` / `og:image`）はこのドメインを指す。

- 置き場は Cloudflare。
- 配信は Cloudflare Workers（`web/deploy/cloudflare.config.ts`、`domains: ['fudoki.dev']`）。現在は `web/worker.ts` が 500 を返す
- build/deploy は公開 app のコードだけを扱い、dbt・原典の全量生成は実行しない
- 公開 app は `pipeline/` を import しない（`pipeline/verify/boundaries.ts` が検査する）
