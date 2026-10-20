# `cf deploy` が CI で中止されるときのハマりどころ

- **`cf deploy`（cf 1.0.0-beta.6）は strict 固定で、CI（非対話）では Cloudflare 側の設定とコードの設定に差があると中止する。** 中止メッセージは `--strict` を外せと言うが、フラグでは外せない。対話で実行すると差分が表示され、上書きするか聞かれる。
  - Why: 設定をコードで持つ（config-as-code）一方で、ダッシュボードで変えた値が黙って消えないよう、差分を人が確認する作りになっている。CI には確認する人がいないので止まる。
  - How to apply: binding・`observability`・`assets` など config を変える変更を main に入れる前後で、初回だけ手元から `bun run deploy:web`（`apps/web/deploy` の `mise exec -- cf deploy`）を実行し、差分を確認して上書きに yes と答える。以後は Cloudflare 側とコードが揃うので CI の `deploy-web` が通る。
- **差分に `zone_name`・`enabled`・`previews_enabled` の削除が出ても、route は消えない。** `domains: ['fudoki.dev']` は `{ pattern, custom_domain: true }` に変換され、zone は Cloudflare 側が解決する。zone を明示できる書き方（`triggers.fetch({ pattern, zone })`）は classic route になるので使わない。
  - How to apply: 上書き後に `curl -I https://fudoki.dev/` で応答を確かめる。
