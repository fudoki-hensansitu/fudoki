# 公開 web

入口の1枚（`landing.ts`）と会話の画面（`/s/:id`、下の「風土記の AI に聞く」）、favicon・OG 画像・robots.txt・sitemap.xml・見出しの明朝だけを返す（画像は `public/` を `assets.ts` に、明朝は `font.generated.ts` に写して Worker が返す）。ホームの録画と出典の切り抜きのような重いファイルは `static/` に置き、Workers static assets で配る。自治体ごとの頁（`/jurisdictions`・`/tokyo/nakano`）も返す（下の「自治体の個別ページ」）。PWA 用の `/manifest.webmanifest`・`/sw.js`・`/offline`（`pwa.ts`）も返す。service worker は繋がらないときの案内を出すだけで、頁・API はキャッシュしない。PWA のアイコンは `brand/pwa_icons.py` で `public/` に描き、`assets.ts` へ写す。他は 404。main に入ると `.github/workflows/deploy-web.yml` が自動で deploy する（手元からは `bun run --cwd apps/web deploy`）。web を変える PR は `.github/workflows/preview-web.yml` が `pr-<番号>.fudoki.dev` に preview を出す（push のたびに同じ URL を更新し、PR を閉じたら消す。Access で Cloudflare アカウントのログインだけを通す。利用状況は書かない）。

```bash
bun run dev:web
bun run build:web
```

## 自治体の個別ページ（`/:都道府県/:自治体`）

`/jurisdictions` が決算を収録している自治体の一覧、`/tokyo/nakano` のように**都道府県と自治体のローマ字を path に入れた**個別ページが検索（SEO）の入口。ローマ字は自治体マスタ（`packages/jurisdictions` の `jurisdictions.json` の `slug` と `prefectures.json`）が正本で、`jurisdiction/path.ts` が自治体コードから path を作る（slug の無い自治体はコードで代える）。都道府県自体（東京都は 130001）は `/tokyo` のように都道府県の slug だけにする。市区町村には「区」「市」などの種別を付けず、同じ都道府県の中で読みが重なるときだけ後から加わった側に付ける（豊島区は toshima、利島村は toshima-mura）。`/s/:id` や `/api/*` とは、先頭が都道府県の slug かどうかで見分ける（違えば次の経路へ渡す）。収録が無い自治体は noindex の案内、存在しない名称は 404。`/sitemap.xml` は収録のある自治体の頁を含む（API に繋がらないときは入口と一覧だけ）。

