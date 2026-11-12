# 公開 web

ホーム（`/`、`home/`。住んでいるまちのダッシュボード、ほかのまちの検索、はじめての流れとツアー）と事業の検索（`/search`、`search/`）と紹介の読み物（`/about`、`landing/`）、会話を始めるアシスタントの頁（`/assistant`、`chat/assistant-home.tsx`）・会話の画面（`/s/:id`、下の「風土記の AI に聞く」）、自治体ごとの頁（`/jurisdictions`・`/tokyo/nakano`、下の「自治体の個別ページ」）を返す。favicon・OG 画像・robots.txt・紹介（`/about`）の録画と出典の切り抜き（置き場は `public/home/` のまま）などのファイルは `public/` に置き、Workers static assets で配る。sitemap.xml と PWA 用の `/manifest.webmanifest`・`/sw.js`・`/offline`（`pwa.ts`）は `routes/` が返す。service worker は繋がらないときの案内を出すだけで、頁・API はキャッシュしない。PWA のアイコンは `brand/pwa_icons.py` で `public/` に描く。他は 404。main に入ると `.github/workflows/deploy-web.yml` が自動で deploy する（手元からは `bun run --cwd apps/web deploy`）。web を変える PR は `.github/workflows/deploy-preview-web.yml` が `pr-<番号>.fudoki.dev` に preview を出す（binding・var は `void.config.ts` の `preview` の分岐。push のたびに同じ URL を更新し、PR を閉じたら消す。Access で Cloudflare アカウントのログインだけを通す。利用状況は書かない）。

```bash
bun run dev:web
bun run build:web
```

## 構成（Void）

