// 自治体の個別ページに載せる、事務事業評価から取った事業・事業の入れ替え。API にはまだ無いので、出典（事務事業評価・基本構想）から
// 手で起こした値をここに置く。金額は出典の千円を円にしたもの。紋章は emblems.ts が扱う
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
  /** シートの指標のうち、その年度の目標と実績が両方載っている最初のもの。値はシートの表記のまま。載っていなければ持たない */
  indicator?: { name: string; unit: string; target: string; actual: string }
  /** 最終評価の区分（「C 改善・見直しする事業」）と今後の方向性 */
  grade: string
  direction: string
  /** 評価シートの PDF（evaluationSheets）の頁 */
  page: number
}

/** 今ある小事業の中で、その年度に始めた取り組み。評価シートの特徴的事項・取組内容から、始めたことを書いた一文を抜き出したもの。
 * 評価は取り組みだけのものはなく、含まれる小事業全体のもの */
export interface Initiative {
  /** 区政を知らない人に伝わる言い換え（風土記の判断） */
  title: string
  /** 評価シートの文そのもの（空白だけ詰める）。要約しない */
  quote: string
  /** 含まれる小事業の名前（評価シートの小事業名） */
  name: string
  /** 含まれる小事業の予算科目（目）の COFOG コード */
  cofog: string
  /** 含まれる小事業全体の決算額・最終評価の区分・方向性 */
  settledYen: number
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
  /** その年度に新しくできた事業。事務事業評価（翌年度に公表）のシートのうち、事業期間がその年度から始まり、
   * 前年度の行政コストが0で、前年度までの指標の実績が無いもの。決算額の大きい順。評価がまだ公表されていない年度は空。分野の枠へは COFOG で振り分ける（domains.ts）。区の「政策領域」とは別 */
  projects: EvaluatedProject[]
  /** 今ある小事業の中でその年度に始めた取り組み。候補はシートの文（「令和6年度から」「開始」など）と費用の増え方で機械的に絞り、
   * 始めたことを書いた一文を抜き出す（今は品川 R6 の見本を手で置いている） */
  initiatives?: Initiative[]
  /** 予算案のプレス発表資料の施策（budget-press.ts）。事業評価（projects・initiatives）がまだ公表されていない年度に、サーバーで足す */
  budgetNew?: import('./budget-press').PressItem[]
  /** budgetNew を取った予算案のプレス発表資料の PDF。サーバーで足す */
  budgetPress?: string
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
  tags: string[]
  /** 基本構想が掲げる都市像（まちの将来像）。年度によらず header の名前の下に出す */
  vision?: { text: string; source: string }
  /** 会計年度（西暦）ごと */
  years: Record<string, ProfileYear>
}

export const assetPath = (code: string, file: string) => `/jurisdictions/${code}/${file}`