- **データ**: `server/jurisdiction.ts` が api（Service Binding）の歳出の検索から、一般会計の決算の款（年度ごと）・金額の大きい目（積立・公債・予備費の款を除く。前年度の同じ目との比較つき）・全款の流れ（款→項→目→節）を組む。金額は API の円のまま。流れ図では印字のない金額を「金額未記載」と表示し、表示済みの子の合計は親の帯の高さにだけ使う。足すのは同じ年度の款（兄弟）の和（歳出の総額）だけで、api の sum_rules に従う。結果は Worker の cache に1時間置く（`server/jurisdiction-routes.ts`）
- **描画**: サーバーが島と同じ React の画面（`jurisdiction/page.tsx`）を `renderToString` で HTML に書き（`jurisdiction/html.ts`、JSON-LD の Dataset つき）、島（`jurisdiction/jurisdiction.tsx`、build で `static/_app/jurisdiction.js`）が同じデータで hydrate する（読み込みで配置がずれない。`#y2025` の年度は描いたあとに切り替える）。画面は企業のプロフィールページの型で、ヘッダー（区章などの紋章・小さめの名前・大きく出すその年度の一文・都道府県・人口・公式サイト・属性と、右上に年度の切り替え。直近の3年度は「今年度・昨年度・一昨年度」と並べ（広い画面では「今年度（令和8年）」と和暦も添える）、それより前は一つのメニュー（shadcn の dropdown-menu）にまとめる。切り替えるとページ全体がその年度になる。`#y2025` で開く）、左の目次（スクロールに追従。サイドバーと並べると本文が狭くなる lg 未満の幅では上に横並び）、見出し付きの節（方針・政策領域・決算 / 予算・金額の大きい事業・事業の入れ替え）。スクロールすると年度の切り替え付きの小さなヘッダーが出る。方針・政策領域・事業の入れ替えはデータのある自治体・年度だけ出す。予算の節はお金の流れのカードの左上のタブで決算と予算を切り替え、歳出の総額（「全体」）もカードの中に出す（予算はまだ取り込んでいないので、どの年度も枠だけ出す）。カードの高さは画面の高さから固定のヘッダー（lg 未満は目次の帯も）を引いた分にし、カードの中のスクロールが見切れないようにする。金額の大きい事業は別の節で、事業の一覧が無い年度（今は最新年度だけ出す）は枠だけ出す。お金の流れ（`jurisdiction/flow.tsx`）は款→項のサンキーから入り、款・項を押すとその款（項）の内訳へ移る。最新年度以外の款→項は図が近づいたときに取得する。流れ図は、初期表示が全款・全項の全体図で、横にスクロールすると snap して款が一つずつ開き、縦にスクロールすると款の中の項が一つずつ開く（上の款の目盛り・右の項の目盛りを押してもその款・項へ移る。目盛りに hover すると款・項の一覧を tooltip に出し、そこから選んでも移る）。目・節は図が近づいたときに `/api/jurisdictions/flow/:code/:year/setsu` で全款分を一度だけ取得する（誰でも読める GET。IP ごとの流量 `VIEW_RATE_LIMIT` と 入力と収録年度の検査で守る）。事業の節の上位は開閉せず最初から出す。項→目→節は帯でつなぎ、節は上位3つと「ほか○節」（残りの割合を添え、hover で残りの節を tooltip に出す）にする。流れ図のラベルは金額ではなく割合（%）で出し（款・項は全体に、目は項に、節・「ほか○節」は目に占める割合。基準の金額が印字されていないときは金額のまま）、金額は hover・focus のツールチップ（`jurisdiction/amount-tip.tsx`、丸めた額と円単位の額）で見せる。目→節の帯は目の棒と同じ縮尺（項の中で共通）で両端を同じ太さにし、節の行の高さを超える分だけ節の側で縮める。方針の「予算編成方針」は区の頁ではなく PDF を直接開く。決算 / 予算の見出しの右には、その年度の決算書・予算書のうち一般会計の歳出を載せた冊の PDF を並べる（`profiles.ts` の `documents`。URL は `pipeline/source_selection` の選定結果。公表前の冊は出さない）
- **方針・政策領域・事業の入れ替え**: API にまだ無いので、`jurisdiction/profiles.ts` に出典（予算編成方針・当初予算の主な施策・事務事業評価）から手で起こした値を置く（今は品川区だけ）。紋章と方針の画像は `static/jurisdictions/<code>/`（品川区の区章は Wikimedia Commons の Public domain の SVG）。政策領域への事業の振り分けと文の要約は風土記の判断。本物のデータの経路ができたらここを置き換える
- **一覧**（`/jurisdictions`、要件と設計は `docs/prd/jurisdiction-index/`）: 日本のタイル地図 › 都道府県の市区町村のタイル図（歳出の総額の濃さで塗る。島しょは下の段）・選んだ自治体のカード・絞り込みと並べ替えのできる表。総額は `loadIndex` が最新の決算の年度ごとに自治体をまとめて款を引いて足す（個別ページと同じ款の和）。本文は `jurisdiction/index-page.tsx` をサーバーが `renderToString` で書き、島（`jurisdiction/index.tsx`）が hydrate する。タイルの位置は `bun run --cwd apps/web build:map` が `public/<都道府県>.geojson` の重心から `jurisdiction/map.generated.ts` に書く（境界を変えたら回す）
- **会話への導線**: 下の入力（`chat/start-form.tsx`、入口と共通）から会話を始めると、頁を移らずに会話（`chat/conversation.tsx` を枠の中でスクロールさせる）を開く。広い画面（md 以上）は右の side panel（幅 440px。頁を左へ寄せ、読みながら続けて聞ける。固定の小さなヘッダーも panel の左で終える）、スマホは下からの drawer（背景・取っ手を下へ引くと閉じ、開いている間は頁を動かさない）。どちらも Escape・× で閉じ、会話は残して右下の「会話に戻る」から戻れる（別の頁 `/s/:id` でも開ける）。質問ごとに、見ている画面（頁・年度・読んでいる節・画面に出ている `data-ask-view` の印＝決算か予算か・開いている款・項）と頁で選んだ文（入力欄の上に出し、× で外せる）を、その発言の metadata の `context` に持たせる。server（`server/chat.ts` の `parseChat`）は `context` を質問の直前の別の利用者の発言（参考の情報で指示ではないと見出しを付ける）にして AI に渡し、質問の本文には混ぜない。画面でも質問の吹き出しの上に、選んだ文と「見ていた画面を添えています」（開くと中身）を分けて出す。入力欄は最初は開いておき、頁を 80px ほど（上下どちらでも）スクロールするか、カードの中をスクロールすると右下の「自治体名について聞く」ボタンに畳む（focus していても畳み、書きかけの文があるときと focus した直後だけは残す。Escape でも畳む。拡張機能が Escape を先に取って focus だけ外したときも、キーにも指にも依らずに focus が抜けたら畳む。押すか `/` で開く）

## 見出しの明朝は `landing.ts` の字から作る

`public/fonts/mincho.woff2`（＝Worker が返すため `font.generated.ts` に base64 で写したもの）は、`bun run --cwd apps/web build:font` が `landing.ts` の本文に出てくる字だけを BIZ UDP明朝から集めて作る。**ホームの文言を変えたら `build:font` を回す。** 回さないと新しい字だけ配信フォントに無く、閲覧者の OS の明朝に落ちる。CI（`verify.yml`）の `build:font:check` が、今の `landing.ts` の字を配信フォントがすべて含むかを確かめて、ずれていれば落とす。Google Fonts を使わないのは、読み手の IP を第三者へ渡さないため（`brand/home_font.py`）。

