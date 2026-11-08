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
  /** 数字と事業を取った、事務事業評価の結果の資料（PDF）。その年度の予算に反映された前年の評価 */
  source: string
  /** 同じ評価の評価シート（全部局）の PDF。事業ごとの page はこの PDF の頁 */
  sheets: string
  /** 事務事業評価で捻出した財源 */
  raisedYen: number
  /** 区が掲げた捻出の目標。目標を示していない年度は持たない */
  targetYen?: number
  evaluated: number
  grades: { A: number; B: number; C: number; D: number }
  /** D評価（完了・中止・廃止）の事業。result は 廃止・移管・統合・完了・廃止を検討（評価結果の表の区分） */
  exits: { name: string; reason: string; result: string; page: number }[]
  /** A〜C 評価の事業。評価結果の表（最終評価および削減額一覧）の事業名・今後の取組の方向性。表を起こしていない年度は持たない */
  graded?: Record<'A' | 'B' | 'C', { name: string; direction: string; page: number }[]>
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
          "grade": "D 終える",
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
          "grade": "B 続ける",
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
          "grade": "B 続ける",
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
          "grade": "B 続ける",
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
          "grade": "A 広げる",
          "direction": "新規の取組み",
          "page": 218
        },
        {
          "name": "児童相談所維持管理経費",
          "title": "児童相談所の建物の管理",
          "cofog": "10",
          "what": "児童相談所と一時保護所の光熱水費、警備・清掃、設備の維持管理、修繕を行う。",
          "settledYen": 76933000,
          "grade": "B 続ける",
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
          "grade": "C 見直す",
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
          "grade": "B 続ける",
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
          "grade": "C 見直す",
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
          "grade": "B 続ける",
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
          "grade": "B 続ける",
          "direction": "現状維持",
          "page": 253
        },
        {
          "name": "子ども家庭センター開設準備経費",
          "title": "子ども家庭センターの開設準備",
          "cofog": "10.4",
          "what": "母子保健と児童福祉が一緒に相談に乗る「子ども家庭センター」をR7年4月に開くための準備をした。",
          "settledYen": 17373000,
          "grade": "D 終える",
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
          "grade": "B 続ける",
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
          "grade": "B 続ける",
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
          "grade": "C 見直す",
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
          "grade": "C 見直す",
          "direction": "手法等の改善",
          "page": 601
        },
        {
          "title": "補助教材費の公費負担",
          "quote": "令和6年4月から、区立学校対象学年の全員が使用する補助教材等の費用を公費負担し、保護者負担の軽減を図った。",
          "name": "教材教具費",
          "cofog": "09",
          "settledYen": 748825000,
          "grade": "B 続ける",
          "direction": "現状維持",
          "page": 594
        },
        {
          "title": "メタバースを使った不登校支援",
          "quote": "メタバースによる不登校支援事業（東京都バーチャル・ラーニング・プラットフォーム事業）での支援を令和6年6月から開始した。",
          "name": "不登校対策事業費",
          "cofog": "09.8",
          "settledYen": 152232000,
          "grade": "B 続ける",
          "direction": "計画・規定どおり",
          "page": 634
        },
        {
          "title": "教育支援センター「マイスクール西大井」",
          "quote": "教育支援センター「マイスクール西大井」を令和6年5月から開設した。",
          "name": "不登校対策事業費",
          "cofog": "09.8",
          "settledYen": 152232000,
          "grade": "B 続ける",
          "direction": "計画・規定どおり",
          "page": 634
        },
        {
          "title": "幼児教育の探究活動（とうきょうすくわくプログラム）",
          "quote": "令和6年度から幼保共通の「とうきょうすくわくプログラム」の活用等により、幼児教育における探究活動を通じて、子どもの豊かな育ちを支援し、小学校における探究的な学習へつなげていく。",
          "name": "保幼小連携推進経費",
          "cofog": "09.8",
          "settledYen": 2790000,
          "grade": "C 見直す",
          "direction": "取組みの一部をやめる",
          "page": 616
        },
        {
          "title": "介護職員の居住支援手当",
          "quote": "住宅費負担の軽減と住環境整備により就労環境を改善し、介護人材の確保・定着を図るため、令和6年度から区内介護事業所を通じて居住支援手当を支給した。",
          "name": "福祉人材確保・定着事業",
          "cofog": "10.2",
          "settledYen": 318532000,
          "grade": "C 見直す",
          "direction": "手法等の改善",
          "page": 262
        },
        {
          "title": "生殖補助医療の医療費助成",
          "quote": "令和6年7月より実施した「不妊治療（生殖補助医療）医療費助成」における申請が増加傾向にあるため、今後も執行率は高いと予想される。",
          "name": "不妊治療等支援事業",
          "cofog": "07.4",
          "settledYen": 26433000,
          "grade": "B 続ける",
          "direction": "現状維持",
          "page": 357
        },
        {
          "title": "グリーンスローモビリティの実証運行",
          "quote": "グリーンスローモビリティの実証運行を令和6年10月から11月にかけて北品川・天王洲エリアで実施した。",
          "name": "地域交通検討経費",
          "cofog": "04.5",
          "settledYen": 152037000,
          "grade": "B 続ける",
          "direction": "計画・規定どおり",
          "page": 520
        },
        {
          "title": "コミュニティバスの子育て支援割",
          "quote": "令和4年10月1日より運行間隔を30分から20分間隔へ短縮、令和6年8月1日より子育て支援割の導入を開始した。",
          "name": "地域交通検討経費",
          "cofog": "04.5",
          "settledYen": 152037000,
          "grade": "B 続ける",
          "direction": "計画・規定どおり",
          "page": 520
        },
        {
          "title": "人材スキルアップ支援事業",
          "quote": "補助費については、新たに「人材スキルアップ支援事業」を始めたため、その分増加している。",
          "name": "雇用確保支援事業",
          "cofog": "04.1",
          "settledYen": 50312000,
          "grade": "C 見直す",
          "direction": "手法等の改善",
          "page": 123
        }
      ],
      "scrap": {
        "source": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/181/20240222105532_16.pdf",
        "sheets": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/181/20240222105532_15.pdf",
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
            "result": "廃止",
            "page": 14
          },
          {
            "name": "シティプロモーション推進",
            "reason": "都市ブランディングの考え方を含めて事業を組み直す",
            "result": "廃止",
            "page": 15
          },
          {
            "name": "外国人観光客の誘致",
            "reason": "総合的な戦略を検討し、事業を組み直す",
            "result": "廃止",
            "page": 134
          },
          {
            "name": "社会教育委員会議",
            "reason": "会議のあり方を考え直した",
            "result": "廃止",
            "page": 141
          },
          {
            "name": "親元近居支援",
            "reason": "助け合いにより効果的な事業を考え直す",
            "result": "廃止",
            "page": 464
          },
          {
            "name": "防災フェア",
            "reason": "地区の総合防災訓練と合わせて組み直す",
            "result": "廃止",
            "page": 570
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
        "source": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/177/20240222105532_18.pdf",
        "sheets": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/177/20240222105532_19.pdf",
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
            "result": "廃止",
            "page": 40
          },
          {
            "name": "区政アドバイザー会議",
            "reason": "外部の助言は、ほかの会議で必要に応じて聞けている",
            "result": "廃止",
            "page": 2
          },
          {
            "name": "社会教育委員会議",
            "reason": "諮問機関としての役目を終えた",
            "result": "廃止",
            "page": 146
          },
          {
            "name": "前立腺がん・喉頭がん検診",
            "reason": "国の指針にない検診で、死亡を減らす効果の根拠が足りない",
            "result": "廃止を検討",
            "page": 369
          },
          {
            "name": "高齢者の配食サービス",
            "reason": "費用や食事の内容で民間のサービスが上回る",
            "result": "廃止を検討",
            "page": 315
          },
          {
            "name": "区民斎場「なぎさ会館」",
            "reason": "利用が減って赤字が続き、臨海斎場が式場を広げる",
            "result": "廃止を検討",
            "page": 101
          }
        ]
      },
      "evaluationSource": "https://www.city.shinagawa.tokyo.jp/kusei/shisakukeikaku/1005171/1005176/1005177.html"
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
        "source": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/173/20240222105532_35.pdf",
        "sheets": "https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/005/173/20240222105532_36.pdf",
        "raisedYen": 1522098000,
        "targetYen": 2000000000,
        "evaluated": 652,
        "grades": {
          "A": 16,
          "B": 339,
          "C": 271,
          "D": 26
        },
        "graded": {
          "A": [
            {
              "name": "ＩＣＴ推進管理費",
              "direction": "対象・規模等の拡大",
              "page": 13
            },
            {
              "name": "地域住民と外国人との交流促進",
              "direction": "対象・規模等の拡大",
              "page": 30
            },
            {
              "name": "競争力強化支援事業",
              "direction": "対象・規模等の拡大",
              "page": 124
            },
            {
              "name": "すまいるスクール運営費",
              "direction": "対象・規模等の拡大",
              "page": 166
            },
            {
              "name": "青少年育成活動",
              "direction": "対象・規模等の拡大",
              "page": 168
            },
            {
              "name": "児童相談事業",
              "direction": "対象・規模等の拡大",
              "page": 174
            },
            {
              "name": "児童相談所運営費",
              "direction": "新規の取組み",
              "page": 218
            },
            {
              "name": "地域福祉推進費",
              "direction": "対象・規模等の拡大",
              "page": 224
            },
            {
              "name": "地域生活支援事業",
              "direction": "対象・規模等の拡大",
              "page": 238
            },
            {
              "name": "認知症高齢者支援事業",
              "direction": "対象・規模等の拡大",
              "page": 329
            },
            {
              "name": "産後ケア事業",
              "direction": "対象・規模等の拡大",
              "page": 403
            },
            {
              "name": "精神保健事業",
              "direction": "新規の取組み",
              "page": 408
            },
            {
              "name": "空き家等対策事業",
              "direction": "新規の取組み",
              "page": 462
            },
            {
              "name": "省エネルギー対策事業",
              "direction": "対象・規模等の拡大",
              "page": 493
            },
            {
              "name": "区教員事務費",
              "direction": "対象・規模等の拡大",
              "page": 606
            },
            {
              "name": "特別支援学級等運営費",
              "direction": "対象・規模等の拡大",
              "page": 636
            }
          ],
          "B": [
            {
              "name": "企画関係事務費",
              "direction": "現状維持",
              "page": 3
            },
            {
              "name": "基金積立金",
              "direction": "現状維持",
              "page": 7
            },
            {
              "name": "予算関係管理費",
              "direction": "現状維持",
              "page": 8
            },
            {
              "name": "起債償還元金",
              "direction": "現状維持",
              "page": 9
            },
            {
              "name": "起債利子",
              "direction": "現状維持",
              "page": 10
            },
            {
              "name": "区施設創エネ設備整備推進費",
              "direction": "計画・規定どおり",
              "page": 12
            },
            {
              "name": "公有財産管理費",
              "direction": "現状維持",
              "page": 18
            },
            {
              "name": "賦課事務費",
              "direction": "現状維持",
              "page": 19
            },
            {
              "name": "徴収事務費",
              "direction": "現状維持",
              "page": 20
            },
            {
              "name": "非核平和都市品川宣言事業",
              "direction": "現状維持",
              "page": 24
            },
            {
              "name": "自治功労者等表彰",
              "direction": "現状維持",
              "page": 28
            },
            {
              "name": "各種団体分担金",
              "direction": "計画・規定どおり",
              "page": 35
            },
            {
              "name": "総務関係事務費",
              "direction": "現状維持",
              "page": 37
            },
            {
              "name": "いじめ防止対策推進事業",
              "direction": "現状維持",
              "page": 38
            },
            {
              "name": "都市ブランディング推進経費",
              "direction": "計画・規定どおり",
              "page": 43
            },
            {
              "name": "区民相談経費",
              "direction": "計画・規定どおり",
              "page": 45
            },
            {
              "name": "情報公開等経費",
              "direction": "計画・規定どおり",
              "page": 46
            },
            {
              "name": "職員共済組合業務経理等負担金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 50
            },
            {
              "name": "被災地支援事業",
              "direction": "現状維持",
              "page": 52
            },
            {
              "name": "代替職員雇用経費",
              "direction": "現状維持",
              "page": 54
            },
            {
              "name": "職員健康管理費",
              "direction": "計画・規定どおり",
              "page": 56
            },
            {
              "name": "職員顕彰",
              "direction": "現状維持",
              "page": 57
            },
            {
              "name": "公立学校共済組合業務経理等負担金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 60
            },
            {
              "name": "庁舎計画費",
              "direction": "計画・規定どおり",
              "page": 61
            },
            {
              "name": "広町事業検討費",
              "direction": "計画・規定どおり",
              "page": 63
            },
            {
              "name": "地域環境整備等助成金",
              "direction": "計画・規定どおり",
              "page": 65
            },
            {
              "name": "地域振興関係事務費",
              "direction": "現状維持",
              "page": 69
            },
            {
              "name": "地域振興基金積立金",
              "direction": "計画・規定どおり",
              "page": 73
            },
            {
              "name": "生活安全サポート隊活動費",
              "direction": "計画・規定どおり",
              "page": 82
            },
            {
              "name": "防犯活動団体支援",
              "direction": "計画・規定どおり",
              "page": 84
            },
            {
              "name": "統計調査事務費",
              "direction": "現状維持",
              "page": 86
            },
            {
              "name": "学校基本調査",
              "direction": "法定受託事務・法定扶助費等",
              "page": 89
            },
            {
              "name": "経済センサス調査区管理",
              "direction": "法定受託事務・法定扶助費等",
              "page": 91
            },
            {
              "name": "国勢調査調査区設定",
              "direction": "法定受託事務・法定扶助費等",
              "page": 93
            },
            {
              "name": "全国家計構造調査",
              "direction": "法定受託事務・法定扶助費等",
              "page": 94
            },
            {
              "name": "農林業センサス",
              "direction": "法定受託事務・法定扶助費等",
              "page": 95
            },
            {
              "name": "戸籍届出・証明事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 96
            },
            {
              "name": "住民基本台帳事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 97
            },
            {
              "name": "中長期在留者関係事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 98
            },
            {
              "name": "印鑑登録証明事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 99
            },
            {
              "name": "住居表示管理事務費",
              "direction": "現状維持",
              "page": 100
            },
            {
              "name": "臨海斎場運営費",
              "direction": "計画・規定どおり",
              "page": 104
            },
            {
              "name": "産業振興事業助成金",
              "direction": "現状維持",
              "page": 109
            },
            {
              "name": "勤労者福利厚生事業",
              "direction": "現状維持",
              "page": 110
            },
            {
              "name": "五反田産業文化施設経費",
              "direction": "現状維持",
              "page": 115
            },
            {
              "name": "経営相談事業",
              "direction": "現状維持",
              "page": 121
            },
            {
              "name": "商店街活性化推進事業",
              "direction": "計画・規定どおり",
              "page": 130
            },
            {
              "name": "共通商品券普及促進事業",
              "direction": "現状維持",
              "page": 133
            },
            {
              "name": "消費者センター運営費",
              "direction": "現状維持",
              "page": 136
            },
            {
              "name": "文化活動関係事務費",
              "direction": "現状維持",
              "page": 146
            },
            {
              "name": "歴史館運営費",
              "direction": "現状維持",
              "page": 153
            },
            {
              "name": "地域スポーツ施設開放",
              "direction": "現状維持",
              "page": 155
            },
            {
              "name": "野外活動事業",
              "direction": "現状維持",
              "page": 158
            },
            {
              "name": "品川区スポーツ協会助成金",
              "direction": "現状維持",
              "page": 160
            },
            {
              "name": "公園運動施設費",
              "direction": "現状維持",
              "page": 162
            },
            {
              "name": "施設予約システム管理経費",
              "direction": "現状維持",
              "page": 163
            },
            {
              "name": "児童センター運営費",
              "direction": "現状維持",
              "page": 165
            },
            {
              "name": "児童相談等運営支援事業",
              "direction": "法定受託事務・法定扶助費等",
              "page": 169
            },
            {
              "name": "児童入所施設措置費等支弁経費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 170
            },
            {
              "name": "社会的養護推進経費",
              "direction": "現状維持",
              "page": 171
            },
            {
              "name": "子どもの未来応援基金積立金",
              "direction": "計画・規定どおり",
              "page": 173
            },
            {
              "name": "子育て支援事業運営費",
              "direction": "計画・規定どおり",
              "page": 175
            },
            {
              "name": "ネウボラネットワーク経費（子育て期）",
              "direction": "現状維持",
              "page": 176
            },
            {
              "name": "ヤングケアラー支援事業",
              "direction": "計画・規定どおり",
              "page": 177
            },
            {
              "name": "母子生活支援施設運営費",
              "direction": "現状維持",
              "page": 179
            },
            {
              "name": "女性福祉事業",
              "direction": "現状維持",
              "page": 180
            },
            {
              "name": "入院助産費",
              "direction": "現状維持",
              "page": 181
            },
            {
              "name": "ひとり親家庭自立等支援",
              "direction": "現状維持",
              "page": 182
            },
            {
              "name": "子どもすこやか医療費助成事業",
              "direction": "現状維持",
              "page": 185
            },
            {
              "name": "高校生等医療費助成事業",
              "direction": "現状維持",
              "page": 186
            },
            {
              "name": "各種手当事務",
              "direction": "現状維持",
              "page": 187
            },
            {
              "name": "児童手当給付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 188
            },
            {
              "name": "児童育成手当給付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 189
            },
            {
              "name": "児童扶養手当給付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 190
            },
            {
              "name": "子どもの未来応援事業",
              "direction": "計画・規定どおり",
              "page": 192
            },
            {
              "name": "ひとり親家庭医療費助成事務",
              "direction": "現状維持",
              "page": 193
            },
            {
              "name": "ぷりすくーる西五反田経費",
              "direction": "現状維持",
              "page": 197
            },
            {
              "name": "区外保育園委託",
              "direction": "現状維持",
              "page": 215
            },
            {
              "name": "一時保護所運営費",
              "direction": "現状維持",
              "page": 219
            },
            {
              "name": "児童相談所維持管理経費",
              "direction": "現状維持",
              "page": 220
            },
            {
              "name": "社会福祉法人認可・指導監査事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 223
            },
            {
              "name": "成年後見制度経費",
              "direction": "現状維持",
              "page": 226
            },
            {
              "name": "福祉計画事務費",
              "direction": "現状維持",
              "page": 227
            },
            {
              "name": "障害者施策関係事務費",
              "direction": "現状維持",
              "page": 231
            },
            {
              "name": "基幹相談支援センター運営費",
              "direction": "計画・規定どおり",
              "page": 234
            },
            {
              "name": "障害者介護給付事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 235
            },
            {
              "name": "障害者訓練等給付事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 236
            },
            {
              "name": "相談支援給付等事務",
              "direction": "現状維持",
              "page": 237
            },
            {
              "name": "社会参加支援事業",
              "direction": "現状維持",
              "page": 239
            },
            {
              "name": "在宅生活支援事業",
              "direction": "現状維持",
              "page": 240
            },
            {
              "name": "障害者福祉手当等支給事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 241
            },
            {
              "name": "西大井福祉園等運営費",
              "direction": "現状維持",
              "page": 243
            },
            {
              "name": "かがやき園運営費",
              "direction": "計画・規定どおり",
              "page": 244
            },
            {
              "name": "北品川つばさの家運営費",
              "direction": "現状維持",
              "page": 245
            },
            {
              "name": "重症心身障害者通所施設運営費",
              "direction": "計画・規定どおり",
              "page": 247
            },
            {
              "name": "障害児者福祉施設管理経費",
              "direction": "計画・規定どおり",
              "page": 249
            },
            {
              "name": "障害児支援給付事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 251
            },
            {
              "name": "出石つばさの家運営費",
              "direction": "現状維持",
              "page": 253
            },
            {
              "name": "在宅高齢者支援事業",
              "direction": "現状維持",
              "page": 254
            },
            {
              "name": "特別養護老人ホーム運営費",
              "direction": "現状維持",
              "page": 257
            },
            {
              "name": "在宅サービスセンター運営費",
              "direction": "現状維持",
              "page": 258
            },
            {
              "name": "在宅介護支援センター運営費",
              "direction": "現状維持",
              "page": 259
            },
            {
              "name": "高齢者福祉施設支援事業",
              "direction": "現状維持",
              "page": 261
            },
            {
              "name": "福祉サービス評価・向上支援事業",
              "direction": "現状維持",
              "page": 263
            },
            {
              "name": "介護保険特別会計繰出金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 264
            },
            {
              "name": "高齢者福祉事務費",
              "direction": "現状維持",
              "page": 265
            },
            {
              "name": "職員共済組合業務経理等負担金（介護）",
              "direction": "計画・規定どおり",
              "page": 266
            },
            {
              "name": "一般事務費（介護）",
              "direction": "現状維持",
              "page": 267
            },
            {
              "name": "各種団体分担金（介護）",
              "direction": "計画・規定どおり",
              "page": 268
            },
            {
              "name": "東京都国保団体連合会負担金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 269
            },
            {
              "name": "介護保険料賦課徴収事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 270
            },
            {
              "name": "介護認定審査会費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 271
            },
            {
              "name": "認定調査等費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 272
            },
            {
              "name": "介護保険制度推進委員会費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 274
            },
            {
              "name": "地域密着型サービス事業者指定等事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 275
            },
            {
              "name": "居宅介護サービス給付費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 276
            },
            {
              "name": "地域密着型介護サービス給付費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 277
            },
            {
              "name": "居宅介護福祉用具費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 278
            },
            {
              "name": "居宅介護住宅改修費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 279
            },
            {
              "name": "居宅介護サービス計画給付費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 280
            },
            {
              "name": "施設介護サービス給付費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 281
            },
            {
              "name": "介護予防サービス給付費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 282
            },
            {
              "name": "地域密着型介護予防サービス給付費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 283
            },
            {
              "name": "介護予防福祉用具費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 284
            },
            {
              "name": "介護予防住宅改修費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 285
            },
            {
              "name": "介護予防サービス計画給付費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 286
            },
            {
              "name": "審査支払手数料",
              "direction": "法定受託事務・法定扶助費等",
              "page": 287
            },
            {
              "name": "高額介護サービス費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 288
            },
            {
              "name": "高額医療合算介護サービス費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 289
            },
            {
              "name": "特定入所者介護サービス費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 290
            },
            {
              "name": "特定入所者介護予防サービス費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 291
            },
            {
              "name": "通院等外出介助サービス特別給付費",
              "direction": "現状維持",
              "page": 293
            },
            {
              "name": "高額総合事業サービス費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 296
            },
            {
              "name": "高額医療合算総合事業サービス費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 297
            },
            {
              "name": "総合事業ケアマネジメント費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 298
            },
            {
              "name": "介護予防による地域づくり推進事業",
              "direction": "現状維持",
              "page": 308
            },
            {
              "name": "在宅介護支援センター事業費",
              "direction": "現状維持",
              "page": 310
            },
            {
              "name": "医療連携の促進",
              "direction": "現状維持",
              "page": 311
            },
            {
              "name": "ＡＬＳ患者コミュニケーション支援事業",
              "direction": "現状維持",
              "page": 318
            },
            {
              "name": "生活支援体制整備事業",
              "direction": "現状維持",
              "page": 321
            },
            {
              "name": "審査支払手数料",
              "direction": "法定受託事務・法定扶助費等",
              "page": 325
            },
            {
              "name": "介護給付費等準備基金積立金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 326
            },
            {
              "name": "第一号被保険者過誤納保険料還付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 327
            },
            {
              "name": "保険給付費負担金等過年度分精算還付",
              "direction": "法定受託事務・法定扶助費等",
              "page": 328
            },
            {
              "name": "高齢者クラブ支援事業",
              "direction": "現状維持",
              "page": 331
            },
            {
              "name": "介護予防活動拠点運営費",
              "direction": "現状維持",
              "page": 332
            },
            {
              "name": "高齢者住宅運営費",
              "direction": "現状維持",
              "page": 335
            },
            {
              "name": "高齢者地域支援事務費",
              "direction": "現状維持",
              "page": 337
            },
            {
              "name": "生活保護法施行事務",
              "direction": "現状維持",
              "page": 339
            },
            {
              "name": "生活保護適正化事業",
              "direction": "現状維持",
              "page": 340
            },
            {
              "name": "生活保護費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 342
            },
            {
              "name": "法外援護費",
              "direction": "現状維持",
              "page": 343
            },
            {
              "name": "中国残留邦人等支援事業",
              "direction": "法定受託事務・法定扶助費等",
              "page": 345
            },
            {
              "name": "高額療養費等支払費用貸付事務",
              "direction": "現状維持",
              "page": 346
            },
            {
              "name": "保健衛生助成金",
              "direction": "現状維持",
              "page": 350
            },
            {
              "name": "妊娠高血圧症候群等公費負担",
              "direction": "法定受託事務・法定扶助費等",
              "page": 351
            },
            {
              "name": "ＡＥＤ管理費",
              "direction": "現状維持",
              "page": 352
            },
            {
              "name": "健康推進関係事務費",
              "direction": "現状維持",
              "page": 354
            },
            {
              "name": "妊婦健康診査",
              "direction": "法定受託事務・法定扶助費等",
              "page": 355
            },
            {
              "name": "不妊治療等支援事業",
              "direction": "現状維持",
              "page": 357
            },
            {
              "name": "公害健康被害補償事業",
              "direction": "法定受託事務・法定扶助費等",
              "page": 368
            },
            {
              "name": "医療連携推進費",
              "direction": "計画・規定どおり",
              "page": 370
            },
            {
              "name": "地域医療保健推進助成金",
              "direction": "現状維持",
              "page": 372
            },
            {
              "name": "災害医療体制整備費",
              "direction": "計画・規定どおり",
              "page": 373
            },
            {
              "name": "衛生統計調査費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 375
            },
            {
              "name": "犬の登録・予防注射",
              "direction": "法定受託事務・法定扶助費等",
              "page": 376
            },
            {
              "name": "食品衛生",
              "direction": "現状維持",
              "page": 378
            },
            {
              "name": "環境衛生",
              "direction": "現状維持",
              "page": 379
            },
            {
              "name": "医薬衛生",
              "direction": "法定受託事務・法定扶助費等",
              "page": 380
            },
            {
              "name": "そ族昆虫防除対策費",
              "direction": "現状維持",
              "page": 381
            },
            {
              "name": "生活衛生関係事務費",
              "direction": "現状維持",
              "page": 382
            },
            {
              "name": "衛生検査室管理運営費",
              "direction": "計画・規定どおり",
              "page": 383
            },
            {
              "name": "栄養・食生活改善普及啓発および指導",
              "direction": "計画・規定どおり",
              "page": 384
            },
            {
              "name": "未熟児養育医療費公費負担",
              "direction": "法定受託事務・法定扶助費等",
              "page": 385
            },
            {
              "name": "育成医療・療育給付事業",
              "direction": "法定受託事務・法定扶助費等",
              "page": 386
            },
            {
              "name": "予防接種事業",
              "direction": "現状維持",
              "page": 387
            },
            {
              "name": "結核対策事業",
              "direction": "計画・規定どおり",
              "page": 389
            },
            {
              "name": "小児慢性特定疾病医療費等助成",
              "direction": "法定受託事務・法定扶助費等",
              "page": 392
            },
            {
              "name": "品川保健センター管理運営費",
              "direction": "現状維持",
              "page": 393
            },
            {
              "name": "乳児健康診査",
              "direction": "現状維持",
              "page": 394
            },
            {
              "name": "１歳６カ月児健康診査",
              "direction": "法定受託事務・法定扶助費等",
              "page": 395
            },
            {
              "name": "３歳児健康診査",
              "direction": "法定受託事務・法定扶助費等",
              "page": 396
            },
            {
              "name": "小児健康相談",
              "direction": "現状維持",
              "page": 397
            },
            {
              "name": "すくすく赤ちゃん訪問事業",
              "direction": "現状維持",
              "page": 398
            },
            {
              "name": "大井保健センター管理運営費",
              "direction": "現状維持",
              "page": 406
            },
            {
              "name": "荏原保健センター管理運営費",
              "direction": "現状維持",
              "page": 407
            },
            {
              "name": "国民年金事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 409
            },
            {
              "name": "国民健康保険事業会計繰出金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 410
            },
            {
              "name": "後期高齢者医療特別会計繰出金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 411
            },
            {
              "name": "職員共済組合業務経理等負担金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 412
            },
            {
              "name": "各種団体分担金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 414
            },
            {
              "name": "国民健康保険運営協議会",
              "direction": "法定受託事務・法定扶助費等",
              "page": 415
            },
            {
              "name": "東京都国保団体連合会負担金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 417
            },
            {
              "name": "療養給付費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 418
            },
            {
              "name": "療養費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 419
            },
            {
              "name": "審査支払手数料",
              "direction": "法定受託事務・法定扶助費等",
              "page": 420
            },
            {
              "name": "高額療養費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 421
            },
            {
              "name": "高額介護合算療養費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 422
            },
            {
              "name": "移送費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 423
            },
            {
              "name": "出産育児一時金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 424
            },
            {
              "name": "出産育児一時金支払手数料",
              "direction": "法定受託事務・法定扶助費等",
              "page": 425
            },
            {
              "name": "葬祭費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 426
            },
            {
              "name": "結核・精神医療給付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 427
            },
            {
              "name": "医療給付費分納付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 429
            },
            {
              "name": "後期高齢者支援金等分納付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 430
            },
            {
              "name": "介護納付金分納付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 431
            },
            {
              "name": "医療費通知事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 434
            },
            {
              "name": "保険料還付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 436
            },
            {
              "name": "保険料還付加算金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 437
            },
            {
              "name": "保険給付費等交付金償還金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 438
            },
            {
              "name": "その他償還金及び還付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 439
            },
            {
              "name": "保険料延滞金還付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 440
            },
            {
              "name": "職員共済組合業務経理等負担金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 441
            },
            {
              "name": "一般事務費（後期高齢者医療）",
              "direction": "法定受託事務・法定扶助費等",
              "page": 442
            },
            {
              "name": "各種団体分担金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 443
            },
            {
              "name": "後期高齢者医療保険料徴収事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 444
            },
            {
              "name": "広域連合分賦金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 445
            },
            {
              "name": "後期高齢者健康診査事業",
              "direction": "法定受託事務・法定扶助費等",
              "page": 446
            },
            {
              "name": "保健事業と介護予防の一体的実施事業",
              "direction": "法定受託事務・法定扶助費等",
              "page": 447
            },
            {
              "name": "葬祭費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 450
            },
            {
              "name": "過誤納保険料還付金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 451
            },
            {
              "name": "保険料還付加算金",
              "direction": "法定受託事務・法定扶助費等",
              "page": 452
            },
            {
              "name": "都市計画審議会経費",
              "direction": "現状維持",
              "page": 454
            },
            {
              "name": "空港環境経費",
              "direction": "現状維持",
              "page": 457
            },
            {
              "name": "都市計画関係事務費",
              "direction": "現状維持",
              "page": 458
            },
            {
              "name": "住環境整備連携事業",
              "direction": "現状維持",
              "page": 460
            },
            {
              "name": "建築審査会事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 465
            },
            {
              "name": "建築紛争調整事務",
              "direction": "現状維持",
              "page": 466
            },
            {
              "name": "住宅関係事務費",
              "direction": "現状維持",
              "page": 468
            },
            {
              "name": "密集住宅市街地整備促進事業",
              "direction": "計画・規定どおり",
              "page": 469
            },
            {
              "name": "不燃化特区支援事業",
              "direction": "計画・規定どおり",
              "page": 470
            },
            {
              "name": "防災街区整備事業",
              "direction": "計画・規定どおり",
              "page": 471
            },
            {
              "name": "都市防災不燃化促進事業",
              "direction": "計画・規定どおり",
              "page": 472
            },
            {
              "name": "防災生活圏促進事業",
              "direction": "計画・規定どおり",
              "page": 473
            },
            {
              "name": "避難道路機能強化事業",
              "direction": "計画・規定どおり",
              "page": 474
            },
            {
              "name": "従前居住者用住宅管理費",
              "direction": "計画・規定どおり",
              "page": 475
            },
            {
              "name": "整備地域不燃化加速事業",
              "direction": "計画・規定どおり",
              "page": 476
            },
            {
              "name": "大崎駅周辺地区再開発事業",
              "direction": "計画・規定どおり",
              "page": 477
            },
            {
              "name": "大井町駅周辺地区再開発事業",
              "direction": "計画・規定どおり",
              "page": 478
            },
            {
              "name": "武蔵小山駅周辺地区再開発事業",
              "direction": "計画・規定どおり",
              "page": 479
            },
            {
              "name": "戸越公園駅周辺地区再開発事業",
              "direction": "計画・規定どおり",
              "page": 480
            },
            {
              "name": "品川駅南地域周辺まちづくり事業",
              "direction": "計画・規定どおり",
              "page": 481
            },
            {
              "name": "戸越公園駅周辺まちづくり事業",
              "direction": "計画・規定どおり",
              "page": 482
            },
            {
              "name": "京浜急行線連続立体交差化事業",
              "direction": "計画・規定どおり",
              "page": 483
            },
            {
              "name": "東急大井町線連続立体交差化事業",
              "direction": "計画・規定どおり",
              "page": 484
            },
            {
              "name": "都市開発関係事務費",
              "direction": "現状維持",
              "page": 485
            },
            {
              "name": "細街路拡幅整備事業",
              "direction": "計画・規定どおり",
              "page": 486
            },
            {
              "name": "私道整備事業",
              "direction": "現状維持",
              "page": 487
            },
            {
              "name": "住宅・建築物耐震化支援事業",
              "direction": "現状維持",
              "page": 488
            },
            {
              "name": "がけ・擁壁安全化支援事業",
              "direction": "現状維持",
              "page": 489
            },
            {
              "name": "コンクリートブロック塀等安全化支援事業",
              "direction": "現状維持",
              "page": 490
            },
            {
              "name": "建築行政指導費",
              "direction": "現状維持",
              "page": 491
            },
            {
              "name": "建築関係事務費",
              "direction": "現状維持",
              "page": 492
            },
            {
              "name": "カラス及び外来種対策事業",
              "direction": "計画・規定どおり",
              "page": 494
            },
            {
              "name": "環境指導相談費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 495
            },
            {
              "name": "環境調査測定費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 496
            },
            {
              "name": "環境管理対策運用経費",
              "direction": "現状維持",
              "page": 499
            },
            {
              "name": "地域エコ活動推進事業",
              "direction": "現状維持",
              "page": 501
            },
            {
              "name": "資源物再商品化経費",
              "direction": "現状維持",
              "page": 504
            },
            {
              "name": "集団回収",
              "direction": "現状維持",
              "page": 505
            },
            {
              "name": "一般廃棄物処理業許可事務費",
              "direction": "現状維持",
              "page": 511
            },
            {
              "name": "東京二十三区清掃一部事務組合分担金等",
              "direction": "現状維持",
              "page": 515
            },
            {
              "name": "やさしいまちづくり整備費",
              "direction": "計画・規定どおり",
              "page": 519
            },
            {
              "name": "地域交通検討経費",
              "direction": "計画・規定どおり",
              "page": 520
            },
            {
              "name": "交通安全協会補助金",
              "direction": "現状維持",
              "page": 522
            },
            {
              "name": "シェアサイクル事業",
              "direction": "現状維持",
              "page": 524
            },
            {
              "name": "地域交通政策総務費",
              "direction": "現状維持",
              "page": 525
            },
            {
              "name": "道路・公園等占用費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 526
            },
            {
              "name": "道路・公園等監察費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 527
            },
            {
              "name": "屋外広告物取締事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 528
            },
            {
              "name": "道路・公園等公有地管理事務",
              "direction": "現状維持",
              "page": 529
            },
            {
              "name": "道路・公園等台帳補正事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 530
            },
            {
              "name": "地籍調査事業",
              "direction": "現状維持",
              "page": 531
            },
            {
              "name": "土木管理総務費",
              "direction": "現状維持",
              "page": 532
            },
            {
              "name": "街路灯管理費",
              "direction": "現状維持",
              "page": 535
            },
            {
              "name": "道路橋梁総務費",
              "direction": "現状維持",
              "page": 543
            },
            {
              "name": "公衆便所維持管理費",
              "direction": "現状維持",
              "page": 547
            },
            {
              "name": "マイガーデン運営費",
              "direction": "現状維持",
              "page": 549
            },
            {
              "name": "公園総務費",
              "direction": "現状維持",
              "page": 551
            },
            {
              "name": "水辺利活用事業",
              "direction": "計画・規定どおり",
              "page": 553
            },
            {
              "name": "排水施設建設事業",
              "direction": "計画・規定どおり",
              "page": 555
            },
            {
              "name": "下水道管改修事業",
              "direction": "計画・規定どおり",
              "page": 556
            },
            {
              "name": "河川下水道総務費",
              "direction": "現状維持",
              "page": 557
            },
            {
              "name": "防災会議費",
              "direction": "計画・規定どおり",
              "page": 558
            },
            {
              "name": "防災情報配信経費",
              "direction": "現状維持",
              "page": 565
            },
            {
              "name": "初期消火体制強化費",
              "direction": "現状維持",
              "page": 566
            },
            {
              "name": "災害時応急物資確保費",
              "direction": "現状維持",
              "page": 567
            },
            {
              "name": "弔慰金・見舞金経費",
              "direction": "現状維持",
              "page": 570
            },
            {
              "name": "自衛官等募集事務費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 571
            },
            {
              "name": "防災総務費",
              "direction": "現状維持",
              "page": 572
            },
            {
              "name": "委員会運営費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 573
            },
            {
              "name": "教職員福利厚生費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 575
            },
            {
              "name": "文化財保存活用事業",
              "direction": "現状維持",
              "page": 576
            },
            {
              "name": "義務教育施設整備基金積立金",
              "direction": "現状維持",
              "page": 578
            },
            {
              "name": "教育総務関係事務費",
              "direction": "現状維持",
              "page": 579
            },
            {
              "name": "学校維持補修費",
              "direction": "現状維持",
              "page": 580
            },
            {
              "name": "校舎等整備",
              "direction": "現状維持",
              "page": 581
            },
            {
              "name": "外壁・屋上改修費",
              "direction": "現状維持",
              "page": 582
            },
            {
              "name": "学校体育施設整備費",
              "direction": "現状維持",
              "page": 583
            },
            {
              "name": "施設整備等設計委託",
              "direction": "現状維持",
              "page": 584
            },
            {
              "name": "学校維持管理費",
              "direction": "現状維持",
              "page": 585
            },
            {
              "name": "学校運営費",
              "direction": "現状維持",
              "page": 586
            },
            {
              "name": "学校改築推進経費",
              "direction": "現状維持",
              "page": 587
            },
            {
              "name": "就学事務費",
              "direction": "現状維持",
              "page": 588
            },
            {
              "name": "夏季施設費",
              "direction": "現状維持",
              "page": 591
            },
            {
              "name": "移動教室経費",
              "direction": "現状維持",
              "page": 592
            },
            {
              "name": "就学援助費",
              "direction": "現状維持",
              "page": 593
            },
            {
              "name": "教材教具費",
              "direction": "現状維持",
              "page": 594
            },
            {
              "name": "学校図書館資料整備費",
              "direction": "現状維持",
              "page": 598
            },
            {
              "name": "給食施設整備費",
              "direction": "現状維持",
              "page": 602
            },
            {
              "name": "保健運営費",
              "direction": "現状維持",
              "page": 603
            },
            {
              "name": "教職員研修",
              "direction": "現状維持",
              "page": 607
            },
            {
              "name": "教職員支援経費",
              "direction": "現状維持",
              "page": 608
            },
            {
              "name": "一貫教育推進経費",
              "direction": "現状維持",
              "page": 609
            },
            {
              "name": "多様性理解・多文化共生推進事業",
              "direction": "現状維持",
              "page": 613
            },
            {
              "name": "１〜６年生の英語科経費",
              "direction": "計画・規定どおり",
              "page": 614
            },
            {
              "name": "英語力向上推進経費",
              "direction": "現状維持",
              "page": 615
            },
            {
              "name": "幼稚園講師採用経費",
              "direction": "現状維持",
              "page": 617
            },
            {
              "name": "教職員システム管理費",
              "direction": "現状維持",
              "page": 619
            },
            {
              "name": "教育指導関係事務費",
              "direction": "現状維持",
              "page": 620
            },
            {
              "name": "品川区教育会助成金",
              "direction": "現状維持",
              "page": 623
            },
            {
              "name": "人権尊重教育推進経費",
              "direction": "現状維持",
              "page": 624
            },
            {
              "name": "いじめ防止対策費",
              "direction": "計画・規定どおり",
              "page": 627
            },
            {
              "name": "連合行事費",
              "direction": "現状維持",
              "page": 628
            },
            {
              "name": "教育総合支援センター維持運営費",
              "direction": "現状維持",
              "page": 629
            },
            {
              "name": "体力向上推進事業",
              "direction": "現状維持",
              "page": 633
            },
            {
              "name": "不登校対策事業費",
              "direction": "計画・規定どおり",
              "page": 634
            },
            {
              "name": "教科書採択事務",
              "direction": "法定受託事務・法定扶助費等",
              "page": 638
            },
            {
              "name": "会計事務費",
              "direction": "現状維持",
              "page": 642
            },
            {
              "name": "公金取扱事務費",
              "direction": "現状維持",
              "page": 643
            },
            {
              "name": "一時借入金利子",
              "direction": "現状維持",
              "page": 644
            },
            {
              "name": "議会運営費",
              "direction": "現状維持",
              "page": 645
            },
            {
              "name": "図書室運営費",
              "direction": "現状維持",
              "page": 646
            },
            {
              "name": "議会広報費",
              "direction": "現状維持",
              "page": 647
            },
            {
              "name": "選挙管理委員会運営費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 648
            },
            {
              "name": "選挙人名簿調製費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 649
            },
            {
              "name": "選挙執行費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 651
            },
            {
              "name": "選挙執行費",
              "direction": "法定受託事務・法定扶助費等",
              "page": 652
            },
            {
              "name": "監査委員運営費",
              "direction": "現状維持",
              "page": 653
            }
          ],
          "C": [
            {
              "name": "全庁共通プロジェクト推進経費",
              "direction": "手法等の改善",
              "page": 2
            },
            {
              "name": "計画策定経費",
              "direction": "手法等の改善",
              "page": 4
            },
            {
              "name": "ＳＤＧｓ推進経費",
              "direction": "手法等の改善",
              "page": 5
            },
            {
              "name": "指定管理者制度経費",
              "direction": "手法等の改善",
              "page": 6
            },
            {
              "name": "営繕事務費",
              "direction": "手法等の改善",
              "page": 11
            },
            {
              "name": "ネットワーク・セキュリティ経費",
              "direction": "手法等の改善",
              "page": 14
            },
            {
              "name": "住民情報システム運営費",
              "direction": "手法等の改善",
              "page": 15
            },
            {
              "name": "庁舎管理費",
              "direction": "対象・規模等の見直し",
              "page": 16
            },
            {
              "name": "契約関係事務費",
              "direction": "手法等の改善",
              "page": 17
            },
            {
              "name": "税務関係事務費",
              "direction": "手法等の改善",
              "page": 21
            },
            {
              "name": "危機管理経費",
              "direction": "取組みの一部廃止",
              "page": 25
            },
            {
              "name": "二十歳の集い式典経費",
              "direction": "手法等の改善",
              "page": 26
            },
            {
              "name": "新年賀詞交歓会経費",
              "direction": "手法等の改善",
              "page": 27
            },
            {
              "name": "全国自治体との連携事業",
              "direction": "取組みの一部廃止",
              "page": 29
            },
            {
              "name": "国際友好都市交流事業",
              "direction": "対象・規模等の見直し",
              "page": 31
            },
            {
              "name": "山北町との交流事業",
              "direction": "手法等の改善",
              "page": 32
            },
            {
              "name": "早川町との交流事業",
              "direction": "取組みの一部廃止",
              "page": 33
            },
            {
              "name": "文書関係事務費",
              "direction": "手法等の改善",
              "page": 34
            },
            {
              "name": "私立学校関係費",
              "direction": "対象・規模等の見直し",
              "page": 36
            },
            {
              "name": "広報紙発行経費",
              "direction": "取組みの一部廃止",
              "page": 39
            },
            {
              "name": "区政資料等発行経費",
              "direction": "取組みの一部廃止",
              "page": 40
            },
            {
              "name": "広報番組等経費",
              "direction": "対象・規模等の見直し",
              "page": 41
            },
            {
              "name": "ホームページ等経費",
              "direction": "手法等の改善",
              "page": 42
            },
            {
              "name": "広聴経費",
              "direction": "手法等の改善",
              "page": 44
            },
            {
              "name": "広報広聴関係事務費",
              "direction": "手法等の改善",
              "page": 47
            },
            {
              "name": "人権啓発事業",
              "direction": "手法等の改善",
              "page": 48
            },
            {
              "name": "ジェンダー平等推進事業",
              "direction": "手法等の改善",
              "page": 49
            },
            {
              "name": "災害対策職員待機寮管理費",
              "direction": "手法等の改善",
              "page": 51
            },
            {
              "name": "職員研修費",
              "direction": "手法等の改善",
              "page": 53
            },
            {
              "name": "職員福利厚生事業",
              "direction": "対象・規模等の見直し",
              "page": 55
            },
            {
              "name": "人事給与関係事務費",
              "direction": "手法等の改善",
              "page": 59
            },
            {
              "name": "地域振興事業",
              "direction": "手法等の改善",
              "page": 64
            },
            {
              "name": "地域活動基盤整備補助",
              "direction": "手法等の改善",
              "page": 66
            },
            {
              "name": "ふれあい掲示板管理費",
              "direction": "手法等の改善",
              "page": 67
            },
            {
              "name": "区民まつり経費",
              "direction": "手法等の改善",
              "page": 68
            },
            {
              "name": "八潮地区まちづくり事業",
              "direction": "手法等の改善",
              "page": 70
            },
            {
              "name": "区政協力委員会経費",
              "direction": "手法等の改善",
              "page": 71
            },
            {
              "name": "協働推進事業",
              "direction": "手法等の改善",
              "page": 72
            },
            {
              "name": "地域センター等管理運営費",
              "direction": "手法等の改善",
              "page": 74
            },
            {
              "name": "ウェルカムセンター原・交流施設経費",
              "direction": "手法等の改善",
              "page": 75
            },
            {
              "name": "青少年健全育成事業",
              "direction": "手法等の改善",
              "page": 77
            },
            {
              "name": "地域支え愛活動経費",
              "direction": "手法等の改善",
              "page": 78
            },
            {
              "name": "歩行喫煙防止推進経費",
              "direction": "手法等の改善",
              "page": 79
            },
            {
              "name": "生活安全協議会経費",
              "direction": "手法等の改善",
              "page": 80
            },
            {
              "name": "生活安全活動費",
              "direction": "取組みの一部廃止",
              "page": 81
            },
            {
              "name": "児童見守りシステム運営費",
              "direction": "手法等の改善",
              "page": 83
            },
            {
              "name": "社会を明るくする運動経費",
              "direction": "手法等の改善",
              "page": 85
            },
            {
              "name": "区統計資料作成費",
              "direction": "対象・規模等の見直し",
              "page": 87
            },
            {
              "name": "統計調査員等確保対策",
              "direction": "手法等の改善",
              "page": 88
            },
            {
              "name": "区民活動交流施設運営費",
              "direction": "手法等の改善",
              "page": 92
            },
            {
              "name": "行政サービスコーナー経費",
              "direction": "対象・規模等の見直し",
              "page": 101
            },
            {
              "name": "個人番号カード経費",
              "direction": "手法等の改善",
              "page": 102
            },
            {
              "name": "おくやみコーナー経費",
              "direction": "手法等の改善",
              "page": 105
            },
            {
              "name": "戸籍住民関係事務費",
              "direction": "対象・規模等の見直し",
              "page": 106
            },
            {
              "name": "中小企業センター運営費",
              "direction": "手法等の改善",
              "page": 107
            },
            {
              "name": "伝統的産業の振興",
              "direction": "手法等の改善",
              "page": 108
            },
            {
              "name": "産学連携推進事業",
              "direction": "手法等の改善",
              "page": 111
            },
            {
              "name": "創業支援センター等運営費",
              "direction": "手法等の改善",
              "page": 112
            },
            {
              "name": "品川産業支援交流施設経費",
              "direction": "手法等の改善",
              "page": 113
            },
            {
              "name": "品川ビジネスクラブ助成金",
              "direction": "手法等の改善",
              "page": 114
            },
            {
              "name": "就業支援事業",
              "direction": "手法等の改善",
              "page": 116
            },
            {
              "name": "就業関連団体支援事業",
              "direction": "手法等の改善",
              "page": 117
            },
            {
              "name": "産業情報収集提供事業",
              "direction": "手法等の改善",
              "page": 118
            },
            {
              "name": "中小企業事業資金融資あっせん",
              "direction": "手法等の改善",
              "page": 119
            },
            {
              "name": "経営支援セミナー運営費",
              "direction": "手法等の改善",
              "page": 120
            },
            {
              "name": "事業承継支援事業",
              "direction": "取組みの一部廃止",
              "page": 122
            },
            {
              "name": "雇用確保支援事業",
              "direction": "手法等の改善",
              "page": 123
            },
            {
              "name": "販路拡大支援事業",
              "direction": "手法等の改善",
              "page": 125
            },
            {
              "name": "スタートアップ推進事業",
              "direction": "手法等の改善",
              "page": 126
            },
            {
              "name": "商店街振興事業",
              "direction": "手法等の改善",
              "page": 127
            },
            {
              "name": "商店街にぎわい創出事業",
              "direction": "取組みの一部廃止",
              "page": 128
            },
            {
              "name": "商店街ステップ・アップ支援事業",
              "direction": "手法等の改善",
              "page": 131
            },
            {
              "name": "商店街店舗支援事業",
              "direction": "手法等の改善",
              "page": 132
            },
            {
              "name": "商店街連携推進事業",
              "direction": "手法等の改善",
              "page": 134
            },
            {
              "name": "消費生活相談および支援",
              "direction": "手法等の改善",
              "page": 135
            },
            {
              "name": "観光資源整備事業",
              "direction": "対象・規模等の見直し",
              "page": 137
            },
            {
              "name": "観光情報発信事業",
              "direction": "取組みの一部廃止",
              "page": 138
            },
            {
              "name": "観光サービス充実事業",
              "direction": "手法等の改善",
              "page": 139
            },
            {
              "name": "区民レクリエーション",
              "direction": "手法等の改善",
              "page": 141
            },
            {
              "name": "各種団体支援",
              "direction": "手法等の改善",
              "page": 142
            },
            {
              "name": "文化芸術・スポーツ活動支援事業",
              "direction": "手法等の改善",
              "page": 143
            },
            {
              "name": "品川区民芸術祭経費",
              "direction": "手法等の改善",
              "page": 144
            },
            {
              "name": "品川文化振興事業団助成金",
              "direction": "手法等の改善",
              "page": 145
            },
            {
              "name": "区民学習支援経費",
              "direction": "手法等の改善",
              "page": 147
            },
            {
              "name": "シルバー大学",
              "direction": "手法等の改善",
              "page": 148
            },
            {
              "name": "障害者の学習活動支援",
              "direction": "手法等の改善",
              "page": 149
            },
            {
              "name": "総合区民会館運営費",
              "direction": "手法等の改善",
              "page": 150
            },
            {
              "name": "荏原平塚総合区民会館運営費",
              "direction": "手法等の改善",
              "page": 151
            },
            {
              "name": "文化センター運営費",
              "direction": "手法等の改善",
              "page": 152
            },
            {
              "name": "地域スポーツ支援",
              "direction": "手法等の改善",
              "page": 154
            },
            {
              "name": "少年少女スポーツ普及事業",
              "direction": "手法等の改善",
              "page": 156
            },
            {
              "name": "区民スポーツ大会",
              "direction": "手法等の改善",
              "page": 159
            },
            {
              "name": "体育館運営経費",
              "direction": "手法等の改善",
              "page": 161
            },
            {
              "name": "プレイパーク運営費",
              "direction": "手法等の改善",
              "page": 164
            },
            {
              "name": "青少年問題協議会",
              "direction": "取組みの一部廃止",
              "page": 167
            },
            {
              "name": "在宅子育て支援事業",
              "direction": "手法等の改善",
              "page": 172
            },
            {
              "name": "ファミリーサポートセンター運営費",
              "direction": "手法等の改善",
              "page": 178
            },
            {
              "name": "奨学金貸付事業",
              "direction": "手法等の改善",
              "page": 184
            },
            {
              "name": "ベビーシッター利用支援事業費",
              "direction": "対象・規模等の見直し",
              "page": 195
            },
            {
              "name": "保育園改築事業",
              "direction": "手法等の改善",
              "page": 196
            },
            {
              "name": "保育入園調整事務費",
              "direction": "手法等の改善",
              "page": 198
            },
            {
              "name": "認可外保育施設等保育料助成",
              "direction": "手法等の改善",
              "page": 199
            },
            {
              "name": "私立幼稚園保育料助成",
              "direction": "手法等の改善",
              "page": 200
            },
            {
              "name": "保育園運営費",
              "direction": "手法等の改善",
              "page": 201
            },
            {
              "name": "保育園維持管理費",
              "direction": "手法等の改善",
              "page": 202
            },
            {
              "name": "就学前教育推進事業",
              "direction": "手法等の改善",
              "page": 203
            },
            {
              "name": "幼保一体施設保育園運営費",
              "direction": "手法等の改善",
              "page": 204
            },
            {
              "name": "幼保一体施設幼稚園運営費",
              "direction": "手法等の改善",
              "page": 205
            },
            {
              "name": "幼保一体施設維持管理費",
              "direction": "手法等の改善",
              "page": 206
            },
            {
              "name": "公設民営保育園経費",
              "direction": "手法等の改善",
              "page": 207
            },
            {
              "name": "病児・病後児保育委託",
              "direction": "手法等の改善",
              "page": 208
            },
            {
              "name": "幼稚園運営費",
              "direction": "対象・規模等の見直し",
              "page": 209
            },
            {
              "name": "幼稚園維持管理費",
              "direction": "手法等の改善",
              "page": 210
            },
            {
              "name": "区内私立保育園経費",
              "direction": "手法等の改善",
              "page": 211
            },
            {
              "name": "地域型保育事業経費",
              "direction": "対象・規模等の見直し",
              "page": 212
            },
            {
              "name": "認証保育所経費",
              "direction": "対象・規模等の見直し",
              "page": 213
            },
            {
              "name": "認可外保育施設等経費",
              "direction": "手法等の改善",
              "page": 214
            },
            {
              "name": "私立幼稚園経費",
              "direction": "対象・規模等の見直し",
              "page": 216
            },
            {
              "name": "高齢者安否確認事業",
              "direction": "手法等の改善",
              "page": 221
            },
            {
              "name": "高齢者福祉施設整備費",
              "direction": "手法等の改善",
              "page": 222
            },
            {
              "name": "民生委員活動経費",
              "direction": "手法等の改善",
              "page": 225
            },
            {
              "name": "障害者施策推進経費",
              "direction": "手法等の改善",
              "page": 228
            },
            {
              "name": "障害福祉サービス事業者指定等経費",
              "direction": "対象・規模等の見直し",
              "page": 229
            },
            {
              "name": "障害者福祉施設等整備費",
              "direction": "手法等の改善",
              "page": 230
            },
            {
              "name": "権利擁護支援事業",
              "direction": "手法等の改善",
              "page": 232
            },
            {
              "name": "障害者理解・普及啓発事業",
              "direction": "手法等の改善",
              "page": 233
            },
            {
              "name": "心身障害者福祉会館運営費",
              "direction": "手法等の改善",
              "page": 242
            },
            {
              "name": "障害者訓練センター運営費",
              "direction": "手法等の改善",
              "page": 246
            },
            {
              "name": "発達障害者支援施設等運営費",
              "direction": "手法等の改善",
              "page": 248
            },
            {
              "name": "障害児者総合支援施設運営費",
              "direction": "対象・規模等の見直し",
              "page": 250
            },
            {
              "name": "障害者支援事務費",
              "direction": "手法等の改善",
              "page": 252
            },
            {
              "name": "高齢者災害対策支援事業費",
              "direction": "手法等の改善",
              "page": 255
            },
            {
              "name": "高齢者安否確認事業",
              "direction": "手法等の改善",
              "page": 256
            },
            {
              "name": "地域密着型サービス施設運営費",
              "direction": "手法等の改善",
              "page": 260
            },
            {
              "name": "福祉人材確保・定着事業",
              "direction": "手法等の改善",
              "page": 262
            },
            {
              "name": "介護保険制度趣旨普及費",
              "direction": "手法等の改善",
              "page": 273
            },
            {
              "name": "要支援者夜間対応サービス特別給付費",
              "direction": "対象・規模等の見直し",
              "page": 292
            },
            {
              "name": "予防訪問事業",
              "direction": "手法等の改善",
              "page": 294
            },
            {
              "name": "予防通所事業",
              "direction": "取組みの一部廃止",
              "page": 295
            },
            {
              "name": "介護予防対象者把握事業",
              "direction": "手法等の改善",
              "page": 299
            },
            {
              "name": "介護予防普及啓発事業",
              "direction": "手法等の改善",
              "page": 300
            },
            {
              "name": "運動系介護予防事業",
              "direction": "手法等の改善",
              "page": 301
            },
            {
              "name": "認知症予防事業",
              "direction": "対象・規模等の見直し",
              "page": 302
            },
            {
              "name": "ふれあい健康塾",
              "direction": "手法等の改善",
              "page": 303
            },
            {
              "name": "しながわ出会いの湯事業",
              "direction": "手法等の改善",
              "page": 304
            },
            {
              "name": "栄養改善事業",
              "direction": "手法等の改善",
              "page": 305
            },
            {
              "name": "地域貢献ポイント事業",
              "direction": "手法等の改善",
              "page": 306
            },
            {
              "name": "地域包括支援センター機能強化事業",
              "direction": "手法等の改善",
              "page": 307
            },
            {
              "name": "地域包括支援センター運営費",
              "direction": "手法等の改善",
              "page": 309
            },
            {
              "name": "ケアマネジメント支援事業",
              "direction": "手法等の改善",
              "page": 312
            },
            {
              "name": "介護保険給付適正化事業",
              "direction": "手法等の改善",
              "page": 313
            },
            {
              "name": "在宅介護者研修・支援事業",
              "direction": "対象・規模等の見直し",
              "page": 314
            },
            {
              "name": "成年後見制度利用支援事業",
              "direction": "手法等の改善",
              "page": 315
            },
            {
              "name": "住宅改修アドバイザー派遣等事業",
              "direction": "対象・規模等の見直し",
              "page": 316
            },
            {
              "name": "認知症高齢者グループホーム家賃助成事業",
              "direction": "手法等の改善",
              "page": 319
            },
            {
              "name": "認知症地域支援推進事業",
              "direction": "手法等の改善",
              "page": 320
            },
            {
              "name": "認知症早期発見・早期診断推進事業",
              "direction": "対象・規模等の見直し",
              "page": 322
            },
            {
              "name": "認知症カフェ運営補助事業",
              "direction": "対象・規模等の見直し",
              "page": 323
            },
            {
              "name": "認知症本人・家族支援事業",
              "direction": "対象・規模等の見直し",
              "page": 324
            },
            {
              "name": "高齢者活動支援事業",
              "direction": "手法等の改善",
              "page": 330
            },
            {
              "name": "シルバーセンター運営費",
              "direction": "手法等の改善",
              "page": 333
            },
            {
              "name": "高齢者多世代交流支援施設運営費",
              "direction": "手法等の改善",
              "page": 334
            },
            {
              "name": "高齢者住宅対策事業",
              "direction": "手法等の改善",
              "page": 336
            },
            {
              "name": "生活保護者自立支援事業",
              "direction": "手法等の改善",
              "page": 341
            },
            {
              "name": "生活困窮者自立支援事業",
              "direction": "手法等の改善",
              "page": 344
            },
            {
              "name": "健康センター事業費",
              "direction": "対象・規模等の見直し",
              "page": 348
            },
            {
              "name": "健康づくり支援事業費",
              "direction": "手法等の改善",
              "page": 349
            },
            {
              "name": "受動喫煙防止対策費",
              "direction": "手法等の改善",
              "page": 353
            },
            {
              "name": "成人歯科健診",
              "direction": "手法等の改善",
              "page": 358
            },
            {
              "name": "健康診査",
              "direction": "手法等の改善",
              "page": 359
            },
            {
              "name": "がん検診普及事業",
              "direction": "手法等の改善",
              "page": 360
            },
            {
              "name": "胃がん検診",
              "direction": "手法等の改善",
              "page": 361
            },
            {
              "name": "子宮がん検診",
              "direction": "手法等の改善",
              "page": 362
            },
            {
              "name": "乳がん検診",
              "direction": "手法等の改善",
              "page": 363
            },
            {
              "name": "肺がん検診",
              "direction": "手法等の改善",
              "page": 364
            },
            {
              "name": "大腸がん検診",
              "direction": "手法等の改善",
              "page": 365
            },
            {
              "name": "休日・小児夜間診療費",
              "direction": "手法等の改善",
              "page": 369
            },
            {
              "name": "かかりつけ医定着推進事業",
              "direction": "手法等の改善",
              "page": 371
            },
            {
              "name": "猫の適正飼養および活動支援事業",
              "direction": "手法等の改善",
              "page": 377
            },
            {
              "name": "自殺対策事業",
              "direction": "手法等の改善",
              "page": 388
            },
            {
              "name": "感染症対策事業",
              "direction": "手法等の改善",
              "page": 390
            },
            {
              "name": "難病患者療養支援事業",
              "direction": "対象・規模等の見直し",
              "page": 391
            },
            {
              "name": "母子歯科衛生事業",
              "direction": "手法等の改善",
              "page": 399
            },
            {
              "name": "健やか親子学習",
              "direction": "手法等の改善",
              "page": 400
            },
            {
              "name": "食からの子育て支援事業",
              "direction": "手法等の改善",
              "page": 401
            },
            {
              "name": "妊娠期からの相談事業",
              "direction": "手法等の改善",
              "page": 402
            },
            {
              "name": "０歳児見守り・子育てサポート事業",
              "direction": "対象・規模等の見直し",
              "page": 404
            },
            {
              "name": "健康学習費",
              "direction": "手法等の改善",
              "page": 405
            },
            {
              "name": "一般事務費",
              "direction": "手法等の改善",
              "page": 413
            },
            {
              "name": "趣旨普及",
              "direction": "手法等の改善",
              "page": 416
            },
            {
              "name": "特定健康診査事業費",
              "direction": "手法等の改善",
              "page": 432
            },
            {
              "name": "特定保健指導事業",
              "direction": "手法等の改善",
              "page": 433
            },
            {
              "name": "人間ドック助成事業",
              "direction": "手法等の改善",
              "page": 435
            },
            {
              "name": "人間ドック助成事業",
              "direction": "手法等の改善",
              "page": 448
            },
            {
              "name": "後期高齢者歯科健診事業",
              "direction": "手法等の改善",
              "page": 449
            },
            {
              "name": "景観まちづくり推進事業",
              "direction": "手法等の改善",
              "page": 453
            },
            {
              "name": "中高層建築物開発指導",
              "direction": "手法等の改善",
              "page": 456
            },
            {
              "name": "住宅改善資金融資あっせん・助成事業",
              "direction": "手法等の改善",
              "page": 459
            },
            {
              "name": "マンション管理支援事業",
              "direction": "手法等の改善",
              "page": 461
            },
            {
              "name": "区営住宅管理費",
              "direction": "手法等の改善",
              "page": 463
            },
            {
              "name": "区民住宅管理費",
              "direction": "手法等の改善",
              "page": 464
            },
            {
              "name": "居住支援事業",
              "direction": "対象・規模等の見直し",
              "page": 467
            },
            {
              "name": "アスベスト対策事業",
              "direction": "取組みの一部廃止",
              "page": 497
            },
            {
              "name": "環境学習交流施設管理運営費",
              "direction": "手法等の改善",
              "page": 498
            },
            {
              "name": "エコライフ普及事業",
              "direction": "手法等の改善",
              "page": 500
            },
            {
              "name": "資源回収",
              "direction": "手法等の改善",
              "page": 502
            },
            {
              "name": "資源化センター管理運営費",
              "direction": "手法等の改善",
              "page": 503
            },
            {
              "name": "リサイクル活動支援",
              "direction": "手法等の改善",
              "page": 506
            },
            {
              "name": "粗大ごみからのリユース事業",
              "direction": "手法等の改善",
              "page": 507
            },
            {
              "name": "廃棄物減量等推進審議会経費",
              "direction": "手法等の改善",
              "page": 508
            },
            {
              "name": "廃棄物排出指導費",
              "direction": "手法等の改善",
              "page": 510
            },
            {
              "name": "清掃事務所等施設管理事業",
              "direction": "手法等の改善",
              "page": 512
            },
            {
              "name": "安全衛生費",
              "direction": "対象・規模等の見直し",
              "page": 513
            },
            {
              "name": "収集運搬作業費",
              "direction": "手法等の改善",
              "page": 514
            },
            {
              "name": "リサイクル普及啓発費",
              "direction": "手法等の改善",
              "page": 517
            },
            {
              "name": "粗大ごみ再商品化経費",
              "direction": "対象・規模等の見直し",
              "page": 518
            },
            {
              "name": "交通安全啓発費",
              "direction": "手法等の改善",
              "page": 521
            },
            {
              "name": "駅周辺等放置自転車対策事業",
              "direction": "手法等の改善",
              "page": 523
            },
            {
              "name": "道路維持管理費",
              "direction": "対象・規模等の見直し",
              "page": 533
            },
            {
              "name": "道路安全施設費",
              "direction": "対象・規模等の見直し",
              "page": 534
            },
            {
              "name": "道路改良事業",
              "direction": "手法等の改善",
              "page": 536
            },
            {
              "name": "無電柱化推進事業",
              "direction": "手法等の改善",
              "page": 537
            },
            {
              "name": "補助１６３号線整備事業",
              "direction": "手法等の改善",
              "page": 539
            },
            {
              "name": "用地取得事務費",
              "direction": "手法等の改善",
              "page": 540
            },
            {
              "name": "橋梁維持管理費",
              "direction": "手法等の改善",
              "page": 541
            },
            {
              "name": "橋梁改修事業",
              "direction": "手法等の改善",
              "page": 542
            },
            {
              "name": "公園・児童遊園維持管理費",
              "direction": "手法等の改善",
              "page": 544
            },
            {
              "name": "公園・児童遊園整備費",
              "direction": "対象・規模等の見直し",
              "page": 545
            },
            {
              "name": "しながわ水族館運営費",
              "direction": "手法等の改善",
              "page": 546
            },
            {
              "name": "緑化活動支援事業",
              "direction": "手法等の改善",
              "page": 548
            },
            {
              "name": "施設植栽・花壇維持管理",
              "direction": "対象・規模等の見直し",
              "page": 550
            },
            {
              "name": "河川管理費",
              "direction": "対象・規模等の見直し",
              "page": 552
            },
            {
              "name": "治水対策推進助成事業",
              "direction": "手法等の改善",
              "page": 554
            },
            {
              "name": "防災区民組織育成費",
              "direction": "手法等の改善",
              "page": 559
            },
            {
              "name": "防災訓練経費",
              "direction": "手法等の改善",
              "page": 560
            },
            {
              "name": "防災普及教育費",
              "direction": "対象・規模等の見直し",
              "page": 561
            },
            {
              "name": "消防団運営費",
              "direction": "手法等の改善",
              "page": 562
            },
            {
              "name": "避難行動要支援者経費",
              "direction": "手法等の改善",
              "page": 563
            },
            {
              "name": "防災体制整備費",
              "direction": "手法等の改善",
              "page": 564
            },
            {
              "name": "避難所管理費",
              "direction": "手法等の改善",
              "page": 568
            },
            {
              "name": "帰宅困難者対策経費",
              "direction": "手法等の改善",
              "page": 569
            },
            {
              "name": "教育広報発行費",
              "direction": "手法等の改善",
              "page": 574
            },
            {
              "name": "ＰＴＡ関係費",
              "direction": "手法等の改善",
              "page": 577
            },
            {
              "name": "クラブ・部活動指導員経費",
              "direction": "手法等の改善",
              "page": 589
            },
            {
              "name": "プール指導員経費",
              "direction": "対象・規模等の見直し",
              "page": 590
            },
            {
              "name": "学校ＩＣＴ活用経費",
              "direction": "手法等の改善",
              "page": 595
            },
            {
              "name": "学校システム運営費",
              "direction": "手法等の改善",
              "page": 596
            },
            {
              "name": "特色ある教育活動経費",
              "direction": "手法等の改善",
              "page": 597
            },
            {
              "name": "学校維持管理費",
              "direction": "手法等の改善",
              "page": 599
            },
            {
              "name": "学校運営費",
              "direction": "手法等の改善",
              "page": 600
            },
            {
              "name": "給食運営費",
              "direction": "手法等の改善",
              "page": 601
            },
            {
              "name": "特別支援学校補助教材費保護者負担軽減事業",
              "direction": "手法等の改善",
              "page": 604
            },
            {
              "name": "特別支援学校給食費補助事業",
              "direction": "対象・規模等の見直し",
              "page": 605
            },
            {
              "name": "習熟度別学習推進経費",
              "direction": "手法等の改善",
              "page": 610
            },
            {
              "name": "特色ある教育活動経費",
              "direction": "手法等の改善",
              "page": 611
            },
            {
              "name": "学力向上プラン推進事業",
              "direction": "手法等の改善",
              "page": 612
            },
            {
              "name": "保幼小連携推進経費",
              "direction": "取組みの一部廃止",
              "page": 616
            },
            {
              "name": "学校地域連携推進経費",
              "direction": "手法等の改善",
              "page": 618
            },
            {
              "name": "教職員研修",
              "direction": "対象・規模等の見直し",
              "page": 621
            },
            {
              "name": "品川区研究学校",
              "direction": "手法等の改善",
              "page": 622
            },
            {
              "name": "生徒指導対策費",
              "direction": "対象・規模等の見直し",
              "page": 625
            },
            {
              "name": "帰国児童・生徒等支援費",
              "direction": "手法等の改善",
              "page": 626
            },
            {
              "name": "教育相談事業費",
              "direction": "手法等の改善",
              "page": 630
            },
            {
              "name": "市民科・各教科充実経費",
              "direction": "手法等の改善",
              "page": 631
            },
            {
              "name": "特色ある教育活動経費",
              "direction": "対象・規模等の見直し",
              "page": 632
            },
            {
              "name": "特別支援教育サポート経費",
              "direction": "手法等の改善",
              "page": 635
            },
            {
              "name": "就学事務費",
              "direction": "手法等の改善",
              "page": 637
            },
            {
              "name": "品川図書館運営費",
              "direction": "手法等の改善",
              "page": 639
            },
            {
              "name": "地区図書館運営費",
              "direction": "手法等の改善",
              "page": 640
            },
            {
              "name": "学校図書館運営費",
              "direction": "手法等の改善",
              "page": 641
            },
            {
              "name": "常時啓発費",
              "direction": "手法等の改善",
              "page": 650
            }
          ]
        },
        "exits": [
          {
            "name": "企業・大学等との連携促進",
            "reason": "連携が広がり、当初の目的を果たした",
            "result": "廃止",
            "page": 23
          },
          {
            "name": "区民斎場「なぎさ会館」",
            "reason": "使う人が減り、近くに代わりの斎場もある",
            "result": "廃止",
            "page": 103
          },
          {
            "name": "区民保養所（品川荘・光林荘）",
            "reason": "区民保養所としての使用をR10年3月末でやめる",
            "result": "廃止",
            "page": 76
          },
          {
            "name": "フィルムコミッション事業",
            "reason": "観光協会のサイトへ移し、観光PRに組み替える",
            "result": "廃止",
            "page": 140
          },
          {
            "name": "配食サービス栄養改善事業",
            "reason": "R6年度末で終わった",
            "result": "廃止",
            "page": 317
          },
          {
            "name": "働き方改革推進事業",
            "reason": "人材育成の方針などと内容が重なる",
            "result": "移管・統合",
            "page": 58
          },
          {
            "name": "オリンピック・パラリンピックスポーツ等振興事業",
            "reason": "「スポーツまちづくり振興事業」に組み直した",
            "result": "移管・統合",
            "page": 157
          },
          {
            "name": "出産・子育て応援事業",
            "reason": "国の制度（妊婦のための支援給付）に移った",
            "result": "移管・統合",
            "page": 356
          },
          {
            "name": "医療救護所訓練費",
            "reason": "災害医療体制整備費にまとめた",
            "result": "移管・統合",
            "page": 374
          },
          {
            "name": "ごみ・資源の普及啓発費",
            "reason": "リサイクル普及啓発費にまとめた",
            "result": "移管・統合",
            "page": 509
          },
          {
            "name": "清掃関係事務費",
            "reason": "システムの経費を関係する事業へ移した",
            "result": "移管・統合",
            "page": 516
          },
          {
            "name": "補助205号線整備事業",
            "reason": "周りのまちづくりを見ながら考えるため、事業としてはいったん閉じる",
            "result": "移管・統合",
            "page": 538
          },
          {
            "name": "庁舎整備基金積立金",
            "reason": "目標の140億円が貯まった",
            "result": "完了",
            "page": 62
          },
          {
            "name": "児童相談所移管推進事業",
            "reason": "R6年10月に区の児童相談所を開いた",
            "result": "完了",
            "page": 217
          },
          {
            "name": "子ども家庭センター開設準備経費",
            "reason": "R7年4月に子ども家庭センターを開いた",
            "result": "完了",
            "page": 183
          },
          {
            "name": "建設工事統計調査",
            "reason": "国が独自のシステムを入れ、区が行う調査がなくなった",
            "result": "完了",
            "page": 90
          },
          {
            "name": "省エネルギー対策・業務改善設備更新助成金",
            "reason": "緊急経済対策の1年だけの事業で、R6年度で終わった",
            "result": "完了",
            "page": 129
          },
          {
            "name": "定額減税補足給付金",
            "reason": "R7年度の追加給付で終わる",
            "result": "完了",
            "page": 22
          },
          {
            "name": "子育て世帯生活支援特別給付事業",
            "reason": "臨時の給付金で、R7年6月で終わる",
            "result": "完了",
            "page": 191
          },
          {
            "name": "ひとり親世帯臨時特別給付金",
            "reason": "臨時の給付金で、R7年6月で終わる",
            "result": "完了",
            "page": 194
          },
          {
            "name": "住民税非課税世帯等臨時特別給付金",
            "reason": "臨時の給付金で、R4年度で終わった",
            "result": "完了",
            "page": 338
          },
          {
            "name": "住民税非課税世帯等物価高騰対策支援給付金",
            "reason": "国が決めた臨時の給付金で、R7年5月末で終わる",
            "result": "完了",
            "page": 347
          },
          {
            "name": "傷病手当金（新型コロナ）",
            "reason": "請求の期限が過ぎ、R7年5月で終わる",
            "result": "完了",
            "page": 428
          },
          {
            "name": "前立腺がん検診",
            "reason": "国の指針にない検診で、効果の証拠が足りない",
            "result": "廃止を検討",
            "page": 366
          },
          {
            "name": "喉頭がん検診",
            "reason": "国の指針にない検診で、効果の証拠が足りない",
            "result": "廃止を検討",
            "page": 367
          },
          {
            "name": "区民の自主的なまちづくりへの支援",
            "reason": "3年続けて予算の3割も使われていない",
            "result": "廃止を検討",
            "page": 455
          }
        ]
      },
      "evaluationSource": "https://www.city.shinagawa.tokyo.jp/kusei/shisakukeikaku/1005171/1005172/1005173.html"
    }
  }
}

export const PROFILES: Record<string, Profile> = { [SHINAGAWA.code]: SHINAGAWA }
