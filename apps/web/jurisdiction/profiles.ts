// 自治体の個別ページに載せる、事務事業評価から取った事業・事業の入れ替え。API にはまだ無いので、出典（事務事業評価・基本構想）から
// 手で起こした値をここに置く。金額は出典の千円を円にしたもの。紋章は public/jurisdictions/<code>/ に置く
// 事業への COFOG の付与・名前の言い換え・文の要約は風土記の判断で、出典の文言そのものではない

/** 事務事業評価シート一枚（小事業）から取った事業。金額・指標・区分はシートの値だけを使う */
export interface EvaluatedProject {
  /** 評価シートの小事業名 */
  name: string
  /** 区政を知らない人に伝わる言い換え（風土記の判断） */
  title: string
  /** 評価シートの予算科目（目）に付いた COFOG コード（cofog_master のコード）。分野の枠はこれで決まる（domains.ts） */
  cofog: string
  /** 目的・概要の要約（風土記の判断） */
  what: string
  /** 評価シートの決算額 */
  settledYen: number
  /** シートの指標のうち、その年度の目標と実績が両方載っている最初のもの。値はシートの表記のまま */
  indicator: { name: string; unit: string; target: string; actual: string }
  /** 最終評価の区分（「C 改善・見直しする事業」）と今後の方向性 */
  grade: string
  direction: string
  /** 評価シートの PDF（evaluationSheets）の頁 */
  page: number
}

export interface Scrap {
  /** 事務事業評価で捻出した財源 */
  raisedYen: number
  /** 区が掲げた捻出の目標。目標を示していない年度は持たない */
  targetYen?: number
  evaluated: number
  grades: { A: number; B: number; C: number; D: number }
  exits: { name: string; reason: string; result: string }[]
}

export interface ProfileYear {
  /** その年度に実施した事業の事務事業評価（翌年度に公表）から、分野ごとに決算額の大きい順に3事業。
   * 評価がまだ公表されていない年度は空。分野の枠へは COFOG で振り分ける（domains.ts）。区の「政策領域」とは別 */
  projects: EvaluatedProject[]
  scrap?: Scrap
  /** 事務事業評価の結果の頁 */
  evaluationSource: string
  /** 事業を取った評価シート（全部局をまとめた PDF） */
  evaluationSheets?: string
  /** 決算・予算の金額の出典（一般会計の歳出を載せた冊の PDF）。pipeline/source_selection の選定結果の URL */
  documents?: { settlement?: SourceDoc[]; initial?: SourceDoc[] }
}

export interface SourceDoc {
  label: string
  href: string
}

export interface Profile {
  code: string
  /** 自治体の紋章（区章・市章など）。品川区は Wikimedia Commons の Public domain の SVG */
  logo?: string
  tags: string[]
  /** 基本構想が掲げる都市像（まちの将来像）。年度によらず header の名前の下に出す */
  vision?: { text: string; source: string }
  /** 会計年度（西暦）ごと */
  years: Record<string, ProfileYear>
}

export const assetPath = (code: string, file: string) => `/jurisdictions/${code}/${file}`

