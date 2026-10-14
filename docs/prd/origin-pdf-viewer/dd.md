# 原典 PDF の該当箇所の表示 — 設計

## 中継と保持

`GET /v1/origins/{origin_id}/pdf` は D1 の `origin` から URL・形式を読む。URL を入力として受けず、query の追加も拒否する。PDF の HTTP(S) URL の直接取得だけを対象とし、認証情報、非標準ポート、IP アドレス、localhost、内部向けホスト名を拒否する。リダイレクトは追わない。自治体側の移転には原典 URL を案内する。この境界なら、公開 URL に付随する任意の転送先を中継する権限を持たずに済む。

表示用の SQLite Durable Object `OriginPdfRelay` を1つ使う。取得 URL をキーに成功した PDF・取得日時を24時間保持し、期限後は条件付き要求を使わず全文を再取得する。成功には HTTP 200、PDF の Content-Type、先頭の `%PDF-` が必要。ファイル内容と取り込み時の sha256 は比較しない。非公開 R2 は参照しない。

全リクエストを直列化し、同じ URL の同時閲覧も1回の取得で満たす。要求上限は全利用者合計120回/分、自治体への取得試行は全 URL 合計6回/分、同じ URL は1回/分。固定の60秒窓で Durable Object の storage に記録し、再起動でも制約を保つ。取得失敗時は試行回数だけを残し、成功キャッシュは作らない。各取得は接続と本文読取りを含め20秒、実読取り32 MiBまで。Content-Length は早期拒否にも使い、実読取りでも上限を確かめる。上限超過は429/502/504で返し、UIでは表示失敗として URL と頁番号を案内する。

有効なキャッシュは最大16 URL（最大512 MiB）。満杯時は新規取得を断り、期限内のPDFを追い出して再取得を増やすことを避ける。64 KiB の分割値とメタデータを同一トランザクションで保存する。期限切れは要求時と alarm で削除する。保持期限を過ぎたPDFは返さず、取得失敗でも古いPDFを使わない。Cloudflare の基盤によるバックアップはサービスの表示・再利用経路に含めない。

