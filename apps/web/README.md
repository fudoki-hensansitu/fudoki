# 公開 web

入口の1枚（`/`、`landing/`）と会話を始めるアシスタントの頁（`/assistant`、`chat/assistant-home.tsx`）・会話の画面（`/s/:id`、下の「風土記の AI に聞く」）、自治体ごとの頁（`/jurisdictions`・`/tokyo/nakano`、下の「自治体の個別ページ」）を返す。favicon・OG 画像・robots.txt・見出しの明朝・ホームの録画と出典の切り抜きなどのファイルは `public/` に置き、Workers static assets で配る。sitemap.xml と PWA 用の `/manifest.webmanifest`・`/sw.js`・`/offline`（`pwa.ts`）は `routes/` が返す。service worker は繋がらないときの案内を出すだけで、頁・API はキャッシュしない。PWA のアイコンは `brand/pwa_icons.py` で `public/` に描く。他は 404。main に入ると `.github/workflows/deploy-web.yml` が自動で deploy する（手元からは `bun run --cwd apps/web deploy`）。web を変える PR は `.github/workflows/preview-web.yml` が `pr-<番号>.fudoki.dev` に preview を出す（binding・var は `void.config.ts` の `previews`。push のたびに同じ URL を更新し、PR を閉じたら消す。Access で Cloudflare アカウントのログインだけを通す。利用状況は書かない）。

```bash
bun run dev:web
bun run build:web
```

## 構成（Void）

