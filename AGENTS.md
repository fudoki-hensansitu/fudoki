# 風土記

**まちのお金、何に使ってる？** 自治体が何にいくら使い、どう振り返ったかを、事業の単位までわかりやすく見せ、同じデータをオープンデータとして配る。

- **見せる**: 自治体ごとのページ（apps/web）。住民が「この町は何にいくら使っているか」を読める形にする
- **配る**: 同じデータを出典つきで REST・MCP・オープンデータとして配る（apps/api）。誰でも無料で使える（商用での利用は利用規約の条件に従う）

扱うのは**お金の使い道**に絞る。中心は予算・決算・事業評価（と、その土台の基本構想などの計画）で、歳出は**事業単位（目とその下の事業階層）まで**集約した AI ready なデータにする。**議会**（議案・議決など）と**選挙**（候補者・結果など）は風土記に載せず、別のサイトで扱う。避難場所や公共施設のような生活情報は、自治体の全部を載せるとコンセプトがぼやけるため風土記には取り込まない。自治体からそうしたデータの構造化を頼まれたら、取り込まずに構造化だけを引き受ける。

見せ方は評価を書かず、出典と並べるところまでにする。無駄を告発する見せ方は、自治体がデータを出さなくなり供給が閉じるため採らない。自治体どうしにも順位付けや良し悪しの色付けをしない。

713年の官命により、諸国へ地名の由来や産物を**同じ様式で報告させて集めた**地誌『風土記』と呼んでいたことから名付けている。

## Story

自分の街や他の街のことを知りたい人が、行政が何を決め、何にいくら使っているかを、わかりやすい形で、他の街や他の年と同じ物差しで、出典まで辿れる形で見られる。中心は支出で、事業の単位まで見られる。

Core actions:
- ある自治体・年度の支出を事業の単位で見る — 月次
- 自治体をまたいで、または年をまたいで比べる — 月次
- 数字が怪しいと思ったときに、出典と合っているか・注意点が無いかを確かめる — 年数回

## Glossary

用語を置き換えるときは複合語の単位で行う。法令用語・固有名詞・複合語の一部（「全国地方公共団体コード」「国民健康保険団体連合」「公共団体施行事業費」）は置き換えない。裸の語がそうした複合語の一部にも現れるときは、`_Avoid_` に裸の語ではなく置き換える複合語を書く。

**風土記**:
このプロジェクトの名称。画面・説明文・ドキュメントでは「風土記」と表記する。
リポジトリ名・パッケージ名・URL・コード上の識別子の `fudoki` は変更しない。
_Avoid_: fudoki、fudoki（風土記）（利用者向けの表記として）

**金額の段階（phase）**:
金額が予算案・承認済みの予算・補正後の予算・執行実績のどの段階を表すかの区分。資料の種類とは別で、決算資料にも複数の段階の金額が載る。

**予算案（proposed）**:
議会の承認前に提案された予算額。

**当初予算（approved）**:
年度当初の予算として議会が承認した金額。

**補正後の予算（adjusted）**:
補正や流用・充用などを反映した予算現額。補正による増減額だけを表すものではない。

**補正後の予算（流用・充用前）（adjusted-before-transfer）**:
補正を反映し、流用・充用を反映する前の予算額。

**決算・執行実績（executed）**:
実際に収入・支出した金額。歳入では収入済額、歳出では支出済額などが該当する。

**金額の注記（amount annotation）**:
出典の備考などに載る、流用元・流用先、充用、不用額などを説明する文言と金額。科目の予算額・執行額とは別に保持し、金額の段階を付けず、それらの合計に加えない。

**お金の向き（direction）**:
自治体に入る金額か、自治体から出る金額かの区分。

**歳入（revenue）**:
自治体に入る金額。

**歳出（expenditure）**:
自治体から出る金額。

**予算（budget）**:
自治体・年度ごとに、科目別の歳入・歳出の金額を持つデータ。風土記では予算案から決算・執行実績までを金額の段階で区別する。

**機能分類（functional-classification）**:
歳出を目的・行政機能で分ける分類軸。歳入には適用しない。

**款・項・目（kan / kou / moku）**:
自治体の歳出科目の階層。款が最も粗く、項、目の順に細かくなる。

**COFOG（cofog）**:
政府支出の機能別分類。款・項・目とは別の体系で、自治体間の比較に使う。

**経済分類（economic-classification）**:
金額を人件費・物品購入・移転などの経済的な性質で分ける分類軸。

**節（setsu）**:
自治体の歳出科目で、目の内訳を経済的な性質で分ける区分。歳入の節は収入の種類・根拠を分ける区分で、歳出の節とは意味が異なる。

