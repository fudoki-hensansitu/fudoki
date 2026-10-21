# scan PDF OCRの再実行一致の検証記録

2026-10-11に、同じPDF・同じ頁・同じ設定でPaddleOCRを同じMacで繰り返し実行し、native出力が一致するかを測った。native JSONのファイルはどの実行でもバイト単位では一致しなかった。差はすべて所要時間とキャッシュ状態の欄で、文字・座標・confidence・観測ID・観測の順序・描画画素はすべての実行で一致した。

本書は実測値と条件を保存する。OCR結果を取り込みの入力としてどう扱うかの決定は [ADR 0019](adr/0019-freeze-scan-ocr-observations.md)、OCRエンジンの選定は [ADR 0018](adr/0018-paddle-small-for-scan-pdf.md) を参照する。

## 実行条件

- マシン: Apple M1（8コア: 高性能4・高効率4）、メモリ16GB。
- OS: macOS 27.0（build 26A428）、arm64。
- Python 3.13.15。paddleocr 3.7.0、paddlepaddle 3.3.1、paddlex 3.7.2、numpy 2.3.5、pillow 12.3.0、opencv-contrib-python 4.10.0.84（`uv sync --extra paddle-ocr --frozen`、main `7f3b236` のlock）。
- モデル: [固定宣言](../pipeline/ingestion/lib/paddle_ocr_models.json) のPP-OCRv6 small。宣言ファイルSHA-256 `c1205e5310d9cd0ae117874933be6c494e78e2bdf241a55b9a672e979488955a`。重み・設定ファイルのSHAは宣言に記載したもので、読み込み時に照合した。
- 描画: CoreGraphics、300dpi。Swift 6.4（swiftlang-6.4.0.34.1）、`-Onone` でコンパイルしたrenderer（binary SHA-256 `4eb15488b0eba70537fb94c4a1633fa912725a258602f31d49451d40350e57d8`）。
- OCRコード: `paddle_ocr.py` SHA-256 `fe04326886d1916a77c0c5b319454a7cffaff4bd8941ae19467d43e60b4a5e95`（main `7f3b236`）。
- 入口: `scan_ocr` の既定設定 `PaddleConfig()`（検出長辺1280px・原解像度認識・CPU 10 thread・認識batch 6、`retry_regions` なし）。132039のOCR取得に使った `ocr.py` と同じ値である。
- 各実行は別プロセスで、engineを毎回初期化した。1プロセス内でengineを再利用した2回目の認識も比較した。
- 実行中は同じMacで他のagentの処理が動いており、1分間のload averageは4.8〜10.0だった。所要時間はこの負荷を含む。

対象の出典はR2の保存記録から取得し、SHA-256を照合した。

| 対象 | 出典SHA-256 | 物理頁 |
| --- | --- | --- |
| 132039 武蔵野市 2025年度決算 `settlement-4.pdf`（水道事業会計） | `84743fdd8cf408d7c7f9cbe4e92cdea0708cabfe2407421286eb91db93e783b0` | 6–9・38–43（10頁） |
| 132101 小金井市 2025年度決算 `settlement-3.pdf`（一般会計） | `0b1af0ae74a6964525621308a1390afa66d735edfd2ca534de8cd64230522b3c` | 1–4（4頁） |

## 一致の結果

比較は先頭の実行を基準に、JSONの全欄を再帰的に照合した。頁の部分集合を読んだ実行は、共通の頁だけを比べた。

| 対象 | 比較した実行 | ファイルのSHA-256 | 時間以外の差 | 観測数 | 文字の差 | 座標の最大差 | confidenceの最大差 | 観測IDと順序 | 描画画素 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 132039 | 別プロセス2回＋同一engineの2回目（計3） | 3ファイルのSHAがすべて異なる | なし | 4,983 | 0 | 0 px | 0 | 一致 | 一致 |
| 132039 | 物理7・42頁だけを読んだ実行 | — | なし | 1,227（共通頁） | 0 | 0 px | 0 | 一致 | 一致 |
| 132101 | 別プロセス3回＋同一engineの2回目（計4） | 4ファイルのSHAがすべて異なる | なし | 3,354 | 0 | 0 px | 0 | 一致 | 一致 |
| 132101 | CPU 4 thread | — | 設定の記録4欄だけ | 3,354 | 0 | 0 px | 0 | 一致 | 一致 |

ファイルが一致しなかった欄は次のとおりで、OCRの内容ではない。

- 所要時間: `elapsed_seconds`、`render_seconds`、`engine.init_seconds`、各試行の `inference_seconds`。浮動小数の桁数が変わるため、ファイルの大きさも1〜5バイト変わった。
- キャッシュ状態: `renderer.compiled_renderer.cache_hit`（worktreeで最初の実行だけfalse）。

これらの欄と、checkoutの場所で変わる絶対パス（`origin.path`、モデル・宣言・rendererのpath）を除いて正規化したJSONのSHA-256は、条件が同じ実行どうしで一致した（132039は `5e8b2bdcb9d37e9e0a3ba38880f86bc93cd9df5722e53be727a4af7abffeb81e`、132101は `17a6ab723b90e8a4b499514e351243fb3581a415a452d08726d9b56054fe96ab`）。観測とnative結果だけのSHA-256も、条件が同じ実行どうしで一致した（132039は `afe11fd8173551f37e7348fc8a38aa0dece8aceff91bf87cee9458232ccb546d`、132101は `b95a08eb3b7b7c3ce5725141c9416a283a355566b8b62576fc171662b0aa40c2`）。132101のCPU 4 threadの実行は、正規化したJSONでは記録された設定値だけが異なり、観測とnative結果のSHA-256は既定の実行と一致した。どちらのSHAも `compare.py` の正規化（キーを整列した区切りなしのJSON）で計算した。

