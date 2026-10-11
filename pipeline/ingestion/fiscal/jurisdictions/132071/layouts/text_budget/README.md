# 昭島市の text PDF 予算見開き

2025年度一般会計当初予算の原典SHAは `4662197051b0ec0d9c50e1690c5804d0b31e17dd7d35b972fd272e03068507f8`。469物理頁のうち歳出明細は108–449頁（紙面104–445頁）、450頁から給与費明細書である。選定で渡される10–11頁の款・項の印字合計も取り込む。

管理入口は `convert.py`。文字層の抽出、継続見開きの目への所属、説明の字下げと金額右端、折り返し名称の確認には、測定書式 `../budget_spread.json` と共通の `fiscal/layouts/statement/text_document.build_document` を使う。組み立て部分は本dirの `assemble` に置く。年度や頁ごとの例外は持たない。

- 款・項のコード・名称・本年度予算額・前年度予算額・比較は総括表の印字から読む。目は明細の番号トークンを名称から分離し、番号のない前年のみの目も残す。
- 目の下に説明、節の区分、財源内訳の名称をそれぞれ独立した枝として置く。説明の節へ、別欄の節コードを転記しない。
- 国都支出金・地方債・その他・一般財源は、目に属する金額とし、印字見出しの経路を保持する。例えば `本年度予算額の財源内訳／特定財源／国都支出金`。
- すべての名称と金額に物理頁とPDF pointの矩形を持たせる。名称・金額の印字位置と、反復した祖先を識別する位置を分ける。継続で名称と金額の頁が異なるときも、それぞれの位置を残す。桁区切り・△・印字0・空欄を保持する。

共通の管理入口が横持ちの候補からノードの表と金額の表を生成するため、converterは印字セルの位置を持つ中継Parquetと `column_contexts` を返す。この中継表は配布・保存対象ではない。最終の候補は `*-nodes.parquet` と `*-amounts.parquet` の組である。保存済みの旧3590行34列の表は、候補のR2保存・管理JSONの採用まで残る。

```sh
bun run --cwd pipeline ingestion:originals \
  --manifest ingestion/fiscal/jurisdictions/132071/2025/initial/expenditure.json \
  --output ../.agent/akishima-inputs.json --remote
bun run --cwd pipeline ingestion:convert \
  --manifest ingestion/fiscal/jurisdictions/132071/2025/initial/expenditure.json \
  --inputs ../.agent/akishima-inputs.json --output ../.agent/akishima-new-candidate
bun run --cwd pipeline ingestion:verify --candidate ../.agent/akishima-new-candidate
```

出力dirは新しいものを指定する。converterは管理JSONやR2を更新しない。R2への保存は管理入口の `--remote` による別の操作である。

2026-10-11の再抽出候補はノード7060行・金額7629行。款13、項29、目110（前年のみの番号なし2目を含む）の本年度予算額は56,360,000千円。共通の木の検査2373件が一致し、未読・所属未確認は0。説明空白の目は、予備費と前年のみの2目である。

共通の木の検査は決算の見出しを対応させるため、予算の `本年度予算額` と `説明`・`節／金額`、財源の異なる見出し間の照合は別に確かめる必要がある。候補試行では説明→目、節→目、財源名称の内訳→目の同じ財源欄、財源4欄→本年度予算額を検算する。空欄の金額行を作って0を補うことはしない。

`inspect_origin.py` と `inspect_detail_origin.py` は構築コードをimportせず、原典から款・項・目・節の独立した検査用観測を作る。`validate_candidate.py` と `cli_checks.py` は旧3590行の保存値を照合する検査であり、新しいノードの候補には使わない。旧横持ち表の検査宣言は `132071/sum_checks/2025/initial/expenditure.json` に残る。ノードの候補では `ingestion:verify` が共通の木の検査を使う。