const SHINAGAWA: Profile = {
  "code": "131091",
  "logo": "emblem.svg",
  "tags": [],
  "vision": {
    "text": "輝く笑顔 住み続けたいまち しながわ",
    "source": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/004/987/kihonkoso0327.pdf"
  },
  "years": {
    "2024": {
      "documents": {
        "settlement": [
          {
            "label": "決算書",
            "href": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/751/r6/r6_2.pdf"
          }
        ],
        "initial": [
          {
            "label": "予算書",
            "href": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/656/20240208145918_8.pdf"
          }
        ]
      },
      "projects": [
        {
          "name": "庁舎整備基金積立金",
          "title": "新庁舎のための積み立て",
          "cofog": "01",
          "what": "新しい区役所の建設費などに充てるため、R3年度から毎年度基金に積み立ててきた。建設費の見込みが増えたため、R6年度は最終補正で20億円を上乗せした。",
          "settledYen": 5015419000,
          "indicator": {
            "name": "基金積立額【累計】",
            "unit": "億円",
            "target": "140",
            "actual": "140"
          },
          "grade": "D 完了・廃止する事業",
          "direction": "事業の完了",
          "page": 62
        },
        {
          "name": "住民情報システム運営費",
          "title": "住民票・税のシステムの運用",
          "cofog": "01",
          "what": "住民票・印鑑登録・区民税などを扱うシステムを動かし、法改正への対応、証明書のコンビニ交付、国が定める標準システムへの移行の準備を行う。",
          "settledYen": 1667832000,
          "indicator": {
            "name": "システム停止を伴う障害件数",
            "unit": "件",
            "target": "0",
            "actual": "2"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 15
        },
        {
          "name": "ＩＣＴ推進管理費",
          "title": "行政のデジタル化",
          "cofog": "01",
          "what": "手続きのオンライン化、電子決裁とペーパーレス会議、区民向けの AI チャットボット、データ分析の体制づくりを進める。",
          "settledYen": 1604259000,
          "indicator": {
            "name": "行政手続きのオンライン化",
            "unit": "手続き",
            "target": "600",
            "actual": "695"
          },
          "grade": "A 拡大する事業",
          "direction": "対象・規模等の拡大",
          "page": 13
        },
        {
          "name": "共通商品券普及促進事業",
          "title": "プレミアム付きの区内共通商品券",
          "cofog": "04.1",
          "what": "商店街の連合会が出すプレミアム付き商品券のプレミアム分と経費を助成する。R6年度は区内の中小店舗でのキャッシュレス決済に20％分のポイント還元も行った。",
          "settledYen": 1098804000,
          "indicator": {
            "name": "プレミアム付区内共通商品券 申込件数",
            "unit": "件",
            "target": "53,000",
            "actual": "58,915"
          },
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 133
        },
        {
          "name": "中小企業事業資金融資あっせん",
          "title": "中小企業の融資のあっせん",
          "cofog": "04.1",
          "what": "区内の中小企業が低い利率で事業資金を借りられるよう金融機関に紹介し、利子の一部と信用保証料を区が負担する。",
          "settledYen": 1032067000,
          "indicator": {
            "name": "融資あっ旋紹介状発行件数",
            "unit": "件",
            "target": "1,570",
            "actual": "1,945"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 119
        },
        {
          "name": "道路維持管理費",
          "title": "道路の維持管理",
          "cofog": "04.5",
          "what": "道路の傷んだ箇所の修繕、巡回、路面の清掃、街路樹や排水施設の管理を行う。道路の不具合を区民がスマートフォンから通報できる仕組み（しなみちレポート）も運用する。",
          "settledYen": 890587000,
          "indicator": {
            "name": "区民要望件数【年間】",
            "unit": "件",
            "target": "800",
            "actual": "1,491"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "対象・規模等の見直し",
          "page": 533
        },
        {
          "name": "公園・児童遊園維持管理費",
          "title": "公園・児童遊園の管理",
          "cofog": "08.1",
          "what": "区内276か所の公園・児童遊園・緑地の清掃、樹木の手入れ、遊具や照明の補修、見回りを行う。",
          "settledYen": 1666871000,
          "indicator": {
            "name": "品川区世論調査による指標（公園や子どもの遊び場）",
            "unit": "点",
            "target": "3.7",
            "actual": "3.5"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 544
        },
        {
          "name": "公園・児童遊園整備費",
          "title": "公園・児童遊園の整備",
          "cofog": "08.1",
          "what": "西五反田公園などの施設の更新・改修、ユニバーサルデザイン化、民間の力を使った公園づくり（Park-PFI）、勝島の人道橋の整備を進める。",
          "settledYen": 1000223000,
          "indicator": {
            "name": "公園・児童遊園の改修・新設",
            "unit": "箇所",
            "target": "9",
            "actual": "7"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "対象・規模等の見直し",
          "page": 545
        },
        {
          "name": "品川図書館運営費",
          "title": "品川図書館の運営",
          "cofog": "08.2",
          "what": "区立図書館の中央館として地区館10館を束ね、駅の取次施設、電子図書館、地域資料のデジタルアーカイブを運営する。",
          "settledYen": 544942000,
          "indicator": {
            "name": "品川図書館利用者アンケートによる満足度",
            "unit": "％",
            "target": "85",
            "actual": "90.1"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 639
        },
        {
          "name": "区内私立保育園経費",
          "title": "私立保育園の運営費",
          "cofog": "10",
          "what": "私立保育園に国の基準に沿った委託費を払い、職員を手厚く置くための区独自の助成、保育士の処遇改善、特別な配慮が要る子の受け入れ体制づくりを支える。",
          "settledYen": 20657247000,
          "indicator": {
            "name": "私立保育園在園児数（延べ人数）",
            "unit": "人",
            "target": "94,289",
            "actual": "83,703"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 211
        },
        {
          "name": "生活保護費",
          "title": "生活保護",
          "cofog": "10.7",
          "what": "国の基準で計算した生活費を、生活に困っている世帯に支給する。家庭訪問などで状況をつかみ、自立に向けた支援につなげる。",
          "settledYen": 10912307000,
          "indicator": {
            "name": "進学・就職準備給付金",
            "unit": "件",
            "target": "17",
            "actual": "8"
          },
          "grade": "B 継続する事業",
          "direction": "法定受託事務・法定扶助費等",
          "page": 342
        },
        {
          "name": "児童手当給付金",
          "title": "児童手当",
          "cofog": "10",
          "what": "子どもを育てている世帯に手当を支給する。R6年10月分から高校生年代まで対象を広げ、所得制限をなくした。",
          "settledYen": 5384454000,
          "indicator": {
            "name": "児童手当受給者数（延べ）",
            "unit": "人",
            "target": "751,370",
            "actual": "462,806"
          },
          "grade": "B 継続する事業",
          "direction": "法定受託事務・法定扶助費等",
          "page": 188
        },
        {
          "name": "予防接種事業",
          "title": "予防接種",
          "cofog": "07.4",
          "what": "法律で定められた定期予防接種を行い、任意の予防接種の費用の一部を助成する。",
          "settledYen": 2509011000,
          "indicator": {
            "name": "五種混合ワクチン１期初回定期予防接種率",
            "unit": "％",
            "target": "100",
            "actual": "98.3"
          },
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 387
        },
        {
          "name": "出産・子育て応援事業",
          "title": "出産・子育て応援ギフトと妊娠期からの相談",
          "cofog": "07.4",
          "what": "妊娠届のときの面談などで相談に乗り、妊婦と出産後の家庭に5万円ずつのギフトを渡す。",
          "settledYen": 769630000,
          "indicator": {
            "name": "８カ月アンケート回答率",
            "unit": "％",
            "target": "50",
            "actual": "58.7"
          },
          "grade": "D 完了・廃止する事業",
          "direction": "事業移管・統合",
          "page": 356
        },
        {
          "name": "公害健康被害補償事業",
          "title": "公害による健康被害の補償",
          "cofog": "07",
          "what": "大気汚染で健康を損なった人の認定と医療費などの補償、呼吸器のリハビリ教室や肺年齢測定会を行う。",
          "settledYen": 447411000,
          "indicator": {
            "name": "各種審査会（認定・報酬・大気）",
            "unit": "回",
            "target": "36",
            "actual": "36"
          },
          "grade": "B 継続する事業",
          "direction": "法定受託事務・法定扶助費等",
          "page": 368
        },
        {
          "name": "大崎駅周辺地区再開発事業",
          "title": "大崎駅・五反田駅周辺の再開発",
          "cofog": "06.2",
          "what": "大崎駅・五反田駅の周辺で、民間の再開発を誘導・支援し、道路や広場を整備する。",
          "settledYen": 5545508000,
          "indicator": {
            "name": "大崎地区内の事業完了件数",
            "unit": "件",
            "target": "17",
            "actual": "16"
          },
          "grade": "B 継続する事業",
          "direction": "計画・規定どおり",
          "page": 477
        },
        {
          "name": "京浜急行線連続立体交差化事業",
          "title": "京急線の高架化と駅前広場",
          "cofog": "06.2",
          "what": "泉岳寺駅〜新馬場駅のあいだの京急線を高架にして踏切3か所をなくし、駅前広場を整備する。",
          "settledYen": 2789233000,
          "indicator": {
            "name": "連続立体交差事業進捗率",
            "unit": "％",
            "target": "40",
            "actual": "40"
          },
          "grade": "B 継続する事業",
          "direction": "計画・規定どおり",
          "page": 483
        },
        {
          "name": "不燃化特区支援事業",
          "title": "燃えにくいまちへの建て替え支援",
          "cofog": "06.2",
          "what": "木造住宅が密集する地区（不燃化特区）で、古い建物の取り壊しや燃えにくい建物への建て替えの費用を助成し、相談窓口を置く。",
          "settledYen": 795766000,
          "indicator": {
            "name": "東中延一・二丁目、中延二・三丁目及び西中延三丁目地区 不燃領域率",
            "unit": "％",
            "target": "57",
            "actual": "56.4"
          },
          "grade": "B 継続する事業",
          "direction": "計画・規定どおり",
          "page": 470
        },
        {
          "name": "収集運搬作業費",
          "title": "ごみの収集",
          "cofog": "05.1",
          "what": "燃やすごみを週2回、陶器・ガラス・金属ごみを月2回集める。事業系ごみや粗大ごみの有料処理券を販売する。",
          "settledYen": 1409787000,
          "indicator": {
            "name": "区民１人１日あたりのごみ収集量",
            "unit": "ｇ",
            "target": "437",
            "actual": "431"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 514
        },
        {
          "name": "資源回収",
          "title": "資源の回収",
          "cofog": "05.1",
          "what": "区内約11,000か所の資源ステーションから週1回資源を集め、学校など区の施設でも回収する。資源の持ち去りを見回る。",
          "settledYen": 1139535000,
          "indicator": {
            "name": "資源ステーション回収・回収量",
            "unit": "トン",
            "target": "17,736",
            "actual": "17,124"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 502
        },
        {
          "name": "資源物再商品化経費",
          "title": "資源物の再商品化",
          "cofog": "05.1",
          "what": "集めたプラスチック・びん・ペットボトルなどを処理し、再商品化する業者に引き渡す。",
          "settledYen": 196671000,
          "indicator": {
            "name": "ペットボトルベール品質調査",
            "unit": "点",
            "target": "85",
            "actual": "83"
          },
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 504
        },
        {
          "name": "学校改築推進経費",
          "title": "学校の改築",
          "cofog": "09",
          "what": "古くなった学校を、子どもの数の見込みに合わせて計画的に建て替える。",
          "settledYen": 4471954000,
          "indicator": {
            "name": "新規着手校数（年度別）",
            "unit": "校",
            "target": "1",
            "actual": "1"
          },
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 587
        },
        {
          "name": "給食運営費",
          "title": "学校給食の運営",
          "cofog": "09",
          "what": "学校給食の無償化、調理業務の委託、栄養士業務の委託、食器や衛生用品の購入、調理機器の修繕を行う。",
          "settledYen": 3047859000,
          "indicator": {
            "name": "給食調理業務等代行の評価",
            "unit": "校",
            "target": "46",
            "actual": "45"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 601
        },
        {
          "name": "学校ＩＣＴ活用経費",
          "title": "学校の ICT 環境",
          "cofog": "09",
          "what": "すべての児童・生徒に学習用タブレットを配り、電子黒板やデジタル教科書など授業で使う機器を整える。",
          "settledYen": 1950090000,
          "indicator": {
            "name": "タブレット型端末配備台数",
            "unit": "台",
            "target": "26,400",
            "actual": "26,400"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 595
        }
      ],
      "scrap": {
        "raisedYen": 2364986000,
        "evaluated": 665,
        "grades": {
          "A": 40,
          "B": 262,
          "C": 324,
          "D": 39
        },
        "exits": [
          {
            "name": "イメージアップ運動",
            "reason": "区民サービスの向上に向けて事業を考え直した",
            "result": "廃止"
          },
          {
            "name": "シティプロモーション推進",
            "reason": "都市ブランディングの考え方を含めて事業を組み直す",
            "result": "廃止"
          },
          {
            "name": "外国人観光客の誘致",
            "reason": "総合的な戦略を検討し、事業を組み直す",
            "result": "廃止"
          },
          {
            "name": "社会教育委員会議",
            "reason": "会議のあり方を考え直した",
            "result": "廃止"
          },
          {
            "name": "親元近居支援",
            "reason": "助け合いにより効果的な事業を考え直す",
            "result": "廃止"
          },
          {
            "name": "防災フェア",
            "reason": "地区の総合防災訓練と合わせて組み直す",
            "result": "廃止"
          }
        ]
      },
      "evaluationSource": "https://www.city.shinagawa.tokyo.jp/kusei/shisakukeikaku/1005171/1005172/1005173.html",
      "evaluationSheets": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/173/20240222105532_36.pdf"
    },
    "2025": {
      "documents": {
        "settlement": [
          {
            "label": "決算書",
            "href": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/751/r7/r7_2.pdf"
          }
        ],
        "initial": [
          {
            "label": "予算書1",
            "href": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/655/2025tousyoyosan_5.pdf"
          },
          {
            "label": "予算書2",
            "href": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/655/2025tousyoyosan_6.pdf"
          }
        ]
      },
      "projects": [],
      "scrap": {
        "raisedYen": 2014563000,
        "targetYen": 2000000000,
        "evaluated": 669,
        "grades": {
          "A": 34,
          "B": 271,
          "C": 319,
          "D": 45
        },
        "exits": [
          {
            "name": "イメージアップ運動",
            "reason": "始めて32年がたち、当初の目的を果たした",
            "result": "廃止"
          },
          {
            "name": "区政アドバイザー会議",
            "reason": "外部の助言は、ほかの会議で必要に応じて聞けている",
            "result": "廃止"
          },
          {
            "name": "社会教育委員会議",
            "reason": "諮問機関としての役目を終えた",
            "result": "廃止"
          },
          {
            "name": "前立腺がん・喉頭がん検診",
            "reason": "国の指針にない検診で、死亡を減らす効果の根拠が足りない",
            "result": "廃止を検討"
          },
          {
            "name": "高齢者の配食サービス",
            "reason": "費用や食事の内容で民間のサービスが上回る",
            "result": "廃止を検討"
          },
          {
            "name": "区民斎場「なぎさ会館」",
            "reason": "利用が減って赤字が続き、臨海斎場が式場を広げる",
            "result": "廃止を検討"
          }
        ]
      },
      "evaluationSource": "https://www.city.shinagawa.tokyo.jp/kusei/shisakukeikaku/1005171/1008977/index.html"
    },
    "2026": {
      "documents": {
        "initial": [
          {
            "label": "予算書",
            "href": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/654/2026tousyoyosan_3.pdf"
          }
        ]
      },
      "projects": [],
      "scrap": {
        "raisedYen": 1522098000,
        "targetYen": 2000000000,
        "evaluated": 652,
        "grades": {
          "A": 16,
          "B": 339,
          "C": 271,
          "D": 26
        },
        "exits": [
          {
            "name": "区民斎場「なぎさ会館」",
            "reason": "使う人が減り、近くに代わりの斎場もある",
            "result": "廃止"
          },
          {
            "name": "冊子「ミニ区政概要」",
            "reason": "区のホームページと内容が重なる",
            "result": "廃止"
          },
          {
            "name": "荏原町安全安心ステーション",
            "reason": "防犯カメラが普及した",
            "result": "廃止"
          },
          {
            "name": "企業・大学との連携促進",
            "reason": "連携が広がり、当初の目的を果たした",
            "result": "廃止"
          },
          {
            "name": "公園へのミスト設置",
            "reason": "シェードポリシーの中で考え直す",
            "result": "見送り"
          }
        ]
      },
      "evaluationSource": "https://www.city.shinagawa.tokyo.jp/kusei/shisakukeikaku/1005171/1005172/1005173.html"
    }
  }
}

export const PROFILES: Record<string, Profile> = { [SHINAGAWA.code]: SHINAGAWA }
