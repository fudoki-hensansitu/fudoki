# Design — 風土記

Locked design system。この repo の視覚値の正本。product-design skill はこれを参照し、
Hallmark は検出すると pick をこれに従わせる。値を変えるときはこのファイルだけを編集し、
派生物は再生成する。

## System
- Genre · editorial（地誌・帳面）
- Theme · 白い机に生成りの紙。見出しはゴシックで、大きさと色で階層を作る。色はブランドの青丹とアクセントの金茶、朱と藍は絵の面にだけ置く
- Vibe · 静か、紙、帳面、確かめられる、少しの諧謔

**実データそのものが製品の説明を担う。** 紹介の最初の画面に置くのは、実際の自治体（品川区）のお金の流れの図の画面。
飾りの絵は紙の後ろに敷く添え物で、本文やデータを覆わない。

画面は **読み物**（紹介 `/about`・利用条件・案内）と **データの面**（ホーム・自治体の頁・アシスタントなどの報告・分析）に分かれる。token と書体は共通で、
絵の面（網点・大きな字・朱の楕円）を持つのは読み物だけ。データの面は紙・罫線・数字だけで組む。
**画面はすべてゴシック（`--font-sans`）で組む。** アプリの中（ホーム・自治体の一覧・個別ページ・アシスタント・会話）も紹介（`/about`）も見出しを含めてゴシックにし、階層は大きさと色（前景・`--muted-foreground`）で作る。
**太さは 400〜600 にする。** 本文は 400、ラベル・ボタンは 500、見出しと要の金額は 600。紹介（`/about`）もアプリと同じ太さで組む（2026-11-18 に LP をアプリの見た目に揃えた）。
**文字の大きさは段で選ぶ。** 本文は注記 12px（`text-xs`）・補足 14px（`text-sm`）・本文 16px（`text-base`）だけにする。読ませる文（段落・表の中身・会話の答え）は本文の 16px にし、補足・注記は一行の添え書き（単位・件数・出典・※・状態の知らせ）に限る。表は部品（`Table`）の既定が本文の大きさなので、使う側で小さくしない（lint の `design/body-text` が見る）。それより大きい文字は、見出しも金額も `Title` の段（h1 28/32・h2 24・h3 20・総額・紋章の代わりの頭文字・紹介の冒頭の見出しだけの display 40/48）で組み、見出しでないものは `titleVariants` か `as` で要素を変える。大きさの token は足さず、段は部品（`components/ui`）に寄せる。金額の単位を小さく添えるときは em で書いてよい。
**余白は 4px の格子にする。** padding・margin・gap は Tailwind の整数の段（1＝4px）で書き、`1.5` のような半端な段や `[22px]` の直書きはしない。位置（top・inset など）の微調整は対象外。
**この3つと色の決まりは lint（`apps/web/lint/design.js`）で止める。** 対象は `apps/web` の TSX（紹介 `/about` も含む）で、部品（`components/ui`）は対象外。ホームのレシートの機械の金額のように段の外が要る見せ場は、理由を書いて rule を外す。

## Tokens

shadcn/ui の語彙。色の役割は次のとおり。