物理7・42頁だけを読んだ実行でも、この2頁の観測は10頁を読んだ実行と同じだった。比べたのはこの2頁だけで、他の頁の組み合わせは確かめていない。thread数の変更でも観測は変わらなかった。

## 凍結済みのnativeとの比較

132039の変換が入力に使う凍結native（SHA-256 `41956f0115d9bac0835fa38959ce1ef96a4ed6a534fd99cf83a5f782d466b2b8`）は、このcheckoutのgitignore配下に無く、直接は比べていない。代わりに、凍結nativeの観測IDに結び付いた書式設定 [settlement-84743fdd.json](../pipeline/ingestion/fiscal/jurisdictions/132039/layouts/enterprise_statement/settlement-84743fdd.json) を、新しく取得したnativeで再生した。設定はメモリ上でnativeのSHAだけを差し替え、Git管理のファイルは変えていない。

- 訂正と見出しが参照する観測ID 131件はすべて新しいnativeに存在した。
- 訂正22件はすべて、観測ID・セル枠・元の文字列の照合を通って適用された。見出しの対応36件も、観測ID・枠・native文字列が一致した。
- 再構築した7表を、R2に保存済みのParquetと全セルで比べた。列・行数は全表で一致し、5表は全セルが一致した。
- 差は `shihon_shushi_meisai` の5セルと `shihon_shushi_meisai_details` の2セルだけだった。どれも物理42頁26行目の金額 `0` と、そこから項の金額へ継承した値である。この金額は追加のcrop OCR（`crop-001/page-42.json`）から読んでおり、そのファイルと切り出し領域の宣言がこのcheckoutに無いため再取得していない。

この環境では、凍結時と同じ観測IDと文字列がOCRの再実行で得られた。凍結nativeのファイル全体のバイト一致は確認していない。

## 所要時間とメモリ

`/usr/bin/time` のreal（プロセス全体）と、結果に記録された時間。推論は全試行の `inference_seconds` の合計。

| 対象 | 実行 | real（秒） | 初期化 | 描画 | 推論 | 最大RSS |
| --- | --- | --- | --- | --- | --- | --- |
| 132101（4頁） | 最初の実行（2回認識） | 117.6 | 7.1 | 2.1 / 1.6 | 47.4 / 45.0 | 1.11 GB |
| 132101 | 2回目のプロセス | 54.5 | 1.6 | 0.6 | 49.2 | 1.15 GB |
| 132101 | 3回目のプロセス | 64.4 | 1.5 | 0.8 | 59.1 | 1.11 GB |
| 132101 | CPU 4 thread | 56.5 | 1.2 | 0.6 | 52.3 | 1.26 GB |
| 132039（10頁） | 1回目のプロセス（2回認識） | 151.7 | 1.3 | 1.1 / 2.5 | 69.2 / 72.6 | 1.83 GB |
| 132039 | 2回目のプロセス | 72.7 | 1.3 | 1.2 | 67.0 | 1.93 GB |
| 132039（物理7・42頁） | 部分集合 | 23.7 | 1.5 | 0.5 | 19.1 | 1.23 GB |

132039の頁別の推論は、表のある9頁で5.5〜10.0秒、空白紙の物理43頁で1.0秒だった。132101は見開きの密な表で、1頁あたり約12〜15秒かかった。最初の実行はSwift rendererのコンパイルとengineの冷えた初期化を含む。

比較のため、新しいnativeから132039の書式設定で7表を組み立て、保存済みの表と全セルを比べる処理（`replay_132039.py`）は、プロセス全体で1.04秒だった。Parquetの書き出しは含まない。

native JSON（現行の `indent=2` 出力）の大きさは、132039の10頁で10.5MB（gzipで0.75MB）、132101の4頁で7.1MB（gzipで0.49MB）だった。

## 検証範囲と実験ファイル

同じMac・同じpackage版・同じモデルでの一致であり、別のMac・別のCPU・Linux・Poppler描画・別のpackage版での一致は測っていない。ADR 0018のとおりPopplerはCoreGraphicsと画素が異なり得る。原解像度の再読（`retry_regions`）とcropの領域指定による読み取り、Apple Vision、複数のOCRプロセスの同時実行も、今回の比較対象に含めていない。

以下はGit管理外のローカル実験ファイル（`pipeline/ingestion/fiscal/observations/ocr-determinism-2026-10-11/`）である。

- 実行コード: `scripts/run_ocr.py`（SHA-256 `5880ae20944e1a60cb51e5c1cb3b083920e0f3ea915bd380b00cb876781e81a2`）、`scripts/batch.sh`（`28660d8ee709b4d8ea2e65dcec311be249565c57ec5b1ec7d5f9df390485c09c`）。
- 比較コード: `scripts/compare.py`（`c4d78e232a3fe8f2972aea53caae891b025a58752c5538e47aaba122082a4c41`）、凍結済み設定の再生: `scripts/replay_132039.py`（`a53d321dc4b9c88bcecd96af2b9a8adeafec8824ff97ab5e8701d50da6a31a11`）。
- 比較結果: `reports/132039.json`、`reports/132101.json`、`reports/132039-replay-proc1.json`。
- 各実行の所要時間・ログ: `runs/<自治体>/<実行>/summary.json` と `runs/<自治体>/<実行>.log`。比較後、再生成できる各実行のnative（計約67MB）と出典PDFの複製は削除した。作り直すときは出典をR2から取得し、`scripts/batch.sh` を実行する。
