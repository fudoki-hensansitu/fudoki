---
name: cloudflare-api-ops
description: fudoki の apps/api（Cloudflare Workers + D1、REST と MCP）をデプロイ・運用するときに参照する。公開直後に想定外の 403 が出た、といった非自明なハマりどころを持つ。
user-invocable: false
---

# cloudflare-api-ops

`apps/api`（api.fudoki.dev）の運用で得た、コードや AGENTS.md からは読めないハマりどころの正本。設計判断そのもの（why この形にしたか）は `apps/AGENTS.md` が正本なので、ここは重複させない。

## Routing table

| やること | 読む reference |
| --- | --- |
| 公開直後に特定クライアントだけ 403 になる | [references/cloudflare-zone.md](references/cloudflare-zone.md) |
| 事業の評価の検索を止める・上限を変える・migration を適用する・ローカルの `cf dev` で AI Search を呼ぶ | [references/evaluation-search.md](references/evaluation-search.md) |

## 関連 skill

- apps/api の設計判断・トレードオフは `apps/AGENTS.md` が正本（このスキルは重複させない）
- dbt / duckdb 側のハマりどころは `.agents/skills/pipeline/`
