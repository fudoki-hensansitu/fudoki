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

/** 当初予算の資料「款別予算等の主な施策」で、区が新規（◎）と印を付けた項目を含む事業。事業評価がまだ出ていない年度に使う。
 * 事業名・項目・金額は資料のまま。COFOG は同じ年度の予算書の内訳（事業）を名前と予算額で突き合わせ、その目に付いた分類を写したもの */
export interface BudgetNew {
  /** 資料の事業名（区分の欄） */
  name: string
  /** ◎の付いた項目。資料の文言のまま。括弧の中の項目は括弧の前の語を添える */
  items: string[]
  /** 事業全体の予算額。新規の項目だけの額ではない */
  budgetYen: number
  /** 分類できない目は空。分野は「その他」に入る */
  cofog: string
  /** 資料の PDF（budgetHighlights）の頁 */
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
  /** 予算の資料で新規と印を付けた項目。事業評価（projects・initiatives）がある年度は使わない */
  budgetNew?: BudgetNew[]
  /** budgetNew を取った「款別予算等の主な施策」の PDF */
  budgetHighlights?: string
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
          "grade": "D 完了・廃止する事業",
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
          "grade": "D 完了・廃止する事業",
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
          "direction": "取組みの一部廃止",
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
      "budgetNew": [
        {
          "name": "SDGｓ推進経費",
          "items": [
            "中高生リバースメンター事業"
          ],
          "budgetYen": 19515000,
          "cofog": "01.3.2",
          "page": 1
        },
        {
          "name": "ＩＣＴ推進管理費",
          "items": [
            "Microsoft365導入経費"
          ],
          "budgetYen": 2288892000,
          "cofog": "01.3.3",
          "page": 1
        },
        {
          "name": "非核平和都市品川宣言事業",
          "items": [
            "「被爆ピアノ」平和の集い",
            "次世代向け平和のワークショップ"
          ],
          "budgetYen": 14205000,
          "cofog": "01",
          "page": 1
        },
        {
          "name": "地域住民と外国人との交流促進",
          "items": [
            "グローバル人材育成海外派遣事業"
          ],
          "budgetYen": 16049000,
          "cofog": "01",
          "page": 1
        },
        {
          "name": "いじめ防止対策推進事業",
          "items": [
            "いじめ予防に係る出前講座等"
          ],
          "budgetYen": 7225000,
          "cofog": "01",
          "page": 1
        },
        {
          "name": "広聴経費",
          "items": [
            "住民参加型デジタルプラットフォーム経費"
          ],
          "budgetYen": 3960000,
          "cofog": "01",
          "page": 1
        },
        {
          "name": "地域振興経費",
          "items": [
            "こみゅにてぃぷらざ八潮の活用に向けたトライアル"
          ],
          "budgetYen": 64437000,
          "cofog": "01",
          "page": 2
        },
        {
          "name": "歩行喫煙防止推進経費",
          "items": [
            "巡回指導等の強化"
          ],
          "budgetYen": 142727000,
          "cofog": "01",
          "page": 2
        },
        {
          "name": "都市型観光プラン推進事業",
          "items": [
            "しながわ花海道ゆりの花サステナブル",
            "しながわツアー造成補助金"
          ],
          "budgetYen": 254032000,
          "cofog": "",
          "page": 2
        },
        {
          "name": "文化芸術・スポーツ活動支援事業",
          "items": [
            "デフリンピック啓発事業",
            "Ａｉｍ Ｆｏｒ インクルーシブ（コンサートやアートをとおした共生社会理解促進事業）"
          ],
          "budgetYen": 24313000,
          "cofog": "",
          "page": 2
        },
        {
          "name": "地域スポーツ支援",
          "items": [
            "デフリンピック認知度120％プロジェクト"
          ],
          "budgetYen": 52695000,
          "cofog": "08.1",
          "page": 3
        },
        {
          "name": "少年少女スポーツ普及事業",
          "items": [
            "プロ選手による少年少女スポーツ教室"
          ],
          "budgetYen": 21371000,
          "cofog": "08.1",
          "page": 3
        },
        {
          "name": "選挙執行費",
          "items": [
            "都議会議員選挙執行費",
            "参議院議員選挙執行費"
          ],
          "budgetYen": 568169000,
          "cofog": "01.6",
          "page": 3
        },
        {
          "name": "成年後見制度経費",
          "items": [
            "終活支援パッケージ事業助成"
          ],
          "budgetYen": 26906000,
          "cofog": "10",
          "page": 4
        },
        {
          "name": "障害者介護給付事務",
          "items": [
            "生活介護延長受入れ運営費助成事業"
          ],
          "budgetYen": 3109086000,
          "cofog": "10.1",
          "page": 4
        },
        {
          "name": "地域生活支援事業",
          "items": [
            "精神障害者の退院・居住支援コーディネート事業",
            "重度訪問介護利用者の大学就学支援事業"
          ],
          "budgetYen": 336475000,
          "cofog": "10.1",
          "page": 4
        },
        {
          "name": "社会参加支援事業",
          "items": [
            "中等度難聴者補聴器購入助成",
            "介護タクシー利用補助事業",
            "医療ショートステイ事業に係る交通費補助"
          ],
          "budgetYen": 214854000,
          "cofog": "10.1",
          "page": 5
        },
        {
          "name": "障害者訓練センター運営費",
          "items": [
            "リボン跡地障害者就労支援施設"
          ],
          "budgetYen": 83415000,
          "cofog": "10.1",
          "page": 5
        },
        {
          "name": "大原児童発達支援センター運営費",
          "items": [
            "児童発達支援・放課後等デイサービス・障害児相談支援事業"
          ],
          "budgetYen": 86912000,
          "cofog": "10.1",
          "page": 5
        },
        {
          "name": "障害児支援給付事務",
          "items": [
            "障害児通所支援等にかかる利用者負担無償化",
            "障害児区外特別支援学校への通学支援事業"
          ],
          "budgetYen": 1819751000,
          "cofog": "10.1",
          "page": 5
        },
        {
          "name": "障害者支援事務費",
          "items": [
            "障害者手帳アプリ活用の導入"
          ],
          "budgetYen": 10804000,
          "cofog": "10.1",
          "page": 5
        },
        {
          "name": "地域包括支援センター運営費",
          "items": [
            "地域包括あり方検討委託"
          ],
          "budgetYen": 33959000,
          "cofog": "10.2",
          "page": 6
        },
        {
          "name": "福祉人材確保・定着事業",
          "items": [
            "介護職員等宿舎借上支援事業",
            "外国人介護人材雇用（就学）支援事業"
          ],
          "budgetYen": 572651000,
          "cofog": "10.2",
          "page": 6
        },
        {
          "name": "高齢者活動支援事業",
          "items": [
            "スマホを活用した介護予防サポート"
          ],
          "budgetYen": 86789000,
          "cofog": "10.2",
          "page": 6
        },
        {
          "name": "高齢者住宅対策事業",
          "items": [
            "高齢者の住宅あっせん事業（家財の運搬費）"
          ],
          "budgetYen": 85300000,
          "cofog": "10.2",
          "page": 6
        },
        {
          "name": "子育て支援推進費",
          "items": [
            "八潮子育て支援施設の運営開始",
            "オンラインMy助産師（専属助産師による伴走型支援）"
          ],
          "budgetYen": 747511000,
          "cofog": "10.4",
          "page": 7
        },
        {
          "name": "児童センター運営費",
          "items": [
            "学習と食の支援"
          ],
          "budgetYen": 1409004000,
          "cofog": "10.4",
          "page": 7
        },
        {
          "name": "子どもの居場所運営費",
          "items": [
            "朝の児童の居場所確保事業"
          ],
          "budgetYen": 1708686000,
          "cofog": "10.4",
          "page": 7
        },
        {
          "name": "子どもの未来応援基金積立金",
          "items": [
            "子ども未来応援基金積立金"
          ],
          "budgetYen": 66353000,
          "cofog": "10.4",
          "page": 7
        },
        {
          "name": "児童相談事業",
          "items": [
            "地域子ども家庭支援センターの開設"
          ],
          "budgetYen": 54488000,
          "cofog": "10.4",
          "page": 7
        },
        {
          "name": "ひとり親家庭支援事業",
          "items": [
            "体験格差改善事業"
          ],
          "budgetYen": 35021000,
          "cofog": "10.4",
          "page": 7
        },
        {
          "name": "奨学金事業",
          "items": [
            "大学生奨学金"
          ],
          "budgetYen": 72502000,
          "cofog": "10.4",
          "page": 7
        },
        {
          "name": "各種手当事務",
          "items": [
            "実質ひとり親家庭給付金"
          ],
          "budgetYen": 3000000,
          "cofog": "10.4",
          "page": 7
        },
        {
          "name": "子どもの食の支援事業",
          "items": [
            "子ども食堂における朝食支援"
          ],
          "budgetYen": 76039000,
          "cofog": "10.4",
          "page": 8
        },
        {
          "name": "就学前教育推進費",
          "items": [
            "公・私立保育園交流スポーツ事業",
            "５歳児健康診査相談支援事業"
          ],
          "budgetYen": 13939000,
          "cofog": "10.4",
          "page": 8
        },
        {
          "name": "公設民営保育園経費",
          "items": [
            "大井保育園131人"
          ],
          "budgetYen": 1238849000,
          "cofog": "10.4",
          "page": 9
        },
        {
          "name": "私立保育園費",
          "items": [
            "保育設備改修等事業",
            "保育の質の確保・向上事業"
          ],
          "budgetYen": 21360719000,
          "cofog": "10.4",
          "page": 9
        },
        {
          "name": "認証保育所経費",
          "items": [
            "保育設備改修等事業",
            "保育の質の確保・向上事業"
          ],
          "budgetYen": 1643963000,
          "cofog": "10.4",
          "page": 9
        },
        {
          "name": "私立幼稚園経費",
          "items": [
            "人材確保・育成支援事業"
          ],
          "budgetYen": 580055000,
          "cofog": "10.4",
          "page": 9
        },
        {
          "name": "生活困窮者自立支援事業",
          "items": [
            "住居確保給付金転居費"
          ],
          "budgetYen": 75624000,
          "cofog": "10.7",
          "page": 9
        },
        {
          "name": "７３(ナナサン）歯科健診事業",
          "items": [
            "７３歳被保険者を対象とした歯科健診"
          ],
          "budgetYen": 3520000,
          "cofog": "07",
          "page": 10
        },
        {
          "name": "一般事務費（介護）",
          "items": [
            "ケアプランデータ連携システムの導入費用助成"
          ],
          "budgetYen": 411439000,
          "cofog": "01",
          "page": 10
        },
        {
          "name": "健康づくり支援事業費",
          "items": [
            "ウォーキングマップリニューアル"
          ],
          "budgetYen": 63974000,
          "cofog": "07.4",
          "page": 12
        },
        {
          "name": "公衆浴場補助(保健衛生助成金)",
          "items": [
            "物価高騰対策支援金"
          ],
          "budgetYen": 56900000,
          "cofog": "07.4",
          "page": 12
        },
        {
          "name": "母子健康診査費",
          "items": [
            "妊産婦歯科健診（妊産婦歯科クリーニング）",
            "５歳児健診"
          ],
          "budgetYen": 456554000,
          "cofog": "07.4",
          "page": 12
        },
        {
          "name": "健康診査",
          "items": [
            "骨粗しょう症検診"
          ],
          "budgetYen": 57817000,
          "cofog": "07.4",
          "page": 13
        },
        {
          "name": "予防接種費",
          "items": [
            "帯状疱疹（６５歳以上）"
          ],
          "budgetYen": 2332678000,
          "cofog": "07.4",
          "page": 13
        },
        {
          "name": "感染症対策事業",
          "items": [
            "新型インフルエンザ等対策行動計画改定"
          ],
          "budgetYen": 38441000,
          "cofog": "07.4",
          "page": 13
        },
        {
          "name": "省エネルギー対策事業",
          "items": [
            "ＺＥＢ設計支援助成",
            "新築時ＺＥＨ化助成",
            "区民参加によるCO2クレジットの創出"
          ],
          "budgetYen": 100617000,
          "cofog": "05",
          "page": 14
        },
        {
          "name": "中小企業事業資金融資あっせん",
          "items": [
            "チャレンジ支援資金"
          ],
          "budgetYen": 1312849000,
          "cofog": "04.1",
          "page": 15
        },
        {
          "name": "経営相談事業",
          "items": [
            "融資あっ旋WEB相談システム導入"
          ],
          "budgetYen": 48233000,
          "cofog": "04.1",
          "page": 15
        },
        {
          "name": "就業支援費",
          "items": [
            "女性デジタル人材マッチング支援事業"
          ],
          "budgetYen": 207389000,
          "cofog": "04.1",
          "page": 16
        },
        {
          "name": "共通商品券普及促進事業",
          "items": [
            "デジタル商品券発行事業"
          ],
          "budgetYen": 363533000,
          "cofog": "04.1",
          "page": 16
        },
        {
          "name": "駅周辺等放置自転車対策事業",
          "items": [
            "西大井駅自転車等駐車場実施設計"
          ],
          "budgetYen": 476224000,
          "cofog": "04.5",
          "page": 17
        },
        {
          "name": "やさしいまちづくり整備費",
          "items": [
            "大井町駅周辺地区バリアフリー計画改定",
            "しながわお休み石調査点検"
          ],
          "budgetYen": 38202000,
          "cofog": "04.5",
          "page": 17
        },
        {
          "name": "道路維持管理費",
          "items": [
            "品川シーサイド駅前広場シェルター改修工事"
          ],
          "budgetYen": 1037121000,
          "cofog": "04.5.1",
          "page": 17
        },
        {
          "name": "道路改良事業",
          "items": [
            "立会道路再整備"
          ],
          "budgetYen": 516258000,
          "cofog": "04.5.1",
          "page": 17
        },
        {
          "name": "水辺利活用事業",
          "items": [
            "護岸ライトアップ試行実施",
            "目黒川転落防止柵設計委託",
            "東品川二丁目船着場改修工事"
          ],
          "budgetYen": 161760000,
          "cofog": "",
          "page": 17
        },
        {
          "name": "大井町駅周辺地区再開発事業",
          "items": [
            "大井町駅周辺地区社会実験"
          ],
          "budgetYen": 70468000,
          "cofog": "06.2",
          "page": 18
        },
        {
          "name": "公園・児童遊園維持管理費",
          "items": [
            "大森貝塚遺跡庭園改修実施設計"
          ],
          "budgetYen": 1770078000,
          "cofog": "08.1",
          "page": 18
        },
        {
          "name": "居住支援事業",
          "items": [
            "あんしん住まいる相談デスク（居住支援総合相談窓口新設）",
            "居住サポート住宅支援事業",
            "家主のあんしん保険",
            "エアコン設置・買替費用助成"
          ],
          "budgetYen": 42730000,
          "cofog": "06.1",
          "page": 19
        },
        {
          "name": "防災区民組織育成費",
          "items": [
            "防災区民組織活動助成金",
            "地域の助け合い強化事業"
          ],
          "budgetYen": 78153000,
          "cofog": "03.2",
          "page": 19
        },
        {
          "name": "防災普及教育費",
          "items": [
            "マンション防災推進事業",
            "多様な視点での災害対策の強化",
            "事業者向け防災啓発事業"
          ],
          "budgetYen": 150648000,
          "cofog": "03.2",
          "page": 19
        },
        {
          "name": "消防団運営費",
          "items": [
            "コミュニティ助成事業"
          ],
          "budgetYen": 19763000,
          "cofog": "03.2",
          "page": 19
        },
        {
          "name": "防災体制整備費",
          "items": [
            "災害対策用モバイルサービス導入"
          ],
          "budgetYen": 148659000,
          "cofog": "03.2",
          "page": 19
        },
        {
          "name": "文化財保存活用事業",
          "items": [
            "埋蔵文化財データベース作成"
          ],
          "budgetYen": 26489000,
          "cofog": "09.8",
          "page": 21
        },
        {
          "name": "就学支援費",
          "items": [
            "特別支援学校保護者負担軽減事業（制服代）",
            "特別支援学校保護者負担軽減事業（修学旅行費）"
          ],
          "budgetYen": 168731000,
          "cofog": "09.8",
          "page": 21
        },
        {
          "name": "しながわ教育推進事業",
          "items": [
            "市民科検討委員会経費",
            "ウェルビーイングの理解を深める学習"
          ],
          "budgetYen": 241597000,
          "cofog": "09.8",
          "page": 21
        },
        {
          "name": "品川英語力向上推進プラン",
          "items": [
            "オンライン英会話レッスン（6年生）（1校）"
          ],
          "budgetYen": 184394000,
          "cofog": "09.8",
          "page": 22
        },
        {
          "name": "不登校対策事業費",
          "items": [
            "マイスクール昼食提供",
            "フリースクール等利用料助成"
          ],
          "budgetYen": 168599000,
          "cofog": "09.8",
          "page": 22
        },
        {
          "name": "特別支援教育費",
          "items": [
            "伊藤小学校特別支援学級開設準備工事"
          ],
          "budgetYen": 752019000,
          "cofog": "09.8",
          "page": 23
        },
        {
          "name": "学校環境整備事業",
          "items": [
            "防災井戸新設（台場小）"
          ],
          "budgetYen": 1981192000,
          "cofog": "09",
          "page": 24
        },
        {
          "name": "学校運営費",
          "items": [
            "標準服購入費用保護者負担軽減事業",
            "修学旅行費無償化事業"
          ],
          "budgetYen": 1247054000,
          "cofog": "09",
          "page": 24
        },
        {
          "name": "給食運営費",
          "items": [
            "学校給食有機農産物等導入（全校）"
          ],
          "budgetYen": 3381734000,
          "cofog": "09",
          "page": 24
        },
        {
          "name": "学校改築備品等整備費",
          "items": [
            "城南第二小、第四日野小、浜川小外構：初度調弁",
            "鈴ケ森小仮設校舎移転経費"
          ],
          "budgetYen": 226371000,
          "cofog": "09",
          "page": 24
        }
      ],
      "budgetHighlights": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/655/2025tousyoyosan_2.pdf",
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
      "budgetNew": [
        {
          "name": "議会広報費",
          "items": [
            "主権者教育経費"
          ],
          "budgetYen": 58338000,
          "cofog": "01.1",
          "page": 1
        },
        {
          "name": "ＳＤＧｓ推進経費",
          "items": [
            "SDGｓ啓発事業"
          ],
          "budgetYen": 25756000,
          "cofog": "01.3.2",
          "page": 1
        },
        {
          "name": "庁舎管理費",
          "items": [
            "新庁舎移転に向けた庁有車の効率的運用"
          ],
          "budgetYen": 898381000,
          "cofog": "01.3.3",
          "page": 2
        },
        {
          "name": "国際友好都市交流事業",
          "items": [
            "ジュネーヴ市友好都市35周年公式訪問団受入"
          ],
          "budgetYen": 161638000,
          "cofog": "01",
          "page": 2
        },
        {
          "name": "全国自治体との連携事業",
          "items": [
            "ワーケーション促進事業"
          ],
          "budgetYen": 10907000,
          "cofog": "01",
          "page": 2
        },
        {
          "name": "区制８０周年記念事業",
          "items": [
            "記念イベント委託・商店街フラッグ経費等"
          ],
          "budgetYen": 10224000,
          "cofog": "01",
          "page": 2
        },
        {
          "name": "広報番組等経費",
          "items": [
            "動画による発信力の強化"
          ],
          "budgetYen": 101307000,
          "cofog": "01",
          "page": 2
        },
        {
          "name": "ジェンダー平等推進事業",
          "items": [
            "保護者向け「リプロダクティブ・ヘルス/ライツ」の周知啓発"
          ],
          "budgetYen": 32723000,
          "cofog": "01",
          "page": 3
        },
        {
          "name": "庁舎計画費",
          "items": [
            "新庁舎移転計画・管理支援業務委託"
          ],
          "budgetYen": 335002000,
          "cofog": "01.3.3",
          "page": 3
        },
        {
          "name": "生活安全協議会経費",
          "items": [
            "出前防犯教室"
          ],
          "budgetYen": 4080000,
          "cofog": "01",
          "page": 4
        },
        {
          "name": "防犯支援事業",
          "items": [
            "被害者宿泊費助成",
            "加害者カウンセリング費用助成",
            "盗撮対策・防犯ミラー",
            "防犯アドバイザー派遣"
          ],
          "budgetYen": 173630000,
          "cofog": "01",
          "page": 5
        },
        {
          "name": "観光資源整備事業",
          "items": [
            "東京都国際美術展連携事業",
            "観光統計データ提供事業"
          ],
          "budgetYen": 146962000,
          "cofog": "",
          "page": 5
        },
        {
          "name": "文化芸術・スポーツ活動支援事業",
          "items": [
            "多彩カイギ"
          ],
          "budgetYen": 19187000,
          "cofog": "",
          "page": 5
        },
        {
          "name": "区民学習支援経費",
          "items": [
            "しなカレント講座"
          ],
          "budgetYen": 6557000,
          "cofog": "",
          "page": 5
        },
        {
          "name": "地域スポーツ施設開放",
          "items": [
            "子どもの施設使用料無料化"
          ],
          "budgetYen": 494648000,
          "cofog": "08.1",
          "page": 6
        },
        {
          "name": "住民基本台帳事務費",
          "items": [
            "手続きガイド"
          ],
          "budgetYen": 93364000,
          "cofog": "01.3",
          "page": 6
        },
        {
          "name": "おくやみコーナー経費",
          "items": [
            "区民葬儀助成事業"
          ],
          "budgetYen": 19691000,
          "cofog": "01.3",
          "page": 6
        },
        {
          "name": "福祉計画事務費",
          "items": [
            "福祉オンブズマン設置検討"
          ],
          "budgetYen": 14792000,
          "cofog": "10",
          "page": 8
        },
        {
          "name": "障害者福祉施設等整備費",
          "items": [
            "心身障害者福祉会館躯体現況調査等"
          ],
          "budgetYen": 445149000,
          "cofog": "10.1",
          "page": 8
        },
        {
          "name": "地域生活支援事業",
          "items": [
            "日中一時支援事業（民間事業所への助成事業）",
            "移動支援事業（移動支援事業に係る処遇改善加算等助成）",
            "精神障害者ピアサポート事業",
            "視覚障害者向け遠隔サポートシステム"
          ],
          "budgetYen": 389832000,
          "cofog": "10.1",
          "page": 9
        },
        {
          "name": "社会参加支援事業",
          "items": [
            "障害者福祉団体施設利用における助成"
          ],
          "budgetYen": 209840000,
          "cofog": "10.1",
          "page": 9
        },
        {
          "name": "心身障害者福祉会館運営費",
          "items": [
            "失語症向け意思疎通支援者派遣事業"
          ],
          "budgetYen": 337847000,
          "cofog": "10.1",
          "page": 9
        },
        {
          "name": "認知症高齢者支援事業",
          "items": [
            "認知症施策推進計画の策定",
            "認知症の人の社会参加推進事業"
          ],
          "budgetYen": 68303000,
          "cofog": "10.2",
          "page": 11
        },
        {
          "name": "子ども・若者活動拠点経費",
          "items": [
            "子ども・若者活動拠点施設等整備事業"
          ],
          "budgetYen": 682920000,
          "cofog": "10.4",
          "page": 12
        },
        {
          "name": "子どもの居場所運営費",
          "items": [
            "すまいるスクール放課後体験活動"
          ],
          "budgetYen": 1861062000,
          "cofog": "10.4",
          "page": 12
        },
        {
          "name": "青少年育成活動",
          "items": [
            "若者支援コーディネーター事業",
            "子ども・若者応援フリースペースの増設"
          ],
          "budgetYen": 186315000,
          "cofog": "10.4",
          "page": 12
        },
        {
          "name": "こども計画推進費",
          "items": [
            "新条例制定検討（こどもの権利）",
            "しながわこども未来ガイド策定"
          ],
          "budgetYen": 18505000,
          "cofog": "10.4",
          "page": 12
        },
        {
          "name": "社会的養護推進経費",
          "items": [
            "品川景徳学園改築工事費補助"
          ],
          "budgetYen": 203479000,
          "cofog": "10.4",
          "page": 12
        },
        {
          "name": "ファミリーサポートセンター運営費",
          "items": [
            "提供会員活動報酬の補助"
          ],
          "budgetYen": 38198000,
          "cofog": "10.4",
          "page": 13
        },
        {
          "name": "保育園改築事業",
          "items": [
            "東五反田保育園改築工事・監理委託"
          ],
          "budgetYen": 420002000,
          "cofog": "10.4",
          "page": 13
        },
        {
          "name": "乳児等通園支援事業利用料助成",
          "items": [
            "利用料助成（区外施設利用者分）"
          ],
          "budgetYen": 1006000,
          "cofog": "10.4",
          "page": 14
        },
        {
          "name": "私立保育園費",
          "items": [
            "賃貸物件による大規模改修等事業"
          ],
          "budgetYen": 22434155000,
          "cofog": "10.4",
          "page": 15
        },
        {
          "name": "乳児等通園支援事業費",
          "items": [
            "運営費助成（80園）"
          ],
          "budgetYen": 940593000,
          "cofog": "10.4",
          "page": 15
        },
        {
          "name": "児童相談所運営費",
          "items": [
            "個別的ケア認定里親事業",
            "乳幼児緊急一時保護委託事業",
            "登録一時保護家庭事業"
          ],
          "budgetYen": 216909000,
          "cofog": "10.4",
          "page": 15
        },
        {
          "name": "生活困窮者自立支援事業",
          "items": [
            "住民税非課税世帯エアコン購入費等助成事業"
          ],
          "budgetYen": 101633000,
          "cofog": "10.7",
          "page": 16
        },
        {
          "name": "ＡＥＤ管理費",
          "items": [
            "三角巾の配備"
          ],
          "budgetYen": 46045000,
          "cofog": "07.4",
          "page": 17
        },
        {
          "name": "保健衛生助成金",
          "items": [
            "医師会への補助金（システム構築）"
          ],
          "budgetYen": 84655000,
          "cofog": "07.4",
          "page": 17
        },
        {
          "name": "荏原保健センター管理運営費",
          "items": [
            "移転関連経費（R8.5～）"
          ],
          "budgetYen": 1452625000,
          "cofog": "07.4",
          "page": 17
        },
        {
          "name": "妊産婦健康診査",
          "items": [
            "産婦健康診査",
            "多胎妊婦健康診査加算"
          ],
          "budgetYen": 402911000,
          "cofog": "07.4",
          "page": 18
        },
        {
          "name": "乳児健康診査",
          "items": [
            "１カ月児健康診査"
          ],
          "budgetYen": 87216000,
          "cofog": "07.4",
          "page": 18
        },
        {
          "name": "母子歯科衛生事業",
          "items": [
            "歯ならびモグモグ相談"
          ],
          "budgetYen": 14058000,
          "cofog": "07.4",
          "page": 18
        },
        {
          "name": "０歳児見守り・子育てサポート事業",
          "items": [
            "伴走支援業務"
          ],
          "budgetYen": 299657000,
          "cofog": "07.4",
          "page": 18
        },
        {
          "name": "予防接種費",
          "items": [
            "定期予防接種（RSウイルス）"
          ],
          "budgetYen": 2119137000,
          "cofog": "07.4",
          "page": 19
        },
        {
          "name": "難病患者療養支援事業",
          "items": [
            "人工呼吸器装着難病患者災害時停電シミュレーション"
          ],
          "budgetYen": 19810000,
          "cofog": "07.4",
          "page": 19
        },
        {
          "name": "精神保健事業",
          "items": [
            "グリーフケア事業"
          ],
          "budgetYen": 16619000,
          "cofog": "07.4",
          "page": 19
        },
        {
          "name": "省エネルギー対策事業",
          "items": [
            "しながわゼロカーボンアクション助成（エコカー購入助成）"
          ],
          "budgetYen": 115974000,
          "cofog": "05",
          "page": 19
        },
        {
          "name": "清掃事務所等施設管理事業",
          "items": [
            "北品川分室新設工事"
          ],
          "budgetYen": 1151082000,
          "cofog": "05.1",
          "page": 20
        },
        {
          "name": "収集運搬作業費",
          "items": [
            "車両運行管理システム導入経費",
            "車両購入費"
          ],
          "budgetYen": 1583184000,
          "cofog": "05.1",
          "page": 20
        },
        {
          "name": "中小企業センター運営費",
          "items": [
            "産業支援のあり方検討"
          ],
          "budgetYen": 179957000,
          "cofog": "04.1",
          "page": 21
        },
        {
          "name": "中小企業事業資金融資あっせん",
          "items": [
            "経営改善計画策定支援事業"
          ],
          "budgetYen": 1056413000,
          "cofog": "04.1",
          "page": 21
        },
        {
          "name": "事業承継支援事業",
          "items": [
            "知恵と技術をつなぐ助成"
          ],
          "budgetYen": 32288000,
          "cofog": "04.1",
          "page": 21
        },
        {
          "name": "競争力強化支援事業",
          "items": [
            "ＧＸ・脱炭素経営推進支援事業"
          ],
          "budgetYen": 154356000,
          "cofog": "04.1",
          "page": 21
        },
        {
          "name": "雇用確保支援事業",
          "items": [
            "区内企業の新入社員向け合同研修"
          ],
          "budgetYen": 63694000,
          "cofog": "04.1",
          "page": 22
        },
        {
          "name": "駅周辺等放置自転車対策事業",
          "items": [
            "西大井駅自転車等駐車場改修工事",
            "西大井広場公園駐輪場工事"
          ],
          "budgetYen": 574423000,
          "cofog": "04.5",
          "page": 23
        },
        {
          "name": "道路維持管理費",
          "items": [
            "AI道路点検パトロールシステム開発"
          ],
          "budgetYen": 1135357000,
          "cofog": "04.5.1",
          "page": 23
        },
        {
          "name": "道路改良事業",
          "items": [
            "浅間台小学校西側道路スロープ化工事設計"
          ],
          "budgetYen": 567400000,
          "cofog": "04.5.1",
          "page": 23
        },
        {
          "name": "無電柱化推進事業",
          "items": [
            "無電柱化推進計画改定"
          ],
          "budgetYen": 354700000,
          "cofog": "04.5.1",
          "page": 23
        },
        {
          "name": "景観まちづくり推進事業",
          "items": [
            "社会資本総合整備計画（第四期）作成"
          ],
          "budgetYen": 17379000,
          "cofog": "06.2",
          "page": 24
        },
        {
          "name": "都市計画関係事務費",
          "items": [
            "暑熱対策都市戦略「（仮称）シェードポリシー」の策定"
          ],
          "budgetYen": 24793000,
          "cofog": "06.2",
          "page": 24
        },
        {
          "name": "大井町駅周辺地区再開発事業",
          "items": [
            "大井町駅西口Ｅ地区ガイドライン策定支援業務等委託"
          ],
          "budgetYen": 57233000,
          "cofog": "06.2",
          "page": 25
        },
        {
          "name": "公園・児童遊園維持管理費",
          "items": [
            "公園における防災設備整備事業"
          ],
          "budgetYen": 2029323000,
          "cofog": "08.1",
          "page": 25
        },
        {
          "name": "公衆便所維持管理費",
          "items": [
            "荏原町駅前公衆便所改修工事設計"
          ],
          "budgetYen": 70621000,
          "cofog": "08.1",
          "page": 25
        },
        {
          "name": "住宅改善工事等助成事業",
          "items": [
            "子育てファミリー世帯転居費用助成"
          ],
          "budgetYen": 84090000,
          "cofog": "06.1",
          "page": 26
        },
        {
          "name": "マンション管理支援事業",
          "items": [
            "マンション実態調査"
          ],
          "budgetYen": 37341000,
          "cofog": "06.1",
          "page": 26
        },
        {
          "name": "空き家等対策事業",
          "items": [
            "しながわ子育て等空き家バンクの開設"
          ],
          "budgetYen": 29983000,
          "cofog": "06.1",
          "page": 26
        },
        {
          "name": "防災普及教育費",
          "items": [
            "防災区民憲章の啓発"
          ],
          "budgetYen": 143821000,
          "cofog": "03.2",
          "page": 26
        },
        {
          "name": "防災情報配信経費",
          "items": [
            "防災行政無線等新庁舎移転実施設計委託"
          ],
          "budgetYen": 65110000,
          "cofog": "03.2",
          "page": 26
        },
        {
          "name": "避難所管理費",
          "items": [
            "避難所開設キット導入"
          ],
          "budgetYen": 30096000,
          "cofog": "03.2",
          "page": 27
        },
        {
          "name": "市民科・各教科充実経費",
          "items": [
            "企業と連携した探究的な学習",
            "学習支援ソフト導入"
          ],
          "budgetYen": 80445000,
          "cofog": "09.8",
          "page": 29
        },
        {
          "name": "特別支援学級等運営費",
          "items": [
            "特別支援教育推進計画策定"
          ],
          "budgetYen": 772376000,
          "cofog": "09.8",
          "page": 29
        },
        {
          "name": "学校改築推進経費",
          "items": [
            "改築困難校基本構想委託（三木小、大崎中）"
          ],
          "budgetYen": 11135103000,
          "cofog": "09",
          "page": 31
        },
        {
          "name": "子ども・子育て支援納付金分納付金",
          "items": [
            "子ども・子育て支援納付金分"
          ],
          "budgetYen": 244693000,
          "cofog": "07",
          "page": 32
        }
      ],
      "budgetHighlights": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/654/2026tousyoyosan_1.pdf",
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
