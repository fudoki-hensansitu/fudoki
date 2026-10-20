# ADR 0032: 新しい scan PDF の取得は Paddle small（ONNX Runtime）を既定にし、既存の冊は Vision のまま残す

状態: 採用（2026-10-20）。[ADR 0018](0018-paddle-small-for-scan-pdf.md) と [ADR 0019](0019-freeze-scan-ocr-observations.md) の 2026-10-11 改訂（既定エンジンを Apple Vision にする）を置き換える。ADR 0019 の「変換器の外で一度だけ OCR し、観測を固定して補助入力にする」方針と、`_vlm_identity()` に結び付いた VLM の答えの固定は変えない。[ADR 0017](0017-vision-for-coordinate-preserving-ocr.md) は比較の記録として残る。

新しい取得依頼（`ocr_inputs[].request.engine`）は `paddle` と書く。PaddleOCR PP-OCRv6 small を ONNX Runtime の CPU で動かし、検出は頁を縦に分けて読む。管理 JSON に `engine: "vision"` で書かれた既存の依頼は、そのまま Apple Vision で取得し、観測も動かさない。

## Vision を既定にした前提が崩れた

Vision を既定にしたのは、実スキャンの金額で Paddle small より読めたからだった。ただし比較に使った Paddle は頁全体を一度に読む設定で、右罫線に接した桁や縮小による取りこぼしが多かった。頁を縦に分けて検出すると、この差は縮まる。132055 の 269 セル（読めた・誤り・読めなかった、の順）では、Vision の頁全体読みが 229/4/36、Vision の固定観測が 265/4/0、Paddle が 265/4/0 だった。固定観測は取得後に墨チェックと VLM で補った結果で、Paddle も同じ数になった。

縦に分ける効果は大きい。131181 荒川区の 1646 セルは、頁全体読みが 1595/5/46、縦 4 分割が 1640/6/0。132152 国立市の 2245 セルは、頁全体読みが 2161/20/64、縦 4 分割が 2233/8/4 だった。訂正前の Vision は数百件の金額の誤りを出したのに対し、縦 4 分割の Paddle は 6〜12 件にとどまる。残る主な誤りは、右罫線に接した最後の桁の落ちである。これは木の検査（階層別合計）が合わないセルとして止まるので、誤りが表に入ることはない。

Vision の弱みは精度だけでなく動く場所にもある。macOS でしか動かず、OS の更新で出力が変わりうる。ONNX Runtime の CPU 実行なら、同じ重みと同じ画素でどの環境でも同じ読みになる見込みが立つ。

## ONNX Runtime で動かす

Paddle の公式配布には、変換済みの ONNX（`PP-OCRv6_small_det_onnx_infer`・`PP-OCRv6_small_rec_onnx_infer`）がある。PaddleOCR 3.7.0 の `PaddleOCR(engine="onnxruntime")` が直接読む。2026-10-20 の実測で、宣言済みの Paddle 重みを Paddle 本体で動かした結果と ONNX Runtime の結果は、933 観測で文字・枠とも完全に一致した（枠差 0px）。10 頁の所要は、ONNX Runtime（intra_op 4 スレッド）が 28.8 秒、Paddle 本体（10 スレッド）が 84.7 秒。ONNX Runtime は 2〜6 スレッドで同等で、8 以上で遅くなる。既定のスレッド数は 4 にする。

ONNX の重みは `paddle_ocr_models.json` に、ファイル名・バイト数・sha256 付きで固定する。ここで Paddle 本体の重みも `runtime` で区別した。照合は従来どおりで、自動ダウンロードはせず、不足と不一致は停止する。`inference.yml` の sha256 は、宣言済みの Paddle 版と ONNX 版で一致した。

ONNX Runtime での実行は paddlepaddle を import しない。そこで `paddle-ocr` extra から paddlepaddle を外して `onnxruntime==1.31.0` を足し、paddlepaddle は `runtime="paddle"` のためだけの extra `paddle-native` に移した。

## 検出の設定は PaddleConfig の項目にする

検出の解像度の上限（`detection_limit_side_len`）と頁の縦分割数（`page_strips`、隣との重なり `strip_overlap_px`）は `PaddleConfig` の項目で、依頼の `config` に書く。最良の値は別の調査で比較中なので、既定は分割なし（`page_strips: 1`、従来の頁全体読みと同じ）に置き、決まった値で既定を直す。重なりの帯で二重に検出された観測は、そのまま両方残す。除去は評価と同じ扱いに合わせた。

## 墨チェックと VLM は Paddle の取得でも最後の段にする

取得は、Paddle の頁読み、Paddle の ROI 再読、数字だけの認識（`_read_zeros`）、VLM の順に補う。ROI 再読は、罫線を白く消した頁から見落とした墨の範囲を切り出し、64px まで拡大して読む。Vision で使っていた白い余白は付けない。VLM は木の検査が合わないセルだけを対象に、期待値を渡さず 1 回だけ読ませて観測に固定する。採るかどうかは木の検査が決め、VLM の答えが合計に合うことを読みの正しさの根拠にはしない。

`column_tiles`（罫線で区切った列を小さく分ける読み）は Vision の取りこぼしへの対処なので、Paddle の依頼では使えない。

## 既存の冊は Vision のまま残す

観測 ID は、Paddle が `p{n}:{region}:a{k}:result{m}:r{i}`、Vision が `p{n}:{region}:r{i}` で、形が違う。`AmountRule` などの固定観測と訂正の宣言は Vision の ID に結び付くので、既存の冊を Paddle に切り替えると訂正がすべて無効になる。切り替えの利益は、訂正済みの冊では小さい。そのため既存の依頼は `engine: "vision"` のまま触らない。固定済みの VLM の答えを無効にしないよう、`_vlm_identity()` の値も変えない。

## 結果

- 新しい取得は `engine: "paddle"` と書く。`scan_ocr` の `backend` 既定は Paddle になった。`config` に `VisionConfig` を渡す呼び出しは、従来どおり Vision を選ぶ。
- Paddle の観測は native の出力（`attempts[].native`）を持たない。観測は `regions` にあり、native は大きく、同じ内容の重複になるためである。試行の設定・拡大条件・画素の sha256 は残す。
- `scan_ocr.py`・`paddle_ocr.py`・`paddle_ocr_models.json` の変更で、全保存済み表の `input_fingerprint` が古くなる（[ADR 0027](0027-refresh-fingerprints-by-table-content.md)）。`ingestion:refresh` で中身が同じことを確かめて指紋だけを書き換える。この ADR の変更では表の中身は変わらない見込みである。
- 縦分割の最良設定、二重検出の除去の要否、ROI 再読が Paddle で十分に動くかは、実際の頁で測る。右罫線に接した最後の桁の落ちは、木の検査で止まるが、Paddle 側では直せていない。
