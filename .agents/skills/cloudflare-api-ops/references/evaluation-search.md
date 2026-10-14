# 事業の評価の検索（search_evaluations）の運用

設計は `docs/prd/evaluation-search/dd.md`。実装は `apps/api/src/evaluations.ts` と `evaluation-quota.ts`。

- **止める・上限を変える（デプロイ不要）**: D1 の `control` 表の値を更新する。`evaluation_search`（`on` 以外・行が無いなら評価の検索だけ 503。初期値 `off`）、`evaluation_search_per_minute`（既定 30）、`evaluation_search_per_day`（既定 1000）は全利用者の合計。上限の値が無い・正の整数でないときは 503（閉じる側）。Worker は検索のたびに読むので、更新はすぐ効く。
  - How to apply: 公開の直後に `per_day` を小さくして 429 が返ることを確かめ、値を戻す。`serving` が `off` なら評価の検索も止まる。
- **migration は自動で適用されない**: `apps/api/migrations/0002_evaluation_search.sql` は `control` に 3 行を足すだけ。本番の D1 への適用は手動で、適用前に `evaluation_search` の行が無いので評価の検索は 503。
- **回数は検索の前に数える**: Durable Object `EvaluationSearchQuota` が UTC の分と日の固定の窓で数え、storage に書いてから AI Search を呼ぶ。失敗・時間切れの検索も数え、拒んだ要求は数えない。上限の値は DO ではなく `control` に置くので、数え直しはせず値で調整する。
- **AI Search の binding は中断できない**: `search(params)` に timeout も `AbortSignal` も無い。Worker は 8 秒で応答だけを打ち切り（503）、検索は裏で続き得る。
- **登録済み**: `operations.ts` の末尾に入れてあり、REST・OpenAPI・MCP の tool に出る。外すのは切り戻し（再デプロイが要る。まず `evaluation_search` を `off` にする）。
- **ローカルの `cf dev` で AI Search を呼ぶ**（2026-10-14 に確かめた）:
  - AI Search の binding は simulation が無く、そのままだと検索が `Binding EVALUATION_SEARCH needs to be run remotely` で失敗し 503 になる。`cloudflare.config.ts` の `bindings.aiSearch({...})` に `dev: { remote: true }` を一時的に足す（コミットしない。D1・DO・rate limit はローカルのまま）。remote proxy の接続に Cloudflare の認証とネットワークが要る（sandbox の外）。検索は本番の索引を読むので、回数は数十回までにする。1回5〜7秒かかり、8秒の打ち切りに近い（remote proxy 越し）。
  - ローカル D1 は空で、`serving` の行も無く全部 503 になる。`cf dev` が出す Local Explorer API の `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/d1/database/<D1 の id>/raw`（body `{"sql": "…"}`）で、`migrations/0001_init.sql`・`0002_evaluation_search.sql` を流す。`evaluation_search` を `on` にし、`per_day` を小さくして 429 を確かめたら戻す。`--persist-to` は作業用の dir にして、既定の共有 state（`~/.config/cloudflare/state`）を使わない。
  - 流量（IP あたり）の確かめは、ローカルでは IP が `unknown` の1つの key になる。同時に12件送ると10件が通り2件が 429（`Retry-After: 60`）。
- **config が import したファイルは `cf dev` の Worker から読めない**: `@cloudflare/vite-plugin` が config の依存を `server.fs.deny` に入れるため、Worker のコードがそれを import すると `Failed to load url … Does the file exist?` で起動しない（`cf deploy` の build は通る）。`cloudflare.config.ts` と `src/evaluation-limits.ts` が流量の値を二重に持つのはこのため。`evaluations.test.ts` が2つの一致を照合する。
