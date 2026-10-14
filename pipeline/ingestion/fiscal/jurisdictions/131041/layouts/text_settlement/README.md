# 新宿区の text 決算書

2025決算の一般・介護・国保・後期の4表を汎用text変換へ移行した。原典SHAは `ca3f8658f6dbe295978db484227ec1c7adbdc15eeb136f109fa406798511c1eb`。頁の範囲は選定のscope、会計と表IDは管理宣言、見開きの綴じ位置は `expenditure.layout.json` の `spread.gutter=0.5` から読む。構築と保存の関門は [汎用の設計](../../../../../../../docs/prd/generic-node-builder/dd.md) と [組版設定](../../../../../../../docs/prd/generic-node-builder/layout-settings.md) に従う。

| 会計 | ノード 前→後 | 金額件数 前→後 | 追加した節 |
| --- | ---: | ---: | ---: |
| 一般 | 1,127→2,308 | 2,535→7,260 | 1,159 |
| 介護保険 | 92→179 | 408→758 | 77 |
| 国民健康保険 | 90→147 | 430→673 | 50 |
| 後期高齢者医療 | 36→65 | 170→301 | 24 |

特別会計の旧提供データ214行は全保持し、名前・金額・分類・繰出先は同一。原典座標を更新し、節151行を加える。総括の反復した款と注記もrawに保持する。国保では総括の物理149頁に印字された予備費充用2,208,000円を独立した注記として加える。注記・節・備考という別の軸の金額は相互に加算しない。

専用の変換器とoptions schemaは、4表の切替え後に参照がなくなったため削除した。`inspect_origin.py`・`inspect_pdfkit.swift`・`validation.py` は、以前の専用wide表を校正した独立検査の材料として保持する。その検査は過去のwide候補を入力にし、現在のノード・金額の表の検査には共通の `ingestion:verify` を使う。

`pipeline/` で、原典SHAと復元したPDFへの対応JSON、未使用の候補出力先を指定する。

```sh
bun run ingestion:check --manifest ingestion/fiscal/jurisdictions/131041/2025/settlement/expenditure.json
bun run ingestion:convert \
  --manifest ingestion/fiscal/jurisdictions/131041/2025/settlement/expenditure.json \
  --inputs <inputs.json> --output <candidate-directory>
bun run ingestion:verify --candidate <candidate-directory>
```