**GFSM の経済分類（gfsm）**:
政府財政統計マニュアル（GFSM）に基づく経済分類。節だけでは一意に決まらず、支出内容や相手先などが必要になる。現在の配布物には含めない。

**支出（spending）**:
個々の支払いを取引単位で記録したデータ。科目別に集計された決算・執行額とは粒度が異なる。

**取引（transaction）**:
誰が、誰に、いつ、いくら支払ったかを表す個々の記録。

**配布物（Fiscal Data Package / package）**:
自治体ごとに風土記が配る、財政データとその意味・出典を記述したメタデータのまとまり。出典と宣言・判断から生成する。
_Avoid_: 成果物、出力

**パイプライン（pipeline）**:
出典から提供用データを作るまでのデータの流れ。

**出典（origin）**:
自治体が公開した予算・決算の資料そのもの（CSV または PDF）。
_Avoid_: 原典、ソース、元データ、生データ

**出典対象（source）**:
自治体・年度・当初／補正号／決算で区別する、収録する資料の対象。会計・お金の向きは出典に含まれる内容として扱う。同じ対象を載せる複数のURLや形式とは区別する。

**出典の選定結果（selection）**:
一つの出典対象を代表する資料を定めた判断。分冊の場合は必要な冊を含める。取り込み表の採用や、その対象全体の収録完了とは区別する。

**取り込み（ingestion / raw）**:
出典を表に読み込んだもの。値や単位は出典のまま。PDF は印字された項目と金額を、親子の所属を保ったまま表（ノードの表と金額の表）にする。CSV は原文の行と1対1の表にする。PDF の場合は組版からの抽出（抽出は復元検査が成り立たず、出典の内部で重複して印字された数字どうしの一致で確かめる）。
_Avoid_: パース、OCR（OCR は抽出の手段の1つ）

**取り込みの整形（staging）**:
取り込みの表の型と、文字列・金額の表記を整えたもの。風土記では取り込みの行と1対1の対応を保ち、金額の単位も出典のままにする。PDF の取り込みの表は全自治体で同じ形（ノードの表と金額の表）なので出典ごとには分けず、CSV は書式ごとに分ける。

**中間処理（intermediate）**:
利用者向けのデータを作るための準備。風土記では自治体間の構造・金額単位の統一、共通科目への対応、COFOG 分類を行う。

**提供用データ（marts）**:
利用者が使う列・粒度を確定した最終データモデル。風土記では出典由来の金額と分類などの判断を列の説明で区別し、COFOG は歳出明細と同じ表に含める。MCP・自治体別 CSV・Fiscal Data Package などの配布経路は、ここから作る。

**正規化**:
列・型・単位・表記などを共通の形に揃える処理。特定の dbt 層の別名ではない。

**判断**:
出典にない対応・分類・推定を風土記が定めること。層名ではなく処理やデータの性質を表す。

**証跡（provenance）**:
出典との対応や確認の根拠。独立したprovenanceファイルは生成・保存しない。出典・意味は入力一覧と出典宣言、訂正はコードから参照する宣言、検査結果は再生成するレポートで扱う。
_Avoid_: ログ

**財政明細（fiscal line）**:
歳出明細と歳入明細の総称。両者を同じ種類の明細とは扱わない。

**歳出明細（fiscal expenditure line）**:
一つの財政資料に載る、支出の目的・科目・金額を表す明細。別年度・別文書の明細とは区別する。

**自治体マスタ（jurisdiction master）**:
自治体コードと自治体の名称を対応付ける共通の定義。年度ごとの予算・決算や提供データの版とは区別する。
_Avoid_: 団体マスタ

**COFOG分類マスタ（COFOG master）**:
政府支出の目的別分類のコード・名称・階層の共通定義。明細に対する分類結果や金額とは区別する。

**歳出の節マスタ（fiscal expenditure setsu master）**:
給料・旅費・委託料等の法定区分と、その適用期間の共通定義。個々の予算対象や金額とは区別する。

**歳出の節（fiscal expenditure setsu）**:
給料・旅費・委託料等、歳出の経済的な性質による区分。歳入の節や、支出の目的による COFOG 分類とは別の概念である。

**歳出予算対象（fiscal expenditure budget item）**:
自治体・年度・会計・科目／事業経路・追加区分と歳出の節で区別し、予算の基準額と変更を追跡する対象。節の対応が不明な場合は、出典で確認できる粒度を保持する。

**歳入明細（fiscal revenue line）**:
一つの財政資料に載る、収入の種類・科目・金額を表す明細。歳出明細とは別の概念であり、COFOG の分類対象ではない。

**決算歳出明細（settlement expenditure line）**:
決算の実際の支出を表す明細。金額は支出済額一つであり、予算の基準額・変更履歴とは別に扱う。

