# 風土記(fudoki)

自治体の歳出を事業の単位で検索し、比較の条件と出典を確かめるpluginです。たとえば「中野区の2025年度決算一般会計の目を金額の大きい順に3件見せて」と頼めます。接続先は既存の `https://api.fudoki.dev/mcp` で、認証とローカルMCPプログラムは不要です。

## QuickStart

ローカル開発時はrepoの `docs/prd/mcp-distribution/install.md` でCodex・Claude Code・Cursorを選んでください。Gitからの導入・更新は [導入ガイド](https://github.com/wwwyo/fudoki/blob/main/docs/prd/mcp-distribution/install.md)を参照してください。このパッケージはローカル形式検査済みで、公開ディレクトリへの提出と実クライアントでの導入確認は未完了です。Claude Codeのセッション内では `/plugin install fudoki --marketplace wwwyo/fudoki` を実行できます（v2.1.275以降）。導入ガイドの `claude plugin marketplace add` と `claude plugin install` はshellで行う同じ導入の二段階手順です。

共通skillは `skills/compare-expenditure/SKILL.md`。Claude Codeでは `/fudoki:compare-expenditure`、Codex・Cursorでは導入後のskill一覧から呼び出せます。収録範囲・列説明を確認してから検索・比較します。事業の評価の頁を探す手順は `skills/compare-expenditure/references/evaluation.md`。評価の検索が返すのは頁の所在と短い抜粋だけで、内容は出典PDFの頁を取得して確かめます。UI非対応hostでは構造化結果と出典リンクを使います。

API・MCP・UIはURLの先で更新されます。skillや接続設定はpluginの更新が必要です。`serverInfo.version` はpluginの自動更新通知ではありません。詳細は導入ガイドにあります。

[利用者向け文書](https://docs.fudoki.dev) · [コード](https://github.com/wwwyo/fudoki)

不具合・データ訂正は [GitHub Issues](https://github.com/wwwyo/fudoki/issues)、非公開の相談は [support@fudoki.dev](mailto:support@fudoki.dev) で受け付けます。

For reviewers: This plugin searches Japanese municipal expenditure through a remote, read-only MCP endpoint. It bundles one comparison skill (with a reference for locating evaluation documents), checks coverage and accounting scope, and links amounts to original documents. The evaluation lookup returns only the location (URL, SHA-256, page) and a short excerpt of the selected municipalities' evaluation documents for the 2025 fiscal year settlement; content is read from the original PDF. It does not provide individual transactions, revenue, or write operations.

## License

pluginのコードと付属文書は [MIT](LICENSE)。取得する財政データ・自治体の出典には適用しません。
