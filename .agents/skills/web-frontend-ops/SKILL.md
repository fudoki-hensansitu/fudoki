---
name: web-frontend-ops
description: fudoki の apps/web（Cloudflare Workers、現在は入口の1枚だけ）と repo root の DESIGN.md を触るときに参照する。DESIGN.md に何を書くか迷った、といった非自明なハマりどころを持つ。
user-invocable: false
---

# web-frontend-ops

`apps/web`（fudoki.dev）の運用で得た、コードや AGENTS.md からは読めないハマりどころの正本。

## Routing table

| やること | 読む reference |
| --- | --- |
| `DESIGN.md` に何を書くか・書かないかを判断したい | [references/design-md.md](references/design-md.md) |

## 関連 skill

- 全体設計・配布の方針は repo ルートの `AGENTS.md` が正本（このスキルは重複させない）
- apps/api 側の運用ハマりどころは `.agents/skills/cloudflare-api-ops/`
