// ホームに載せる数字。api.fudoki.dev の応答をそのまま写したもので、画面では足し算をしない（DESIGN.md「画面で集計しない」）
// 取り直すときは POST /v1/expenditure/nodes:search（document_kind=settlement, fiscal_year=2025, account_name=一般会計）。出典の頁は source_page
export const HOME = {
  nakano: {
    jurisdiction: '中野区',
    period: '令和7年度 決算',
    document: '令和7年度中野区各会計歳入歳出決算書',
    // 款の上位7つ（支出済額の大きい順）
    kanList: [
      { name: '子ども教育費', amount: 58443843520 },
      { name: '健康福祉費', amount: 35007274203 },
      { name: 'まちづくり推進費', amount: 21630493705 },
      { name: '諸支出金', amount: 17424157244 },
      { name: '総務費', amount: 15640931656 },
      { name: '区民費', amount: 14920957629 },
      { name: '地域支えあい推進費', amount: 10244505881 },
    ],
  },
  // ホームの表で順に切り替える自治体。款は支出済額の最も大きいもの、その下の最も大きい項、その下の上位2つの目、目ごとに上位3つの内訳。
  // 内訳は API の軸「節」、無ければ軸「備考」（新宿区は事業の一覧）。COFOG の「仮」は tentative、「分類できない」は unclassifiable
  ledgers: [
    {
      jurisdiction: '中野区',
      kan: { name: '子ども教育費', amount: 58443843520, page: 120 },
      kou: { name: '子ども費', amount: 39677209243, page: 120 },
      moku: [
        {
          name: '保育園・幼稚園費',
          amount: 20712681454,
          cofog: '分類できない',
          page: 120,
          detail: [
            { kind: '節', name: '扶助費', amount: 17588572813, page: 120 },
            { kind: '節', name: '負担金補助及び交付金', amount: 2226175147, page: 120 },
            { kind: '節', name: '委託料', amount: 355826620, page: 120 },
          ],
        },
        {
          name: '子育て支援費',
          amount: 9147986681,
          cofog: '10.4',
          page: 120,
          detail: [
            { kind: '節', name: '扶助費', amount: 8111557205, page: 120 },
            { kind: '節', name: '委託料', amount: 753643656, page: 120 },
            { kind: '節', name: '負担金補助及び交付金', amount: 208633145, page: 120 },
          ],
        },
      ],
    },
    {
      jurisdiction: '三鷹市',
      kan: { name: '民生費', amount: 44901001222, page: 154 },
      kou: { name: '児童福祉費', amount: 20143661300, page: 160 },
      moku: [
        {
          name: '保育所費',
          amount: 11311439480,
          cofog: '10',
          page: 162,
          detail: [
            { kind: '節', name: '扶助費', amount: 7651759488, page: 164 },
            { kind: '節', name: '負担金補助及び交付金', amount: 1477396304, page: 164 },
            { kind: '節', name: '給料', amount: 553952574, page: 162 },
          ],
        },
        {
          name: '児童福祉総務費',
          amount: 6292165847,
          cofog: '10.4',
          page: 160,
          detail: [
            { kind: '節', name: '扶助費', amount: 5571600335, page: 162 },
            { kind: '節', name: '負担金補助及び交付金', amount: 642446506, page: 162 },
            { kind: '節', name: '委託料', amount: 45388101, page: 160 },
          ],
        },
      ],
    },
    {
      jurisdiction: '北区',
      kan: { name: '福祉費', amount: 99094047827, page: 63 },
      kou: { name: '児童福祉費', amount: 42637549508, page: 66 },
      moku: [
        {
          name: '児童福祉総務費',
          amount: 17280210796,
          cofog: '10.4',
          page: 66,
          detail: [
            { kind: '節', name: '扶助費', amount: 8888013625, page: 67 },
            { kind: '節', name: '給料', amount: 2979267283, page: 66 },
            { kind: '節', name: '職員手当等', amount: 2527517072, page: 66 },
          ],
        },
        {
          name: '児童保育費',
          amount: 13604688989,
          cofog: '10.4',
          page: 67,
          detail: [
            { kind: '節', name: '扶助費', amount: 10032782670, page: 67 },
            { kind: '節', name: '負担金補助及び交付金', amount: 3266473620, page: 67 },
            { kind: '節', name: '償還金利子及び割引料', amount: 256567708, page: 67 },
          ],
        },
      ],
    },
    {
      jurisdiction: '目黒区',
      kan: { name: '健康福祉費', amount: 66530841295, page: 59 },
      kou: { name: '児童福祉費', amount: 39070113107, page: 64 },
      moku: [
        {
          name: '児童福祉事業費',
          amount: 28914165240,
          cofog: '10.4',
          page: 65,
          detail: [
            { kind: '節', name: '扶助費', amount: 22211650733, page: 65 },
            { kind: '節', name: '負担金、補助及び交付金', amount: 5808702287, page: 65 },
            { kind: '節', name: '償還金、利子及び割引料', amount: 440090261, page: 65 },
          ],
        },
        {
          name: '児童福祉総務費',
          amount: 6811339742,
          cofog: '10.4',
          page: 64,
          detail: [
            { kind: '節', name: '給料', amount: 2372336087, page: 64 },
            { kind: '節', name: '職員手当等', amount: 2316824000, page: 64 },
            { kind: '節', name: '共済費', amount: 953671472, page: 65 },
          ],
        },
      ],
    },
    {
      jurisdiction: '新宿区',
      kan: { name: '福祉費', amount: 47204750736, page: 97 },
      kou: { name: '生活保護費', amount: 22637659292, page: 102 },
      moku: [
        {
          name: '扶助費',
          amount: 21137089401,
          cofog: '10.7',
          page: 103,
          detail: [
            { kind: '事業', name: '保護費', amount: 20606678815, page: 103 },
            { kind: '事業', name: '保護施設等事務費', amount: 422078728, page: 103 },
            { kind: '事業', name: '法外援護', amount: 108331858, page: 103 },
          ],
        },
        {
          name: '生活保護総務費',
          amount: 1500569891,
          cofog: '10.7',
          page: 103,
          detail: [
            { kind: '事業', name: '職員費', amount: 1208230409, page: 103 },
            { kind: '事業', name: '生活保護法施行事務', amount: 145917820, page: 103 },
            { kind: '事業', name: '被保護者の生活支援事業', amount: 140006462, page: 103 },
          ],
        },
      ],
    },
  ],
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
    period: '令和7年度決算 · 一般会計 · 各自治体の決算書',
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
