// 自治体の個別ページに載せる、区の方針・政策領域・事業の入れ替え。API にはまだ無いので、出典（予算編成方針・当初予算の主な施策・
// 事務事業評価）から手で起こした値をここに置く。金額は出典の千円を円にしたもの。画像は static/jurisdictions/<code>/ に置く
// 政策領域への事業の振り分けと文の要約は風土記の判断で、出典の文言そのものではない

export interface Amount {
  yen: number
  /** 金額が事業の一部・全体のどちらかなど、金額の範囲 */
  label?: string
}

export type ProjectStatus = 'short' | 'met' | 'mixed' | 'none'

export interface PolicyProject {
  name: string
  what: string
  amounts: Amount[]
  /** 区の事務事業評価の結果。評価前の年度は持たない */
  status?: ProjectStatus
  evaluation?: { grade?: string; note: string }
}

export interface Domain {
  id: string
  name: string
  /** 目次に出す短い名前 */
  short?: string
  image: string
  projects: PolicyProject[]
}

export interface Policy {
  title: string
  body: string
  image: string
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
  /** 予算の考え方の一文。ヘッダーの説明に出す */
  tagline: string
  /** 方針の出典（予算編成方針の頁） */
  policySource: string
  policies: Policy[]
  domains: Domain[]
  scrap?: Scrap
  sources: string[]
}

export interface Profile {
  code: string
  /** 自治体の紋章（区章・市章など）。品川区は Wikimedia Commons の Public domain の SVG */
  logo?: string
  site: string
  population?: { people: number; asOf: string }
  tags: string[]
  /** 会計年度（西暦）ごと */
  years: Record<string, ProfileYear>
}

export const assetPath = (code: string, file: string) => `/jurisdictions/${code}/${file}`

