# 自治体の頁

## 組み立て

- 頁は `apps/web/pages/[prefecture]/` の下にある。全自治体が同じ頁・同じ loader（`_loader.ts`）を通る。自治体ごとの分岐やデータを頁・コンポーネントに書かない
- 金額・事業・施策・事業評価は apps/api から取る（`server/app-data.ts`。年度・タブ・流れ図の会計は頁の URL で、loader が props で渡す）。手で起こしたデータを web に置かない。web が持つのは API に無い都市像（`jurisdiction/visions.ts`）と紋章（`jurisdiction/emblems.ts`）だけ
- データの取得は `server/jurisdiction-routes.ts`（Worker の中には置かず CDN の ISR に置く）。頁・OG 画像・sitemap が同じ関数を使う。事業は頁ごとに読む（`jurisdiction/app/api.ts`。サーバーは api の内部の RPC、ブラウザは web の `/api/projects`。全件を手元に取らない）
- サイト内のリンクは年度つきの URL（`/tokyo/shinagawa/2026/projects`）にする。年度の無い URL は最新の年度を出すか、タブの頁なら年度つきへ転送する
- 描画は `jurisdiction/app/app-page.tsx`、AI に質問する欄は `jurisdiction/ask-dock.tsx`

## 都市像（visions.ts）

自治体の頁の見出しとホームのうちのまちに出す一文。自治体を足したら一緒に足す。

- 集め方: その自治体の現行の基本計画（基本構想）に載っている都市像・将来像の文をそのまま写す。言い換え・要約・副題の付け足しをしない
- 名前は計画ごとに違う（都市像・将来都市像・まちの将来像・基本理念・キャッチコピーなど）。計画の最上位に一文で掲げている文を採る。分野ごとの将来像が並ぶだけのときは、それらを束ねる一文（基本理念など）を採る
- 基本構想を持たない自治体は最上位の計画から採る（東京都は「2050東京戦略」）
- 現行の計画を採る。次の計画が策定済みならそちらにする。案・素案の段階の文は採らない
- `source` は文が載っている公式サイトの頁か PDF
- 一文で掲げた都市像が見つからない自治体は入れない（頁は都市像なしで出る）