- ブランド色 `--primary`（青丹）: 操作・リンク・選んだ項目・グラフの系列・各節の要の数字（数字を全部塗らない）
- アクセント `--kincha`（金茶）: 目を引きたい面（進み具合の棒、注意の印）と、ページ冒頭の使ったお金の数字。文字に使うときは白地で読める（コントラスト 4.5 以上）鮮やかな `--kincha-ink`（#b85c00）。暗くすると目立たなくなるので、濃さは彩度で出す
- 増減（前年度比など）は良し悪しを表さないので、プラスもマイナスも色を付けない
- 面の地: 主張したい面（ホームの「うちのまち」など、1画面に1枚）は `--brand` の緑の地に `--brand-foreground` の文字。`--brand` は明暗とも青丹の濃い緑。中の押せるものは `--brand-fill` に置く（明るいときは白、暗いときは半透明の白）。
- 選んだ状態: タブ・チップ・切り替え（年度・絞り込み・分け方）で選んでいるものは `--primary` の地に `--primary-foreground` の文字（タブは文字と下線を `--primary`）。選んでいないものと hover は生成り（`--secondary`・`--card`・`--accent`）。緑の面の中では `--brand-fill` を選んだ印にする。カード（会計の札など）は地を `--accent`、縁を `--primary` にする
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
  /* 地図の濃淡（まち比べ）。値の大きさを青丹の濃さ5段で塗る。良し悪しを表さないので1色だけにする。値の無いまちは斜線。4・5段は生成りの文字、1〜3段は墨の文字で、両テーマとも 4.5:1 以上になる濃さにしている */
  --shade-1: color-mix(in oklab, var(--primary) 10%, var(--background));
  --shade-2: color-mix(in oklab, var(--primary) 30%, var(--background));
  --shade-3: color-mix(in oklab, var(--primary) 52%, var(--background));
  --shade-4: color-mix(in oklab, var(--primary) 85%, var(--background));
  --shade-5: var(--primary);
  --shade-none: repeating-linear-gradient(135deg, var(--card) 0 4px, var(--muted) 4px 6px);
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
/* 見出しはゴシック。画面の見出しは Title の 600 */
.text-heading { font-family: var(--font-sans); font-weight: 600; font-style: normal; letter-spacing: var(--letter-spacing-heading); word-break: auto-phrase; text-wrap: balance; }
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

- **見出し**: アプリの中の見出しは `Title`（`components/ui/title.tsx`）の4段だけを使う。h1 28px（sm 以上 32px）・h2 24px・h3 20px・headline 16px（本文の大きさ）で、どれも 600。段は本文から約 1.2 倍ずつ上げ（Apple の Title 3〜Large Title と同じ考え方）、headline は本文と同じ大きさで太さだけ変える。段と要素（h1〜h4）は既定で揃え、文書の構造で要素だけ変えるときは `as` で渡す。札（Card）の見出しは `CardTitle`（h3）。紹介の頁もこの段で組み、冒頭の見出しだけ display を使う。会話の Markdown は対象外
- **紹介の録画**: 機能の節（事業の一覧・まち比べ・AI）は実際の操作の録画を色の面に載せる。録画は音なし・繰り返しで、再生の操作盤は出さず、表示域に入ったら再生する（押すと再生・停止、動きを減らす設定では自動で再生しない）。事業の一覧・まち比べはスマホの幅で本番を撮る（`public/about/<名前>.mp4` と最初の枠の `-poster.webp`）
- **紹介（`/about`）の構成**: fluz.app/us の組み方に倣う LP（2026-11-19 yuito。色・文字・余白は風土記の token と `Title` の段のまま）。緑の面（`--brand`）に中央の問いの見出し・できるようになること・「うちのまちの使い道を見る」、面の下の縁にまたがせてお金の流れの図（中央）と分野・事業の画面（左右、幅の広い画面だけ）→ やり方3つ（札の下に実際の画面を差し込む）→ 機能4つ（札の名前・見出し・文と、色の面 `--paper`・`--sakura`・`--kincha`・`--ai` に載せた画面・録画を左右に振る。事業の一覧・まち比べ・出典の頁・AI）→ 暗い帯（`--night`）に困りごとと「風土記／予算書の PDF」の比べの表 → 議員・会派向けの予算・決算委員会の調査の相談 → よくある質問 → 緑の面の呼びかけ。見出しは機能の名前でなく、読んだ人ができるようになることにする。タブ・dialog などの切り替える部品は置かない。件数などの時点で変わる数字の帯は置かない。画面の絵は本番の画面の画像（`public/about/<名前>-light|dark.webp`）で、テーマに合わせて片方を出す（`landing/about.css`）。画面が変わったら撮り直す
- **出典の面**: 紹介の「資料のどこにあるか」は、出典の PDF の切り抜きを白地の枠に載せ、API が返す印字の位置をブランド色（`--primary`）の囲みで重ねる。例には金額が実際に入っている明細を選ぶ（0 円の科目は使わない）
- **コピーに作業の記録を書かない**: 取得日・更新日・件数など、時点で変わる値や作業の経緯は画面に載せない
- **自治体の個別ページ（`/:都道府県/:名称`）**: 見出し・金額・本文はすべて `--font-sans` のゴシック体にし、ロゴはホームと同じ SVG を使う。流れ図は全款・全項を初期表示し、目・節も全款を同じ深さへ展開する。グラフを主役にするため、データの面でもブランド色とアクセントを使う（Tokens の色の役割）。款・分野ごとの色分けはしない。数字は `shadcn/ui` の chart（recharts）と自前の流れ図で描き、収録していない年度は「未収録」と書く。API にまだ無い値（特色・将来推計）は仮の値で、数字の隣に「仮」を付け、検索エンジンへ渡す HTML には入れない
- **FAQ**: 罫線の上にゴシックの問い、`+` が開くと 45° 回る。答えは `--muted-foreground`
- **データの面に出してよい色**: 前景・`--muted-foreground`・罫線に加え、ブランド色・アクセント（Tokens の色の役割）と `--destructive`（検査が落ちているときだけ）。絵の色は出さない

