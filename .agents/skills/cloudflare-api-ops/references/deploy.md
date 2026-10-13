# `cf` でのデプロイとローカル実行のハマりどころ

- **`cf deploy` が workers.dev の設定段で 504 になっても、コードのアップロードと配信は完了していることがある。** `apps/api` で 2026-10-13 に 2 回観測した。504 の直後に再デプロイを繰り返す前に、配信履歴と workers.dev の状態、`api.fudoki.dev/health`・`/openapi.json` が新しいかを curl で確かめる。まだ古いときだけ再デプロイする。
- **`cf dev` の `--persist-to` は効かない。** local D1 は常に `apps/api/.cloudflare/state` を読む（`--local` の状態はここ。gitignore 済み）。sandbox では `~/Library/Preferences/cloudflare` へ書けず `cf dev` が起動しないことがあるので、必要なときは sandbox の外で回す。
- `cf d1 query --local` は未実装（2026-10-13 時点）。local D1 の中身を直接見るときは `apps/api/.cloudflare/state` の sqlite3 を読む。
