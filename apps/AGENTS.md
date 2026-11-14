# apps

公開面。web（fudoki.dev）・api（api.fudoki.dev）・docs（docs.fudoki.dev）の3つの Cloudflare Workers。

## web（`@fudoki/web`）

- 頁: ホーム（`/`。住んでいるまちのダッシュボードと、ほかのまちの検索）、まち比べ（`/compare`。2つのまちの一般会計を分野ごとに並べる）、紹介（`/about`）、アシスタント（`/assistant`）と会話（`/s/:id`・`/api/*`）、自治体の頁（`/tokyo/nakano`）、`/favicon.svg`・`/robots.txt`。他は 404
- [Void](https://void.cloud/)（Vite）で build する。設定は `void.config.ts`。頁は `pages/`（layout のサイドバーを残して SPA で移る）、API・sitemap・PWA は `routes/`、ファイル（icon・録画・出典の切り抜き）は `public/`（Workers static assets）
- データは apps/api の内部の RPC（entrypoint `Web`）を Service Binding で呼んで読む（`server/fudoki-api.ts`）。公開の REST・MCP は使わず、ブラウザは api.fudoki.dev を呼ばない（ADR 0044）
- web が持つデータの binding は、web 自身の D1 `fudoki-web`（binding `DB`。会話の保存と、外部サービスから引く参照データ（ADR 0042））だけ
- 会話: アシスタントの入力 → Turnstile → `/s/:id`。`server/` が Workers AI と apps/api の MCP を繋ぎ、出典の頁を読む tool `read_source_page`（`server/source-pages.ts`）を足す。頁の文字は AI にだけ渡し、画面と保存には出さない。結果は apps/api の MCP Apps の View を sandbox の iframe に描く。構成・上限・手で設定するもの・集計の SQL は `web/README.md`
- 自治体の OG 画像は `/jurisdictions/<code>/og.png` を Worker が頁と同じデータから描く（`server/og-render.ts`）
- brand・map の資産生成（`build:brand`・`fetch:boundaries`）はこの package の script
- `web/server/availability.test.ts` が配るファイルと PWA の繋ぎを確かめる
- DESIGN.md・自治体の頁の作り・都市像の集め方は `.agents/skills/web-app/`

## api（`@fudoki/api`）

- Cloudflare Workers + D1（ADR 0022・0038）。集約ごとの dir（`src/jurisdiction/`・`src/expenditure/` など）に型（`model.ts`）・問い合わせ（`queries.ts`）・REST の route（`routes.ts`、`@hono/zod-openapi`）・MCP の tool（`tools.ts`）を置く。設計は `docs/prd/aggregate-api/dd.md`
- `src/app.ts` が middleware・MCP（`/mcp`）・`/openapi.json` を持つ。REST は `/v1/jurisdictions*`・`/v1/expenditures/*`・`/v1/evaluations/*`・`/v1/budget-proposals/*`・`/v1/projects*`
- `src/rpc.ts` が型 `AppType` と、web 用の内部の RPC の型（`WebRpc`）を export する。内部の RPC `Web`（`src/web-entrypoint.ts`、操作は `src/web-ops.ts`）は MCP の tool と同じ名前・schema・問い合わせを使う
- 出典の頁の文字を読む内部の RPC `SourcePages`（`src/source-pages-entrypoint.ts`）は HTTP の route・MCP に載せない。頁の文字は D1 の `source_page_text` を出典の sha256 で引く（`docs/prd/page-words/dd.md`）
- 公開か内部かは api のインターフェース（REST の route・MCP の tool・内部の RPC）だけが持ち、D1・marts・`columns.json` には持たせない。内部の RPC だけが読む表は、参照するモジュールを試験で限る
- api は R2 の binding を持たない（`pipeline/verify/boundaries.ts`）
- 検索の入力の schema と SQL の組み立ては `src/shared/search.ts`。公開列の契約は生成物 `src/columns.json`。D1 の migration は `migrations/`
- MCP Apps の View（結果の表）は `ui/`。`bun run --cwd apps/api view` が生成物 `src/gen/view.ts` に書く。`src/gen/` は commit せず、生成物を import する script は `bun run view &&` を前に付ける
- 描画できる tool を変えるときは `src/app.ts` の `RENDER_DESCRIPTION` も同じ commit で直す
- デプロイ・運用のハマりどころは `.agents/skills/cloudflare-api-ops/`

## docs（`@fudoki/docs`）

- API・MCP の利用者向け文書。Blume で `content/` の MDX を静的に書き出し、assets だけの Worker で配る（`workers.dev`・preview URL は閉じる）
- API リファレンスは `apps/api/openapi.ts` が書き出す `openapi.json` から生成する。操作の説明は `apps/api/src/<集約>/tools.ts`・`routes.ts` を直し、頁には接続方法・データの読み方など schema に無いことだけを書く
- 見た目は `theme.css` で本体（DESIGN.md の色・書体・薄緑のサイドバー）に揃える。icon は `public/icons/` の Phosphor（regular）の SVG を `/icons/<name>.svg` で指し、`theme.css` の mask で文字色に塗る。SVG を frontmatter や import で渡さない
- ロゴは fudoki.dev への戻り口

## 配信

- web は `https://fudoki.dev/`（`web/void.config.ts`）。公開 web の絶対 URL（`canonical`・`og:image`）はこのドメインを指す
- main に入ると GitHub Actions がデプロイする（`deploy-web.yml`・`deploy-api.yml`・`deploy-docs.yml`、パスで対象を分ける）。手元の `deploy:*` は手動で出し直すときだけ使う。web の D1 の migration は deploy-web・deploy-preview-web が deploy の前に当てる。api の D1 の migration は自動では流さない
- web を変える PR は `deploy-preview-web.yml` が Worker Previews で `pr-<番号>.fudoki.dev` に出す（binding・var は `void.config.ts` の `preview` の分岐。PR を閉じたら消す。fork の PR は出さない）。preview は Cloudflare Access の「fudoki previews」の背後に置き（宛先は Worker 単位の `preview_worker`）、noindex は付けない
- build・deploy は公開 app のコードだけを扱い、dbt・出典の全量生成は実行しない
- 公開 app は `pipeline/` を import しない（`pipeline/verify/boundaries.ts`）
- deploy の token の権限は `.agents/skills/cloudflare-api-ops/references/cf-deploy.md`
