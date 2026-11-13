---
name: cloudflare-api-ops
description: fudoki の apps（api・web・docs の Cloudflare Workers）をデプロイ・運用するときに参照する。CI の cf deploy が止まる、公開直後に想定外の 403 が出る、deploy の token の権限を変える、といったときに読む。
user-invocable: false
---

# cloudflare-api-ops

apps の Cloudflare の運用で、コードからは読めないこと。構成は `apps/AGENTS.md`、決定の理由は `docs/adr/` にある。

| やること | 読む reference |
| --- | --- |
| 公開直後に特定のクライアントだけ 403 になる | [references/cloudflare-zone.md](references/cloudflare-zone.md) |
| CI の `cf deploy` が「差分がある」と中止する・deploy の token の権限を変える | [references/cf-deploy.md](references/cf-deploy.md) |
