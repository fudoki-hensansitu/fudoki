# Design — 風土記

Locked design system。この repo の視覚値の正本。product-design skill はこれを参照し、
Hallmark は検出すると pick をこれに従わせる。値を変えるときはこのファイルだけを編集し、
派生物は再生成する。

## System
- Genre · editorial（地誌・帳面）
- Theme · 白い机に生成りの紙。見出しはゴシックで、太さと大きさで階層を作る。色はブランドの青丹とアクセントの金茶、朱と藍は絵の面にだけ置く
- Vibe · 静か、紙、帳面、確かめられる、少しの諧謔

**実データそのものが製品の説明を担う。** 紹介の最初の画面に置くのは、実際の自治体の予算を載せた、自治体の頁を模した札。
飾りの絵は紙の後ろに敷く添え物で、本文やデータを覆わない。

画面は **読み物**（紹介 `/about`・利用条件・案内）と **データの面**（ホーム・自治体の頁・アシスタントなどの報告・分析）に分かれる。token と書体は共通で、
絵の面（網点・大きな字・朱の楕円）を持つのは読み物だけ。データの面は紙・罫線・数字だけで組む。
**画面はすべてゴシック（`--font-sans`）で組む。** アプリの中（ホーム・自治体の一覧・個別ページ・アシスタント・会話）も紹介（`/about`）も見出しを含めてゴシックにし、階層は太さと大きさで作る。紹介の見出しは太く（700）詰める。

## Tokens

shadcn/ui の語彙。色の役割は次のとおり。

- ブランド色 `--primary`（青丹）: 操作・リンク・選んだ項目・グラフの系列・各節の要の数字（数字を全部塗らない）
- アクセント `--kincha`（金茶）: 目を引きたい面（進み具合の棒、注意の印）と、ページ冒頭の使ったお金の数字。文字に使うときは白地で読める（コントラスト 4.5 以上）鮮やかな `--kincha-ink`（#b85c00）。暗くすると目立たなくなるので、濃さは彩度で出す
- 増減（前年度比など）は良し悪しを表さないので、プラスもマイナスも色を付けない
- 面の地: 主張したい面（ホームの「うちのまち」など、1画面に1枚）は `--brand` の緑の地に `--brand-foreground` の文字。`--brand` は明暗とも青丹の濃い緑。中の押せるものは `--brand-fill` に置く（明るいときは白、暗いときは半透明の白）。押せるもの（タブ・切り替え・カード）の状態（選んだ・選んでいない・hover）は生成り（`--secondary`・`--card`）。
- 絵の色 `--shu`・`--ai`・`--sakura`: 読み物の絵の面と帯だけ

`--accent` は shadcn の名前で、hover の控えめな面に使う（アクセント色ではない）。

