# Design — 風土記

Locked design system。この repo の視覚値の正本。product-design skill はこれを参照し、
Hallmark は検出すると pick をこれに従わせる。値を変えるときはこのファイルだけを編集し、
派生物は再生成する。

## System
- Genre · editorial（地誌・帳面）
- Theme · 白い机に生成りの紙。見出しは低コントラストの明朝 400、ブランドの青丹は操作にだけ、朱と藍は絵の面にだけ置く
- Vibe · 静か、紙、帳面、確かめられる、少しの諧謔

**実データの表そのものが製品の説明を担う。** 最初の画面に置くのは、出典の階層（款・項・目）と金額・頁を持つ帳面の紙。
飾りの絵は紙の後ろに敷く添え物で、本文やデータを覆わない。

画面は **読み物**（ホーム・利用条件・案内）と **データの面**（報告・分析）に分かれる。token と書体は共通で、
絵の面（網点・大きな字・朱の楕円）を持つのは読み物だけ。データの面は紙・罫線・数字だけで組む。

## Tokens

shadcn/ui の語彙。ブランド色は `--primary`、`--accent` は hover の控えめな面。拡張は絵の面と帯の色。

```css
:root {
  --background: #fdfcfa;
  --foreground: #2b2723;
  --card: #f8f5ee;
  --card-foreground: #2b2723;
  --popover: #fdfcfa;
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
  --destructive-foreground: #fdfcfa;
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
  --shu: #c1553a;
  --ai: #33507a;
  --kincha: #e3a43c;
  --sakura: #ebcab9;
  --logo-rule-ink: #29523b;

  --font-display: "Fudoki Mincho", "BIZ UDPMincho", "Hiragino Mincho ProN", "Yu Mincho", serif;
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
    --ai: #6f8fc0;
    --sakura: #b98f80;
    --logo-rule-ink: #9cc7ad;
  }
}
```

## Components