const SHINAGAWA: Profile = {
  "code": "131091",
  "logo": "emblem.svg",
  "site": "https://www.city.shinagawa.tokyo.jp/",
  "population": {
    "people": 418666,
    "asOf": "2026-09-01"
  },
  "tags": [],
  "years": {
    "2026": {
      "tagline": "区民の不安や不満といった「不」を取り除き、誰もが安心して暮らしていける社会へ",
      "policySource": "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005728/1005729.html",
      "policies": [
        {
          "title": "ウェルビーイングの深化",
          "body": "4つの政策領域の事業で、誰もが使う基礎的な行政サービスと、災害や疾病など誰もが抱えうるリスクへの備えを等しく提供する。",
          "image": "policy-1.jpg"
        },
        {
          "title": "未来志向の戦略的な投資",
          "body": "SDGs 未来都市として、持続可能な経済・環境・社会をつくる。AI やデジタルツールで内部事務を効率化し、人材を育てる。",
          "image": "policy-2.jpg"
        },
        {
          "title": "持続可能な自治体経営",
          "body": "事業に優先順位をつけて入れ替える。背景・課題・費用対効果を明確にしてから予算を要求する。",
          "image": "policy-3.jpg"
        }
      ],
      "domains": [
        {
          "id": "anzen",
          "name": "安全安心を守る",
          "image": "domain-anzen.jpg",
          "projects": [
            {
              "name": "シェードポリシーの策定と、非課税世帯のエアコン購入費助成",
              "what": "街なかの日陰を増やす都市戦略を都内で初めてつくる。住民税が非課税の世帯にエアコンの購入費を助成する。",
              "amounts": [
                {
                  "yen": 7500000,
                  "label": "シェードポリシー"
                },
                {
                  "yen": 33920000,
                  "label": "エアコン助成"
                }
              ],
              "status": "none",
              "evaluation": {
                "note": "新規事業。成果の指標はまだない"
              }
            },
            {
              "name": "ストーカー・DV対策",
              "what": "被害者が避難するときの宿泊費を最大21泊助成。加害者の更生プログラムの費用も助成する。",
              "amounts": [
                {
                  "yen": 15610000
                }
              ],
              "status": "none",
              "evaluation": {
                "note": "新規事業。効果を測る指標は公開資料に示されていない"
              }
            }
          ]
        },
        {
          "id": "kodomo",
          "name": "社会全体で子どもと子育てを支える",
          "short": "子どもと子育てを支える",
          "image": "domain-kodomo.jpg",
          "projects": [
            {
              "name": "子どもの公共施設の利用料を無料に",
              "what": "区のプール・体育館など区有施設の利用料を、18歳以下は0円にする。",
              "amounts": [
                {
                  "yen": 30470000
                }
              ],
              "status": "short",
              "evaluation": {
                "grade": "B 今のまま続ける",
                "note": "（学校施設の開放）・温水プールの利用者 186,018人／目標 205,000人"
              }
            },
            {
              "name": "すまいるスクールの無料体験活動",
              "what": "全小学校の放課後の居場所で、無料の体験活動を新しく始める。朝の居場所づくりも全校に広げる。",
              "amounts": [
                {
                  "yen": 1861060000,
                  "label": "居場所運営費全体"
                }
              ],
              "status": "mixed",
              "evaluation": {
                "grade": "A 広げる",
                "note": "登録児童と満足度は目標超え、地域の人による教室は 1,399回／目標 3,700回"
              }
            },
            {
              "name": "子育て世帯の転居助成と、こども誰でも通園の月30時間化",
              "what": "区内で家を買って転居する子育て世帯に最大30万円、賃貸なら最大15万円。0〜2歳の通園を国の基準の月10時間から月30時間へ広げる。",
              "amounts": [
                {
                  "yen": 19690000,
                  "label": "転居助成など"
                },
                {
                  "yen": 941600000,
                  "label": "誰でも通園"
                }
              ],
              "status": "none",
              "evaluation": {
                "note": "新規事業。転出がどれだけ減ったかを測る指標は公開資料に見当たらない"
              }
            }
          ]
        },
        {
          "id": "yasashii",
          "name": "生きづらさをなくし住み続けられるやさしい社会をつくる",
          "short": "やさしい社会をつくる",
          "image": "domain-yasashii.jpg",
          "projects": [
            {
              "name": "がん検診の自己負担を無料に",
              "what": "胃がん（バリウム・内視鏡）と乳がん（マンモグラフィ）の検診を無料にする。これまでは数百円〜2,000円の自己負担があった。",
              "amounts": [
                {
                  "yen": 137540000,
                  "label": "胃がん検診"
                },
                {
                  "yen": 165680000,
                  "label": "乳がん検診"
                }
              ],
              "status": "mixed",
              "evaluation": {
                "grade": "C やり方を見直す",
                "note": "胃がん検診の受診率 7.9%／目標 11.6%、乳がん検診 30.9%／目標 30.9%"
              }
            }
          ]
        },
        {
          "id": "mirai",
          "name": "未来に希望の持てるサステナブルな社会をつくる",
          "short": "サステナブルな社会をつくる",
          "image": "domain-mirai.jpg",
          "projects": []
        }
      ],
      "scrap": {
        "raisedYen": 1520000000,
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
      "sources": [
        "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005728/1005729.html",
        "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005653/1005654.html",
        "https://www.city.shinagawa.tokyo.jp/kusei/shisakukeikaku/1005171/1005172/1005173.html"
      ]
    },
    "2025": {
      "tagline": "性別や障害の有無、家庭の状況などで選択を阻まれず、自分の望むように生き、幸せを感じられる社会へ",
      "policySource": "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005728/1005730.html",
      "policies": [
        {
          "title": "ウェルビーイングの進化（深化）",
          "body": "区民アンケートから選んだ4つの政策領域で、区民の幸福を高める取り組みを加速する。事務事業評価で20億円を生み出し、その財源にあてる。",
          "image": "policy-1.jpg"
        },
        {
          "title": "SDGs の達成を加速する",
          "body": "SDGs 未来都市と自治体 SDGs モデル事業に選ばれたことを機に、「子どもとともに創るウェルビーイングシティしながわ」を目指す。区民・企業・大学などと共に施策をつくる。",
          "image": "domain-mirai.jpg"
        },
        {
          "title": "働き方を変える",
          "body": "新庁舎への移転を見据えて DX 人材を育てる。生成 AI やデジタルツールで業務を効率化し、人と財源をより重要な事業に回す。",
          "image": "policy-2.jpg"
        }
      ],
      "domains": [
        {
          "id": "anzen",
          "name": "安全安心を守る",
          "image": "domain-anzen.jpg",
          "projects": [
            {
              "name": "住まいの相談窓口と、エアコンの設置・買い替え助成",
              "what": "家を借りにくい高齢者などの相談窓口「あんしん住まいる相談デスク」を新しく開く。家主向けの保険と、エアコンの設置・買い替えの費用助成も始める。",
              "amounts": [
                {
                  "yen": 42730000,
                  "label": "居住支援事業全体"
                }
              ]
            },
            {
              "name": "マンション防災と、事業者向けの防災啓発",
              "what": "マンションの住民どうしで災害に備える取り組みと、区内の事業者向けの防災啓発を新しく始める。",
              "amounts": [
                {
                  "yen": 150650000,
                  "label": "防災普及教育費全体"
                }
              ]
            }
          ]
        },
        {
          "id": "kodomo",
          "name": "社会全体で子どもと子育てを支える",
          "short": "子どもと子育てを支える",
          "image": "domain-kodomo.jpg",
          "projects": [
            {
              "name": "認証保育所などの第一子の保育料を無償に",
              "what": "令和7年9月から、認証保育所や認可外の保育施設に通う第一子の保育料を無償にする。",
              "amounts": [
                {
                  "yen": 1102060000,
                  "label": "保育料助成全体"
                }
              ]
            },
            {
              "name": "朝の子どもの居場所づくり",
              "what": "放課後の居場所「すまいるスクール」に加えて、登校前の朝に子どもが過ごせる居場所を確保する事業を始める。",
              "amounts": [
                {
                  "yen": 1708690000,
                  "label": "子どもの居場所運営費全体"
                }
              ]
            },
            {
              "name": "不登校の子どもへの昼食と、フリースクールの利用料助成",
              "what": "区の不登校支援教室「マイスクール」で昼食を出す。フリースクールなどの利用料も助成する。",
              "amounts": [
                {
                  "yen": 168600000,
                  "label": "不登校対策事業全体"
                }
              ]
            }
          ]
        },
        {
          "id": "yasashii",
          "name": "生きづらさをなくし住み続けられるやさしい社会をつくる",
          "short": "やさしい社会をつくる",
          "image": "domain-yasashii.jpg",
          "projects": [
            {
              "name": "障害児の通所支援の利用者負担を無償に",
              "what": "児童発達支援や放課後等デイサービスなど、障害児の通所支援の利用者負担をなくす。区外の特別支援学校への通学も支える。",
              "amounts": [
                {
                  "yen": 1819750000,
                  "label": "障害児支援給付全体"
                }
              ]
            },
            {
              "name": "中等度難聴の人の補聴器と、介護タクシーの助成",
              "what": "身体障害者手帳の対象にならない中等度難聴の人の補聴器購入と、介護タクシーの利用を新しく助成する。",
              "amounts": [
                {
                  "yen": 214850000,
                  "label": "社会参加支援事業全体"
                }
              ]
            },
            {
              "name": "介護職員の宿舎の借り上げ支援",
              "what": "介護事業者が職員の宿舎を借り上げる費用を支援する。外国人の介護人材を雇う事業者も支える。",
              "amounts": [
                {
                  "yen": 572650000,
                  "label": "福祉人材確保・定着事業全体"
                }
              ]
            }
          ]
        },
        {
          "id": "mirai",
          "name": "未来に希望の持てるサステナブルな社会をつくる",
          "short": "サステナブルな社会をつくる",
          "image": "domain-mirai.jpg",
          "projects": [
            {
              "name": "建物の省エネ化の助成と、区民参加の CO2 クレジット",
              "what": "ZEB の設計や新築の ZEH 化を新しく助成する。区民の省エネで減らした CO2 をクレジットにする取り組みも始める。",
              "amounts": [
                {
                  "yen": 100620000,
                  "label": "省エネルギー対策事業全体"
                }
              ]
            },
            {
              "name": "AI オンデマンド交通とグリーンスローモビリティの実証運行",
              "what": "予約に応じて走る乗合交通と、低速の電動車による地域交通を試しに走らせ、本格運行を検討する。",
              "amounts": [
                {
                  "yen": 154750000,
                  "label": "地域交通検討経費全体"
                }
              ]
            }
          ]
        }
      ],
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
      "sources": [
        "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005728/1005730.html",
        "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005653/1005655.html",
        "https://www.city.shinagawa.tokyo.jp/kusei/shisakukeikaku/1005171/1005176/1005177.html"
      ]
    },
    "2024": {
        "tagline": "区民の幸福（ウェルビーイング）を軸に、新しい時代の品川を引っ張る",
        "policySource": "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005728/1005731.html",
        "policies": [
          {
            "title": "誰もが自分らしく暮らせる品川区",
            "body": "子ども、現役世代、高齢者、障害者など、誰もが生きがいを感じて暮らせる区を目指す。いまも将来も、区民の誰もが幸福を実感できる施策を進める。",
            "image": "policy-1.jpg"
          },
          {
            "title": "職員の提案を施策にする",
            "body": "職員事業提案制度を始める。提案された事業は、関係する部署が今の課題や既存の事業との関係を踏まえて、新しい施策として実施を検討する。",
            "image": "policy-2.jpg"
          },
          {
            "title": "事務事業評価で無駄をなくす",
            "body": "物価の高騰を踏まえ、事務事業評価で見直すべき事業を確かめて無駄をなくす。実施計画と SDGs を進めるため、歳出と歳入の両方で工夫する。",
            "image": "policy-3.jpg"
          }
        ],
        "domains": [
          {
            "id": "anzen",
            "name": "安全安心を守る",
            "image": "domain-anzen.jpg",
            "projects": [
              {
                "name": "携帯トイレの全戸配布と、中学生の防災プロジェクト",
                "what": "災害時に使う携帯トイレを区内の全戸に配る。中学生向けの防災プロジェクトも新しく始める。",
                "amounts": [
                  {
                    "yen": 695891000,
                    "label": "防災普及教育費全体"
                  }
                ]
              },
              {
                "name": "避暑シェルターの運用補助",
                "what": "暑い日に誰でも涼める「避暑シェルター」を運用する施設に補助金を出す。",
                "amounts": [
                  {
                    "yen": 18707000,
                    "label": "危機管理経費全体"
                  }
                ]
              }
            ]
          },
          {
            "id": "kodomo",
            "name": "社会全体で子どもと子育てを支える",
            "short": "子どもと子育てを支える",
            "image": "domain-kodomo.jpg",
            "projects": [
              {
                "name": "学校給食の無償化",
                "what": "区立学校の給食費を無償にする取り組みを続ける。",
                "amounts": [
                  {
                    "yen": 3177795000,
                    "label": "給食運営費全体"
                  }
                ]
              },
              {
                "name": "補助教材費の保護者負担をなくす",
                "what": "これまで保護者が負担していた補助教材の費用を区が負担する。",
                "amounts": [
                  {
                    "yen": 1011667000,
                    "label": "教材教具費全体"
                  }
                ]
              },
              {
                "name": "メタバースを使った不登校支援",
                "what": "学校に行きにくい子どもが、仮想空間で学んだり人と関わったりできる支援を新しく始める。",
                "amounts": [
                  {
                    "yen": 161054000,
                    "label": "不登校対策事業費全体"
                  }
                ]
              }
            ]
          },
          {
            "id": "yasashii",
            "name": "生きづらさをなくし住み続けられるやさしい社会をつくる",
            "short": "やさしい社会をつくる",
            "image": "domain-yasashii.jpg",
            "projects": [
              {
                "name": "介護職員の居住支援手当",
                "what": "区内の介護施設で働く職員に、住まいの費用を支える手当を新しく出す。有償ボランティアと介護施設のマッチングも始める。",
                "amounts": [
                  {
                    "yen": 611282000,
                    "label": "福祉人材確保・定着事業全体"
                  }
                ]
              },
              {
                "name": "孤独・孤立対策",
                "what": "孤独や孤立に悩む人を支える取り組みを新しく始め、分野をまたいで相談を受ける体制を検討する。",
                "amounts": [
                  {
                    "yen": 188823000,
                    "label": "地域福祉推進費全体"
                  }
                ]
              },
              {
                "name": "生殖補助医療費の助成",
                "what": "体外受精などの生殖補助医療にかかる費用を新しく助成する。不妊の相談事業も始める。",
                "amounts": [
                  {
                    "yen": 58198000,
                    "label": "不妊治療等支援事業全体"
                  }
                ]
              }
            ]
          },
          {
            "id": "mirai",
            "name": "未来に希望の持てるサステナブルな社会をつくる",
            "short": "サステナブルな社会をつくる",
            "image": "domain-mirai.jpg",
            "projects": [
              {
                "name": "キャッシュレス決済のポイント還元",
                "what": "区内の店でキャッシュレス決済をした人にポイントを還元する事業を新しく始める。",
                "amounts": [
                  {
                    "yen": 829953000,
                    "label": "共通商品券普及促進事業全体"
                  }
                ]
              },
              {
                "name": "省エネ家電の設置助成",
                "what": "エアコンや冷蔵庫を省エネ型に買い替える費用を新しく助成する。",
                "amounts": [
                  {
                    "yen": 34069000,
                    "label": "省エネルギー対策事業全体"
                  }
                ]
              },
              {
                "name": "デマンド交通とグリーンスローモビリティの実証実験",
                "what": "予約に応じて走る乗合交通と、低速の電動車を試しに走らせ、地域の交通を充実させる方法を検討する。",
                "amounts": [
                  {
                    "yen": 154495000,
                    "label": "地域交通検討経費全体"
                  }
                ]
              }
            ]
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
        "sources": [
          "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005728/1005731.html",
          "https://www.city.shinagawa.tokyo.jp/kusei/zaisei/1005653/1005656.html",
          "https://www.city.shinagawa.tokyo.jp/kusei/shisakukeikaku/1005171/1005180/1005181.html"
        ]
      }
  }
}

export const PROFILES: Record<string, Profile> = { [SHINAGAWA.code]: SHINAGAWA }