```css
:root {
  --background: #ffffff;
  --foreground: #2b2723;
  --card: #f8f5ee;
  --card-foreground: #2b2723;
  --popover: #ffffff;
  --popover-foreground: #2b2723;
  --primary: #2f5d43;
  --primary-foreground: #f8f5ee;
  --secondary: #ece6da;
  --secondary-foreground: #2b2723;
  --muted: #ece6da;
  --muted-foreground: #6b655c;
  --accent: #e9efe9;
  --accent-foreground: #2f5d43;
  --destructive: oklch(57.7% 0.245 27.325);
  --destructive-foreground: #ffffff;
  --border: #ddd6c8;
  --input: #ddd6c8;
  --ring: #2f5d43;
  --radius: 8px;
  --radius-sm: 4px;
  --radius-card: 16px;
  --radius-sheet: 24px;

  /* 拡張: 絵の面と帯。データを表す面には使わない */
  --paper: #e4d8bf;
  --paper-foreground: #2b2723;
  --night: #2b2723;
  --night-foreground: #f8f5ee;
  /* 出典の頁を写す面。PDF の白なので明暗で変えない */
  --page: #ffffff;
  --page-foreground: #2b2723;
  /* 主張したい面の地（明暗とも同じ緑） */
  --brand: #2f5d43;
  --brand-foreground: #f8f5ee;
  /* 緑の面の中の押せるもの（検索欄・ボタン） */
  --brand-fill: #ffffff;
  --brand-fill-hover: #f8f5ee;
  --brand-fill-foreground: #2b2723;
  --brand-fill-muted: #6b655c;
  /* 自治体の紋章の地。暗いときは白を少し落とす */
  --emblem: #ffffff;
  --shu: #c1553a;
  --ai: #33507a;
  --kincha: #e3a43c;
  /* 金茶を文字に使うときの濃さ（白地で読める） */
  --kincha-ink: #b85c00;
  --sakura: #ebcab9;

  --font-display: "BIZ UDPMincho", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", "Noto Serif CJK JP", serif;
  --font-sans: "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", "Yu Gothic", Meiryo, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --text-caption: 12px;
  --text-ui: 14px;
  --text-body: 16px;
  --text-lead: 17px;
  --text-h3: 26px;
  --text-h2: clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem);
  --text-display: clamp(2.5rem, 1.4rem + 4.4vw, 5.5rem);
  --line-height-body: 1.8;
  --line-height-heading: 1.4;
  --line-height-display: 1.18;
  --letter-spacing-body: 0.03em;
  --letter-spacing-heading: 0.02em;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 40px;
  --space-7: 64px;
  --space-section: 120px;
  --max-width: 1200px;

  --shadow-sheet: 0 20px 25px -5px color-mix(in srgb, var(--night) 12%, transparent), 0 8px 10px -6px color-mix(in srgb, var(--night) 10%, transparent);
  --shadow-pill: 0 1px 2px color-mix(in srgb, var(--night) 4%, transparent), 0 6px 20px color-mix(in srgb, var(--night) 6%, transparent);
  --hair: color-mix(in srgb, var(--foreground) 10%, transparent);
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-sweep: cubic-bezier(0.87, 0, 0.13, 1);
  --duration: 150ms;
}
/* 暗い色。実装（apps/web/styles/tokens.css）は light-dark() で両方を持ち、テーマ（サイドバー、SP は下の帯の設定）は html の data-theme で切り替える。既定はライトで、「端末に合わせる」のときだけ端末の設定に従う */
@media (prefers-color-scheme: dark) {
  :root {
    --background: #1b1916;
    --foreground: #ece6da;
    --card: #24211d;
    --card-foreground: #ece6da;
    --popover: #24211d;
    --popover-foreground: #ece6da;
    --primary: #8fbfa2;
    --primary-foreground: #1b1916;
    --secondary: #302c26;
    --secondary-foreground: #ece6da;
    --muted: #302c26;
    --muted-foreground: #a8a094;
    --accent: #26332b;
    --accent-foreground: #8fbfa2;
    --border: #3b362f;
    --input: #3b362f;
    --ring: #8fbfa2;
    --paper: #3a342b;
    --paper-foreground: #ece6da;
    --night: #0f0e0c;
    --night-foreground: #ece6da;
    --shu: #d46a4f;
    --kincha-ink: #e3a43c;
    --ai: #6f8fc0;
    --sakura: #b98f80;
    --brand-foreground: #ece6da;
    --brand-fill: rgb(255 255 255 / .08);
    --brand-fill-hover: rgb(255 255 255 / .12);
    --brand-fill-foreground: #f3f0ea;
    --brand-fill-muted: rgb(243 240 234 / .9);
    --emblem: #e6e0d4;
  }
}
```

## Components

