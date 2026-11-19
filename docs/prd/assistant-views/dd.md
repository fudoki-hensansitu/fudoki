# アシスタントの会話に、決まった部品で図と表を出す — 設計

担当者: wwwyo / Claude
更新日: `2026-11-19`
状態: Draft（レビュー待ち）

## Summary

[ADR 0053](../../adr/0053-assistant-tools-without-mcp.md) で MCP Apps の View（iframe の表とグラフ）をやめ、会話には tool を呼んだ印しか出ていない。代わりに「見せる tool」を足す。AI は見せる tool を呼んで**どの部品を、どの自治体・年度・資料で出すか**だけを決め、部品の中身（数字・並び・見た目）は server が引いたデータと web の決まった React 部品から出す。AI は部品の JSON も数字も書かない。

最初に足す部品は3つ。

| tool | 部品 | データの出どころ |
| --- | --- | --- |
| `show_money_flow` | 入る→使う（`MoneyFlow`）と総額・1人あたり | 自治体の頁の loader と同じ関数（`subjectsOf`＋`subjectTree`・`loadRevenue`・`loadRevenueFlow`）と人口 |
| `show_expenditure_table` | 科目・内訳の表 | api の `search_expenditure_subjects`・`search_expenditure_details`（同じ入力で引き直す） |
| `show_local_finance` | 借金と貯金・事業に回ったお金・財政の指標（`FinanceSections` の節） | web の D1 の `local_finance`・人口 |

## Goals / Non-Goals

- Goal: 会話の答えの横に、自治体の頁と同じ部品で図・表・出典の頁を出す。数字はすべて tool が引いたデータから出し、AI が書いた数字を部品に入れない。
- Non-Goal: 部品の組み合わせ・レイアウトを AI に決めさせること（json-render などの、AI が UI の JSON を書く形）。比べた結果は「Considered Options」。
- Non-Goal: 公開 MCP（`/mcp`）に同じ部品を出すこと。部品を packages に移して `apps/api/ui` の View に同梱すれば出せるが、外部の利用がほぼ無いので、web で形が固まってからにする。
- Non-Goal: 出典 PDF の頁を会話・頁の中で開くこと（`show_source_page`）。自前の R2 から読むには「api は R2 の binding を持たない」（`pipeline/verify/boundaries.ts`・`apps/AGENTS.md`）を見直す必要があり、利用条件の判断も要るので、見送った（「関連: 出典の頁」）。
- Non-Goal: 款・項のサンキー（`Overview`）・節の「何に使う？」・年度の推移・事業のカード。最初の3つで仕組みを通してから、この4つを同じ形で足す。

## Background

- 会話の本体は `apps/web/chat/conversation.tsx`。応答の `dynamic-tool` の part ごとに `ToolMarker`（印）を出している。tool の結果の `_meta` に載せた次の質問の候補を、画面だけが読んでいる。
- AI に渡す tool の結果は `toModelOutput` → `toolText` で content の text だけ（`apps/web/tool-text.ts`）。ブラウザは tool の結果を sessionStorage に丸ごと持ち、server に送り返すときは `forServer`（`chat/history.ts`）が text だけに作り直す。前の回の結果は `OMITTED` にする。
- web が持つ tool（`get_local_finance`・`get_population`・`read_source_page`・`fetch_page`）は `server/` の `dynamicTool` で、`chat.ts` で登録する。api の tool は `server/assistant-tools.ts` が内部の RPC の `tools()`・`runTool()` を包む。
- 会話のモデルは Workers AI の `@cf/deepseek-ai/deepseek-v4.1-flash-1017`（`void.config.ts`）。1回の応答は `MAX_STEPS = 6` 段まで。

## Design

### 1. 見せる tool の結果の形

見せる tool は web の `server/views/` に置く `dynamicTool` で、結果を次の形で返す。

