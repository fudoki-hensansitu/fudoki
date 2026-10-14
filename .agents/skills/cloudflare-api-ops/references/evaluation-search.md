# 事業の評価の検索（search_evaluations）の運用

設計は `docs/prd/evaluation-search/dd.md`。実装は `apps/api/src/evaluations.ts` と `evaluation-quota.ts`。

- **止める・上限を変える（デプロイ不要）**: D1 の `control` 表の値を更新する。`evaluation_search`（`on` 以外・行が無いなら評価の検索だけ 503。初期値 `off`）、`evaluation_search_per_minute`（既定 30）、`evaluation_search_per_day`（既定 1000）は全利用者の合計。上限の値が無い・正の整数でないときは 503（閉じる側）。Worker は検索のたびに読むので、更新はすぐ効く。
  - How to apply: 公開の直後に `per_day` を小さくして 429 が返ることを確かめ、値を戻す。`serving` が `off` なら評価の検索も止まる。
- **migration は自動で適用されない**: `apps/api/migrations/0002_evaluation_search.sql` は `control` に 3 行を足すだけ。本番の D1 への適用は手動で、適用前に `evaluation_search` の行が無いので評価の検索は 503。
- **回数は検索の前に数える**: Durable Object `EvaluationSearchQuota` が UTC の分と日の固定の窓で数え、storage に書いてから AI Search を呼ぶ。失敗・時間切れの検索も数え、拒んだ要求は数えない。上限の値は DO ではなく `control` に置くので、数え直しはせず値で調整する。
- **AI Search の binding は中断できない**: `search(params)` に timeout も `AbortSignal` も無い。Worker は 8 秒で応答だけを打ち切り（503）、検索は裏で続き得る。
- **未登録の間は公開されない**: `operations.ts` の一覧に入れるまで、REST・OpenAPI・MCP の tool の一覧に出ない（binding は宣言済み）。登録は設計の手順5。