```css
/* 見出しはゴシック。紹介の見出しは 700 で詰める */
.text-heading { font-family: var(--font-sans); font-weight: 700; font-style: normal; letter-spacing: var(--letter-spacing-heading); word-break: auto-phrase; text-wrap: balance; }
.text-body { font-family: var(--font-sans); font-size: var(--text-body); line-height: var(--line-height-body); letter-spacing: var(--letter-spacing-body); line-break: strict; word-break: auto-phrase; overflow-wrap: break-word; text-wrap: pretty; }
.num { font-variant-numeric: tabular-nums; letter-spacing: 0; white-space: nowrap; }
.eyebrow { font: 600 13px/1.4 var(--font-sans); letter-spacing: .08em; color: var(--primary); }

/* ボタンはピル。hover は塗りの色だけを変える */
.btn { height: 44px; padding: 0 var(--space-5); border-radius: 999px; background: var(--primary); color: var(--primary-foreground); font: 500 15px/1 var(--font-sans); white-space: nowrap; transition: background-color var(--duration) var(--ease); }
.btn-outline { border: 1px solid var(--foreground); background: transparent; color: var(--foreground); }

/* 帳面の紙。実データの表を載せる。信号機や偽の操作ボタンは描かない */
.sheet { padding: 22px 26px; border: 1px solid var(--hair); border-radius: var(--radius-card); background: var(--card); color: var(--card-foreground); box-shadow: var(--shadow-sheet); }
.ledger-table th { font-size: var(--text-caption); font-weight: 500; color: var(--muted-foreground); border-bottom: 1px solid var(--hair); }
.ledger-table td { padding: var(--space-2); border-bottom: 1px solid var(--hair); }

/* 絵の面。紙の後ろに敷き、本文やデータを覆わない */
.art-paper { background: var(--paper); }
.art-halftone { background:
  radial-gradient(circle at 50% 50%, transparent 40%, var(--night) 54%) 0 0 / 7px 7px,
  radial-gradient(46% 46% at 38% 62%, var(--kincha), transparent 72%),
  repeating-conic-gradient(from 8deg at 38% 62%, var(--shu) 0 6.4deg, var(--ai) 0 9.6deg, var(--sakura) 0 12.9deg); }

/* nav は透明な帯で始まり、24px スクロールすると白いピルに落ち着く */
.nav-pill { border: 0.5px solid var(--border); border-radius: 999px; background: var(--background); box-shadow: var(--shadow-pill); }
```

- **AI から使う**: 若草の札（角丸 28px）の中に、つなぎ方の手順と実際の操作の録画を並べる。録画は音なし・繰り返しで、表示域に入ったら再生する（クリックで止める・動きを減らす設定では自動で再生しない）。録画の下に「つなぎ方をくわしく見る」のリンクを置く
- **紹介（`/about`）の構成**: 中央の見出し（「どこへ行った？」を手描きの丸で囲む・鉛筆の落書き）→ 下が切れた自治体の頁の画面と、タブで右半分と緑の札のボタンの色が替わる → 住民の問い → 若草の札3枚（使う・新しく始める・振り返る）→ 方眼の面に浮かぶ札（まちの一年＝予算を組む・使う・振り返る・見直す）と使う人の4列 → 比べる・確かめる → AI から使う → 議員・会派向けの予算・決算委員会の調査の相談 → FAQ → 中央の呼びかけ。地は薄い若草（#f6faf6）、札は濃い若草（#e4f1e6）に粒子と角丸 28px、画面のイメージは白で下を切る。色は landing.css の `.landing` の中だけで持ち、要の色はブランド色（`--primary`）。まだ無いデータ（事業評価の指標など）の画面は架空のデータで組み、「画面はイメージです」を添えて実在の自治体名を付けない
- **出典の面**: 「確かめる」は、出典の PDF の切り抜きを `--page` の紙に載せ、API が返す印字の位置を朱の囲みで重ねる。例には金額が実際に入っている明細を選ぶ（0 円の科目は使わない）
- **コピーに作業の記録を書かない**: 取得日・更新日・件数など、時点で変わる値や作業の経緯は画面に載せない
- **自治体の個別ページ（`/:都道府県/:名称`）**: 見出し・金額・本文はすべて `--font-sans` のゴシック体にし、ロゴはホームと同じ SVG を使う。流れ図は全款・全項を初期表示し、目・節も全款を同じ深さへ展開する。グラフを主役にするため、データの面でもブランド色とアクセントを使う（Tokens の色の役割）。款・分野ごとの色分けはしない。数字は `shadcn/ui` の chart（recharts）と自前の流れ図で描き、収録していない年度は「未収録」と書く。API にまだ無い値（特色・将来推計）は仮の値で、数字の隣に「仮」を付け、検索エンジンへ渡す HTML には入れない
- **FAQ**: 罫線の上にゴシックの問い、`+` が開くと 45° 回る。答えは `--muted-foreground`
- **データの面に出してよい色**: 前景・`--muted-foreground`・罫線に加え、ブランド色・アクセント（Tokens の色の役割）と `--destructive`（検査が落ちているときだけ）。絵の色は出さない

