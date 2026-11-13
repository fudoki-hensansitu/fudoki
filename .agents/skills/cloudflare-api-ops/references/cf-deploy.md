# `cf deploy` と deploy の token

apps/docs と apps/web（`cf deploy --prebuilt`）に当てはまる。web の route は `apps/web/void.config.ts`、Preview の設定は `apps/web/vite.config.ts` の `previewDomains` が正本。

- `cf deploy` は CI（非対話）では、Cloudflare 側の設定とコードの設定に差があると中止する。フラグでは外せない。binding・`observability`・`assets` など config を変えたら、その最初のデプロイだけ手元から `bun run deploy:docs`（web なら `deploy:web`）を実行し、差分を確かめて上書きする。
- 差分に `zone_name`・`enabled`・`previews_enabled` の削除が出ても route は消えない。上書き後に `curl -I` で応答を確かめる。zone を明示する `triggers.fetch({ pattern, zone })` は classic route になるので使わない。
- repo の secret `CLOUDFLARE_API_TOKEN` は deploy-api・deploy-docs・deploy-web・deploy-preview-web の共用。権限は Workers の Admin（fudoki。preview の削除に要る）と Editor（fudoki-api・fudoki-docs）、D1 の書き込み（fudoki-web・fudoki-web-preview の migration）、Zone（fudoki.dev）の Workers Routes: Edit と Zaraz: Edit（deploy-web が `apps/web/analytics/zaraz.json` を反映する）。preview も本番と同じ Worker に出すので token は分けない。
