# C. dbt

`pipeline/dbt/` は、入力の準備（`scripts/prepare.py`）、staging・intermediate・marts、seed、検査（`tests/`）を持つ。入口は `bun run --cwd pipeline dbt:build`。設計は [dbt モデルの設計](../../../../docs/prd/fiscal-dbt-models/dd.md) と [配信する表の設計](../../../../docs/prd/fiscal-serving-tables/dd.md)。

## 入力

- 管理 JSON と、SHA・行数を照合した保存済みの表だけを読む。入力の準備が会計・未読・所属未確認・scope を検査し、通らなければ止まる。
- 表の一覧は管理 JSON から作る。手で表を足さない。共通のモデルで通らない表は、除外の理由をコードに宣言する。
- 取り込みの検査はやり直さない。階層はノードの表の親子、単位と金額の見出しは金額の表、会計と注記は管理 JSON から取る。足りないものを推定値や空の表で補わない。

## モデル

- staging は取り込みの行と1対1を保ち、文字列と金額は共通の macro（`trim_cell`・`staging_amount`）を通す。PDF のノードの表は全自治体で同じ SQL、CSV は書式ごとに作り、ノードの形への変換は intermediate で行う。
- 段の名前は共通の規則で付ける（[ADR 0025](../../../../docs/adr/0025-level-names-by-shared-rule.md)）。見出しから金額の段階への対応は共通の辞書に宣言する（[ADR 0021](../../../../docs/adr/0021-level-and-phase-map-in-dbt-seed.md)）。会計の種類は語の辞書で付け、辞書に無い会計名は止める（[ADR 0023](../../../../docs/adr/0023-account-kind-and-no-consolidation.md)）。
- 足すのは同じ軸の子だけ。親と子、分け方の違う枝は足さない。
- コード・宣言・判断は Git、DB・検査結果は再生成する `pipeline/.build/` に置く。

## 内訳の分け方（breakdown）

新しい出典を取り込んだら、目の直下の内訳の欄の見出しごとに分け方（事業・節・その他・除外）を seed `fiscal_detail_breakdown` に宣言する。宣言の要る範囲と書き方は seed の説明にある。同じ見出しの語でも自治体で中身が違うので、他の自治体の行を写さず、目の直下の名称を見て決め、`basis` に確かめた中身を書く。宣言の無い見出しと使われない宣言は検査が止める。

## 確かめること

- 構築の成功を、全公開資料の収録完了と扱わない。
- 行数の一致だけで値の一致としない。単位・金額の段階の根拠は出典から取る。