## Icons
- Phosphor（`@phosphor-icons/react`）の regular weight・256px grid。React の外の HTML（紹介の頁）は同じ path を inline の `<symbol>` に写し、`fill: currentColor` で描く。外部サービスの logo（X・GitHub）も Phosphor のものを使う

## Logo
- Logomark: 区画。32 × 32 の grid で町の土地を5つの区画に割る（予算の内訳＝ツリーマップにも読める）。区画は (x, y, 幅, 高さ) = (2, 2, 15, 17)・(19, 2, 11, 10)・(19, 14, 11, 5)・(2, 21, 9, 9)・(13, 21, 17, 9)、空き2・角丸2.2、見える外形は 28 × 28。区画と文字は `--primary`、右の細い区画だけ `--shu`（朱）
- Wordmark: 「風土記」。Zen角ゴシック New Medium（500、OFL-1.1）を SVG の path にしたもの。字面の高さ 28・中心 y=20（文字サイズ 31.435 単位）、高さ 40 の viewBox、字間は 風–土・土–記とも 3.5（`palt` は使わず実際の輪郭で詰める）、改行しない
- Lockup: 高さ 40、マークは等倍で y=4 に置き（見える範囲 y=6〜34）、マークの見える右端から文字まで 12
- Usage: ヘッダは横組み 28px、マーク単体は 24px・最小 16px、横組みの最小高さ 24px、フッタは先頭の列に横組み 30px（全幅の wordmark は置かない）。周囲は横組みの高さの 1/4 以上を空ける。黒一色・白抜き可、縁取り・影・グラデーションは付けない
- Assets: 正本は `apps/web/brand/config.json`、生成は `bun run --cwd apps/web build:brand`、出力は `apps/web/public/`（`mark.svg`・`wordmark.svg`・`logo.svg` と各 `-dark.svg`、`favicon.svg`）と画面へ inline にする `apps/web/logo.ts`。docs の public・api の favicon にも同期する。PNG のアイコン（favicon.ico・icon・apple-touch-icon・PWA）は `brand/pwa_icons.py` で描く

## Motion
- 動くのは hover・選んだタブの色（150ms）、nav の浮き（300ms ease-out）、紹介の冒頭の札がタブを替えたときに浮き上がる動き（360ms）、FAQ の `+`、AI の節の録画だけ。スクロールに合わせて動かさない。紙・絵は動かさない
- オンボーディングの吹き出しの絵は例外として動かす: 押す所へ指が動いて押す・文字をなぞって選ぶ・質問を打つ、を実際のまちの名前と金額で 4.4 秒ごとに繰り返す。色はデータの面と同じ役割で使う: 前景・`--muted-foreground`・罫線・`--card`・`--secondary`・`--primary`（選んだ文の地は `--primary` を薄めた色）、ホームの札をなぞる所は `--brand`・`--brand-fill`、終わりの印の粒だけ `--kincha`。動かさない設定では終わりの様子を止めて出す
- すべて `prefers-reduced-motion: no-preference` の中に置く