```ts
type ViewResult =
  | {
      content: [{ type: 'text'; text: string }] // AI に渡す。部品に出した要点（総額などの数字は tool が引いた値）と「画面に出した」旨
      view: { kind: ViewKind; v: 1; data: unknown } // 画面だけが読む。AI には渡らない
    }
  | { content: [{ type: 'text'; text: string }]; isError: true } // 収録の無い年度など。view は付けない
```

- `view` は `toolText` が読まないので AI には渡らない（`_meta` の候補と同じ扱い）。そのため見せる tool も、ほかの tool と同じく `toModelOutput` で `toolText` を通す（登録しないと AI SDK の既定の変換が output 全体を AI に渡し、`view` が届く）。`forServer` は output を text だけに作り直すので、server にも送り返されない。sessionStorage には残り、前の回の部品も描き直せる。
- `content` の text には、AI が答えの文を書くのに要る要点だけを入れる（例: 総額・1人あたり・上位3つの分野と額）。全行は入れない。「図と同じ数字を並べ直さず、図で読み取れることを短く書く」と system prompt に足す。
- 失敗（収録の無い年度など）は `isError` と、理由の text だけを返し、`view` を付けない。AI は text を見て「無い」と答える。
- `kind` ごとの `data` の型は zod で `chat/views/schema.ts` に置き（web は今 zod を持たないので依存に足す。server と画面の両方が import する）、server が返す前と、画面が描く前の両方で `safeParse` する。sessionStorage に古い版の data が残っていても、形が違えば描かずに印だけにする（`v` で版を区別する）。

### 2. 画面の描き方

- `conversation.tsx` の `dynamic-tool` の part で、`output.view` があれば印の下に `ViewBlock` を出す。`ViewBlock` は `kind` → 部品の表（`chat/views/index.tsx`）を引き、data を渡す。知らない kind・検査に通らない data は何も出さない。
- 部品は自治体の頁と同じものを使う。頁の props に結び付いた部分（`IncomeFlow` の `openField` など）は、データを受け取るだけの部分を切り出して両方から使う。会話の中の部品は押しても会話の中では drill しない。代わりに部品の下に「頁で開く」（例 `/tokyo/shinagawa/2026/budget`）を置き、自治体の頁へ移る。path は server が `jurisdictionPath` で作って data に入れる（画面の bundle に自治体マスタを載せない）。
- 会話は自治体の頁の下から出る drawer（狭い）と `/s/:id`（全幅）の両方に出る。部品は狭い幅を前提にし、頁の SP の描き方（`MoneyFlow` の SP、表の横スクロール）に寄せる。
- 部品の出現は、答えの文より先に tool の結果が届くので、印の下に skeleton を置かず、結果が届いた時点で出す。

### 3. 各 tool

**`show_money_flow({ jurisdiction_code, fiscal_year, document_kind: 'initial' | 'settlement' })`**

- 引数名は api の `document_kind` に揃える（Glossary の phase は金額の段階を指すので使わない）。
- 数字が頁とずれないよう、自治体の頁の loader と同じ関数で引く。歳出の総額と分野は `subjectsOf` の款項目を `subjectTree` に通したもの（`server/app-data.ts`）、歳入の款は `loadRevenue`、1人あたりの住民税に要る歳入の項・目・節は `loadRevenueFlow`、人口は自治体の catalog。`list_expenditures` の `cofog_*_yen` は別の経路で頁と一致する保証が無いので使わない。
- 組み立て（上位7款＋ほかの収入、決算の差を「翌年度へ繰り越すお金など」、1人あたりの住民税）は今 `IncomeFlow` の中にあるので、純粋な関数に切り出して頁と tool の両方から呼ぶ。
- 歳入の無い資料では、頁と同じく入る→使うを描かない（頁は `revenueDoc` が無ければ `IncomeFlow` を出さない、`app-page.tsx`）。`isError` と「この資料は歳入を収録していない」の text を返し、AI は分野の額を文か `show_expenditure_table` で答える。頁に無い「使う」だけの図は作らない。

