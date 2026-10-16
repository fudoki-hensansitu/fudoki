# 公開 web

入口の1枚（`landing.ts`）だけを返す。`/` の紹介・`/favicon.svg`・`/robots.txt` 以外は 404。自動 deploy は無く、`bun run --cwd apps/web deploy` で出す。

```bash
bun run dev:web
bun run build:web
```