## 守る規則
- **画面で集計しない。** 数字は API が返したものをそのまま載せる。同じ数字が2通りに計算されると、いずれ食い違う
- **割合の分母は合計にする。** 割り当てられなかった分を分母から落とすと、使途が見えていない分まで見えていることになる
- **色は役割の決まったものだけ使う。** 色が付いていたら意味があると読まれる。データの面に絵の色を出さず、款・分野ごとに色を分けない
- **色は token の名前で塗る。** apps/web のコードに色の値（`#fff`・`rgb()`・`oklch()`・`color-mix()`）、Tailwind 標準の色名（`bg-gray-100`・`text-white`）、token に後から付ける透明度（`bg-primary/15`）を書かない。要る色は Tokens に足してから使う。`bun run --cwd apps/web lint`（oxlint の JS plugin、`apps/web/lint/design.js`）が CI で検出する。値を持ってよいのは tokens.css・theme.css・landing.css・`tokens.ts`（theme-color と manifest に渡す背景色）・CSS 変数の届かない出力（OGP 画像・PWA・ロゴ）と shadcn の部品（`chat/components/ui`）だけで、それ以外で要るときは直前の行に `oxlint-disable-next-line design/<rule> -- <理由>` を書く。CSS は oxlint が読まないので対象外
- **比べる数字には、比べ方の注意を同じ面に書く。** 人口あたりでない、年度が違う、などは脚注に逃がさず数字の隣に置く
- **溢れるものはその要素の中でスクロールさせる。** ページ本体を横にスクロールさせない（`overflow-x: clip`）
- **和文の段落は `--line-height-body`（1.8）で組む。** `word-break: keep-all` は本文に当てない
- **和文は文節で折る。** 全頁の本文を `word-break: auto-phrase` で組み、節の見出し（h1・h2）は `text-wrap: balance`、段落（p）は `text-wrap: pretty` にする。後ろにリンクを続ける行の見出し（h3・h4）は balance にしない。数字と単位、並べた2つの金額の文は塊（`whitespace-nowrap`・`inline-block`）にして途中で折らない

## Exports
- `apps/web/styles/tokens.css` の `:root` は本ファイルの Tokens から写す。直接の値の変更はここを先に直す
- 明朝（`--font-display`）は今どの画面でも使っていない。使うときは Web フォントを配らず、端末の明朝で組む
- 重いファイル（ホームの録画・出典の切り抜き）は `apps/web/public/` に置き、Workers static assets で配る。録画は `apps/web/brand/home_demo.sh`（冒頭に映る利用者名を覆う）、切り抜きは `bun run --cwd apps/web build:origin` で作り直す
- 外部へ送るのは、利用者がブラウザで許可した操作に限る（ホームでうちのまちを選んでいないときと「現在地から選ぶ」を押したときに、位置情報の許可があれば国土地理院の逆ジオコーダーへ緯度・経度を送る。プライバシーポリシーに記載）

## Notes
- 参考の質感は flavors.design の Groanola（白い机・oat の窓・低コントラストの serif・ピル・紙と網点のコラージュ）。黄緑の紙と桃・藤の網点は、青丹と緑が2つ並ぶため生成り・朱・藍に置き換えた
- 旧トップの構図は3案（コラージュ / 帳面 / 比較の図版）から帳面を選んだ（2026-11-08 に紹介の頁を LP に作り直し、帳面は外した）。選んだ理由は「最初の画面の帳面がサムネとして分かりやすい」こと。コラージュは絵が実データを添え物にし、図版は見出しが総額の比になって人口差の注意が脚注へ逃げた
- 見出しの書体は Noto Serif JP・しっぽり明朝・Zen Old Mincho・BIZ UDP明朝を実画面で比べて BIZ UDP明朝にした。線の強弱が小さく、役所の資料の語彙に合う。しっぽり明朝と Zen Old Mincho は `palt` が効かず、句読点のまわりが開いた
- Groanola の窓の信号機と、チャット欄の偽の操作ボタンは、OS やアプリの画面をなぞる飾りなので採らない