**決算歳入明細（settlement revenue line）**:
決算の実際の収入を表す明細。金額は収入済額一つであり、予算の基準額・変更履歴とは別に扱う。

**財政明細の階層経路（fiscal line hierarchy）**:
一明細が属する会計・款・項・目・事業等を、自治体の科目体系の順序で並べたもの。

**財政明細の追加区分（fiscal line dimension）**:
階層経路に加えて明細を識別する、所属や予算区分などの出典の区分。

**科目の表（expenditure subject）**:
一つの資料の歳出の款・項・目を1行ずつ持つ表。同じ資料の末端の科目（目と、目の無い項）を足すと総額になる。

**内訳（expenditure detail）**:
科目（主に目）の下に出典が印字した、事業・節などの行。内訳の内訳も持つ。科目とは別の表に置き、科目と足さない。

**分け方（breakdown）**:
内訳の枝が何で分けているかの区分（事業・節・その他）。出典と欄の見出しごとに風土記が宣言する判断。分け方の違う内訳は同じ支出の別の切り口なので足さない。

**所管課（department）**:
内訳の名称の末尾の【】に印字された、事業を担当する課の名前。

**印字の位置（location）**:
科目・内訳の行が出典に印字された頁と枠。PDF だけが枠を持つ。

## ディレクトリ構造

```
.
├── pipeline/         # source_selection、ingestion/fiscal、dbt（マスタと正規化macro）
├── packages/         # fiscal の純粋な型・名称、jurisdictions
├── apps/             # web（ホーム・紹介・自治体の頁・AI との会話）、api、docs
├── docs/
│   ├── prd/<topic>/{prd,dd}.md   # 要件と設計書。同じ topic に併置する
│   ├── adr/                      # 決定の記録
│   └── survey/                   # データ源の実測
└── .agent/           # 個人メモ・試作（gitignore）
```

docs/ は共有文書として Git で管理し、判断の記録はコードと同じ寿命を持たせる。置き場の規約は prd skill に従う。

各 dir の構造・判断・手順の詳細はその dir の AGENTS.md に置く（`pipeline/`・`apps/`・`packages/`・`docs/`）。

## セットアップ

ツールは mise で管理している。mise は cwd の `mise.toml` で版を選ぶので、`cf` など mise で管理する tool は repo の中から実行する（scratchpad から叩くと別の版になり、引数や PATH が違って落ちる）。

```bash
mise install
bun install
uv sync

bun run --cwd pipeline ingestion:check   # 取り込みの宣言・選定・fingerprint を検査
bun run typecheck:all                    # 型検査（root と全 package）
bun run test                             # テスト（web の入口と各 package）
bun run --cwd pipeline test:python       # パイプラインの Python テスト
bun run build:web                        # build（api・docs も build:api・build:docs）
bun run dev:api                          # API をローカルで起動（web は dev:web）
bun run inspect:mcp                      # MCP Inspector を本番の MCP（api.fudoki.dev/mcp）向けに起動
```

lint の script は持たない。

unit テストは、金額の正しさ・公開 API の安全性（認証・入力の上限・SQL の bind・停止スイッチなど）・壊すと利用者に届く契約（MCP の出力 schema など）のように、間違えると困るものに限って書く。画面や細かい振る舞いはローカルの e2e（smoke）で確かめ、CI では回さない。CI は速さを優先する。

依存は exact ピン留めにする。公開から7日未満の版は `bunfig.toml`（`minimumReleaseAge`）と root の `pyproject.toml`（`exclude-newer`）で解決から外す。セキュリティ修正は severity に関わらず cooldown の例外として直ちに適用し、例外を解除できる日時を PR 本文に書き、公開から7日経ったら例外と補助の固定を外す。

### secret

