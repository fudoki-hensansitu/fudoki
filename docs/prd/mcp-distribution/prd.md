---
status: in-progress
---

# AI クライアントへの接続・プラグイン配布

## Problem

風土記のリモート MCP を使う利用者に、接続方法と、自治体の歳出を比較・集計するときのルールを届ける必要がある。

## Overview

既存の MCP サーバー `https://api.fudoki.dev/mcp` を使い、次の順に進める。

1. **既存 URL の接続案内と UI の確認**: 接続案内を整え、ChatGPT・Claude・Cursor で表と原典 PDF を確認する。配布のためのローカルプログラムは不要とする。
2. **skill を含むプラグインの Git 配布**: 共通 skill と小さな plugin package を用意し、Codex・Claude Code・Cursor に独自 Git 配布する。接続設定とともに、風土記固有の比較・集計ルールを届ける。
3. **公式ディレクトリへの提出**: ChatGPT の公開 plugin と Claude の connector＋plugin を提出する。一般利用者が発見・導入できるよう、掲載文書・画像・レビュー用の検証を用意する。

## Non-Goals

- Gemini 向けの接続案内・検証・プラグイン配布。
- VS Code 向けの接続案内・検証・プラグイン配布。

## 関連

- [団体と収録範囲の参照](../jurisdiction-coverage/prd.md): MCP の表と検索前の収録範囲の確認。
- [原典 PDF の該当箇所の表示](../origin-pdf-viewer/prd.md): MCP の UI で確認する原典 PDF。

## この作業の実施範囲（2026-10-14）

ローカルの接続案内・skill・plugin・提出物を準備し、公式schemaと関連検証を行う。mainへの反映、公開申請、デプロイは別途行う。これらと未確認hostでの実機検証が残るため、statusはin-progressとする。PDF見開き・React＋shadcn/uiへの移行は別担当に移管した。

## Acceptance Criteria

- ChatGPT・Claude・Cursor向けに既存URLの接続と、収録範囲・検索結果・内訳・原典PDFを確認する手順がある。実確認と未確認を区別する。
- Codex・Claude Code・Cursorで共通skillとリモートMCP設定を読み込めるpluginとmarketplace manifestがあり、公式形式に沿う。ローカルMCPコピーと秘密を含まない。
- 比較条件、phaseと現在の公開資料区分の対応、会計、粒度、親子・軸・繰出の二重集計回避を、現在の列説明・sum_rulesを根拠にskillで示す。
- hostごとの導入・更新方法を公式URLとともに説明する。サーバー更新、package更新、metadata再取得、serverInfo.versionを混同しない。
- ChatGPT公開pluginとClaude connector＋pluginの掲載文書、画像、レビュー手順、必要な未入力項目がある。公開URL・録画・実機検証・提出を未実施のまま完了済みと扱わない。