## Icons
- Phosphor（`@phosphor-icons/react`）の regular weight・256px grid。外部サービスの logo（X・GitHub）も Phosphor のものを使う

## Logo
- Logomark: 区画。32 × 32 の grid で町の土地を5つの区画に割る（予算の内訳＝ツリーマップにも読める）。区画は (x, y, 幅, 高さ) = (2, 2, 15, 17)・(19, 2, 11, 10)・(19, 14, 11, 5)・(2, 21, 9, 9)・(13, 21, 17, 9)、空き2・角丸2.2、見える外形は 28 × 28。区画と文字は `--primary`、右の細い区画だけ `--shu`（朱）
- Wordmark: 「風土記」。Zen角ゴシック New Medium（500、OFL-1.1）を SVG の path にしたもの。字面の高さ 28・中心 y=20（文字サイズ 31.435 単位）、高さ 40 の viewBox、字間は 風–土・土–記とも 3.5（`palt` は使わず実際の輪郭で詰める）、改行しない
- Lockup: 高さ 40、マークは等倍で y=4 に置き（見える範囲 y=6〜34）、マークの見える右端から文字まで 12
- Usage: ヘッダは横組み 28px、マーク単体は 24px・最小 16px、横組みの最小高さ 24px、フッタは先頭の列に横組み 30px（全幅の wordmark は置かない）。周囲は横組みの高さの 1/4 以上を空ける。黒一色・白抜き可、縁取り・影・グラデーションは付けない
- Assets: 正本は `apps/web/brand/config.json`、生成は `bun run --cwd apps/web build:brand`、出力は `apps/web/public/`（`mark.svg`・`wordmark.svg`・`logo.svg` と各 `-dark.svg`、`favicon.svg`）と画面へ inline にする `apps/web/logo.ts`。docs の public・api の favicon にも同期する。PNG のアイコン（favicon.ico・icon・apple-touch-icon・PWA）は `brand/pwa_icons.py` で描く

