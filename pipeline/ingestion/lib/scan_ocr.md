# scan PDFのOCRを選ぶ

共通入口は `ingestion.lib.scan_ocr`。既定は **Apple Vision**（`vision_ocr`）。PaddleOCRのPP-OCRv6 smallは `backend="paddle"` で選ぶ。失敗時に別エンジンへ自動で切り替えない。既存の `vision_ocr`・`paddle_ocr` のAPI・CLIも残す。

```python
from pathlib import Path
from ingestion.lib.scan_ocr import OcrRegion, recognize_pdf

result = recognize_pdf(Path("settlement.pdf"), pages=[1, 2])          # 既定はVision
paddle = recognize_pdf(Path("settlement.pdf"), pages=[1, 2], backend="paddle")
```

`backend` を省略して `config` に `PaddleConfig` を渡した場合はPaddleを選ぶ。型が使うエンジンを一意に決めるため、既存のPaddle取得scriptはそのまま動く。`backend` を明示して `config` の型と食い違う場合は拒否する。

Visionを既定にする理由は、実スキャンの金額の読み取りでPaddle smallより明らかに良いためである。macOSでしか動かない弱点は、OCRを変換器の外で一度だけ実行し観測を固定して補助入力にする方針（[ADR 0019](../../../docs/adr/0019-freeze-scan-ocr-observations.md)）で消える。Visionは **accurate、revision 3、日本語・英語** を初期条件にし、OSの版・build、revision、言語補正を記録する。内部重みは固定できるとは扱わない。設定は [vision_ocr.md](vision_ocr.md) を参照する。

## 単独の0を読めないことがある

Visionは単独の「0」を検出しないことがある。数字の中の0（例 `10,500`）は読める。読めなかった金額は行を作らずNULLのままにし、合計の差から値を逆算しない。取り込みの木の検査は「印字された金額、なければ子の値の和、子もなければ0」で値を決めるため、集計と検査は影響を受けない。ただし印字された0と原典の空欄の区別（[設計書 N6](../../../docs/prd/fiscal-dbt-models/design-doc.md#取り込みの出力-ノードの表と金額の表)）はこの経路では失われる。

## Paddleを選ぶ場合の縮小検出と原画像の再読

Paddleは文字を探す検出工程だけ長辺1280pxへ縮小する。見つけた文字の認識には、元の画像から切り出した画像を使う。MacのPDF描画は実験と同じCoreGraphics・300dpiを既定とする。

見出しなどの再読領域は、原典の配置を確認した書式設定から明示的に渡す。モジュールが見出しや欠落セルを自動で発見するわけではない。`retry_regions` を省略すると、縮小検出と原解像度認識だけを行い、追加のcrop再読は行わない。

```python
result = recognize_pdf(
    Path("settlement.pdf"), pages=[1, 2],
    retry_regions={1: [
        OcrRegion("header-band", (164/2480, 263/3509, 2304/2480, 720/3509)),
        OcrRegion("header-cell", (1440/2480, 550/3509, 1712/2480, 720/3509)),
    ]},
)
```

この座標は多摩市2020年度決算の実験対象（物理1・2頁、印刷74・75頁）だけの例。他の頁・書式へそのまま適用しない。再読は指定順に行い、原解像度の見出し帯を再読した後、残った不一致の1セルを再読する。再読前後の観測とnative出力を保持し、原ページ上の座標へ戻して、領域内に中心がある親観測とその子を一緒に置き換える。

2026-10-09の比較では同じ2頁の金額124/124、全174項目中171項目が一致し、残る差は中点2件・括弧1件だけだった。通常設定33.1秒に対し、この組み合わせは推論時間の合算17.3秒。初期化・描画・検査・Parquet作成は含まず、各条件1回の測定である。原典画像を親AIが読んだ正解表による評価で、人のレビューはない。別の原典で同じ精度・時間を保証しない。

組み込み後も同じPDFの2頁を共通入口で再検査し、金額124/124、全項目171/174、空欄3/3、未対応領域0を確認した。最終コードでの推論は15.6秒、初期化・描画を含む入口全体は20.9秒だった。最初の実行は推論18.7秒・入口全体42.1秒で、起動状態による時間差がある。2回のnative文字・polygon・word・confidenceは完全一致し、描画画素も従来の実験と一致した。Parquet作成や後段の検査時間は含まない。

## インストールと結果の利用

Paddleの任意依存は `mise exec -- uv sync --extra paddle-ocr --frozen` で導入する。Paddleを選ぶときは実行時も `uv run --extra paddle-ocr --frozen` を使う。既定のVisionでは不要。モデルは [固定宣言](paddle_ocr_models.json) のものをローカルへ明示的に用意する。OCR実行中のダウンロードは行わない。

Paddleのモデル指定・常駐engine・CLIは [paddle_ocr.md](paddle_ocr.md)、Appleの設定・語彙・CLIは [vision_ocr.md](vision_ocr.md) を参照する。複数画像を処理する場合は `PaddleOcr` のcontext内でengineを使い回す。PDF入口は同じengineで全指定頁と再読を処理する。

両エンジンの有効な観測は `pages[].regions[].observations[]` に返る。`pdf_table.tokens_from_ocr(result, kind="region", region_ids=["full-page"], unit="pt")` で表の組み立てへ渡せる。画像入力では `unit="px"` を指定する。原文・金額の補正は行わず、名称辞書の適用や原典照合は呼び出し側で行う。

## OCR後の名称と金額に共通訂正辞書を使う

PaddleとVisionのどちらでも、名称の補正には共通の `ingestion.lib.ocr_names` を使う。呼び出し側が折り返しを結合し、番号欄を確認して番号と名称を分けた後、名称全体を辞書と照合する。[節名称辞書](fiscal_setsu_name_corrections.json) と [科目名辞書](fiscal_subject_name_corrections.json) に、原典画像で確認した誤読パターンを蓄積し、条件が合う別PDFでも再利用する。

金額の誤読も同じ宣言の形で直す。`AmountRule`（`id`・観測した金額・正しい金額・`reason`）に、頁と観測IDを足して一つの観測に結び付ける。同じ誤読文字列が別のセルにあっても、頁と観測IDが合う規則だけを適用する。生の観測は書き換えず、補正前後・rule ID・辞書SHAを候補に残す。宣言した観測文字列が実際の観測と食い違えばエラーにし、古い宣言を黙って通さない。金額の訂正は木の検査で正しさを確かめ、誤った宣言は検査を通らない。合計の差から値を逆算して埋めることはしない。

```json
{"schema_version": 1, "normalization": "NFKC_REMOVE_WHITESPACE", "rules": [
  {"id": "amount-inter-digit-space", "page": 1,
   "observation_id": "p1:full-page:r109", "observed_amount": "84, 365, 635",
   "corrected_amount": "84,365,635", "reason": "OCRが数字の間に空白を入れた。桁と符号は原典画像で確認した。"}
]}
```

辞書にない名称や複数の解釈がある名称だけ、意味の照合や必要な領域の再読へ進む。原典が使っている旧字を新字へ一括変換しない。未訂正のOCR文字・観測ID・位置を保持し、補正前後とrule ID・辞書SHAを候補に記録して原典照合へ渡す。認識用の [ocr_vocabulary.json](ocr_vocabulary.json) はAppleの `customWords` 用で、Paddleの事後訂正にはこの語彙だけを追加しても効果はない。
