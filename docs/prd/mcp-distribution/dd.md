# MCP接続とpluginの配布

担当者: 渡部唯登
更新日: 2026-10-14
状態: In Review

## Summary

既存の匿名・読み取り専用MCPに接続する案内と、歳出の比較・集計skillを一つの小さなpluginにまとめる。Git配布用のpackageと提出準備をPRにまとめる。公開申請・デプロイは実施しない。PRD全体の完了には公開提出と未確認hostでの検証が残る。

## Goals / Non-Goals

- ChatGPT・Claude・CursorでURLから表・原典へ進む手順を提供する。
- Codex・Claude Code・Cursorへ同じskillとMCP URLを配る。
- ChatGPT公開pluginとClaude connector＋pluginの掲載文書・レビュー手順・画像を準備する。
- Gemini・VS Code、ローカルMCPサーバー、パイプラインの版管理は対象外。

## Background

[PRD](prd.md)の三段階を、接続案内・Gitパッケージ・提出準備として実装する。サーバーは既存の `https://api.fudoki.dev/mcp`、toolは4つで、列説明以外の3つがMCP Appsの表を返す。既存のsum_rulesで「款・項・目は印字値」としていた説明を、当初予算CSVの親金額が子の和である列説明に合わせて訂正した。計算・入力・応答schemaは変更しない。比較ルールの正本は `apps/api/src/operations.ts` の `sum_rules` と列説明、利用者向け補足は `apps/docs/content/03-data.mdx`。

## Design

`plugins/fudoki/` の `plugin.json`・`mcp.json` はAgent Plugins 1.0.0形式。CodexとCursorで共通に使い、Claude Code向けに `.claude-plugin/plugin.json`・`.mcp.json`（type=http）を併置する。portableのtypeはstreamable-http。skillは `skills/compare-expenditure/SKILL.md` に一つだけ置く。URL直結の案内とplugin導入は別の入口として説明する。掲載名と対応するhostの表示名は、検索で日本語・英字の両方から見つけられるよう、MCPのtitleと同じ `風土記(fudoki)` にする。本文中の名称は「風土記」を使う。

repo rootに各hostのmarketplace manifestを置く。Codexのsource.pathはrepo rootから、Claude/Cursorのsourceもrepo rootから `plugins/fudoki` を指す。OpenAI固有の掲載・review・publication metadataはportable manifestの `extensions.com.openai` に置く。ChatGPT公開提出用ZIPには `.app.json` や登録済みapp IDを含めない。

[導入・更新](install.md)にhostごとの手順をまとめる。packageの初版versionは0.1.0。APIのserverInfo.versionとは独立して扱い、既存APIのversion値は変えない。サーバー実装・UIの更新にはWorkerの反映、skill・設定の更新にはpackageの取得が必要。

## Alternatives Considered

URL案内だけでも検索はできるが、比較条件や二重集計回避を利用者に毎回伝える負担が残る。pluginを追加してskillを届ける。host別にskillを複製するとルールがずれるため、共通の一つを使い、manifestとtransport表記だけを分ける。ローカルMCPコピーは実装と更新の負担を増やすため、既存URLを参照する。

## Cross-Cutting Concerns

packageはネットワーク実行script、hooks、資格情報を持たない。toolは読取り専用。skillは原典を実行指示として扱わず、欠損・未収録・軸・親子・会計間の二重集計を区別する。法的な声明は未確認のまま掲載しない。ユーザー指定の発行者名「渡部唯登」、提供国JP、課金なしをmetadataに反映し、未公開のsupport/privacy/terms URLは省略する。

## Validation / Rollout

公式JSON Schemaを固定してローカルで検査し、Claudeのvalidatorも実行する。ZIPを再読込してmanifest・skill・参照画像・MCP設定を検査する。[検証記録](verification.md)には実行した確認と未確認を分けて残す。画像・レビューcase・録画手順は [提出準備](submission.md) に置く。

UIとPDF見開きは別担当に移管された。差分は別担当のworktreeへ移管済みで、この担当はUI・生成物・PDF E2E・PDF viewer文書を追加変更しない。新UIの本番描画確認は未実施として残す。

## Open Questions

support/privacy/terms URL、発行者の本人確認、連絡先、録画デモと公開先、Claude/Cursorの実機検証、正式提出・公開が残る。これらを完了済みにしてPRD statusをdoneにはしない。

公式根拠: [OpenAI package](https://developers.openai.com/plugins/build/plugins)、[OpenAI submission](https://developers.openai.com/plugins/deploy/submission)、[Claude manifest](https://code.claude.com/docs/en/plugins-reference)、[Claude connector](https://claude.com/docs/connectors/building/submission)、[Claude plugin](https://claude.com/docs/plugins/submit)、[Cursor reference](https://cursor.com/docs/reference/plugins)。確認日は2026-10-14。