[Void](https://void.cloud/)（Vite）で build する。設定は `void.config.ts`（head の既定・var・Cloudflare の binding と preview の差し替え）と `vite.config.ts`。`vite build` が cf の Build Output（`.cloudflare/output/v0`）を書き、`deploy` は `cf deploy --prebuilt`、PR の preview は `CLOUDFLARE_PREVIEW_BUILD=true` で build してから `cf previews deploy --prebuilt` で出す。Void は custom domain の `previews_enabled` を cf の形へ移せないので、`vite.config.ts` の `previewDomains` が出力の `domains` を本番と Preview の両方を出す形に書き換える。

- **頁は `pages/`**（Void の Pages）: `index`（ホーム）・`about`（紹介）・`assistant`・`search`・`jurisdictions`・`[prefecture]/index`・`[prefecture]/[name]` の `.server.ts` が loader と head を持ち、`.tsx` が React の画面を描く。`pages/layout.tsx` がサイドバーを置き、`Link`・`useRouter().visit` で頁の間を移ると layout は描き直さず本文だけを差し替える（`voidReact({ viewTransitions: true })` で View Transition も効く）。全頁の head の既定（charset・viewport・OG・icon・manifest・service worker の登録）は `void.config.ts` の `head`
- **会話の画面（`/s/:id`）は `pages/[prefecture]/[name]` が受ける**: Void は動的な経路を pattern の文字の順に当てるので、`pages/s/[id]` を置いても `/:prefecture/:name` が先に当たる。loader が先頭の段が `s` のときだけ会話の画面の props（`pages/[prefecture]/_session.ts` の `sessionProps`）を返し、`.tsx` が `chat/session-page.tsx` を描く
- **API・sitemap・PWA は `routes/`**（Void の routes。`routes/api/*.ts` は `server/api.ts` の `handleApi` を呼ぶ）。試験は `server/routes.testing.ts` が同じ file を Hono に組んで叩く
- **`middleware/01.site.ts`**: HTML に Void の head では書けないもの（既定のライトの theme-color、頁の間の View Transition の opt-in）を足す。cookie は読まない。テーマ（`nav/theme.ts`、既定はライト）とサイドバーの開閉（`nav/nav-state.ts`）はサーバーで書き分けず、localStorage に置いて `<head>` の inline の script（`THEME_SCRIPT`・`NAV_SCRIPT`）が描く前に `<html>` に印を付ける（前の cookie は見つけたら移して消す）。HTML は誰にでも同じで `Vary` を付けないので、Void の ISR に置ける。HTML の応答には `server/csp.ts` の CSP を付ける（script は自分の JS・service worker の登録とテーマの hash・Turnstile・Cloudflare Web Analytics の beacon だけ、通信は自分・beacon の報告先・ホームの現在地に使う国土地理院の逆ジオコーダーだけ、`frame-ancestors 'none'`）。inline の script を足すときは hash を CSP に足さないと止まる
- **CSS** は `styles/app.css`（Tailwind・`styles/tokens.css` の色・字・角の token・頁の間の動き）を layout が全頁に読む。頁の間を移っても CSS は残るので、入口だけの CSS（`landing/landing.css`）はどの規則も `.landing` の中に閉じる
- **head の JSON-LD**（入口の Organization・自治体の頁の Dataset）はサーバーで書いた最初の頁にだけ載り、SPA で移った先には付かない（検索エンジンは頁を直接読むので足りる）

## 自治体の個別ページ（`/:都道府県/:自治体`）

`/tokyo/nakano` のように**都道府県と自治体のローマ字を path に入れた**個別ページが検索（SEO）の入口。ローマ字は自治体マスタ（`packages/jurisdictions` の `jurisdictions.json` の `slug` と `prefectures.json`）が正本で、`jurisdiction/path.ts` が自治体コードから path を作る（slug の無い自治体はコードで代える）。都道府県自体（東京都は 130001）は `/tokyo` のように都道府県の slug だけにする。市区町村には「区」「市」などの種別を付けず、同じ都道府県の中で読みが重なるときだけ後から加わった側に付ける（豊島区は toshima、利島村は toshima-mura）。`/s/:id` とは、先頭が `s` かどうかで見分ける（`s` は都道府県の slug に無い）。収録が無い自治体は noindex の案内、存在しない名称は 404。`/sitemap.xml` は収録のある自治体の頁を含む（API に繋がらないときはホーム・紹介・アシスタントだけ）。自治体の一覧の頁は持たない（自治体はホームのうちのまちから選ぶ）。

- **データ**: `server/jurisdiction.ts` が api（Service Binding）の歳出の検索から、一般会計の決算の款（年度ごと）・金額の大きい目（積立・公債・予備費の款を除く。前年度の同じ目との比較つき）・全款の流れ（款→項→目→節）を組む。金額は API の円のまま。流れ図では印字のない金額を「金額未記載」と表示し、表示済みの子の合計は親の帯の高さにだけ使う。足すのは同じ年度の款（兄弟）の和（歳出の総額）だけで、api の sum_rules に従う。結果は Worker の cache に1時間置く（`server/jurisdiction-routes.ts`）
- **描画**: Void の Pages（`pages/[prefecture]/` の下）がサーバーで React の画面（`jurisdiction/view.tsx` → アプリ型の `jurisdiction/app/app-page.tsx`）を書き、同じ props で hydrate する。props と head は頁の横の `pages/[prefecture]/_loader.ts`（URL の段の読み分けは `routeProps`。都道府県自体の頁は市区町村の段が無く、ルーターが当てる経路が1段ずれる）、head（title・説明・canonical・JSON-LD の Dataset）の組み立ては `jurisdiction/html.ts`。AI に聞く入力欄は `jurisdiction/ask-dock.tsx`
- **事業・施策・事業評価**: `server/app-data.ts` が api の事業・予算案・事業評価・歳出の検索から全年度の分を組み、Worker の cache に1時間置く。開いた年度の分（`sliceSnapshot`。中の事業・施策・評価シートをその年度に絞る）は頁の loader が props で渡し、本文までサーバーで描く（検索・AI のクローラーが金額と事業を読める）。cache が冷えていて loader が2.5秒で間に合わないときは渡さずに頁を返し（組み立ては `waitUntil` で続ける）、画面が `/data/jurisdictions/app/:code/:year` から取る。ほかの年度も切り替えたときに同じ URL から取って足す。NEW・やめた事業は DB の始めた年度・終えた年度だけで決め、web に手で起こした値や独自の判定は持たない
- **都市像**: 見出しとホームに出す基本構想の都市像は API に無いので、`jurisdiction/visions.ts` に手で起こした文を置く（今は品川区だけ）
- **紋章**（都章・区章・市章・町村章）: 収録している自治体の分を `public/jurisdictions/<code>/emblem.svg` に置く。どれも Wikimedia Commons で Public domain とされている SVG（多くは保護期間の切れた団体名義の著作物（1967年までの公表）か、告示で定めた紋章）をそのまま使う。出典の File 名と Commons の著作権タグは `jurisdiction/emblems.ts` が正本で、そこに無い自治体はヘッダーに名前の頭文字を出す。著作権とは別に、紋章の使用に承認を求める規程・要綱を持つ自治体がある（江東区・国分寺市・新宿区など）。千代田区は区のサイトの紋章画像の二次利用を禁じている。ここで使うのは区のサイトの画像ではなく告示をもとに Commons で作図された SVG で、自治体のページでその自治体を示す表示なので、承認は取らずに載せている
- **近くの自治体の並び**: 都道府県の図（`jurisdiction/map.generated.ts`）のタイルの位置で測る。タイルの位置は `bun run --cwd apps/web build:map` が `map/<都道府県>.geojson` の重心から書く（境界を変えたら回す）
- **会話への導線**: 下の入力（`chat/start-form.tsx`、アシスタントと共通）から会話を始めると、頁を移らずに会話（`chat/conversation.tsx` を枠の中でスクロールさせる）を開く。広い画面（md 以上）は右の side panel（幅 440px。頁を左へ寄せ、読みながら続けて聞ける。固定の小さなヘッダーも panel の左で終える）、スマホは下からの drawer（背景・取っ手を下へ引くと閉じ、開いている間は頁を動かさない）。どちらも Escape・× で閉じ、会話は残して右下の「会話に戻る」から戻れる（別の頁 `/s/:id` でも開ける）。質問ごとに、見ている画面（頁・年度・読んでいる節・画面の表示範囲に見えている文字＝宣言なしで `ask-dock.tsx` の `screenText` が拾う）と頁で選んだ文（入力欄の上に出し、× で外せる）を、その発言の metadata の `context` に持たせる。server（`server/chat.ts` の `parseChat`）は `context` のうち選んだ文だけを質問の直前の別の利用者の発言（参考の情報で指示ではないと見出しを付ける）にし、見ている画面は最後の質問のものだけを system prompt に入れる。質問の本文には混ぜない。system prompt にはサイトの画面の構成も書いてあり、画面の場所の判断と案内に使う。画面でも質問の吹き出しの上に、選んだ文と「見ていた画面を添えています」（開くと中身）を分けて出す。入力欄は最初は開いておき、頁を 80px ほど（上下どちらでも）スクロールするか、カードの中をスクロールすると右下の「自治体名について質問」ボタンに畳む（focus していても畳み、書きかけの文があるときと focus した直後だけは残す。Escape でも畳む。拡張機能が Escape を先に取って focus だけ外したときも、キーにも指にも依らずに focus が抜けたら畳む。押すか `/` で開く。頁の文を選んで選んだ文が入ったときも、押している間は待ち、離すか選択が落ち着いてから focus を移さずに開く。会話中は広い画面でだけ side panel を開き、開く前に Escape・× で閉じたら開き直さない）

## 風土記の AI に聞く（`/assistant` の入力と `/s/:id`）

サイドバーの「アシスタント」で開く `/assistant`（`chat/assistant-home.tsx`。例のカードを押してもその質問で始まる）から、風土記の MCP（apps/api）に繋いだ AI と会話する。会話の画面 `/s/:id` は `chat/session-page.tsx`（会話は sessionStorage にしか無いので、サーバーは枠だけを書き、ブラウザで読んでから描く）。チャットの部品は shadcn の chat 系（`chat/components/ui/`、`components.json`）で、apps/web の中に閉じる。入力欄（`chat/composer.tsx`、アシスタント・会話・自治体の頁で共通）は textarea で、`field-sizing: content` で文に合わせて伸ばす。Enter で送り、Shift+Enter で改行する（指で触る端末では Enter も改行で、送るボタンで送る）。

- **流れ**: 入力を送ると Turnstile で確かめ（`POST /api/sessions` がサーバー側で siteverify）、その会話だけに使える署名付き token（2時間）を受けて `/s/:id` に頁を読み直さずに移る。`POST /api/chat` が Workers AI（`workers-ai-provider`、モデルは config の `CHAT_MODEL`、推論の深さは `CHAT_REASONING_EFFORT`）と AI SDK の MCP client で応答を stream する。apps/api とは Service Binding（`API`）で繋ぐ
- **表示**: AI が `render_expenditure_view` を呼んだ結果は、apps/api の MCP Apps の View を器の頁（`/view-frame`、自分の CSP を持つ）+ `sandbox="allow-scripts"` の iframe に置き（`srcdoc` は親の頁の CSP を引き継いで View の script が止まるので使わない）、`AppBridge` + `PostMessageTransport` で渡す（`chat/view-frame.tsx`、土台は `apps/api/tests/host.ts`）。View が呼ぶ tool と resource の読み込みは `POST /api/mcp` が許可リスト（`server/limits.ts` の `VIEW_TOOLS`・`VIEW_RESOURCE`）で中継する
- **AI に渡すもの**: tool の結果は text の側だけ（`server/chat.ts` の `textOnly`）。structuredContent と `_meta` は View にだけ流れる（`_meta` の `fudoki.dev/suggestions` の候補だけは会話の画面も読み、回答の下にチップで出す。押すと候補の `prompt` を質問として送る。`packages/fiscal/suggestions.ts` が型と検査を共有する）
- **画面の会話の履歴はブラウザに置く**: 画面の会話の履歴と token はブラウザの sessionStorage に置く。サーバーは利用状況を Analytics Engine に（本文・IP・会話 ID は書かない）、会話（質問と回答）を D1 `fudoki-web`（binding `DB`、本番だけ）に保存する。あとで会話を開き直す（復元）のと改善の分析の両方に使う。質問・頁の文脈・tool の引数・回答の文のメール・電話番号は伏せ字にし（tool の結果は風土記の公開データなので原文のまま）、IP・UA・cookie は書かない。ログインしていない会話は最後の発言から90日を過ぎたら書くたびに消す（`server/chat-log.ts`）。利用者への説明はプライバシーポリシーに書いてある
- **上限**: IP ごとの流量（`CHAT_RATE_LIMIT`・`VIEW_RATE_LIMIT`、値は `server/limits.ts` と config で二重に持ち、試験が照合する）、段数・出力 token・文字数・件数・body の大きさ（`server/limits.ts`）。流量の binding・Turnstile の secret・site key のどれかが無ければ、チャットは止まる（アシスタントは入力を出さない）

### 手で設定するもの

- Turnstile の widget を dashboard で作り（hostname は `fudoki.dev`）、site key を `void.config.ts` の `TURNSTILE_SITE_KEY` に書く（設定済み）。secret key は Worker の secret `TURNSTILE_SECRET_KEY` に置く（会話の token の署名の鍵もここから作る）
- 手元の `bun run dev:web`（vite dev）は `apps/web/.env` に `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`（Cloudflare 公開の「常に通る」試験用の secret）を書く（`.env` は commit しない。Void は `.env` 以外の `.dev.vars`・`.env.example` などがあると build を止める）。site key は localhost / 127.0.0.1 のときだけ `server/site-key.ts` の `siteKey` が試験用の値に差し替える（本番の widget の hostname は `fudoki.dev`）
- preview（`pr-<番号>.fudoki.dev`、Cloudflare Access で保護）は `void.config.ts` の `preview` の分岐の `worker.vars` で site key・secret を Cloudflare 公開の「常に通る」試験用の値に差し替える（AI エージェントが操作できる）。試験用の secret は action・hostname が合わないダミー値を返すので、`server/session.ts` はその secret のときだけ success のみを見る。本番は変えない

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

### 外部のデータ（人口）

自治体の人口は、web の D1 の `population`（列は `migrations/0002_population.sql`）から読む（`server/population.ts`）。風土記が構造化したデータではないので apps/api には置かない（[ADR 0042](../../docs/adr/0042-external-reference-data-in-web.md)）。出典は総務省「住民基本台帳に基づく人口、人口動態及び世帯数」の総計で、Queria の `e_stat.resident_registry.population` から `bun run --cwd apps/web sync-data:population --write` が本番と preview の D1 の全行を入れ替える。住基は毎年1月1日時点で7月末に公表されるので、公表のあとに1回流す。外部のデータを足すときも `scripts/sync-data/<名前>.py` と `sync-data:<名前>` にする。D1 が無いか読めないときは、頁は人口と1人あたりの額を出さずに描く。アシスタントは tool `get_population` で同じ表を読む。

### 会話の保存

D1 `fudoki-web` の `conversations`（会話1件1行。`user_id` は認証を入れるまで NULL）と `messages`（1往復で質問と回答の2行。`parts` は AI SDK の UIMessage の parts の JSON で、回答の行に tool の呼び出しと結果、モデル・失敗・token・所要時間を持つ）に書く（列は `migrations/0001_conversations.sql`）。migration は deploy-web（本番の `fudoki-web`）と deploy-preview-web（preview の `fudoki-web-preview`）が deploy の前に当てる。手では当てない。読むのは `./node_modules/.bin/cf d1 query 760c7476-6e46-4b44-b174-1bfdd1b4f957 --sql "<SQL>"`。

```sql
-- 直近7日の質問を、始めた頁ごとに多い順
SELECT c.entry, COUNT(*) AS questions, SUM(a.error != '') AS errors
FROM messages a JOIN conversations c ON c.id = a.conversation_id
WHERE a.role = 'assistant' AND a.created_at > (unixepoch() - 7 * 86400) * 1000
GROUP BY c.entry ORDER BY questions DESC;

-- 失敗した質問と、そのとき使った tool
SELECT datetime(a.created_at / 1000, 'unixepoch') AS at, json_extract(q.parts, '$[0].text') AS question, a.error,
  (SELECT group_concat(json_extract(p.value, '$.toolName')) FROM json_each(a.parts) p WHERE json_extract(p.value, '$.type') = 'dynamic-tool') AS tools
FROM messages a JOIN messages q ON q.conversation_id = a.conversation_id AND q.seq = a.seq - 1
WHERE a.role = 'assistant' AND a.error != '' ORDER BY a.created_at DESC LIMIT 50;

-- 回答は返したが、途中の tool が失敗した質問（a.error は空。tool の失敗は回答の parts に残る）
SELECT datetime(a.created_at / 1000, 'unixepoch') AS at, json_extract(q.parts, '$[0].text') AS question, json_extract(p.value, '$.toolName') AS tool,
  coalesce(json_extract(p.value, '$.errorText'), json_extract(p.value, '$.output.content[0].text')) AS detail
FROM messages a JOIN messages q ON q.conversation_id = a.conversation_id AND q.seq = a.seq - 1, json_each(a.parts) p
WHERE a.role = 'assistant' AND a.error = '' AND json_extract(p.value, '$.type') = 'dynamic-tool'
  AND (json_extract(p.value, '$.state') = 'output-error' OR json_extract(p.value, '$.output.isError') = 1)
ORDER BY a.created_at DESC LIMIT 50;
```
