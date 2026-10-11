# dbt のモデル層と配布処理を分ける

## 決定

予算のモデルを `staging → intermediate → marts` に分け、原典の取得・取り込みと配布パッケージの生成は dbt の外に置く。

- staging：原典ごとの列名・型の整形。原典の行と1対1の対応と金額単位を保つ。
- intermediate：提供用データのための中間処理。団体間の構造統一、円換算、共通科目への対応、COFOG 分類を行う。
- marts：利用者向けの列・粒度を確定する。風土記では団体別 CSV に書き出す。
- 配布：CSV に列の定義・出典・利用条件を添える処理は dbt の外に置く。

原典由来の支出・歳入も、団体間の構造・単位の統一のため intermediate を経る。分類は intermediate で付け、marts では原典由来の値と同じ明細の列に置く（2026-10-11 に改めた）。

## 理由とトレードオフ

「正規化」「判断」は処理の性質であり、モデル層とは別の軸である。層名は dbt の推奨構成に合わせる。

判断の有無は、dbt の層の定義とは別の情報として残す。規則表の役割と下流への伝播を報告し、原典由来の値と風土記が付与した分類は、同じ明細の別の列として提供し、列の説明で区別する。

## 参照

dbt の層は強制仕様ではなく推奨構成。[Staging](https://docs.getdbt.com/best-practices/how-we-structure/2-staging) は原典ごとの準備、[Intermediate](https://docs.getdbt.com/best-practices/how-we-structure/3-intermediate) は最終モデルを作る中間処理として整理されている。配布ファイルを書き出すこと自体を marts の定義にはしない。
