# docs

設計・調査文書。判断の記録はコードと同じ寿命を持ち、git 管理する。

- `adr/`: 決定とその理由。置き換えた・やめた ADR は消さず、先頭の状態を直す
- `prd/<topic>/prd.md` + `prd/<topic>/dd.md`: 実装中・現役の要件と設計書。同じ topic に併置し、その topic の作業記録も同じ dir に置く。やめた設計・終わった試行は消す（git の履歴に残る）
- `survey/`: データ源・道具の実測。主張には実測日を添える。観測は commit しない
- `brand/cover.jpg`: README の表紙

docs の直下にファイルを置かない。
