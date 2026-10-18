# 公開 web

入口の1枚（`landing.ts`）と会話の画面（`/s/:id`、下の「風土記の AI に聞く」）、favicon・OG 画像・robots.txt・sitemap.xml・見出しの明朝だけを返す（画像は `public/` を `assets.ts` に、明朝は `font.generated.ts` に写して Worker が返す）。ホームの録画と原典の切り抜きのような重いファイルは `static/` に置き、Workers static assets で配る。他は 404。main に入ると `.github/workflows/deploy-web.yml` が自動で deploy する（手元からは `bun run --cwd apps/web deploy`）。

```bash
bun run dev:web
bun run build:web
```

## 見出しの明朝は `landing.ts` の字から作る

`public/fonts/mincho.woff2`（＝Worker が返すため `font.generated.ts` に base64 で写したもの）は、`bun run --cwd apps/web build:font` が `landing.ts` の本文に出てくる字だけを BIZ UDP明朝から集めて作る。**ホームの文言を変えたら `build:font` を回す。** 回さないと新しい字だけ配信フォントに無く、閲覧者の OS の明朝に落ちる（`build:web` も CI もこの再生成をしないので気づけない）。Google Fonts を使わないのは、読み手の IP を第三者へ渡さないため（`brand/home_font.py`）。

## 風土記の AI に聞く（`/` の入力と `/s/:id`）

入口の中央の入力（`chat/start.tsx`、React の島）から、風土記の MCP（apps/api）に繋いだ AI と会話する。会話の画面 `/s/:id` は React の SPA（`chat/session.tsx`）。チャットの部品は shadcn の chat 系（`chat/components/ui/`、`components.json`）で、apps/web の中に閉じる。

- **流れ**: 入力を送ると Turnstile で確かめ（`POST /api/sessions` がサーバー側で siteverify）、その会話だけに使える署名付き token（2時間）を受けて `/s/:id` に移る。`POST /api/chat` が Workers AI（`workers-ai-provider`、モデルは config の `CHAT_MODEL`）と AI SDK の MCP client で応答を stream する。apps/api とは Service Binding（`API`）で繋ぐ
- **表示**: AI が `render_expenditure_view` を呼んだ結果は、apps/api の MCP Apps の View を `srcdoc` + `sandbox="allow-scripts"` の iframe に置き、`AppBridge` + `PostMessageTransport` で渡す（`chat/view-frame.tsx`、土台は `apps/api/tests/host.ts`）。View が呼ぶ tool と resource の読み込みは `POST /api/mcp` が許可リスト（`server/limits.ts` の `VIEW_TOOLS`・`VIEW_RESOURCE`）で中継する
- **AI に渡すもの**: tool の結果は text の側だけ（`server/chat.ts` の `textOnly`）。structuredContent と `_meta` は View にだけ流れる
- **保存しない**: 会話の履歴と token はブラウザの sessionStorage だけに置く。サーバーは利用状況だけを Analytics Engine に書く（本文・IP・会話 ID は書かない）
- **上限**: IP ごとの流量（`CHAT_RATE_LIMIT`・`VIEW_RATE_LIMIT`、値は `server/limits.ts` と config で二重に持ち、試験が照合する）、段数・出力 token・文字数・件数・body の大きさ（`server/limits.ts`）。流量の binding・Turnstile の secret・site key のどれかが無ければ、チャットは止まる（入口は入力を出さない）
- **build**: `bun run --cwd apps/web client` が `static/_app/` に JS・CSS を書く（`build`・`deploy`・`dev` が先に回す。生成物は commit しない）

### 手で設定するもの

- Turnstile の widget を dashboard で作り（hostname は `fudoki.dev`）、site key を `deploy/cloudflare.config.ts` の `TURNSTILE_SITE_KEY` に書く。secret key は Worker の secret `TURNSTILE_SECRET_KEY` に置く（会話の token の署名の鍵もここから作る）
- 手元の `cf dev` は `deploy/.dev.vars.example` を `deploy/.dev.vars` に写す（Cloudflare の試験用の鍵で通る）

### 利用状況

dataset `fudoki_web_chat`（binding `CHAT_USAGE`）に1要求1行で書く。列は `server/usage.ts`: blob1 種類（`chat`・`relay`）・blob2 モデル・blob3 tool と回数（`name:count,...`）・blob4 失敗の種類、double1 入力 token・double2 出力 token・double3 tool 呼び出し数・double4 段数・double5 所要 ms・double6 失敗なら1。

```sql
-- 直近7日の、日ごと・モデルごとの会話の応答数・token・tool 呼び出し・失敗・平均所要時間（Analytics Engine の SQL API）
SELECT
  toStartOfDay(timestamp) AS day,
  blob2 AS model,
  SUM(_sample_interval) AS responses,
  SUM(_sample_interval * double1) AS input_tokens,
  SUM(_sample_interval * double2) AS output_tokens,
  SUM(_sample_interval * double3) AS tool_calls,
  SUM(_sample_interval * double6) AS errors,
  SUM(_sample_interval * double5) / SUM(_sample_interval) AS avg_ms
FROM fudoki_web_chat
WHERE blob1 = 'chat' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY day, model
ORDER BY day
```