手元で使う secret は root の `fnox.toml` に age で暗号化して commit する（[fnox](https://fnox.jdx.dev/)、mise で入る）。値は `recipients` に並べた公開鍵の全員が自分の秘密鍵で開ける。平文・秘密鍵は commit しない。この repo は public なので暗号文は誰でも見られる。

- 鍵は fudoki 専用にする。個人の global の secret などを開ける鍵を recipients に入れない（漏れたときに fudoki 以外まで開くため）
- 各自の fudoki 用の秘密鍵は OS の keychain（service `fnox-fudoki`、account `age-key`）に置き、`fnox.toml` の `identity` がそこから読む。shell に `FNOX_AGE_KEY` を export しない（export するとそちらが優先され、全 repo の fnox に同じ鍵が渡る）
- 中身は `TYPESAFE_API_KEY`（パイプラインの Jev の聞き直し。fudoki 用に発行した key）と `ESTAT_APP_ID`（e-Stat API の appId。コードはまだ読まず、agent が統計表を API で引くときに使う）。どちらも今は yuito のアカウントのもので、`TYPESAFE_API_KEY` はメンバーが使うと yuito の課金になる。メンバーが増えたら共有を続けるか各自の key にするかを決める
- 使うときは `fnox exec --if-missing error -- <command>` で、その command にだけ env を渡す（例: `fnox exec --if-missing error -- bun run --cwd pipeline ingestion:convert ...`）。`--if-missing error` が無いと、復号できない値は警告だけで env に入らないまま command が走る。`fnox get`・`fnox export`・`printenv` で値を画面や log に出さない
- 値を足す・変える: `fnox set <KEY>` を実行し、値は hidden prompt か stdin で渡す（引数に書くと shell 履歴に残る）
- メンバーを足す: 本人が fudoki 用の鍵を作って keychain に入れ（macOS: `d=$(mktemp -d) && age-keygen -o "$d/k" 2>/dev/null && age-keygen -y "$d/k" && security add-generic-password -U -s fnox-fudoki -a age-key -w "$(grep '^AGE-SECRET-KEY' "$d/k")"; rm -rf "$d"`。公開鍵だけが表示される）、公開鍵（`age1...`）を `recipients` に 1 行足す。鍵を持つ人が `fnox reencrypt -p age` で暗号文を作り直す。agent・CI に渡すときも専用の鍵を 1 本作って同じように足す
- AI agent（cloud 環境）用の鍵: recipients の `# ai` の行。秘密鍵は yuito の keychain（service `fnox-fudoki`、account `age-key-ai`。作り方は上と同じで account だけ変える）に置き、cloud 環境の環境変数 `FNOX_AGE_KEY` に渡す（`FNOX_AGE_KEY` は `identity` より優先されるので keychain の無い Linux でも開ける）。cloud 環境には mise を版固定で入れ、`mise.toml` の fnox を入れる（setup script: `curl -fsSL https://mise.run | MISE_VERSION=v2026.11.5 sh`、`export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"`、`mise trust --yes && mise install`）。止めるときは、行を消して `fnox reencrypt -p age`、cloud 環境の `FNOX_AGE_KEY` を消し、値を rotate する
- メンバーが抜ける: `recipients` から行を消して `fnox reencrypt -p age` で作り直す。その人は git 履歴の古い暗号文をまだ開けるので、値そのものを rotate する
- `CLOUDFLARE_ACCOUNT_ID` は secret ではないので `mise.toml` の `[env]` に平文で置く。`CLOUDFLARE_API_TOKEN` などの CI・deploy の secret は GitHub secret、本番の Worker の secret（`TURNSTILE_SECRET_KEY` など）は Cloudflare に置き、`fnox.toml` には入れない。CI に `FNOX_AGE_KEY` を渡すとその 1 本で全部開くため、CI からは fnox を使わない

## 技術スタック

- **パイプライン**（取得・OCR・dbt 変換・検証・保存・一時検証の規則）→ `pipeline/AGENTS.md`
- **公開面**（web・api・docs、web はホーム・紹介・自治体の頁・AI との会話）→ `apps/AGENTS.md`
- **言語・依存**: TypeScript は Bun workspaces（共有版は `catalog:` で集約）、Python は uv workspace。exact ピン留め・cooldown 7日
- **保存の大原則**: Git はコード・宣言・判断・入力一覧、非公開 R2 は出典・取り込み表。`.cache/`・`.build/` は再生成可能なローカル作業領域
- **script の置き場**: package の作業はその package.json が所有し、root は `pipeline:*`・`dev:*` などの入口と orchestration だけを持つ

## Skills

構造・判断・手順の詳細は各 dir の AGENTS.md と文書へ逃がしてある。この文書には書かない。

- パイプラインの実装・script・技術スタックを触るとき → `pipeline/AGENTS.md`
- 学び・ハマりどころ・過去の失敗 → `.agents/skills/<topic>/`
- データ源を調べるとき → `docs/survey/`
- 歳出・歳入のドメインモデルとクラス図 → `docs/prd/fiscal-records/fiscal-domain-model.md`
- 外部から取り込んだ skill → `.agents/skills/shadcn/`（`shadcn/ui` から skillctrl で取得。取得元と hash は `skills-lock.json`・`.agents/skillctrl/lock.json`）。他の `.agents/skills/` は repo で書いたもの。Claude Code へは `.claude/skills/` の相対 symlink で渡す
- PR レビュー → Pullfrog。設定の正本は `.github/pullfrog.config.sh`（backend の値は git から見えないので、変えるときはこの script を直して実行する）。public repo なので追加コミットも自動で再レビューし（`review.re-review=true`）、`@pullfrog` で手動依頼もできる
