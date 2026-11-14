# Queria へ配布する

Queria の公開データセット `fudoki` へ、Queria 用の marts（`pipeline/dbt/models/marts/queria/`）を写す。主キー・キーの宣言は `_models.yml` の `meta.queria`。

## 手順

`F="uvx --from fdl-cli --with queria fdl"`（`--with queria` は push の認証の helper が要る）。

1. `mkdir -p pipeline/.build/queria` のあと、そこで `$F checkout https://data.queria.io/datasets/wwwyo/fudoki/ .fdl/work.sqlite`
2. repo 直下で `bun run --cwd pipeline dbt:build -- --remote`（`--jurisdiction` なしの全件）、続けて `bun run --cwd pipeline serving:queria`。公開する版は全自治体で作る（`--jurisdiction` は試し用）
3. `pipeline/.build/queria` で `FDL_WORKING=.fdl/work.sqlite uvx queria validate` → `$F commit .fdl/work.sqlite -m "…" --author <名前>` → `$F push .fdl/work.sqlite`（`queria login` か `FDL_TOKEN` が要る）

## 決まり

- push した時点で公開される。無料枠は最新の版だけを残す。戻すときは前の commit で作り直して push する
