# MCP Apps UI を React と shadcn/ui で構成する

担当者: Codex（wwwyo/mcp-ui-react-shadcn）
更新日: `2026-10-14`
状態: Implemented（ローカル検証済み）

## Summary

既存の3種類の表と原典 PDF を React の画面コンポーネントへ移す。App bridge は画面の effect から独立した状態を持ち、React が購読する。PDF は React が取得・描画の寿命を管理し、項目と金額の既知の頁だけを並べる。

## Goals / Non-Goals

[PRD](prd.md) の閲覧操作と既存の API/MCP 契約を維持する。比較・推移 UI、配布 plugin、公開 web、デプロイは対象外とする。

## Background

現行の結果は団体一覧、歳出ノード一覧、一ノードと軸ごとの子に分かれる。tool入力はhost通知で渡され、画面内の内訳と追加ページはhost経由でtoolを呼ぶ。原典 PDF は既存 API の中継で取得する。UI の入力・財政データの意味は変更しない。

## Design

### 接続と表示の寿命を分ける

`ui/bridge.ts` は初期通知のhandlerを登録してから一度だけ接続し、結果・入力・履歴・取得状態を保持する。`useSyncExternalStore` はこの状態を読むため、React StrictMode の購読再実行で接続やtool要求が増えない。購読は解除関数を返す。tool要求はイベントから開始し、処理中の重複操作を拒否する。

追加ページでは行・軸ごとの子・原典を結合し、次に内訳へ進むときに、結合後の結果を履歴に保存する。戻る操作は再取得しない。hostの新しい入力・結果、戻る、破棄で要求の世代を進め、古い応答を無視する。進行中の要求にはAbortSignalも渡す。

高さ通知のResizeObserverとresize listenerは接続側で所有し、破棄時に解除する。teardownではReactをunmountしてから応答を返し、bridgeを閉じる。初期接続前に通知を受けても保持できる。