## Motion
- 動くのは hover・選んだタブの色（150ms）、nav の浮き（300ms ease-out）、紹介の冒頭の画面が開いたときに一度だけ浮き上がる動き（600ms）、FAQ の `+`、紹介の機能の節の録画、ホームのうちのまちの札（下記）、まち比べ（下記）だけ。スクロールに合わせて動かさない。ほかの紙・絵は動かさない
- ホームのうちのまちの札は、選んだまちのお金を「自分の額」に変える瞬間なので動かす。読む間を置くため、どの段もゆっくり動かす（長さは `apps/web/home/motion.ts`）。札そのものをレジに見立て、下端に差し出し口の溝を持たせる（札と刷り出す紙は平らな描き方に揃え、押し出された前の紙だけを three.js の立体にする）。緑の平らな札に「予算の見出し → 予算の金額 → 1人あたりの見出し → 1人あたりの金額」を一つずつ出す（それぞれ 0.5秒で下から浮かび上がる。いつも一つだけを動かす。数えている間に他を薄くはしない）。金額は数え上げる（1.6秒。額は兆・億・万の単位を挟んで出し、桁ごとに 0〜9 の帯が縦に転がり、減速して自分の数字に着地する。右の桁から順に着地し、左の桁ほど長く転がる。予算と1人あたりは同じ文字の大きさ）。読み終える間（0.9秒）の後、札の下端の差し出し口から分野ごとの1人あたりのレシートがほぼ一定の速さで伸びて出る（3.6秒）。頁は段に合わせて札を画面に入れ（1.4秒、ease-in-out）、紙が出始めたら紙を後から追って送る（紙より長い6秒、sine で出だしと終わりをゆっくりにし、差し出し口のあたりを見せてからレシートの末端まで送る）（利用者がホイール・タッチ・キー・ポインタで操作したら送らない）。年度を替えたら、出ているレシートは切らずに残したまま数え上げをやり直し、数え終えてから新しいレシートを続けて刷り出す。前のレシートは新しい紙に押し出されて1本の続いた紙として真下へ垂れ、新しいレシートの末端の少し下で奥へ折り返し、レシートの裏を少し横にずらして上へ戻り、札の裏へ潜る（キャタピラーのベルトのように回る。紙と紙の境にはミシン目。紙を切り離したり、別の物として落としたりしない）。レシートは末端（合計・QR）から出て、まちの名前が最後に出る。レシートの末端まで頁が送られたら（紙の動きの終わりではなく頁の送り具合で決める）、レシートの下に他のまちの節をふわっと浮かび上がらせ（0.9秒）、その中の見本のまちは一覧の近くまで送ったときに一つずつふわっと出す。札とレシートの場所ははじめから画面1.5枚ぶん取り、刷り終える前に頁の末尾が見えないようにする
- まち比べは、問いを替えたときにタイルの色が西から東へ移る（300ms ease-out、列ごとに 18ms 遅らせる）。一覧の札は下から 300ms で順に現れ（30ms ずつ、9枚目以降は同時）、押すと 0.985 に縮む。問いの頁の札はまちを選び直すと 200ms で現れ、凡例の縦棒は選んだまちの位置へ 300ms で動く（ドラッグ中は指に付いて動かす）
- すべて `prefers-reduced-motion: no-preference` の中に置く。reduce ではホームの札も最初からレシートを出した姿で、数え上げ・transition・頁送りをしない

## 守る規則
- **画面で集計しない。** 数字は API が返したものをそのまま載せる。同じ数字が2通りに計算されると、いずれ食い違う
- **割合の分母は合計にする。** 割り当てられなかった分を分母から落とすと、使途が見えていない分まで見えていることになる
- **色は役割の決まったものだけ使う。** 色が付いていたら意味があると読まれる。データの面に絵の色を出さず、款・分野ごとに色を分けない
- **色は token の名前で塗る。** apps/web のコードに色の値（`#fff`・`rgb()`・`oklch()`・`color-mix()`）、Tailwind 標準の色名（`bg-gray-100`・`text-white`）、token に後から付ける透明度（`bg-primary/15`）を書かない。要る色は Tokens に足してから使う。`bun run --cwd apps/web lint`（oxlint の JS plugin、`apps/web/lint/design.js`）が CI で検出する。値を持ってよいのは tokens.css・theme.css・`tokens.ts`（theme-color と manifest に渡す背景色）・CSS 変数の届かない出力（OGP 画像・PWA・ロゴ）と shadcn の部品（`chat/components/ui`）だけで、それ以外で要るときは直前の行に `oxlint-disable-next-line design/<rule> -- <理由>` を書く。CSS は oxlint が読まないので対象外
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
