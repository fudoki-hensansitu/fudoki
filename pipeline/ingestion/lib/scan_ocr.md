# scan PDFのOCRを選ぶ

取得の依頼に `column_tiles:true` を書くと、罫線で区切った列を文字のない行間で分割し、白い余白を付けてVisionで読む。文書ごとに選ぶ取得条件であり、省略時の頁全体の読みは変えない。`regions` との併用は不可。`vlm_fallback:false` はVisionの再読までで止め、未読の墨を観測に残す。木の検査後に必要なセルだけ別途再読し、答えを固定する場合に使う。例: `{"engine":"vision","pages":[31,32],"column_tiles":true,"vlm_fallback":false}`。

共通入口は `ingestion.lib.scan_ocr`。既定は **Apple Vision**（`vision_ocr`）。PaddleOCRのPP-OCRv6 smallは `backend="paddle"` で選ぶ。失敗時に別エンジンへ自動で切り替えない。既存の `vision_ocr`・`paddle_ocr` のAPI・CLIも残す。

```python
from pathlib import Path
from ingestion.lib.scan_ocr import OcrRegion, recognize_pdf

result = recognize_pdf(Path("settlement.pdf"), pages=[1, 2])          # 既定はVision
paddle = recognize_pdf(Path("settlement.pdf"), pages=[1, 2], backend="paddle")
```

`backend` を省略して `config` に `PaddleConfig` を渡した場合はPaddleを選ぶ。型が使うエンジンを一意に決めるため、既存のPaddle取得scriptはそのまま動く。`backend` を明示して `config` の型と食い違う場合は拒否する。

Visionを既定にする理由は、実スキャンの金額の読み取りでPaddle smallより明らかに良いためである。macOSでしか動かない弱点は、OCRを変換器の外で一度だけ実行し観測を固定して補助入力にする方針（[ADR 0019](../../../docs/adr/0019-freeze-scan-ocr-observations.md)）で消える。取得の入口は `acquire`（`ingestion:ocr` から呼ぶ）で、観測は内容だけの正規化JSON、所要時間や環境は実行記録に分ける。Visionが頁全体を空で返したら、罫線で決めた列の帯で読み直し、それでも空なら止める。Visionは **accurate、revision 3、日本語・英語** を初期条件にし、OSの版・build、revision、言語補正を記録する。内部重みは固定できるとは扱わない。設定は [vision_ocr.md](vision_ocr.md) を参照する。

## 見落とした墨を読み直す

Visionは単独の「0」、横棒1本の「一」、均等割付の名前の1字、ときには備考の行まるごとを、エラーなしに読み落とす。`acquire` は頁ごとに、OCRの箱にも罫線にも覆われない墨を探し（`missed_ink`）、次の順で読み直す。

1. 同じ行・同じセルの墨をまとめ、左右6pt広げて（3ptでは金額の頭の1が切れる）、罫線を白く消した頁の画像で、その範囲だけをVisionで読み直す（`ink_areas`・`_read_without_rules`、領域 `ink-<n>`）。罫線を残すと、際の0を `0一`・`10` と読む。見落とした墨に重ならない読み（読めている行の端など）と、既にある箱と重なる読みは捨てる。
2. それでも覆われない数字の大きさの墨は、PaddleOCRの文字認識だけ（検出なし、PP-OCRv6 small、1か所約130ms）で読み、1桁の数字だけを採る（`_read_zeros`、領域 `digit-<n>`）。残る墨の約4分の3は単独の0で、試しでは345か所すべてcodexと一致した。取得には `--extra paddle-ocr` が要る。
3. 残りの墨は、その行のセル幅をVLM（`vlm_ocr`、既定はcodex経由のgpt-6-luna。OpenCode Goの上限の間の代わりで、`pi` 経由にはモデル名で戻す）に読ませ、OCRが読んだ文字との差が1か所の挿入に定まるときだけ、その文字を補う（`_fill`、領域 `vlm-<n>`）。1字だけを切り出すと形の似た字を取り違える（繕→繰、工→十）ため、行の文脈で読ませる。
4. 定まらない墨は `unread_ink` に範囲だけ残す。合計の差から値を逆算しない。モデルが答えなかった範囲（混雑・時間切れ）は `vlm_failed` に残し、次の取得で聞き直す。モデルは「一」を「ー」「―」と答えることがあるため、語頭や漢字の後の横棒は「一」とする。

VLMの答えは観測に固定される。再取得では、同じモデル・プロンプト・答えの作り方（観測の `vlm`）で得た固定済みの答えを使い回し、聞き直さない。`--verify` はVisionの再現性を確かめ、VLMの答えは固定値として扱う。2026-10-12の青梅・教育費（60頁）では、墨205か所のうち196か所をVisionの読み直しで、残る7か所をVLMで補い、原典画像と一致した。

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
