---
name: web-app
description: fudoki の apps/web（ホーム・自治体の頁・アシスタント）と repo root の DESIGN.md を触るときに参照する。自治体の頁の組み立て・都市像（visions.ts）の集め方・DESIGN.md に何を書くかを持つ。
user-invocable: false
---

# web-app

`apps/web`（fudoki.dev）を作るときの、コードからは読めない決まり。構成は `apps/AGENTS.md`、決定の理由は `docs/adr/` にある。

## データの読み方

- api の応答を web の中（Worker の isolate・Cache API・KV など）に持って使い回さない。頁の応答のキャッシュは CDN（Void の ISR）だけに任せる
- 一覧は api から全件を読んで web で絞り込んだり切ったりしない。最初の1頁を api から取り、続きは api の頁送り（`page_token`）で読み、画面は末尾が見えたら続きを足す。api に絞り込み・並びが足りなければ api に足す

## Routing table

| やること | 読む reference |
| --- | --- |
| 自治体の頁を直す・自治体を足す・都市像を集める | [references/jurisdiction-page.md](references/jurisdiction-page.md) |
| `DESIGN.md` に何を書くか・書かないかを判断したい | [references/design-md.md](references/design-md.md) |

## 関連 skill

- 全体設計・配布の方針は repo root の `AGENTS.md`
- Cloudflare の運用（deploy・token・ゾーン設定）は `.agents/skills/cloudflare-api-ops/`
- web が出すデータ（事業評価・プレス発表の施策・その紐付けなど）は pipeline で作る。作り方は `.agents/skills/pipeline/`