**`show_expenditure_table({ tool: 'search_expenditure_subjects' | 'search_expenditure_details', arguments })`**

- 消した `render_expenditure_view` と同じく、データ tool と同じ入力を受けて引き直す。前の tool の結果を参照させる案（tool call の ID を渡す）は、`execute` に届く履歴が `toModelOutput` で切った text で、行のデータが残っていないので採らない。
- 出すのは 50 行まで（`page_size` を 50 で頭打ちにする）。結果に `next_page_token` があれば、表の下に「50件まで表示（続きがあります）」と出す。会話の中で続きを読む操作は置かず、続きは AI が `page_token` を渡して同じ tool をもう一度呼ぶ。そのため `content` の text（AI に渡る側）にも、表示した件数・続きがあること・`next_page_token` の値を入れる（`view` は AI に渡らないので、ここに書かないと AI は続きを知れない）。
- 列は名称・階層・金額・金額の段階・出典の頁。出典の頁は、今の頁と同じく自治体の資料の URL の `#page=` へのリンクにする。
- 内訳（`search_expenditure_details`）は、分け方（`breakdown`: 事業・節・その他）ごとに見出しを分けて表を区切り、深さで字下げする。事業と節は同じ目の額の別の切り口なので、表に合計の行を置かず、見出しに「分け方の違う表どうしは足せません」を添える（頁の `FlowTable`・MCP の View が軸ごとに分けているのと同じ）。科目（`search_expenditure_subjects`）も合計の行を置かず、階層（款・項・目）の列を出す。

**`show_local_finance({ jurisdiction_code, sections?: ('debt' | 'free' | 'indicators')[] })`**

- `loadLocalFinance` と人口から、財政タブの `FinanceSections` の節（借金と貯金・事業に回ったお金・財政の指標）を出す。`sections` で節を絞る（省略は全部）。`FinanceSections` を節ごとに出せるように分ける。
- 既存の `get_local_finance`（数字を AI に渡す tool）は残す。「借金はいくら？」のような問いは数字の tool で答え、「財政の様子を見せて」には見せる tool を使う、と説明に書き分ける。

### 4. system prompt と上限

- system prompt に「見せる tool は、図や表のほうが文より分かりやすいとき（内訳・比べる・全体を見たい、出典を見たい）だけ、1回の答えで2つまで呼ぶ。1つの金額で答えが決まる問いには呼ばない。図に出した数字を文で並べ直さない」を足す。
- 見せる tool は1段を使う。ただし content の text が要点の数字を持つので、データ tool を呼ばずに1段目から呼べる問いが多く、段は増えにくい。最後の段（6段目）で tool を呼ぶと答えの文が無いまま終わるので、そのときの画面（部品だけで文が無い）を手元で確かめ、要れば `MAX_STEPS` を 7 にする。
- 利用の記録（`writeUsage` の tools）にそのまま数えられる。会話の記録（`writeChatTurn`）は tool の結果も含めて答えの parts を保存している（`answerParts`、20万字まで）ので、`answerParts` で output の `view` を外し、view の data を D1 に書かない。そのため、記録から会話を開き直す画面を作るときは、部品は出ず印だけになる（tool の入力は残るので、引き直して描くことはできる）。

## Cross-cutting concerns

- **数字の正しさ**: 部品の数字は、tool が内部の口と D1 から引いた値だけ。`IncomeFlow` から切り出す組み立て（上位7款・繰り越しの差）は頁と同じ関数を使い、金額の組み立てなので unit テストを書く（AGENTS.md のテストの範囲の「金額の正しさ」）。
- **大きさ**: view の data は sessionStorage に残る。表は50行、お金の流れは款と分野で数十行、財政は5年分。1回の会話で数百 KB を超えない見込み。
- **費用**: 見せる tool は部品の中身を AI に書かせないので、出力トークンは tool の引数の分だけ増える。`show_money_flow`・`show_local_finance` の引数は自治体・年度などの数語。`show_expenditure_table` はデータ tool と同じ `arguments`（検索の条件と、続きを読むときの `page_token`、512字まで）を書き直すので、その分が増え、D1 の読み取りもデータ tool と合わせて2回になる。D1 への書き込みは増えない（会話の記録から view を外す）。
- **届き方**: execute の戻り値は UI message stream でそのまま画面に届き、`toModelOutput` は AI に渡す分にだけ効く。次の質問の候補の `_meta` が同じ経路で今動いている。