```css
/* 見出しは明朝 400 だけ。太さではなく大きさと余白で階層を作る */
.text-heading { font-family: var(--font-display); font-weight: 400; font-style: normal; letter-spacing: var(--letter-spacing-heading); word-break: auto-phrase; text-wrap: balance; }
.text-body { font-family: var(--font-sans); font-size: var(--text-body); line-height: var(--line-height-body); letter-spacing: var(--letter-spacing-body); line-break: strict; word-break: normal; overflow-wrap: break-word; }
.num { font-variant-numeric: tabular-nums; letter-spacing: 0; white-space: nowrap; }
.eyebrow { font: 400 var(--text-ui)/1.4 var(--font-display); color: var(--foreground); }

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

- **帯**: 白い節の間に、生成りの紙（`--paper`、MCP の案内）を全幅で1本だけ挟む。帯の文字は `--paper-foreground`。右には実際の操作の録画を置き、音なし・繰り返しで、表示域に入ったら再生する（クリックで止める・動きを減らす設定では自動で再生しない）。説明文や再生ボタンは添えない
- **冒頭の帳面**: 款・項・目と、目ごとの上位3つの内訳（API の軸「節」、無ければ「備考」の事業）を載せる。自治体の表を 2 秒ごとに順に切り替え、最後から最初へ戻る。見出しの自治体名だけが縦に回り、表は新しいものを上に重ねて 350ms で出す。動きを減らす設定では最初の自治体のまま止める
- **出典の面**: 「確かめる」は、出典の PDF の切り抜きを `--page` の紙に載せ、API が返す印字の位置を朱の囲みで重ねる。例には金額が実際に入っている明細を選ぶ（0 円の科目は使わない）
- **3つのステップ**: 「見る・比べる・確かめる」は、左に sticky の rail、右に1画面ぶんの高さのステップを縦に並べ、961px 以上ではステップの頭に `scroll-snap`（`y mandatory`）で必ず止める。snap はステップが画面を覆っている間だけ効かせ（`html[data-snap]` を script で付け外す）、ページの他の場所には止まる位置を置かない。出入りの先として、帳面の下端と MCP の帯の頭だけを止まる位置にする。rail は朱の大きな漢数字（今のステップ ／ 三）、3分割の目盛り、番号・見出し・一行の要約の一覧。960px 以下では rail を隠し、snap も外す
- **コピーに作業の記録を書かない**: 取得日・更新日・件数など、時点で変わる値や作業の経緯は画面に載せない
- **自治体の個別ページ（`/:都道府県/:名称`）**: 見出し・金額・本文はすべて `--font-sans` のゴシック体にし、ロゴはホームと同じ SVG を使う。流れ図は全款・全項を初期表示し、目・節も全款を同じ深さへ展開する。グラフを主役にするため、データの面でも色を使う。使うのは `--primary`（系列・選んだ項目）と `--kincha`（将来推計・減少）の2色だけで、灰色（`--muted-foreground`）と並べる。款ごとの色分けはしない。数字は `shadcn/ui` の chart（recharts）と自前の流れ図で描き、収録していない年度は「未収録」と書く。API にまだ無い値（人口・特色・将来推計）は仮の値で、数字の隣に「仮」を付け、検索エンジンへ渡す HTML には入れない
- **FAQ**: 罫線の上に明朝の問い、`+` が開くと 45° 回る。答えは `--muted-foreground`
- **データの面に出してよい色**: 前景・`--muted-foreground`・罫線・`--destructive`（検査が落ちているときだけ）。`--primary` と絵の色は出さない。例外は自治体の個別ページ（下の「自治体の個別ページ」）だけ

## Icons
- lucide（`lucide-static@1.54.0` の path を inline の `<symbol>` に写す）・24px grid・stroke 1.5・round cap/join。外部サービスの公式 logo だけを例外とする

## Logo
- Logomark: 32 × 32 の grid に五本の短冊（幅4・空き2、左端 x=2／8／14／20／26、下端 y=28、高さ 14／22／10／26／17、角丸2）と基準線（x=2・y=29・幅28・高さ2、角丸1）。見える外形は幅28・高さ29で、黄金比は使っていない。短冊と文字は `--primary`、基準線だけ `--logo-rule-ink` で背景との明度差を 12% 増やす
- Wordmark: 「風土記」。Zen角ゴシック New Bold（700、OFL-1.1）を SVG の path にしたもの。文字サイズ 32.5 単位・高さ 40 の viewBox、字間は 風–土・土–記とも 3.5（`palt` は使わず実際の輪郭で詰める）、字面の中心 y=21.5、改行しない
- Lockup: 高さ 40、マークを 1.25 倍、マークの見える右端から文字まで 8、文字の先頭輪郭 x=45.5
- Usage: ヘッダは横組み 28px、マーク単体は 24px・最小 16px、横組みの最小高さ 24px、フッタは先頭の列に横組み 30px（全幅の wordmark は置かない）。周囲は横組みの高さの 1/4 以上を空ける。黒一色・白抜き可、縁取り・影・グラデーションは付けない
- Assets: 正本は `apps/web/brand/config.json`、生成は `bun run --cwd apps/web build:brand`、出力は `apps/web/public/`（`mark.svg`・`wordmark.svg`・`logo.svg` と各 `-dark.svg`、`favicon.svg`）。docs の public にも同期する

## Motion
- 1 primitive: 見出しの sweep。表示域に入ったとき一度だけ、金茶・朱・桜・藍の帯が 1.4s（`--ease-sweep`）で文字を通り抜け、墨に戻る。最初の描画から墨で読める
- 他に動くのは hover の色（150ms）、nav の浮き（300ms ease-out）、rail の漢数字と目盛り（600ms `--ease-sweep`）、帳面の自治体名の回転（700ms `--ease-sweep`）と表の入れ替え、FAQ の `+` だけ。紙・絵は動かさない
- すべて `prefers-reduced-motion: no-preference` の中に置く

## 守る規則
- **画面で集計しない。** 数字は API が返したものをそのまま載せる。同じ数字が2通りに計算されると、いずれ食い違う
- **割合の分母は合計にする。** 割り当てられなかった分を分母から落とすと、使途が見えていない分まで見えていることになる
- **ブランド色と絵の色をデータの面に出さない。** 色が付いていたら意味があると読まれる。データの面で意味を持つ色は `--destructive` だけ（自治体の個別ページの例外を除く）
- **比べる数字には、比べ方の注意を同じ面に書く。** 人口あたりでない、年度が違う、などは脚注に逃がさず数字の隣に置く
- **溢れるものはその要素の中でスクロールさせる。** ページ本体を横にスクロールさせない（`overflow-x: clip`）
- **和文の段落は `--line-height-body`（1.8）で組む。** `word-break: keep-all` は本文に当てない

## Exports
- `apps/web/landing.ts` の `:root` は本ファイルの Tokens から写す。直接の値の変更はここを先に直す
- 見出しの明朝は BIZ UDP明朝 Regular（google/fonts の commit `9710da1e` で固定、SHA-256 は `apps/web/brand/home_font.py`、OFL は `apps/web/brand/fonts/bizudpmincho-OFL.txt`）を、頁で使う字だけに絞って自前で配る。文言を変えたら `bun run --cwd apps/web build:font` で `public/fonts/mincho.woff2` と `font.generated.ts` を作り直す
- 重いファイル（ホームの録画・出典の切り抜き）は `apps/web/static/` に置き、Workers static assets で配る。録画は `apps/web/brand/home_demo.sh`（冒頭に映る利用者名を覆う）、切り抜きは `bun run --cwd apps/web build:origin` で作り直す
- 閲覧者の IP を第三者へ渡さないため、Google Fonts などの外部 CDN から書体を読まない

## Notes
- 参考の質感は flavors.design の Groanola（白い机・oat の窓・低コントラストの serif・ピル・紙と網点のコラージュ）。黄緑の紙と桃・藤の網点は、青丹と緑が2つ並ぶため生成り・朱・藍に置き換えた
- ホームの構図は3案（コラージュ / 帳面 / 比較の図版）から帳面を選んだ。選んだ理由は「最初の画面の帳面がサムネとして分かりやすい」こと。コラージュは絵が実データを添え物にし、図版は見出しが総額の比になって人口差の注意が脚注へ逃げた
- 見出しの書体は Noto Serif JP・しっぽり明朝・Zen Old Mincho・BIZ UDP明朝を実画面で比べて BIZ UDP明朝にした。線の強弱が小さく、役所の資料の語彙に合う。しっぽり明朝と Zen Old Mincho は `palt` が効かず、句読点のまわりが開いた
- Groanola の窓の信号機と、チャット欄の偽の操作ボタンは、OS やアプリの画面をなぞる飾りなので採らない
