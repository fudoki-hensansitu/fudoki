# 原典 PDF の該当箇所の表示 — 設計

## 中継と保持

`GET /v1/origins/{origin_id}/pdf` は D1 の `origin` から URL・形式を読む。URL を入力として受けず、query の追加も拒否する。PDF の HTTP(S) URL の直接取得だけを対象とし、認証情報、非標準ポート、IP アドレス、localhost、内部向けホスト名を拒否する。リダイレクトは追わない。自治体側の移転には原典 URL を案内する。この境界なら、公開 URL に付随する任意の転送先を中継する権限を持たずに済む。

表示用の SQLite Durable Object `OriginPdfRelay` を1つ使う。取得 URL をキーに成功した PDF・取得日時を24時間保持し、期限後は条件付き要求を使わず全文を再取得する。成功には HTTP 200、PDF の Content-Type、先頭の `%PDF-` が必要。ファイル内容と取り込み時の sha256 は比較しない。非公開 R2 は参照しない。

全リクエストを直列化し、同じ URL の同時閲覧も1回の取得で満たす。要求上限は全利用者合計120回/分、自治体への取得試行は全 URL 合計6回/分、同じ URL は1回/分。固定の60秒窓で Durable Object の storage に記録し、再起動でも制約を保つ。取得失敗時は試行回数だけを残し、成功キャッシュは作らない。各取得は接続と本文読取りを含め20秒、実読取り32 MiBまで。Content-Length は早期拒否にも使い、実読取りでも上限を確かめる。上限超過は429/502/504で返し、UIでは表示失敗として URL と頁番号を案内する。

有効なキャッシュは最大16 URL（最大512 MiB）。満杯時は新規取得を断り、期限内のPDFを追い出して再取得を増やすことを避ける。64 KiB の分割値とメタデータを同一トランザクションで保存する。期限切れは要求時と alarm で削除する。保持期限を過ぎたPDFは返さず、取得失敗でも古いPDFを使わない。Cloudflare の基盤によるバックアップはサービスの表示・再利用経路に含めない。

中継には既存の提供停止スイッチを適用する。ブラウザ向けは資格情報なしの CORS `*` とし、取得 URL・取得日時を公開ヘッダーで返す。応答は `no-store` にし、再利用と期限は中継側だけが管理する。MCP の tool や既存 REST の schema は変更しない。

## View と描画

PDF.js 6.4.299（2026-10-03公開、7日経過）を使う。HTML、描画コード、PDF worker のコードを同梱し、外部 CDN・iframe PDF・ブラウザ内蔵ビューアには依存しない。MCP Apps の CSP に API の origin だけを `connectDomains` として宣言する。sandbox で worker の起動許可に依存しないよう、PDF.js の worker handler を同梱して同じスレッドで処理する。PDF.js 6 は動的evalを使わない。外部フォント・Wasm取得なしで canvas を描く。文字選択・検索・注釈操作の層は作らない。

明細の「原典を表示」で既存結果の上に表示領域を開く。項目の頁と金額の頁を切り替えられ、同じ頁なら両方の枠を重ねる。頁はファイルの1始まり。座標は取り込みの左上原点ptを、表示頁の幅・高さに対する比率にして重ねる。4座標が有限・非負で、正の幅と高さがあり、頁内に収まる枠だけを表示する。項目の `source_y0 > source_y1`、欠損・不完全な枠は頁だけを表示する。金額は金額の頁・完全な枠があるときだけ重ねる。

PDF の取得 URL・取得日時、取り込み時と異なる可能性を表示する。読込み・描画・頁範囲のエラーや上限超過でも原典リンクと項目/金額の頁番号を残す。閉じる操作と別の明細を開く操作で、進行中の取得・描画とPDFのメモリを解放し、遅い応答が新しい表示を上書きしないようにする。CSV・頁不明は既存の原典リンクを使う。

## 検証

既存 API/MCP テストと View 再生成検査を維持する。Miniflare の Worker・D1・Durable Object をローカルで起動し、独立した試験用自治体 HTTP サーバーへ中継の実要求を流す。合成PDFで頁/枠/欠損/次頁継続/回転頁、失敗/任意URL拒否/サイズ/時間/頻度/キャッシュ期限を検証する。MCP Apps の AppBridge と CSP・sandbox を持つ試験 host で生成された View を開き、e2e と Orca 内蔵ブラウザで確認する。実在の自治体PDFでも描画を確認する。Claude Web/Desktop・ChatGPTの実接続は、利用可能な接続がある場合だけ実施し、未実施は明記する。

参照: [PDF.js の描画例](https://mozilla.github.io/pdf.js/examples/)、[MCP Apps CSP](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiResourceCsp.html)、[Durable Objects の制約](https://developers.cloudflare.com/durable-objects/platform/limits/)、[SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)。
