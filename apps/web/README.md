# 公開 web

入口の1枚（`landing.ts`）と、favicon・OG 画像・robots.txt・sitemap.xml・見出しの明朝だけを返す（画像は `public/` を `assets.ts` に、明朝は `font.generated.ts` に写して Worker が返す）。ホームの録画と原典の切り抜きのような重いファイルは `static/` に置き、Workers static assets で配る。他は 404。main に入ると `.github/workflows/deploy-web.yml` が自動で deploy する（手元からは `bun run --cwd apps/web deploy`）。

```bash
bun run dev:web
bun run build:web
```
