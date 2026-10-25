# pluginの導入と更新

`plugins/fudoki/` は、リモートMCPの接続設定と共通skillを含むパッケージです。API keyやローカルMCPサーバーの起動は不要です。Gitからの導入と更新方法を以下に示します。

## Codex

このrepoの `.agents/plugins/marketplace.json` は `fudoki-plugins` というローカルsourceを宣言する。対応するChatGPT desktopのPlugins Directoryでこのsourceを選び、風土記をインストールする。必要なら先に `codex plugin marketplace add /absolute/path/to/fudoki` で登録する。

Gitから導入する場合は `codex plugin marketplace add fudoki-hensansitu/fudoki` でsourceを登録する。現在のCLIでは `codex plugin add fudoki@fudoki-plugins` でインストールできる（導入先で `codex plugin add --help` を確認）。desktopのPlugins Directoryでも `fudoki-plugins` を選んでインストールできる。`compare-expenditure` skill（評価の検索の手順は `references/evaluation.md`）と5つのMCP toolが読み込まれたことを確認する。

更新は `codex plugin marketplace upgrade fudoki-plugins` でsourceを更新し、desktopを再起動してインストール済みpluginの内容を確認する。marketplaceの更新だけで全クライアントのインストール済みpackageが必ず更新されるとは扱わない。[OpenAI公式仕様](https://developers.openai.com/plugins/build/plugins)

## Claude Code

一時的なローカル確認は `claude --plugin-dir ./plugins/fudoki`。ユーザー設定へ登録せず、開始したセッションで `/fudoki:compare-expenditure` を呼び出す。

Gitからの導入:

```bash
claude plugin marketplace add fudoki-hensansitu/fudoki
claude plugin install fudoki@fudoki-plugins
```

`/mcp` でpluginのfudokiが接続され、`/fudoki:compare-expenditure` が列説明・収録範囲を確認することを確かめる。直接登録済みの同じMCPがあれば、利用者がどちらを使うか選び、二重登録を避ける。

packageを変更して配るときは `plugins/fudoki/plugin.json` と `.claude-plugin/plugin.json` のversionを同時に上げる。利用者は `claude plugin update fudoki@fudoki-plugins` で更新する。独自marketplaceの自動更新は既定OFF。[Claude公式仕様](https://code.claude.com/docs/en/plugins/publish)

## Cursor

CustomizeのPluginsで追加元「From GitHub Repository」を選び、`https://github.com/fudoki-hensansitu/fudoki` を指定する。repo rootの `.cursor-plugin/marketplace.json` にある風土記をプロジェクトまたはユーザーscopeへインストールする。共有skillと既存MCP URLが読み込まれたことを確認する。[Gitからのskill導入](https://cursor.com/docs/skills)・[manifest仕様](https://cursor.com/docs/reference/plugins)

ローカル確認は `plugins/fudoki/` の中身を `~/.cursor/plugins/local/fudoki/` にコピーし、Developer: Reload Windowを実行する。外部を指すsymlinkは使わない。組織のAllow Local Plugin Imports設定が必要な場合がある。[ローカルplugin](https://cursor.com/docs/plugins#test-plugins-locally)

Gitの変更後はmarketplaceをRefreshし、pluginのversionとskill本文を確認する。teamのAuto Refreshは管理者が設定した場合だけ使う。[更新仕様](https://cursor.com/docs/plugins#keep-plugins-up-to-date)

## サーバーとpackageは別に更新される

API・MCP・UIは同じWorkerから返るので、サーバーが更新されれば同じURLの先の処理が変わる。新しいUIのresource URIはHTMLの内容hashで変わる。既存の会話やtool metadataはhostがキャッシュする可能性があり、必要なら新しい会話、接続の再取得、クライアントの再起動で確認する。

skill、manifest、接続設定は利用者のインストール済みpackageに含まれるため、package側の更新が必要。`serverInfo.version` はMCPの初期化情報で、plugin配布の更新トリガーではない。公開ディレクトリでの更新は各社の再審査・公開手順にも従う。[OpenAIの継続レビュー](https://developers.openai.com/plugins/deploy/app-review#continuous-review-and-tool-updates)
