# 公開 web

入口の1枚（`landing.ts`）と、favicon・OG 画像・robots.txt・sitemap.xml だけを返す（画像は `public/` を `assets.ts` に写して配る）。他は 404。自動 deploy は無く、`bun run --cwd apps/web deploy` で出す。

```bash
bun run dev:web
bun run build:web
```
