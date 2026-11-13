---
name: web-app
description: fudoki の apps/web（ホーム・自治体の頁・アシスタント）と repo root の DESIGN.md を触るときに参照する。自治体の頁の組み立て・都市像（visions.ts）の集め方・DESIGN.md に何を書くかを持つ。
user-invocable: false
---

# web-app

`apps/web`（fudoki.dev）を作るときの、コードからは読めない決まり。構成は `apps/AGENTS.md`、決定の理由は `docs/adr/` にある。

## Routing table

| やること | 読む reference |
| --- | --- |
| 自治体の頁を直す・自治体を足す・都市像を集める | [references/jurisdiction-page.md](references/jurisdiction-page.md) |
| `DESIGN.md` に何を書くか・書かないかを判断したい | [references/design-md.md](references/design-md.md) |

## 関連 skill

- 全体設計・配布の方針は repo root の `AGENTS.md`
- Cloudflare の運用（deploy・token・ゾーン設定）は `.agents/skills/cloudflare-api-ops/`
- web が出すデータ（事業評価・プレス発表の施策・その紐付けなど）は pipeline で作る。作り方は `.agents/skills/pipeline/`