直列化は、取得中に既存PDFの閲覧も待つという制約を持つ。PoCでは同時取得による128 MBのisolateメモリ超過を避け、取得回数・保持件数と期限内再利用を一か所で守ることを優先した。HTTP Worker/DOに接続中の固定wall-time上限はないが、clientの切断や基盤の更新による中断はあり得る（[Cloudflareの制約](https://developers.cloudflare.com/workers/platform/limits/#wall-time-limits-by-invocation-type)）。利用の増加に伴う取得の並列化・保持件数の拡大は、上限とメモリを再設計して行う。16件は最大512 MiBに保持を制限する値で、LRUによる期限前の追出しは期限内再利用の約束を崩すため採用しない。

中継には既存の提供停止スイッチを適用する。ブラウザ向けは資格情報なしの CORS `*` とし、取得 URL・取得日時を公開ヘッダーで返す。応答は `no-store` にし、再利用と期限は中継側だけが管理する。MCP の tool や既存 REST の schema は変更しない。

## View と描画

PDF.js 6.4.299（2026-10-03公開、7日経過）を使う。HTML、描画コード、PDF worker のコードを同梱し、外部 CDN・iframe PDF・ブラウザ内蔵ビューアには依存しない。MCP Apps の CSP に API の origin だけを `connectDomains` として宣言する。sandbox で worker の起動許可に依存しないよう、PDF.js の worker handler を同梱して同じスレッドで処理する。PDF.js 6 は動的evalを使わない。外部フォント・Wasm取得なしで canvas を描く。文字選択・検索・注釈操作の層は作らない。Viewの容量はReact移行後に約2.5 MBとなるが、hostによるURIキャッシュと、外部script/worker許可に依存せず描画できることを優先して同梱を選んだ。

明細の頁番号で既存結果の上に表示領域を開く。項目と金額が別頁なら項目を左・金額を右に同時表示し、同じ頁なら同じcanvasに両方の枠を重ねる。単一の既知の頁は隣接頁と見開きにし、PDFが1頁だけなら1枚にする。閉じる・前の頁・次の頁を通常の操作とし、2頁ずつ送る。最後の見開きが1頁だけにならないよう末尾を調整する。頁はファイルの1始まり。座標は取り込みの左上原点ptを、表示頁の幅・高さに対する比率にして重ねる。4座標が有限・非負で、正の幅と高さがあり、頁内に収まる枠だけを表示する。項目の `source_y0 > source_y1`、欠損・不完全な枠は頁だけを表示する。金額は金額の頁・完全な枠があるときだけ重ねる。

描画後は項目の枠（項目が無ければ金額の枠）が表示領域内に来るようスクロールする。各頁の最小表示幅を保ち、狭いhostでは領域内を横スクロールする。拡大率の選択は置かない。表示領域は `min(70vh, 480px)` とし、hostの自動高さ調整とvhの循環で領域が伸びないようにする。canvasは表示中の頁の合計を最大400万pixel、各canvasの長辺を8192pixel以下とし、別の明細・閉じる操作で旧描画をcancelする。

PDF の取得 URL・取得日時、取り込み時と異なる可能性は「取得情報」にまとめ、通常は閉じる。失敗時は自動で開く。読込み・描画・頁範囲のエラーや上限超過でも原典リンクと項目/金額の頁番号を残す。閉じる操作と別の明細を開く操作で、進行中の取得・描画とPDFのメモリを解放し、遅い応答が新しい表示を上書きしないようにする。CSV・頁不明は既存の原典リンクを使う。

## 検証

既存 API/MCP テストと View 再生成検査を維持する。Miniflare の Worker・D1・Durable Object をローカルで起動し、独立した試験用自治体 HTTP サーバーへ中継の実要求を流す。合成PDFで頁/枠/欠損/次頁継続/回転頁、失敗/任意URL拒否/サイズ/時間/頻度/キャッシュ期限を検証する。MCP Apps の AppBridge と CSP・sandbox を持つ試験 host で生成された View を開き、e2e と Orca 内蔵ブラウザで確認する。実在の自治体PDFでも描画を確認する。Claude Web/Desktop・ChatGPTの実接続は、利用可能な接続がある場合だけ実施し、未実施は明記する。

参照: [PDF.js の描画例](https://mozilla.github.io/pdf.js/examples/)、[MCP Apps CSP](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiResourceCsp.html)、[Durable Objects の制約](https://developers.cloudflare.com/durable-objects/platform/limits/)、[SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)。

## React移行前の検証結果（2026-10-14）

- `mise x -- bun run typecheck:all`、`mise x -- bun run --cwd apps/api test`（138件）、`mise x -- bun run build:api`、`mise x -- bun run build:docs` が成功。APIテストには新旧MCP、既存REST/tool、表示情報、Viewの再生成検査を含む。
- `mise x -- bun run --cwd apps/api test:e2e` は19件成功。実Worker/D1/DOとAppBridgeのsandbox/CSPでPRDの6受入条件を検証。32 MiBちょうどの成功、Content-Lengthと実読取のサイズ超過、headers前/本文先頭後の20秒タイムアウト、任意URL/query/CSV/内部URL/redirectの拒否、失敗非保持、同時要求/同URL別IDの再利用、24時間の期限、頻度・16件保持の上限を確認した。
- 独立QA担当が製品実装を読まずに同じ19件を実行し、通常頁・別頁・枠欠損・次頁継続・回転頁・取得失敗・上限超過の画像を視認した。320/375/414/768 pxの表示も確認した。
- 実在PDFは試験serverを `PORT=4318 mise x -- bun apps/api/tests/server.ts --real` で起動し、`PDF_QA_URL=http://127.0.0.1:4318 REAL_PDF_QA=1 mise x -- bun run --cwd apps/api test:e2e tests/origin-pdf.e2e.ts` で確認した。武蔵野市の公開APIにある備品購入費の明細と原典URLを試験D1にだけ読み込み、自治体へ実取得して日本語・項目/金額枠を描画した。本番D1/R2は変更していない。
- Claude Web/Desktop・ChatGPTへの実接続、Cloudflare本番環境での実中継は未実施。Orcaのsnapshotでは操作できたが、screenshotが古い画像を返す場合があり、描画の視認にはe2eの実ブラウザ画像を使った。試験出力は非commitの `apps/api/.e2e/` に置く。

## React移行と見開き表示

表示・取得・描画の寿命をReactで管理する構成へ移した。狭い領域では見開きの内側で横スクロールし、既知の項目・金額の頁から見開きを開き、前後の頁へ送れる。詳細と今回のローカル検証は[React・shadcn/ui移行の設計](../mcp-ui-react-shadcn/dd.md)を参照する。上の移行前の確認結果を、移行後の実接続の根拠には使わない。


## プレビューと頁送りへの整理

2026-10-14の追加指定により、同頁・片方の頁が既知の場合も隣接頁と見開きにした。この指定は、移行当初の「既知の頁だけ」の制約を更新する。項目と金額が別頁なら、その既知の2頁を最初に並べる。頁送りは同じPDFDocumentから次の2頁を描画し、ネットワークで再取得しない。描画世代のcleanupは前のcanvasを解放し、合計400万pixel・長辺8192pixelの上限を続けて守る。

枠の幾何は原典のptから求める。2pxの線をその領域から2px離して外側に描くため、枠の疑似要素を4px外へ広げる。中心座標に縦横の点線を頁の端まで引く。塗りは置かず、枠とガイドはpointer eventを受け取らない。有効な頁と座標が無ければ、枠とガイドの両方を描かない。
