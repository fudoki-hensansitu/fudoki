# 検証記録

確認日: 2026-10-14。公開提出・デプロイは未実施。UIは別担当へ移管済み。この担当の最終差分はplugin・接続案内・提出準備に限定する。

## ローカルで実施した確認

| コマンド・確認 | 結果 |
| --- | --- |
| `mise exec -- uv run --no-sync python docs/prd/mcp-distribution/package.py build` | Agent Plugins 1.0.0公式schema、共通/Claude manifestの一致、既存MCP URL、3種marketplaceの相対path、掲載文の長さ、5 positive / 3 negative case、参照画像、9ファイルのZIP再読込と内容一致を確認。package_valid=true、public_submission_ready=false |
| `mise exec -- claude plugin validate --strict --json ./plugins/fudoki` | success=true。errors/warningsなし |
| `mise exec -- claude plugin validate --strict --json ./.claude-plugin/marketplace.json` | 説明不足のwarningを修正後、success=true。errors/warningsなし |
| 共通 skill-creator の `quick_validate.py plugins/fudoki/skills/compare-expenditure` | Skill is valid |
| `mise exec -- bun run --cwd apps/docs typecheck` | 成功 |
| `mise exec -- bun run build:docs` | 成功。Blumeが12ページを生成し、cfのdry-runが終了。公開・アップロードなし |
| `mise exec -- bun run typecheck:all` | 成功 |
| `mise exec -- bun run --cwd apps/api test` | 138 pass、0 fail。MCP/REST schema、入力制約、UI生成物の同期検査を含む |
| `mise exec -- bun run --cwd apps/docs doctor` | 12ページ、No problems found |
| アイコンの視認 | 256×256 PNG、既存markの緑の棒・基線を白背景で確認。ファイルサイズ・参照はpackage検査で確認 |
| 既存公開URLのHTTP確認 | docs.fudoki.dev、/mcp、/dataが200。各ページtitleと本文が風土記の文書であることを確認 |

package検査は既存uv環境のjsonschemaを `--no-sync` で使う。依存追加・install・lock変更なし。`.build/plugins/fudoki-0.1.0.zip` はローカル生成物として再生成できる。公式schemaの固定コピーは `schemas/` にある。掲載URLのうちsupport/privacy/termsは未入力のまま。

## 公開MCPの読取り確認

`mise exec -- bun -` でpackageの `mcp.json` のURLを読んでPOST要求を送り、各結果をassertで検査した。URL/statusと必要な構造だけを出力し、headers・tokenは記録しない。送信したのは公開財政データを求める引数で、ユーザー情報・秘密は含めない。

- initialize: protocolVersion 2025-06-18、serverInfo.name=fudoki-api。
- tools/list: 4つのtool、titleとreadOnlyHint=true・destructiveHint=false・openWorldHintのbooleanを確認。
- list_jurisdictions: name=中野区で収録範囲を取得。
- describe_expenditure_columns: 5つのsum_rulesを取得。
- search_expenditure_nodes: settlement、2025年度、131148、一般会計、目、amount_yen降順、page_size=3で3件を取得し、各行の条件一致を確認。
- get_expenditure_node: 前の検索の最初のnode_idで取得。node_id一致と節の内訳を確認。
- resources/list: text/html;profile=mcp-appのresourceを確認。HTMLの描画はこのHTTP確認には含めない。

これはplugin導入・skillの実行・会話内のtool選択の検証ではない。

## 引き継いだ実機確認

- ChatGPT: 2026-10-14の個人用custom MCP接続で、収録範囲、検索結果3件、内訳、原典PDFの項目122頁・金額123頁切替と各枠を確認済み。CSP強制ONでも成功し、検証後は元のOFFに戻した。公開提出ではない。
- Claude: 同名の匿名custom connectorを作成・接続でき、3つのUI toolを対話型として認識。応答・描画は未確認。
- Cursor: native IDEでの実機確認は未実施。
- 新UI: React＋shadcn移行と見開きは別担当。変更前の実機結果を新UIの成功として扱わない。

会話・アカウント情報・Inspector認証URLは公開するpackageに含めない。既存接続を重複作成せず、利用枠購入やアカウント設定変更も行っていない。

## 残る確認

インストール後の各hostのskill読込み・4 toolの接続、5 positive / 3 negative case、Claude/Cursorの表示、提出用スクリーンショット3〜5枚、録画と閲覧可能なURL、発行者の本人確認、連絡先、support/privacy/termsの公開、各portalの検査・提出・公開が残る。

コードの独立レビュー（再利用・品質・効率）はpackage.pyに指摘なし。文章レビューの3件（比較条件、未公開リンク、UI移管状態）を修正した。技術レビューの1件（CSVの親金額と行番号の説明）を修正し、APIのsum_rulesとデータ説明も列説明に合わせた。parent金額の計算やパイプラインは変更していない。plugin内にMITライセンスを同梱し、ClaudeのREADME要件を満たすためレビュー用の英語概要も追加した。


## PRの検証範囲

このPRはpackage・接続案内・提出準備を対象とする。APIの変更はCSV親金額の説明の訂正で、データ・計算・応答schemaは変更しない。UIとPDF viewerの変更は別の作業に移管済み。

pluginの実インストール・クライアントごとの更新は未検証。`codex plugin list --marketplace fudoki-plugins --available --json` は、source未登録のため installed/available とも空だった。公開ディレクトリへの提出とデプロイはこのPRでは実施しない。PRD全体のstatusはin-progressを維持する。