## Considered Options

- **json-render（AI が UI の JSON を書き、許可したカタログの部品で描く）**: 部品の組み合わせを AI が自由に決められ、`@json-render/mcp` で公開 MCP にも同じカタログを出せる。一方で、数字を AI が props に書く（`$state` で state を指せるが、tool の結果を state に流し込むのは自前で書く）、毎回カタログの説明が prompt に乗り spec の分だけ出力が増える、今のモデルで長い JSON が崩れやすい、0.x で1か月に7版（2026-11-19 時点 0.23.2）と変わりが速い。今出したいものは決まった形の図・表なので、自由度より数字の確かさと速さを取った。部品の data は zod で定義しておき、組み合わせの自由が要る場面が出たらカタログに載せ替えられる。
- **データ tool の結果をそのまま部品にする（見せる tool を作らない）**: 検索のたびに表が出て、AI が下調べに呼んだ結果まで画面に並ぶ。どれを見せるかを AI が選べない。
- **前の tool の結果を ID で指す見せる tool**: 引き直しが要らないが、`execute` に届く履歴は AI に渡した text だけで、行のデータが無い。server に結果を取っておく置き場が要る。

## 関連: 出典の頁（見送り）

出典 PDF を会話と自治体の頁の中で開く部品（`show_source_page`）は作らない。2026-11-19 に yuito が見送った（元の PDF は配らず公式 URL から取る、という 2026-11-12 の決定を保つ）。考え直すときのために、レビューで分かった前提を残す。

- 「api は R2 の binding を持たない」は検査（`pipeline/verify/boundaries.ts` の `apiHasNoR2Binding`）と `apps/AGENTS.md` の決まり。非公開の bucket（`fudoki-inputs`）には取り込みの Parquet も入り、binding は読み取りだけにも prefix にも絞れない。R2 から出すなら、公開してよい PDF だけを写した別の bucket を api に繋ぐ案と、ADR が要る。
- `origin_id` は出典の sha256 そのもの。R2 の key（`fiscal/source-selection/<自治体>/<年度>/<資料>[-<分冊>].pdf`）は選定の JSON の受領書にあり、D1 には無い。`fiscal_origin` は `pipeline/dbt/scripts/prepare.py` の `track_origin` が組むので、key を足すならそこ。ただし `fiscal_origin` の列は公開 REST にそのまま出る。
- 今の viewer（`apps/api/ui/pdf-view.tsx`）は全文を `arrayBuffer()` で読んでいて範囲読みではなく、公開 MCP の View も使い続ける。web に持ってくるなら共有の package にする。
- Worker が返す応答の `Cache-Control` は edge に置かれず、Void の ISR も `/api` を対象にしない。範囲読みは1つの PDF で要求が多く、web の `VIEW_RATE_LIMIT`（60回/分/IP）に当たる。
- 評価シートは利用条件で転載が禁じられている（`apps/api/src/source-pages.ts`）。予算書・決算書の利用条件は自治体ごとに未確認。

## 進め方

1. 見せる tool の仕組み（結果の形・`ViewBlock`・schema・`answerParts` から view を外す）と `show_local_finance`（データが web の D1 だけで済む）。
2. `show_money_flow`（`IncomeFlow` の組み立ての切り出しと unit テスト）・`show_expenditure_table`。

各段で手元の web を立ち上げ、品川区と事業の内訳が無いまちで、drawer と `/s/:id` の両方を見る。