## 風土記の AI に聞く（`/` の入力と `/s/:id`）

入口の中央の入力（`chat/start.tsx`、React の島）から、風土記の MCP（apps/api）に繋いだ AI と会話する。会話の画面 `/s/:id` は React の SPA（`chat/session.tsx`）。チャットの部品は shadcn の chat 系（`chat/components/ui/`、`components.json`）で、apps/web の中に閉じる。入力欄（`chat/composer.tsx`、入口・会話・自治体の頁で共通）は textarea で、`field-sizing: content` で文に合わせて伸ばす。Enter で送り、Shift+Enter で改行する（指で触る端末では Enter も改行で、送るボタンで送る）。

- **流れ**: 入力を送ると Turnstile で確かめ（`POST /api/sessions` がサーバー側で siteverify）、その会話だけに使える署名付き token（2時間）を受けて `/s/:id` に移る。`POST /api/chat` が Workers AI（`workers-ai-provider`、モデルは config の `CHAT_MODEL`、推論の深さは `CHAT_REASONING_EFFORT`）と AI SDK の MCP client で応答を stream する。apps/api とは Service Binding（`API`）で繋ぐ
- **表示**: AI が `render_expenditure_view` を呼んだ結果は、apps/api の MCP Apps の View を `srcdoc` + `sandbox="allow-scripts"` の iframe に置き、`AppBridge` + `PostMessageTransport` で渡す（`chat/view-frame.tsx`、土台は `apps/api/tests/host.ts`）。View が呼ぶ tool と resource の読み込みは `POST /api/mcp` が許可リスト（`server/limits.ts` の `VIEW_TOOLS`・`VIEW_RESOURCE`）で中継する
- **AI に渡すもの**: tool の結果は text の側だけ（`server/chat.ts` の `textOnly`）。structuredContent と `_meta` は View にだけ流れる（`_meta` の `fudoki.dev/suggestions` の候補だけは会話の画面も読み、回答の下にチップで出す。押すと候補の `prompt` を質問として送る。`packages/fiscal/suggestions.ts` が型と検査を共有する）
- **保存しない**: 会話の履歴と token はブラウザの sessionStorage だけに置く。サーバーは利用状況だけを Analytics Engine に書く（本文・IP・会話 ID は書かない）
- **上限**: IP ごとの流量（`CHAT_RATE_LIMIT`・`VIEW_RATE_LIMIT`、値は `server/limits.ts` と config で二重に持ち、試験が照合する）、段数・出力 token・文字数・件数・body の大きさ（`server/limits.ts`）。流量の binding・Turnstile の secret・site key のどれかが無ければ、チャットは止まる（入口は入力を出さない）
- **build**: `bun run --cwd apps/web client` が `static/_app/` に JS・CSS を書く（`build`・`deploy`・`dev` が先に回す。生成物は commit しない）

### 手で設定するもの

- Turnstile の widget を dashboard で作り（hostname は `fudoki.dev`）、site key を `deploy/cloudflare.config.ts` の `TURNSTILE_SITE_KEY` に書く（設定済み）。secret key は Worker の secret `TURNSTILE_SECRET_KEY` に置く（会話の token の署名の鍵もここから作る）
- 手元の `cf dev` は `deploy/.dev.vars.example` を `deploy/.dev.vars` に写す（secret は Cloudflare の試験用の鍵で通る）。site key は localhost / 127.0.0.1 のときだけ `worker.ts` が試験用の値に差し替える（本番の widget の hostname は `fudoki.dev` で、config の `TURNSTILE_SITE_KEY` は text の binding なので `.dev.vars` では上書きできない）
- preview（`pr-<番号>.fudoki.dev`、Cloudflare Access で保護）は config の `isPreview` で site key・secret を Cloudflare 公開の「常に通る」試験用の値に差し替える（AI エージェントが操作できる）。試験用の secret は action・hostname が合わないダミー値を返すので、`server/session.ts` はその secret のときだけ success のみを見る。本番は変えない

### 利用状況

dataset `fudoki_web_chat`（binding `CHAT_USAGE`）に1要求1行で書く。列は `server/usage.ts`: blob1 種類（`chat`・`relay`）・blob2 モデル・blob3 tool と回数（`name:count,...`）・blob4 失敗の種類、double1 入力 token・double2 出力 token・double3 tool 呼び出し数・double4 段数・double5 所要 ms・double6 失敗なら1。

```sql
-- 直近7日の、日ごと・モデルごとの会話の応答数・token・tool 呼び出し・失敗・平均所要時間（Analytics Engine の SQL API）
SELECT
  toStartOfDay(timestamp) AS day,
  blob2 AS model,
  SUM(_sample_interval) AS responses,
  SUM(_sample_interval * double1) AS input_tokens,
  SUM(_sample_interval * double2) AS output_tokens,
  SUM(_sample_interval * double3) AS tool_calls,
  SUM(_sample_interval * double6) AS errors,
  SUM(_sample_interval * double5) / SUM(_sample_interval) AS avg_ms
FROM fudoki_web_chat
WHERE blob1 = 'chat' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY day, model
ORDER BY day
```