[Void](https://void.cloud/)（Vite）で build する。設定は `void.config.ts`（head の既定・var・Cloudflare の binding と preview の差し替え）と `vite.config.ts`。`vite build` が `dist/ssr/`（Worker）・`dist/client/`（`public/` を含む assets）と `dist/ssr/wrangler.json` を書き、`deploy` は `wrangler deploy -c dist/ssr/wrangler.json`、PR の preview は `wrangler preview` が同じ file を読む。

- **頁は `pages/`**（Void の Pages）: `index`（入口）・`assistant`・`jurisdictions`・`[prefecture]/index`・`[prefecture]/[name]` の `.server.ts` が loader と head を持ち、`.tsx` が React の画面を描く。`pages/layout.tsx` がサイドバーを置き、`Link`・`useRouter().visit` で頁の間を移ると layout は描き直さず本文だけを差し替える（`voidReact({ viewTransitions: true })` で View Transition も効く）。全頁の head の既定（charset・viewport・OG・icon・manifest・明朝の preload・service worker の登録）は `void.config.ts` の `head`
- **会話の画面（`/s/:id`）は `pages/[prefecture]/[name]` が受ける**: Void は動的な経路を pattern の文字の順に当てるので、`pages/s/[id]` を置いても `/:prefecture/:name` が先に当たる。loader が先頭の段が `s` のときだけ会話の画面の props（`server/pages.ts` の `sessionProps`）を返し、`.tsx` が `chat/session-page.tsx` を描く
- **API・sitemap・PWA は `routes/`**（Void の routes。`routes/api/*.ts` は `server/api.ts` の `handleApi` を呼ぶ）。試験は `server/routes.testing.ts` が同じ file を Hono に組んで叩く
- **`middleware/01.site.ts`**: サイドバーの開閉の cookie を `useShared()` へ渡し、HTML に Void の head では書けないもの（ライト・ダークの theme-color の対、頁の間の View Transition の opt-in）を足す。開閉で HTML が変わるので `Vary: Cookie` を付ける。HTML の応答には `server/csp.ts` の CSP を付ける（script は自分の JS・service worker の登録の hash・Turnstile・Cloudflare Web Analytics の beacon だけ、`frame-ancestors 'none'`）。inline の script を足すときは hash を CSP に足さないと止まる
- **CSS** は `styles/app.css`（Tailwind・`styles/tokens.css` の色・字・角の token・頁の間の動き）を layout が全頁に読む。頁の間を移っても CSS は残るので、入口だけの CSS（`landing/landing.css`）はどの規則も `.landing` の中に閉じる
- **head の JSON-LD**（入口の Organization・自治体の頁の Dataset）はサーバーで書いた最初の頁にだけ載り、SPA で移った先には付かない（検索エンジンは頁を直接読むので足りる）

## 自治体の個別ページ（`/:都道府県/:自治体`）

`/jurisdictions` が決算を収録している自治体の一覧、`/tokyo/nakano` のように**都道府県と自治体のローマ字を path に入れた**個別ページが検索（SEO）の入口。ローマ字は自治体マスタ（`packages/jurisdictions` の `jurisdictions.json` の `slug` と `prefectures.json`）が正本で、`jurisdiction/path.ts` が自治体コードから path を作る（slug の無い自治体はコードで代える）。都道府県自体（東京都は 130001）は `/tokyo` のように都道府県の slug だけにする。市区町村には「区」「市」などの種別を付けず、同じ都道府県の中で読みが重なるときだけ後から加わった側に付ける（豊島区は toshima、利島村は toshima-mura）。`/s/:id` とは、先頭が `s` かどうかで見分ける（`s` は都道府県の slug に無い）。収録が無い自治体は noindex の案内、存在しない名称は 404。`/sitemap.xml` は収録のある自治体の頁を含む（API に繋がらないときは入口・一覧・アシスタントだけ）。

- **データ**: `server/jurisdiction.ts` が api（Service Binding）の歳出の検索から、一般会計の決算の款（年度ごと）・金額の大きい目（積立・公債・予備費の款を除く。前年度の同じ目との比較つき）・全款の流れ（款→項→目→節）を組む。金額は API の円のまま。流れ図では印字のない金額を「金額未記載」と表示し、表示済みの子の合計は親の帯の高さにだけ使う。足すのは同じ年度の款（兄弟）の和（歳出の総額）だけで、api の sum_rules に従う。結果は Worker の cache に1時間置く（`server/jurisdiction-routes.ts`）
- **描画**: Void の Pages（`pages/[prefecture]/[name].tsx`）がサーバーで React の画面（`jurisdiction/page.tsx`）を書き、同じ props で hydrate する（読み込みで配置がずれない。`#y2025` の年度は描いたあとに切り替える）。head（title・説明・canonical・JSON-LD の Dataset）は `jurisdiction/html.ts`。画面は企業のプロフィールページの型で、ヘッダー（区章などの紋章・名前・基本構想の都市像・都道府県・人口・公式サイト・属性と、右上に年度の切り替え。直近の3年度は「今年度・昨年度・一昨年度」と並べ（広い画面では「今年度（R8）」と和暦も添える）、それより前は一つのメニュー（shadcn の dropdown-menu）にまとめる。切り替えるとページ全体がその年度になる。`#y2025` で開く）、左の目次（スクロールに追従。サイドバーと並べると本文が狭くなる lg 未満の幅では上に横並び）、見出し付きの節（区政を知らなくても読めるよう、問いの見出しと一文の説明を付ける。区は何をしている？（冒頭に1年に使うお金の総額と住民1人あたり（数字を大きく、単位を小さく）、分野ごとの仕事の例と、その分野が全体に占める割合（%）とその下に住民1人あたりの額。決算がまだ無い年度を選ぶと、その年度の一般会計の当初予算の総額と分野ごとの額を出す（`server/jurisdiction.ts` の `loadBudget`）。分野は COFOG の大分類で、額は機能分類のお金の流れと同じ。`domains.ts` の examples）・新しく何を始めた？（事業評価のシートのうち、その年度に新しくできた事業と、今ある事業の中で始めた取り組み。評価がまだ公表されていない年度は、予算案のプレス発表資料の施策を「新しく何を始める？」として出す）・お金は何に使われた？（決算の無い年度は「お金は何に使う？」）・いちばんお金がかかっているのは？・やめたこと・見直したことは？・ほかの自治体も見る（都道府県・同じ都道府県で収録のある近くの自治体3件（都道府県の図のタイルの位置で測る。紋章があれば出す）・全国の一覧を同じカードで並べる）の順。金額より暮らしの具体例を先に出す）。スクロールすると年度の切り替え付きの小さなヘッダーが出る。一定より下までスクロールすると、左下（質問のボタンと同じ高さ）に上に戻るボタンが出る。事業評価の事業・事業の入れ替えはデータのある自治体だけ出す（評価がまだ公表されていない年度は、予算案のプレス発表資料の施策を出し、それも無ければ枠だけ出して未公表と言う）。お金の流れは決算と予算を切り替えず、決算のある年度は決算、決算の無い年度は一般会計の当初予算を出す（`?phase=initial`。見出しは「お金は何に使う？」）。歳出の総額（「全体」）もカードの中に出す。金額の大きい事業も、決算の無い年度は当初予算の大きい目を出す（見出しは「いちばんお金がかかるのは？」、前年度比は「—」と出す）。カードの高さは画面の高さから固定のヘッダー（lg 未満は目次の帯も）を引いた分にし、カードの中のスクロールが見切れないようにする。金額の大きい事業は別の節で、最新の決算の年度と当初予算の年度に出し、それ以外の年度は枠だけ出す。お金の流れは、カードの左上に「予算」か「決算」かを出し、右上の丸いボタンの並び（ヘッダーの年度の切り替えと同じ形）で「機能分類」（既定）と「自治体分類」を切り替える。機能分類は目に付いた COFOG で、大分類（10分類）→中分類→科目（目）→内訳（節・事業）の流れにする（款・項は混ぜない。大分類までしか決まらない目は「未分類」、COFOG の付かない目は「その他」に入れ、全分類の和を総額に合わせる。`server/jurisdiction.ts` の `loadCofogFlow`、内訳は `?view=cofog`）。お金の流れ（`jurisdiction/flow.tsx`）は款→項のサンキーから入り（図が画面に入ると帯が左から右へ伸び、右の棒とラベルがあとから出る。帯の上を左から右へ光が流れ続ける。款（大分類）の中の項→目→節の帯も、その項が開いたときに同じ順で伸び、光が流れる。動きを減らす設定では動かさない。`jurisdiction/sankey.tsx` と `styles/app.css`）、款・項を押すとその款（項）の内訳へ移る。最新年度以外の款→項は図が近づいたときに取得する。流れ図は、初期表示が全款・全項の全体図で、横にスクロールすると snap して款が一つずつ開き、縦にスクロールすると款の中の項が一つずつ開く（上の款の目盛り・右の項の目盛りを押してもその款・項へ移る。目盛りに hover すると款・項の一覧を tooltip に出し、そこから選んでも移る）。目・節は図が近づいたときに `/api/jurisdictions/flow/:code/:year/setsu` で全款分を一度だけ取得する（誰でも読める GET。IP ごとの流量 `VIEW_RATE_LIMIT` と 入力と収録年度の検査で守る）。事業の節の上位は開閉せず最初から出す。項→目→節は帯でつなぎ、節は上位3つと「ほか○節」（残りの割合を添え、hover で残りの節を tooltip に出す）にする。流れ図のラベルは金額ではなく割合（%）で出し（款・項は全体に、目は項に、節・「ほか○節」は目に占める割合。基準の金額が印字されていないときは金額のまま）、金額は hover・focus のツールチップ（`jurisdiction/amount-tip.tsx`、丸めた額と円単位の額）で見せる。目→節の帯は目の棒と同じ縮尺（項の中で共通）で両端を同じ太さにし、節の行の高さを超える分だけ節の側で縮める。新しく何を始めた？の見出しの右には、その年度の事業評価（区の事務事業評価）の頁を出す（行ごとのリンクは付けない）。お金の流れの見出しの右には、その年度の決算書・予算書のうち一般会計の歳出を載せた冊の PDF を並べる（`profiles.ts` の `documents`。URL は `pipeline/source_selection` の選定結果。公表前の冊は出さない）
- **事業評価の事業・事業の入れ替え**: API にまだ無いので、`jurisdiction/profiles.ts` に出典（事務事業評価）から手で起こした値を置く（今は品川区だけ）。事業は評価シート（小事業）一枚ずつで、事業期間がその年度から始まり、前年度の行政コストが0で、前年度までの指標の実績が無いシートを新しくできた事業とする。今ある小事業の中で始めた取り組みは新しいシートにならないので、シートの特徴的事項・取組内容から始めたことを書いた一文を抜き出し（候補は「令和6年度から」「開始」などの文と費用の増え方で機械的に絞る。今は品川 R6 の見本を手で置いている）、文はそのまま引いて、評価は含まれる小事業全体のものだと書く。分野は予算科目の目に付いた COFOG で分け、分野の中は新しくできた事業のあとに今ある事業の中で始めた取り組みを並べる（それぞれ決算額の大きい順。取り組みは含まれる小事業の決算額）。金額（決算額）・指標（その年度の目標と実績が両方載った最初のもの）・区分・方向性はシートの値だけを使い、当初予算からは取らない。名前の言い換えと目的の要約は風土記の判断。分野はどの自治体でも同じにするため、区の「政策領域」ではなく COFOG の大分類（10分類）を区政を知らない人に伝わる名前にしたもの（防災・安全／福祉・子育て／教育／健康・医療／住まい・まちづくり／産業・交通／環境／文化・スポーツ／行政・議会、市民の関心の高い順。自治体が受け持たない防衛は出さない。名前は `packages/fiscal/cofog-master.ts` の `COFOG_DIVISION_LABELS`、並びと仕事の例は `jurisdiction/domains.ts`）。目の COFOG で枠は一つに決まり、事業の無い枠は出さない。枠のまとめ方・並び・目への COFOG の付与・文の要約は風土記の判断。本物のデータの経路ができたらここを置き換える
- **予算案のプレス発表から取る新規**: 事業評価は実施した翌年度に公表されるので、まだの年度は当初予算の予算案のプレス発表資料（主な施策を1件1頁で説明したもの）に載った施策のうち、事業名に「新規」の印が付いたものだけを「新しく何を始める？」として出す（印の無い施策は拡大か継続かを資料から決められないので出さない。データには紐付けごと残す。`jurisdiction/budget-press.ts`。サーバーで profile に足す。評価のある年度は評価を優先する）。行の見出しは施策の名前（副題は除く）と資料の予算額で、その右の金額の下に住民1人あたりの額を小さく添える（評価の年度も同じ）。下に資料の「POINT」を資料の文のまま添え、見出しの右にプレス発表資料へのリンクを出す。施策の名前の左に「新規」のギザギザのシール（評価の年度の拡大・今ある事業の中での取り組みは「拡大」の上向き矢印のアイコン）（文字は Noto Sans JP Bold の字形をパスにする。地は左上を淡くしたグラデーションで、ベタ塗りより主張を抑える）。やめた事業の行にも同じ作りで「中止」の八角形を置く（結果の「廃止」は書かず、「廃止を検討」は「やめるか検討中」と言う。`jurisdiction/fresh-icons.tsx`）。説明文は資料の名前を出さず、その年度の予算で新しく始める事業だと言う。分野ごとに上から3件を出し、残りは薄く消える1件だけ見せ、その上の真ん中に重ねた「もっと見る」で25件ずつ開き、開いたあとは最後の行の下に「もっと見る」（残りがあるとき）と「閉じる」を並べる（評価の年度・やめたこと・見直したことは？の一覧も同じ。`FrameItems` の `limit`）。ボタンが入れ替わるときは次のボタンへフォーカスを移す。やめたこと・見直したことは？の一覧は「事業」（方向性の印と事業名）・「今後の方向」・「資料」の3列の表にし、資料の列にその事業の評価シート（全部局の PDF の頁）へのリンクを置く。開閉は高さを動かし、閉じるときは、最後に見せている行（3件目）が画面の真ん中に来るまで、縮みと同じ時間でスクロールを戻す。開閉のボタンは開いていても色を付けず、動かすのは色だけにする（位置の切り替えに transform の transition が乗ると左右に揺れる）。分野は、施策を同じ年度の予算書の内訳（事業）に紐付け、その目の COFOG を写す。紐付けは、名前の一致（または名前の一部と予算額の一致）で決まればそれ、決まらなければ単語（Intl.Segmenter）の重なりで候補を12件に絞り、TypeSafe の Jev に「どれでもない」を含めて選ばせ、確信度0.6以上だけ採る（風土記の判断。手順は `.agents/skills/web-frontend-ops/references/link-to-budget-detail.md`）。紐付かない施策と分類できない目は「その他」に入れる。紐付けた内訳の id は将来の構造化・検索のために残す
- **紋章**（都章・区章・市章・町村章）: 収録している自治体の分を `public/jurisdictions/<code>/emblem.svg` に置く。どれも Wikimedia Commons で Public domain とされている SVG（多くは保護期間の切れた団体名義の著作物（1967年までの公表）か、告示で定めた紋章）をそのまま使う。出典の File 名と Commons の著作権タグは `jurisdiction/emblems.ts` が正本で、そこに無い自治体はヘッダーに名前の頭文字を出す。著作権とは別に、紋章の使用に承認を求める規程・要綱を持つ自治体がある（江東区・国分寺市・新宿区など）。千代田区は区のサイトの紋章画像の二次利用を禁じている。ここで使うのは区のサイトの画像ではなく告示をもとに Commons で作図された SVG で、自治体のページでその自治体を示す表示なので、承認は取らずに載せている
- **一覧**（`/jurisdictions`、要件と設計は `docs/prd/jurisdiction-index/`）: 日本のタイル地図 › 都道府県の市区町村のタイル図（歳出の総額の濃さで塗る。島しょは下の段）・選んだ自治体のカード・絞り込みと並べ替えのできる表。総額は `loadIndex` が最新の決算の年度ごとに自治体をまとめて款を引いて足す（個別ページと同じ款の和）。本文は `jurisdiction/index-page.tsx` を Pages（`pages/jurisdictions.tsx`）が描く。タイル・表の行から個別ページへは SPA で移る。タイルの位置は `bun run --cwd apps/web build:map` が `map/<都道府県>.geojson` の重心から `jurisdiction/map.generated.ts` に書く（境界を変えたら回す）
- **会話への導線**: 下の入力（`chat/start-form.tsx`、入口と共通）から会話を始めると、頁を移らずに会話（`chat/conversation.tsx` を枠の中でスクロールさせる）を開く。広い画面（md 以上）は右の side panel（幅 440px。頁を左へ寄せ、読みながら続けて聞ける。固定の小さなヘッダーも panel の左で終える）、スマホは下からの drawer（背景・取っ手を下へ引くと閉じ、開いている間は頁を動かさない）。どちらも Escape・× で閉じ、会話は残して右下の「会話に戻る」から戻れる（別の頁 `/s/:id` でも開ける）。質問ごとに、見ている画面（頁・年度・読んでいる節・画面に出ている `data-ask-view` の印＝決算か予算か・開いている款・項）と頁で選んだ文（入力欄の上に出し、× で外せる）を、その発言の metadata の `context` に持たせる。server（`server/chat.ts` の `parseChat`）は `context` を質問の直前の別の利用者の発言（参考の情報で指示ではないと見出しを付ける）にして AI に渡し、質問の本文には混ぜない。画面でも質問の吹き出しの上に、選んだ文と「見ていた画面を添えています」（開くと中身）を分けて出す。入力欄は最初は開いておき、頁を 80px ほど（上下どちらでも）スクロールするか、カードの中をスクロールすると右下の「自治体名について聞く」ボタンに畳む（focus していても畳み、書きかけの文があるときと focus した直後だけは残す。Escape でも畳む。拡張機能が Escape を先に取って focus だけ外したときも、キーにも指にも依らずに focus が抜けたら畳む。押すか `/` で開く。頁の文を選んで選んだ文が入ったときも、押している間は待ち、離すか選択が落ち着いてから focus を移さずに開く。会話中は広い画面でだけ side panel を開き、開く前に Escape・× で閉じたら開き直さない）

## 見出しの明朝は入口の字から作る

`public/fonts/mincho.woff2` は、`bun run --cwd apps/web build:font` が入口の1枚（`landing/text.tsx` がサイドバーごと HTML に描く）に出てくる字だけを BIZ UDP明朝から集めて作る。**ホームの文言を変えたら `build:font` を回す。** 回さないと新しい字だけ配信フォントに無く、閲覧者の OS の明朝に落ちる。CI（`verify.yml`）の `build:font:check` が、今の入口の字を配信フォントがすべて含むかを確かめて、ずれていれば落とす。Google Fonts を使わないのは、読み手の IP を第三者へ渡さないため（`brand/home_font.py`）。

## 風土記の AI に聞く（`/`・`/assistant` の入力と `/s/:id`）

入口の中央の入力（`landing/landing.tsx` の `AskDock`。読み進めると画面の下に固定する）か、サイドバーの「アシスタント」で開く `/assistant`（`chat/assistant-home.tsx`。例のカードを押してもその質問で始まる）から、風土記の MCP（apps/api）に繋いだ AI と会話する。会話の画面 `/s/:id` は `chat/session-page.tsx`（会話は sessionStorage にしか無いので、サーバーは枠だけを書き、ブラウザで読んでから描く）。チャットの部品は shadcn の chat 系（`chat/components/ui/`、`components.json`）で、apps/web の中に閉じる。入力欄（`chat/composer.tsx`、入口・会話・自治体の頁で共通）は textarea で、`field-sizing: content` で文に合わせて伸ばす。Enter で送り、Shift+Enter で改行する（指で触る端末では Enter も改行で、送るボタンで送る）。

- **流れ**: 入力を送ると Turnstile で確かめ（`POST /api/sessions` がサーバー側で siteverify）、その会話だけに使える署名付き token（2時間）を受けて `/s/:id` に頁を読み直さずに移る。`POST /api/chat` が Workers AI（`workers-ai-provider`、モデルは config の `CHAT_MODEL`、推論の深さは `CHAT_REASONING_EFFORT`）と AI SDK の MCP client で応答を stream する。apps/api とは Service Binding（`API`）で繋ぐ
- **表示**: AI が `render_expenditure_view` を呼んだ結果は、apps/api の MCP Apps の View を器の頁（`/view-frame`、自分の CSP を持つ）+ `sandbox="allow-scripts"` の iframe に置き（`srcdoc` は親の頁の CSP を引き継いで View の script が止まるので使わない）、`AppBridge` + `PostMessageTransport` で渡す（`chat/view-frame.tsx`、土台は `apps/api/tests/host.ts`）。View が呼ぶ tool と resource の読み込みは `POST /api/mcp` が許可リスト（`server/limits.ts` の `VIEW_TOOLS`・`VIEW_RESOURCE`）で中継する
- **AI に渡すもの**: tool の結果は text の側だけ（`server/chat.ts` の `textOnly`）。structuredContent と `_meta` は View にだけ流れる（`_meta` の `fudoki.dev/suggestions` の候補だけは会話の画面も読み、回答の下にチップで出す。押すと候補の `prompt` を質問として送る。`packages/fiscal/suggestions.ts` が型と検査を共有する）
- **画面の会話の履歴はブラウザに置く**: 画面の会話の履歴と token はブラウザの sessionStorage に置く。サーバーは利用状況を Analytics Engine に（本文・IP・会話 ID は書かない）、会話（質問と回答）を D1 `fudoki-web`（binding `DB`、本番だけ）に保存する。あとで会話を開き直す（復元）のと改善の分析の両方に使う。質問・頁の文脈・tool の引数・回答の文のメール・電話番号は伏せ字にし（tool の結果は風土記の公開データなので原文のまま）、IP・UA・cookie は書かない。ログインしていない会話は最後の発言から90日を過ぎたら書くたびに消す（`server/chat-log.ts`）。利用者への説明はプライバシーポリシーに書いてある
- **上限**: IP ごとの流量（`CHAT_RATE_LIMIT`・`VIEW_RATE_LIMIT`、値は `server/limits.ts` と config で二重に持ち、試験が照合する）、段数・出力 token・文字数・件数・body の大きさ（`server/limits.ts`）。流量の binding・Turnstile の secret・site key のどれかが無ければ、チャットは止まる（入口は入力を出さない）

### 手で設定するもの

- Turnstile の widget を dashboard で作り（hostname は `fudoki.dev`）、site key を `void.config.ts` の `TURNSTILE_SITE_KEY` に書く（設定済み）。secret key は Worker の secret `TURNSTILE_SECRET_KEY` に置く（会話の token の署名の鍵もここから作る）
- 手元の `bun run dev:web`（vite dev）は `apps/web/.env` に `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`（Cloudflare 公開の「常に通る」試験用の secret）を書く（`.env` は commit しない。Void は `.env` 以外の `.dev.vars`・`.env.example` などがあると build を止める）。site key は localhost / 127.0.0.1 のときだけ `server/pages.ts` の `siteKey` が試験用の値に差し替える（本番の widget の hostname は `fudoki.dev`）
- preview（`pr-<番号>.fudoki.dev`、Cloudflare Access で保護）は `void.config.ts` の `previews.vars` で site key・secret を Cloudflare 公開の「常に通る」試験用の値に差し替える（AI エージェントが操作できる）。試験用の secret は action・hostname が合わないダミー値を返すので、`server/session.ts` はその secret のときだけ success のみを見る。本番は変えない

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

### 会話の保存

D1 `fudoki-web` の `conversations`（会話1件1行。`user_id` は認証を入れるまで NULL）と `messages`（1往復で質問と回答の2行。`parts` は AI SDK の UIMessage の parts の JSON で、回答の行に tool の呼び出しと結果、モデル・失敗・token・所要時間を持つ）に書く（列は `migrations/0001_conversations.sql`）。migration は自動では当たらないので、変えたら apps/web で `bun run build` のあと `bunx wrangler d1 migrations apply fudoki-web --remote -c dist/ssr/wrangler.json` を手で流す（apps/web には wrangler の設定ファイルが無いので、build が書き出す設定を渡す）。読むのは `bunx wrangler d1 execute fudoki-web --remote -c dist/ssr/wrangler.json --command "<SQL>"`。

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