参照: [Reactの外部状態購読](https://react.dev/reference/react/useSyncExternalStore)、[StrictMode](https://react.dev/reference/react/StrictMode)、[App SDK](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html)。

### 公式部品とhostのスタイルを使う

shadcn CLI `4.21.3` の公式 `@shadcn` registryから、Table、Button、Input、NativeSelect、Badge、Empty、Alert、Skeleton、Fieldと依存するLabel・Separatorを取得した。共有部品は公式のBase UI版（base-nova）を取得し、Button・Input・Separator・BadgeのprimitiveにはBase UIを使う。Label・NativeSelect・Table等にはHTML要素を使う。@base-ui/reactは7日経過版の1.8.0にexact固定し、Radixへの依存を除去した。ホストの意味別tokens・フォントは維持する。React/React DOMは`19.3.0`、Tailwindは`4.3.3`。直接依存はexact指定とし、CLI・依存の公開から7日経過をnpm registryで確認した。`cn`はCLIが追加した公式shadcn-uiのclass結合ライブラリで、`0.4.0`に固定する。

`packages/ui/src/styles/globals.css` でDESIGN.mdの色・文字・角丸と、hostのbackground/text/border/font変数をshadcnの意味別tokensへ対応させる。light/darkはhostの明示値を優先し、値が無い場合はOS設定を使う。項目枠の緑と金額枠の橙、白いPDF紙面を維持する。hostのフォントCSSは既存SDK helperで反映し、外部フォントの許可domainは追加しない。

参照: [shadcn Table](https://ui.shadcn.com/docs/components/base/table)、[Native Select](https://ui.shadcn.com/docs/components/base/native-select)、[Tailwind PostCSS](https://tailwindcss.com/docs/installation/using-postcss)。

### PDF の既知の頁を並べる

`ui/pdf-view.tsx` は取得時にAbortControllerを作り、PDF.jsのloading taskを破棄時にdestroyする。effectの開始をmicrotaskへ送り、StrictModeの直後のcleanupで不要になった取得を開始しない。描画effectはRenderTaskをcancelし、canvasのwidth/heightを0へ戻す。選択を変える場合はviewerを作り直す。

項目頁・金額頁は正の整数だけを使い、重複を除き、項目・金額の順で配置する。全canvasの合計を400万pixel以下、各canvasの長辺を8192pixel以下に抑え、寸法は切り下げる。拡大率は表示幅・150%・200%で、CSS表示幅だけを変える。狭い領域でも見開きは内部で横スクロールし、host全体の横幅を広げない。頁と4座標が対応し、有限・非負・正の大きさ・頁内の枠だけを描く。回転はPDF.jsの表示後viewport寸法に対応させる。

取得 URL・日時・取り込み時と異なる可能性を示す。失敗時もURLと項目・金額の頁番号を残す。閉じると元の操作へfocusを戻す。

### 単体 HTML を再生成する

`ui/build.ts` はBunでTSX・React・App SDK・PDF.jsのworker handlerをbundleし、PostCSS/TailwindでCSSを生成してHTMLへinline化する。通常はReact production版を使う。共有部品のクラスは`packages/ui/src/`から検出する。CSSに外部参照が残る場合はbuildを失敗させる。APIのbuildはViewの再生成を先に実行する。HTML内容からhash付きresource URIと`src/view.generated.ts`を生成する。CSPのAPI origin、MIME type、旧`ui/resourceUri`キーは既存のサーバー実装を維持する。

## Alternatives Considered

- 手動DOM更新の継続: bundleは小さいが、表示の置換と履歴・非同期処理の対応を今後も手動で保つ必要がある。ユーザー指定のReact移行を採用する。
- bridge接続をReact effectで開始:構成は短くなるが、StrictModeのsetup/cleanupで接続と通知の順序が複雑になる。接続を一か所で所有し、Reactは購読する。
- PDFの頁切替の継続:狭い幅でも大きな1頁を表示できるが、別頁の項目と金額を往復する必要がある。見開きと内部スクロールを採用する。
- 外部workerやCDN:HTML容量を減らせるが、既存のCSP境界を拡大する。従来のworker handler同梱を保つ。

## Cross-Cutting Concerns

MCP/REST schema、原典の中継、財政明細、金額の段階や和の条件を変更しない。OAuth・外部registry・本番操作は追加しない。ReactとRadixの同梱による容量増加は残る。PDFの高さとcanvas容量を固定上限内に抑え、閉じる・結果置換・teardownで破棄する。

## Validation / Rollout

`tests/mcp-ui.e2e.ts` は試験hostの固定結果と通常のAppBridge通知・tool要求で、3画面・状態・履歴・テーマ・遅い応答・teardownを検証する。`tests/origin-pdf.e2e.ts` はローカル環境で動かすWorker・D1・DOの実装と合成PDFで、見開き・同頁・枠欠損・回転・頁不整合・幅・閉じる・取得再利用を検証する。hostは`allow-scripts`のみのsandbox、API originのみのconnect-src、worker-src 'none'を維持する。

ローカルの検証結果と画像は以下に記録する。今回はcommit・push・PR・deployを行わない。移行後のChatGPT・Claude・Cursor実接続は未確認で、本番の既存UIの確認実績とは分ける。


## ローカル検証結果（2026-10-14）

- `mise exec -- bun run typecheck:all` と `mise exec -- bun run --cwd apps/api test` が成功。APIテストは138件で、公開schema・MIME type・旧キー・CSP・UI再生成の同期を含む。
- `mise exec -- bun apps/api/ui/build.ts --check` と `mise exec -- bun run build:api` が成功。buildはViewを再生成してからcfのdry-runを実行する。生成HTMLは約2.5 MB。デプロイは行っていない。
- API cwdで `E2E_TELEMETRY_DISABLED=1 mise exec -- bun run test:e2e --output .e2e/final --trace on` が33件成功。団体の絞込み/展開/追加、検索/軸ごとの内訳/末端/追加済み行を含む戻る、0件/読込み/失敗/再試行、host通知/遅いtool応答/teardownを確認した。
- PDFは同頁/別頁/片方の頁/欠損枠/頁外枠/次頁継続/回転/頁不整合、320/375/414/768pxの拡大/内部横スクロール/金額側への移動、focus復帰/取得中の閉じる/遅い応答/中継の再利用、極端な縦横比でのcanvas上限を確認した。頁欠損は試験hostの不完全な通知を使う。公開schemaでは項目頁が必須なので、その試験のためにD1へNULLの項目頁を保存しない。
- development版のReactでも24件成功。traceは各画面で初期化1回で、PDFを2回開くケースの取得要求は2回。想定した502/429以外のconsole errorはなかった。最終生成物はproduction版に戻した。
- ChatGPT/Claude風の背景色・文字色・フォント変数を送る試験hostでlight/darkを確認した。実製品のhostContextを採取した再現ではなく、host通知への追従の検証である。
- 既存の実在PDF用fixtureをOrca terminalで起動し、ローカルAppBridge hostから武蔵野市のPDFを取得して、日本語と項目/金額の枠を確認した（追加1件成功）。公開APIは読取りだけに使い、本番D1/R2の変更はない。
- Orcaのsnapshotはsandbox iframeの内部へ入れなかったため、視認にはe2eのブラウザ画像を使った。画像と絶対パス別の差分は、gitignore内の `.agent/reports/mcp-ui-react-shadcn/result.md`、実行結果は `apps/api/.e2e/{final,strict-mode,real}/report.json` に置く。

新設文書の文章・技術レビューを別々に行い、履歴保存の時点、native部品とRadixの区別、ローカル検証の表現を修正した。技術レビューで見つかったhost未指定時のフォント変数の循環参照と、canvas寸法の整数化による上限超過も修正して検証した。移行後のChatGPT・Claude・Cursor実接続は未確認である。


## 共有packageと操作用dev画面

共通の11部品と意味別tokensは`packages/ui`（`@fudoki/ui`）が所有する。Reactはpeer依存とし、appと同じcatalog版を使う。class結合・Radix・icon・共有CSSの依存はUI packageへ移した。各appはsource exportをbundleする。団体・財政明細・App bridge・PDFはAPI appに残す。

appとUI packageの`components.json`はstyle・icon・baseColorを揃え、公式CLIの`info`から同じ共有部品を認識できることを確認した。appから追加した共通部品も`packages/ui/src/components/`に向く。[shadcnのmonorepoガイド](https://ui.shadcn.com/docs/monorepo)に沿ってworkspace exportとaliasを設定する。

`mise exec -- bun run --cwd apps/api dev:ui`はローカルの試験Worker/D1/DOとAppBridge hostを起動し、`http://127.0.0.1:4317/preview?ui=jurisdictions`で各パターンを実際のiframeに表示する。上部で団体一覧/検索/軸ごとの内訳/末端/PDF/頁欠損/0件/読込み/失敗/再試行/遅い応答を選ぶ。テーマと幅も切り替えられる。試験データと合成PDFを使い、本番データを変更しない。

UI・共有部品の保存では、ビルドキャッシュを無効にして再生成し、同じパターンを再読み込みする。ファイル変更を短時間でまとめ、同じビルド要求はPromiseを共有する。host/serverの変更はBunのwatchで再起動する。プレビューの部品選択・幅・テーマはURLに保持する。この画面と検証用の操作は開発サーバーだけに存在し、配信する単体HTMLには含めない。

共有packageへの移動後、型検査、APIテスト138件、Viewの再生成同期、API buildと既存UI/PDFのE2E24件が成功した。操作用dev画面のパターン切替・テーマ・iframe幅・PDF・再試行・遅い応答・リセットは`tests/preview.e2e.ts`で検証する。dev画面の操作と共有部品保存による再生成は3件すべて成功した。結果は`apps/api/.e2e/{shared-ui,preview}/report.json`に置く。Orcaの`MCP UI dev` terminalでdevサーバーを継続して動かす。

## 表示する文言を絞る

結果自体で分かる情報を説明文やラベルで繰り返さない。団体の絞込みラベルは読み上げ用に残し、一団体だけの場合は絞込みを出さない。通常の件数説明と収録範囲のバッジを外し、絞込み中の一致件数だけを表示する。

明細名から内訳を開き、別の「内訳」操作を各行に置かない。軸名は子の表の列見出しにまとめ、科目の種別と原典タイトルの重複表示を外す。原典の頁番号を操作にし、項目と金額が別頁の場合だけ区別を併記する。PDFの取得URLはURL自体をリンクにする。

列見出し、年度・会計、空・失敗・取得中の状態、PDFの取得日時・内容変更の可能性、頁番号と枠の区別は判断に必要な情報として残す。DESIGN.mdの無彩色のデータ面、文字と余白による階層、host由来のフォント、意味別tokensを維持する。

この整理後、型検査、APIテスト138件、生成物の同期、UI/PDFのE2E24件、操作用dev画面のE2E3件が成功した。結果と各パターンの確認画像は`apps/api/.e2e/{simple,simple-preview}/`に置く。操作用dev画面も同じ実装を再生成する。

### 団体の収録範囲を直接表示する

利用者の追加指定により、団体行の展開とそのstate・keyboard handlerを外した。収録範囲のセルに年度・資料の種類を一度だけ表示し、その下に会計名と原典リンクを置く。一団体の場合も同じ表を使う。行は通常の表の行として扱い、クリック可能な見た目や`aria-expanded`を持たない。

一覧の追加取得は既存の表に続きを加える操作なので、ボタンを「次のページ」から「さらに表示」へ変更した。APIのpage tokenと追加取得・履歴の処理は同じである。

この変更はAPI appの型検査と生成物の同期が成功し、UI操作のE2E10件、devプレビューのE2E3件で検証した。結果は`apps/api/.e2e/{flat-coverage,flat-coverage-preview}/`に置く。

## 歳出のチャートと原典確認の整理

追加指定により、歳出検索結果の原典列を外した。原典は明細を開いて確認する。`ui/expenditure-charts.tsx`は公式CLIから取得した`packages/ui/src/components/chart.tsx`を使い、RechartsのPieで表示する。[shadcnのChart](https://ui.shadcn.com/docs/components/base/chart)と[Pie例](https://ui.shadcn.com/charts/pie)を参照した。Chartの依存としてCardも公式CLIが追加した。Rechartsはnpm registryで公開日時と最新の7日経過版を確認し、`3.10.1`をroot catalogにexactで固定した。

一つの円には、団体・年度・資料区分・会計・軸・段・原典の親IDが同じ明細だけを渡す。款・項・目の印字額を直接使い、画面で親や会計の総額を計算しない。階層の情報が不足した結果や別の軸は表に残す。複数の範囲は選択で切り替える。親と子は別の円になり、別年度・会計・軸も混ざらない。取得済みの明細内の割合であり、未取得の続きがある場合は明示する。

欠損・負数・安全な整数でない額を含む範囲は円グラフにせず、金額を表で示す。0円の行は表に残し、正の額がない範囲も表にする。0円や不明額を別の数値に置き換えない。色は無彩色の識別補助とし、COFOGの色として扱わない。名称・金額の表とtooltipを併置する。

款の選択後も款の円と選択状態を残し、項、目の円を並べる。祖先の別の明細を選ぶと、その位置より先の履歴を置き換える。選択は円または表から同じtool要求を一度だけ送り、取得中は操作を止める。App bridgeの接続・abort・世代による古い応答の除外を引き続き使う。狭いhostでは縦に並べる。

PDFは見開きと頁送りを中心にし、取得情報を折りたたむ。強調箇所の中心から縦横の点線を頁全体へ伸ばし、2pxの枠線と文字領域の間に2pxの余白を取る。詳細は[原典PDFの設計](../origin-pdf-viewer/dd.md)に記す。

操作用devには「款→項→目」「款で絞った結果」「取得途中」「金額欠損」のパターンも追加した。すべて試験データで、実際のAppBridge・CSP・sandbox下のReact UIを使う。

最終検証は型検査全対象、APIテスト138件、UI・チャート・PDFのE2E29件、dev画面のE2E3件が成功した。暗いテーマ調整後は4幅×4テーマの操作を1件再確認した。生成物の同期とAPI buildのdry-runも成功。結果は`apps/api/.e2e/{charts-final,charts-dev-final,chart-theme}/`。画像と絶対パス別の差分・コマンド・git statusは`.agent/reports/mcp-ui-react-shadcn/result.md`に記す。本番の実接続は未確認で、デプロイは実施していない。


### 色と常時表示の凡例（追加指定）

「グラフが何を示すか、hoverしなくても分かる」よう、階層・対象を見出しに表示し、扇形と一覧を同じ色と番号で対応させた。名称と円単位の金額は常時表示する。14度未満の小さい扇形はSVGの番号を省いて重なりを避けるが、一覧の色・番号・名称・金額は残す。

利用者の色指定を優先し、先の無彩色パレットから12色の識別補助に更新した。この画面内の番号に対応する色であり、COFOG分類の色や分類結果を意味しない。色が循環する多数の項目でも番号で区別できる。light/darkで色相を保ち、明度を変える。DESIGN.mdの全体設定・他のappは変更しない。

団体一覧の収録範囲は年度・資料の種類だけにし、会計名と原典リンクを外した。APIに含まれる会計・原典のデータは変更しない。

### チャットの流れの中で一度見る画面への作り直し（2026-10-14）

View はチャットの中で一度見て先へ進む使われ方をする。分からないことはチャットで聞き直すので、繰り返し使う操作（絞り込み欄・円の範囲の選択・掘り下げた階層を並べる表示）を外し、感覚的に分かることを優先した。上の「色と常時表示の凡例」と円グラフ・12色の構成はこれで置き換えた。

- **金額は一色の横棒の長さで見せる。** 円と凡例の表を、名前・割合・金額・横棒の1行にまとめた（`ui/bars.tsx`）。棒は最大の行に対する長さ、割合は合計に対する比。並びは金額の大きい順で、11件を超えると上位10件だけを出し、残りは件数と割合を添えて畳む。割合は同じ親・資料・会計の兄弟だけに出し、団体や年度が混ざる結果では出さず、行ごとに団体と年度を添える
- **今見ている明細だけを1カラムに出す。** 掘り下げると画面を置き換える。見出しの形は下の項目に記す
- **原典は明細ごとに「原典を見る」1つ。** host が対応していれば全画面（`requestDisplayMode`）で PDF を開き、戻ると inline に戻す。PDF 画面の取得情報（URL・取得日時・注意書き）の折りたたみは外し、ページ送りの右に参照元へのリンクだけを置く
- **見ている対象を `updateModelContext` で AI に伝える。** 掘り下げ・PDF を開いたあとにチャットで「これは？」と聞かれたとき、AI が対象を指せる
- **団体名は MCP の結果の `_meta.jurisdictionNames` に載せる。** structuredContent と REST の契約は変えない
- 団体一覧は団体 × 年度の表にし、収録した資料の区分を置く。区分を押すと、その団体・年度・資料の一般会計（無ければ最初の会計）の款を取得する
- **見出しは一覧と明細で同じ形にする。** 1行目は shadcn の Breadcrumb による経路（今の画面は太字）と右寄せの範囲（団体・年度・資料）、2行目は金額（一覧では兄弟の合計）と参照。経路の段は押して戻れ、通っていない款・項は親を辿って移れる。名前の前には区分（款・項・目・節・事業）のタグを置く
- 金額は兆・億を小数第1位まで、万は整数で出し、円単位の正確な額は title にだけ置く。文字の段は DESIGN.md の本文・見出し・ラベルに合わせ、大きくするのは金額だけ
- 画面の文言は「原典」ではなく「参照」と呼び、ボタン・リンクは名詞にする（参照・参照元・続き・← 明細）

UI の E2E は `tests/view.e2e.ts` の主要な流れ4件に置き換えた（`mcp-ui`・`expenditure-charts`・`preview`・`origin-pdf` の E2E は削除）。