const SHINAGAWA: Profile = {
  "code": "131091",
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
          "name": "定額減税補足給付金",
          "title": "定額減税で引ききれない分の給付",
          "cofog": "01.1",
          "what": "国の定額減税（住民税1万円・所得税3万円×人数）で税額から引ききれない人に、その差額を給付した。",
          "settledYen": 1441439000,
          "indicator": {
            "name": "給付者数",
            "unit": "人",
            "target": "44,351",
            "actual": "37,424"
          },
          "grade": "D やめる・終える",
          "direction": "事業の完了",
          "page": 22
        },
        {
          "name": "児童入所施設措置費等支弁経費",
          "title": "施設や里親に預けた子どもの費用",
          "cofog": "10",
          "what": "区の児童相談所が子どもを児童福祉施設や里親に預けたときの生活費や医療費などを支払う。",
          "settledYen": 429671000,
          "indicator": {
            "name": "児童福祉施設等の措置児童数等",
            "unit": "人",
            "target": "510",
            "actual": "553"
          },
          "grade": "B 継続する事業",
          "direction": "法定受託事務・法定扶助費等",
          "page": 170
        },
        {
          "name": "選挙執行費",
          "title": "衆議院議員選挙の執行",
          "cofog": "01.6",
          "what": "衆議院議員選挙と最高裁判所裁判官の国民審査の投票・開票、選挙公報の配布、ポスター掲示場の設置などを行った。",
          "settledYen": 223204000,
          "indicator": {
            "name": "選挙の効力に関する異議申出の件数",
            "unit": "件",
            "target": "0",
            "actual": "0"
          },
          "grade": "B 継続する事業",
          "direction": "法定受託事務・法定扶助費等",
          "page": 652
        },
        {
          "name": "選挙執行費",
          "title": "東京都知事選挙の執行",
          "cofog": "01.6",
          "what": "東京都知事選挙と都議会議員補欠選挙の投票・開票、選挙公報の配布、ポスター掲示場の設置などを行った。",
          "settledYen": 204373000,
          "indicator": {
            "name": "選挙の効力に関する異議申出の件数",
            "unit": "件",
            "target": "0",
            "actual": "0"
          },
          "grade": "B 継続する事業",
          "direction": "法定受託事務・法定扶助費等",
          "page": 651
        },
        {
          "name": "児童相談所運営費",
          "title": "区の児童相談所の運営",
          "cofog": "10",
          "what": "区が自ら児童相談所を運営し、虐待の通告を24時間受け、子どもと家庭の相談・支援を行う。医師や弁護士も確保し、職員の研修を行う。",
          "settledYen": 149439000,
          "indicator": {
            "name": "虐待相談対応件数",
            "unit": "件",
            "target": "913",
            "actual": "602"
          },
          "grade": "A 拡大する事業",
          "direction": "新規の取組み",
          "page": 218
        },
        {
          "name": "児童相談所維持管理経費",
          "title": "児童相談所の建物の管理",
          "cofog": "10",
          "what": "児童相談所と一時保護所の光熱水費、警備・清掃、設備の維持管理、修繕を行う。",
          "settledYen": 76933000,
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 220
        },
        {
          "name": "戸籍住民関係事務費",
          "title": "戸籍住民課の窓口の案内と遠隔支援",
          "cofog": "01.3",
          "what": "戸籍住民課の受付案内システムとフロアマネージャーを置き、地域センターの窓口を本庁の職員がWebカメラで支える。",
          "settledYen": 63302000,
          "indicator": {
            "name": "年間来庁者数",
            "unit": "件",
            "target": "100,000",
            "actual": "114,347"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "対象・規模等の見直し",
          "page": 106
        },
        {
          "name": "一時保護所運営費",
          "title": "一時保護所の運営",
          "cofog": "10",
          "what": "虐待などで家庭から一時的に離れた2歳から18歳までの子どもが暮らす一時保護所で、生活用品・学習・運動・食事を用意する。",
          "settledYen": 40106000,
          "indicator": {
            "name": "一時保護所入所児童数",
            "unit": "人",
            "target": "42",
            "actual": "78"
          },
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 219
        },
        {
          "name": "粗大ごみ再商品化経費",
          "title": "粗大ごみのリユース・リサイクル",
          "cofog": "05.1",
          "what": "粗大ごみの中から木製品・衣装ケース・自転車・羽毛布団を選び出し、リユースやリサイクルに回す。",
          "settledYen": 39777000,
          "indicator": {
            "name": "粗大ごみからのリユース・リサイクル率",
            "unit": "％",
            "target": "45",
            "actual": "47.8"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "対象・規模等の見直し",
          "page": 518
        },
        {
          "name": "整備地域不燃化加速事業",
          "title": "燃えにくいまちへの建て替え支援を広げる",
          "cofog": "06.2",
          "what": "不燃化特区のほかにも火事の危険が高い地区（中延四丁目・小山二丁目）で、古い建物の取り壊しや建て替えの費用を助成し、専門家を派遣する。都の事業を使う。",
          "settledYen": 34036000,
          "indicator": {
            "name": "中延四丁目地区の不燃領域率",
            "unit": "％",
            "target": "61",
            "actual": "53.2"
          },
          "grade": "B 継続する事業",
          "direction": "計画・規定どおり",
          "page": 476
        },
        {
          "name": "出石つばさの家運営費",
          "title": "障害者のグループホーム「出石つばさの家」",
          "cofog": "10",
          "what": "知的障害のある人が暮らすグループホームと、家族が介護できないときの短期入所を運営する。",
          "settledYen": 32419000,
          "indicator": {
            "name": "共同生活援助年間延べ利用者数",
            "unit": "人",
            "target": "130",
            "actual": "121"
          },
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 253
        },
        {
          "name": "子ども家庭センター開設準備経費",
          "title": "子ども家庭センターの開設準備",
          "cofog": "10.4",
          "what": "母子保健と児童福祉が一緒に相談に乗る「子ども家庭センター」をR7年4月に開くための準備をした。",
          "settledYen": 17373000,
          "grade": "D やめる・終える",
          "direction": "事業の完了",
          "page": 183
        },
        {
          "name": "社会的養護推進経費",
          "title": "里親と養子縁組の後押し",
          "cofog": "10",
          "what": "里親の登録を増やし、特別養子縁組の手数料の一部を補助し、児童養護施設や里親に補助金を出す。",
          "settledYen": 3608000,
          "indicator": {
            "name": "里親新規登録数",
            "unit": "家庭",
            "target": "1",
            "actual": "0"
          },
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 171
        },
        {
          "name": "児童相談等運営支援事業",
          "title": "児童福祉審議会と子どもの意見を聞く支援員",
          "cofog": "10",
          "what": "児童福祉審議会を開き、児童相談所が関わる子どもに意見表明等支援員を派遣する。",
          "settledYen": 2361000,
          "indicator": {
            "name": "児童福祉審議会の開催回数",
            "unit": "回",
            "target": "1",
            "actual": "1"
          },
          "grade": "B 継続する事業",
          "direction": "法定受託事務・法定扶助費等",
          "page": 169
        },
        {
          "name": "特別支援学校補助教材費保護者負担軽減事業",
          "title": "特別支援学校の補助教材費を支給",
          "cofog": "09.8",
          "what": "特別支援学校に通う区内の子の保護者に、補助教材費の実費を支給する。",
          "settledYen": 561000,
          "indicator": {
            "name": "支給者数",
            "unit": "人",
            "target": "121",
            "actual": "67"
          },
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 604
        }
      ],
      "initiatives": [
        {
          "title": "学校給食の無償化",
          "quote": "子育て支援策として給食無償化事業を開始したため、行政費用の補助費等が大幅に増加している。",
          "name": "給食運営費",
          "cofog": "09",
          "settledYen": 3047859000,
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 601
        },
        {
          "title": "補助教材費の公費負担",
          "quote": "令和6年4月から、区立学校対象学年の全員が使用する補助教材等の費用を公費負担し、保護者負担の軽減を図った。",
          "name": "教材教具費",
          "cofog": "09",
          "settledYen": 748825000,
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 594
        },
        {
          "title": "メタバースを使った不登校支援",
          "quote": "メタバースによる不登校支援事業（東京都バーチャル・ラーニング・プラットフォーム事業）での支援を令和6年6月から開始した。",
          "name": "不登校対策事業費",
          "cofog": "09.8",
          "settledYen": 152232000,
          "grade": "B 継続する事業",
          "direction": "計画・規定どおり",
          "page": 634
        },
        {
          "title": "教育支援センター「マイスクール西大井」",
          "quote": "教育支援センター「マイスクール西大井」を令和6年5月から開設した。",
          "name": "不登校対策事業費",
          "cofog": "09.8",
          "settledYen": 152232000,
          "grade": "B 継続する事業",
          "direction": "計画・規定どおり",
          "page": 634
        },
        {
          "title": "幼児教育の探究活動（とうきょうすくわくプログラム）",
          "quote": "令和6年度から幼保共通の「とうきょうすくわくプログラム」の活用等により、幼児教育における探究活動を通じて、子どもの豊かな育ちを支援し、小学校における探究的な学習へつなげていく。",
          "name": "保幼小連携推進経費",
          "cofog": "09.8",
          "settledYen": 2790000,
          "grade": "C 改善・見直しする事業",
          "direction": "取組みの一部をやめる",
          "page": 616
        },
        {
          "title": "介護職員の居住支援手当",
          "quote": "住宅費負担の軽減と住環境整備により就労環境を改善し、介護人材の確保・定着を図るため、令和6年度から区内介護事業所を通じて居住支援手当を支給した。",
          "name": "福祉人材確保・定着事業",
          "cofog": "10.2",
          "settledYen": 318532000,
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 262
        },
        {
          "title": "生殖補助医療の医療費助成",
          "quote": "令和6年7月より実施した「不妊治療（生殖補助医療）医療費助成」における申請が増加傾向にあるため、今後も執行率は高いと予想される。",
          "name": "不妊治療等支援事業",
          "cofog": "07.4",
          "settledYen": 26433000,
          "grade": "B 継続する事業",
          "direction": "現状維持",
          "page": 357
        },
        {
          "title": "グリーンスローモビリティの実証運行",
          "quote": "グリーンスローモビリティの実証運行を令和6年10月から11月にかけて北品川・天王洲エリアで実施した。",
          "name": "地域交通検討経費",
          "cofog": "04.5",
          "settledYen": 152037000,
          "grade": "B 継続する事業",
          "direction": "計画・規定どおり",
          "page": 520
        },
        {
          "title": "コミュニティバスの子育て支援割",
          "quote": "令和4年10月1日より運行間隔を30分から20分間隔へ短縮、令和6年8月1日より子育て支援割の導入を開始した。",
          "name": "地域交通検討経費",
          "cofog": "04.5",
          "settledYen": 152037000,
          "grade": "B 継続する事業",
          "direction": "計画・規定どおり",
          "page": 520
        },
        {
          "title": "人材スキルアップ支援事業",
          "quote": "補助費については、新たに「人材スキルアップ支援事業」を始めたため、その分増加している。",
          "name": "雇用確保支援事業",
          "cofog": "04.1",
          "settledYen": 50312000,
          "grade": "C 改善・見直しする事業",
          "direction": "手法等の改善",
          "page": 123
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
