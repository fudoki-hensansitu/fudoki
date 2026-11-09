// 紹介の頁（/about）の「比べる・確かめる」に載せる数字。api.fudoki.dev の応答をそのまま写したもので、画面では足し算をしない（DESIGN.md「画面で集計しない」）
// 取り直すときは POST /v1/fiscal/expenditure/subjects:search（document_kind=settlement, fiscal_year=2025, account_name=一般会計）。出典の頁と印字の位置は get の locations
export const HOME = {
  // 「確かめる」に載せる出典の切り抜き。brand/home_origin.py と同じ頁・範囲（pt、左上原点）。mark は目「図書館費」の支出済額の印字位置（API の amount_source_*）
  origin: {
    jurisdiction: '新宿区',
    document: '令和7年度歳入歳出決算事項別明細書',
    name: '図書館費',
    amount: 1750575436,
    page: 143,
    crop: [10, 52, 722, 345] as const,
    mark: [652.15, 284.99899, 711.37, 293.99899] as const,
  },
  library: {
    name: '図書館費',
    cofog: '08.2',
    period: 'R7年度決算 · 一般会計 · 各自治体の決算書',
    rows: [
      { jurisdiction: '新宿区', amount: 1750575436 },
      { jurisdiction: '北区', amount: 1093837046 },
      { jurisdiction: '三鷹市', amount: 985302519 },
      { jurisdiction: '八王子市', amount: 942086352 },
      { jurisdiction: '立川市', amount: 741225196 },
      { jurisdiction: '多摩市', amount: 736238123 },
      { jurisdiction: '目黒区', amount: 730160884 },
      { jurisdiction: '西東京市', amount: 596261992 },
    ],
  },
}
