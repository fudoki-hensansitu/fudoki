// 自治体の紋章（都章・区章・市章・町村章）。SVG は public/jurisdictions/<code>/emblem.svg に置く。
// どれも Wikimedia Commons で Public domain（CC0 を含む）とされている SVG をそのまま使う。file は Commons の File 名、license は Commons の著作権タグ。候補は Wikidata の全国地方公共団体コード（P429）の紋章の画像（P94、無ければ P158）
/** 自治体ごとの資産（public/jurisdictions/<code>/ の紋章など）の URL */
export const assetPath = (code: string, file: string) => `/jurisdictions/${code}/${file}`

export interface Emblem {
  file: string
  license: string
}

export const EMBLEMS: Record<string, Emblem> = {
  '010006': { file: 'Emblem_of_Hokkaido_Prefecture.svg', license: 'PD-ineligible' }, // 北海道
  '011002': { file: 'Emblem_of_Sapporo,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 札幌市
  '012025': { file: 'Emblem_of_Hakodate,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 函館市
  '012033': { file: 'Emblem_of_Otaru,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 小樽市
  '012041': { file: 'Emblem_of_Asahikawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 旭川市
  '012050': { file: 'Emblem_of_Muroran,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 室蘭市
  '012068': { file: 'Emblem_of_Kushiro,_Hokkaido.svg', license: 'PD-self / PD-ineligible' }, // 釧路市
  '012076': { file: 'Emblem_of_Obihiro,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 帯広市
  '012084': { file: 'Emblem_of_Kitami,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 北見市
  '012092': { file: 'Emblem_of_Yubari,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 夕張市
  '012106': { file: 'Emblem_of_Iwamizawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 岩見沢市
  '012114': { file: 'Emblem_of_Abashiri,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 網走市
  '012122': { file: 'Emblem_of_Rumoi,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 留萌市
  '012131': { file: 'Emblem_of_Tomakomai,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 苫小牧市
  '012149': { file: 'Emblem_of_Wakkanai,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 稚内市
  '012157': { file: 'Emblem_of_Bibai,_Hokkaido.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 美唄市
  '012165': { file: 'Emblem_of_Ashibetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 芦別市
  '012173': { file: 'Emblem_of_Ebetsu,_Hokkaido.svg', license: 'PD-Japan-organization / PD-shape' }, // 江別市
  '012181': { file: 'Emblem_of_Akabira,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 赤平市
  '012190': { file: 'Emblem_of_Monbetsu,_Okhotsk,_Hokkaido.svg', license: 'PD-self / PD-ineligible' }, // 紋別市
  '012203': { file: 'Emblem_of_Shibetsu,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 士別市
  '012211': { file: 'Emblem_of_Nayoro,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 名寄市
  '012220': { file: 'Emblem_of_Mikasa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 三笠市
  '012238': { file: 'Emblem_of_Nemuro,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 根室市
  '012246': { file: 'Emblem_of_Chitose,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 千歳市
  '012254': { file: 'Emblem_of_Takikawa,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 滝川市
  '012262': { file: 'Emblem_of_Sunagawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 砂川市
  '012271': { file: 'Emblem_of_Utashinai,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 歌志内市
  '012289': { file: 'Emblem_of_Fukagawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 深川市
  '012297': { file: 'Emblem_of_Furano,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 富良野市
  '012301': { file: 'Emblem_of_Noboribetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 登別市
  '012319': { file: 'Emblem_of_Eniwa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 恵庭市
  '012335': { file: 'Emblem_of_Date,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 伊達市
  '012343': { file: 'Emblem_of_Kitahiroshima,_Hokkaido.svg', license: 'PD-ineligible' }, // 北広島市
  '012351': { file: 'Emblem_of_Ishikari,_Hokkaido.svg', license: 'PD-ineligible' }, // 石狩市
  '012360': { file: 'Emblem_of_Hokuto,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 北斗市
  '013030': { file: 'Emblem_of_Tobetsu,_Hokkaido.svg', license: 'PD-ineligible' }, // 当別町
  '013048': { file: 'Emblem_of_Shinshinotsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 新篠津村
  '013315': { file: 'Emblem_of_Matsumae,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 松前町
  '013323': { file: 'Emblem_of_Fukushima,_Hokkaido.svg', license: 'PD-ineligible' }, // 福島町
  '013331': { file: 'Emblem_of_Shiriuchi,_Hokkaido.svg', license: 'PD-ineligible' }, // 知内町
  '013340': { file: 'Emblem_of_Kikonai,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 木古内町
  '013374': { file: 'Emblem_of_Nanae,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 七飯町
  '013439': { file: 'Emblem_of_Shikabe,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 鹿部町
  '013455': { file: 'Emblem_of_Mori,_Hokkaido.svg', license: 'PD-ineligible' }, // 森町
  '013463': { file: 'Emblem_of_Yakumo,_Hokkaido.svg', license: 'PD-ineligible' }, // 八雲町
  '013471': { file: 'Emblem_of_Oshamanbe,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 長万部町
  '013617': { file: 'Emblem_of_Esashi,_Hiyama,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 江差町
  '013625': { file: 'Emblem_of_Kaminokuni,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 上ノ国町
  '013633': { file: 'Emblem_of_Assabu,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 厚沢部町
  '013641': { file: 'Emblem_of_Otobe,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 乙部町
  '013676': { file: 'Emblem_of_Okushiri,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 奥尻町
  '013706': { file: 'Emblem_of_Imakane,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 今金町
  '013714': { file: 'Emblem_of_Setana,_Hokkaido.svg', license: 'PD-ineligible' }, // せたな町
  '013919': { file: 'Emblem_of_Shimamaki,_Hokkaido.svg', license: 'PD-ineligible' }, // 島牧村
  '013927': { file: 'Emblem_of_Suttsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 寿都町
  '013935': { file: 'Emblem_of_Kuromatsunai,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 黒松内町
  '013943': { file: 'Emblem_of_Rankoshi,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 蘭越町
  '013951': { file: 'Emblem_of_Niseko,_Hokkaido.svg', license: 'PD-ineligible' }, // ニセコ町
  '013960': { file: 'Emblem_of_Makkari,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 真狩村
  '013978': { file: 'Emblem_of_Rusutsu,_Hokkaido.svg', license: 'PD-ineligible' }, // 留寿都村
  '013986': { file: 'Emblem_of_Kimobetsu,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 喜茂別町
  '013994': { file: 'Emblem_of_Kyogoku,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 京極町
  '014001': { file: 'Emblem_of_Kutchan,_Hokkaido.svg', license: 'PD-ineligible' }, // 倶知安町
  '014010': { file: 'Emblem_of_Kyowa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 共和町
  '014028': { file: 'Emblem_of_Iwanai,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 岩内町
  '014036': { file: 'Emblem_of_Tomari,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 泊村
  '014044': { file: 'Emblem_of_Kamoenai,_Hokkaido.svg', license: 'PD-ineligible' }, // 神恵内村
  '014052': { file: 'Emblem_of_Shakotan,_Hokkaido.svg', license: 'PD-ineligible' }, // 積丹町
  '014061': { file: 'Emblem_of_Furubira,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 古平町
  '014079': { file: 'Emblem_of_Niki,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 仁木町
  '014087': { file: 'Emblem_of_Yoichi,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 余市町
  '014095': { file: 'Emblem_of_Akaigawa,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 赤井川村
  '014231': { file: 'Emblem_of_Nanporo,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 南幌町
  '014249': { file: 'Emblem_of_Naie,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 奈井江町
  '014257': { file: 'Emblem_of_Kamisunagawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 上砂川町
  '014273': { file: 'Emblem_of_Yuni,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 由仁町
  '014281': { file: 'Emblem_of_Naganuma,_Hokkaido.svg', license: 'PD-ineligible' }, // 長沼町
  '014290': { file: 'Emblem_of_Kuriyama,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 栗山町
  '014303': { file: 'Emblem_of_Tsukigata,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 月形町
  '014311': { file: 'Emblem_of_Urausu,_Hokkaido.svg', license: 'PD-ineligible' }, // 浦臼町
  '014320': { file: 'Emblem_of_Shintotsukawa,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 新十津川町
  '014338': { file: 'Emblem_of_Moseushi,_Hokkaido.svg', license: 'PD-ineligible' }, // 妹背牛町
  '014346': { file: 'Emblem_of_Chippubetsu,_Hokkaido.svg', license: 'PD-ineligible' }, // 秩父別町
  '014362': { file: 'Emblem_of_Uryu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 雨竜町
  '014371': { file: 'Emblem_of_Hokuryu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 北竜町
  '014389': { file: 'Emblem_of_Numata,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 沼田町
  '014524': { file: 'Emblem_of_Takasu,_Hokkaido.svg', license: 'PD-ineligible' }, // 鷹栖町
  '014532': { file: 'Emblem_of_Higashikagura,_Hokkaido.svg', license: 'PD-ineligible' }, // 東神楽町
  '014541': { file: 'Emblem_of_Tōma,_Hokkaido.svg', license: 'PD-ineligible' }, // 当麻町
  '014559': { file: 'Emblem_of_Pippu,_Hokkaido.svg', license: 'PD-ineligible' }, // 比布町
  '014567': { file: 'Emblem_of_Aibetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 愛別町
  '014575': { file: 'Emblem_of_Kamikawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 上川町
  '014583': { file: 'Emblem_of_Higashikawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 東川町
  '014591': { file: 'Emblem_of_Biei,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 美瑛町
  '014605': { file: 'Emblem_of_Kamifurano,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 上富良野町
  '014613': { file: 'Emblem_of_Nakafurano,_Hokkaido.svg', license: 'PD-ineligible' }, // 中富良野町
  '014621': { file: 'Emblem_of_Minamifurano,_Hokkaido.svg', license: 'PD-ineligible' }, // 南富良野町
  '014630': { file: 'Emblem_of_Shimukappu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 占冠村
  '014648': { file: 'Emblem_of_Wassamu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 和寒町
  '014656': { file: 'Emblem_of_Kenbuchi,_Hokkaido.svg', license: 'PD-ineligible' }, // 剣淵町
  '014681': { file: 'Emblem_of_Shimokawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 下川町
  '014699': { file: 'Emblem_of_Bifuka,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 美深町
  '014702': { file: 'Emblem_of_Otoineppu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 音威子府村
  '014711': { file: 'Emblem_of_Nakagawa,_Hokkaido.svg', license: 'PD-ineligible' }, // 中川町
  '014729': { file: 'Emblem_of_Horokanai,_Hokkaido.svg', license: 'PD-ineligible' }, // 幌加内町
  '014818': { file: 'Emblem_of_Mashike,_Hokkaido.svg', license: 'PD-ineligible' }, // 増毛町
  '014826': { file: 'Emblem_of_Obira,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 小平町
  '014834': { file: 'Emblem_of_Tomamae,_Hokkaido.svg', license: 'PD-ineligible' }, // 苫前町
  '014842': { file: 'Emblem_of_Haboro,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 羽幌町
  '014851': { file: 'Emblem_of_Shosanbetsu,_Hokkaido.svg', license: 'PD-ineligible' }, // 初山別村
  '014869': { file: 'Emblem_of_Enbetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 遠別町
  '014877': { file: 'Emblem_of_Teshio,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 天塩町
  '015113': { file: 'Emblem_of_Sarufutsu,_Hokkaido.svg', license: 'PD-ineligible' }, // 猿払村
  '015121': { file: 'Emblem_of_Hamatonbetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 浜頓別町
  '015130': { file: 'Emblem_of_Nakatonbetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 中頓別町
  '015148': { file: 'Emblem_of_Esashi,_Sōya,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 枝幸町
  '015164': { file: 'Emblem_of_Toyotomi,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 豊富町
  '015172': { file: 'Emblem_of_Rebun,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 礼文町
  '015181': { file: 'Emblem_of_Rishiri,_Hokkaido.svg', license: 'PD-ineligible' }, // 利尻町
  '015199': { file: 'Emblem_of_Rishirifuji,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 利尻富士町
  '015202': { file: 'Emblem_of_Horonobe,_Hokkaido.svg', license: 'PD-ineligible' }, // 幌延町
  '015431': { file: 'Emblem_of_Bihoro,_Hokkaido.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 美幌町
  '015440': { file: 'Emblem_of_Tsubetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 津別町
  '015458': { file: 'Emblem_of_Shari,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 斜里町
  '015466': { file: 'Emblem_of_Kiyosato,_Hokkaido.svg', license: 'PD-ineligible' }, // 清里町
  '015474': { file: 'Emblem_of_Koshimizu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 小清水町
  '015491': { file: 'Emblem_of_Kunneppu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 訓子府町
  '015504': { file: 'Emblem_of_Oketo,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 置戸町
  '015521': { file: 'Emblem_of_Saroma,_Hokkaido.svg', license: 'PD-ineligible' }, // 佐呂間町
  '015555': { file: 'Emblem_of_Engaru,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 遠軽町
  '015598': { file: 'Emblem_of_Yūbetsu,_Hokkaido.svg', license: 'PD-ineligible' }, // 湧別町
  '015601': { file: 'Emblem_of_Takinoue,_Hokkaido.svg', license: 'PD-ineligible' }, // 滝上町
  '015610': { file: 'Emblem_of_Okoppe,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 興部町
  '015628': { file: 'Emblem_of_Nishiokoppe,_Hokkaido.svg', license: 'PD-ineligible' }, // 西興部村
  '015636': { file: 'Emblem_of_Ōmu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 雄武町
  '015644': { file: 'Emblem_of_Ōzora,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 大空町
  '015717': { file: 'Emblem_of_Toyoura,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 豊浦町
  '015750': { file: 'Emblem_of_Sobetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 壮瞥町
  '015784': { file: 'Emblem_of_Shiraoi,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 白老町
  '015814': { file: 'Emblem_of_Atsuma,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 厚真町
  '015849': { file: 'Emblem_of_Toyako,_Hokkaido.svg', license: 'PD-ineligible' }, // 洞爺湖町
  '015857': { file: 'Emblem_of_Abira,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 安平町
  '015865': { file: 'Emblem_of_Mukawa,_Hokkaido.svg', license: 'PD-ineligible' }, // むかわ町
  '016012': { file: 'Emblem_of_Hidaka,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 日高町
  '016021': { file: 'Emblem_of_Biratori,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 平取町
  '016047': { file: 'Emblem_of_Niikappu,_Hokkaido.svg', license: 'PD-ineligible' }, // 新冠町
  '016071': { file: 'Emblem_of_Urakawa,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 浦河町
  '016080': { file: 'Emblem_of_Samani,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 様似町
  '016098': { file: 'Emblem_of_Erimo,_Hokkaido.svg', license: 'PD-Japan-organization' }, // えりも町
  '016101': { file: 'Emblem_of_Shinhidaka,_Hokkaido.svg', license: 'PD-ineligible' }, // 新ひだか町
  '016314': { file: 'Emblem_of_Otofuke,_Hokkaido.svg', license: 'PD-ineligible' }, // 音更町
  '016322': { file: 'Emblem_of_Shihoro,_Hokkaido.svg', license: 'PD-ineligible' }, // 士幌町
  '016331': { file: 'Emblem_of_Kamishihoro,_Hokkaido.svg', license: 'PD-ineligible' }, // 上士幌町
  '016349': { file: 'Emblem_of_Shikaoi,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 鹿追町
  '016357': { file: 'Emblem_of_Shintoku,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 新得町
  '016365': { file: 'Emblem_of_Shimizu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 清水町
  '016373': { file: 'Emblem_of_Memuro,_Hokkaido.svg', license: 'PD-ineligible' }, // 芽室町
  '016381': { file: 'Emblem_of_Nakasatsunai,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 中札内村
  '016390': { file: 'Emblem_of_Sarabetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 更別村
  '016411': { file: 'Emblem_of_Taiki,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 大樹町
  '016420': { file: 'Emblem_of_Hiroo,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 広尾町
  '016438': { file: 'Emblem_of_Makubetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 幕別町
  '016446': { file: 'Emblem_of_Ikeda,_Hokkaido.svg', license: 'PD-ineligible' }, // 池田町
  '016454': { file: 'Emblem_of_Toyokoro,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 豊頃町
  '016462': { file: 'Emblem_of_Honbetsu,_Hokkaido.svg', license: 'PD-ineligible' }, // 本別町
  '016471': { file: 'Emblem_of_Ashoro,_Hokkaido.svg', license: 'PD-ineligible' }, // 足寄町
  '016489': { file: 'Emblem_of_Rikubetsu,_Hokkaido.svg', license: 'PD-ineligible' }, // 陸別町
  '016497': { file: 'Emblem_of_Urahoro,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 浦幌町
  '016616': { file: 'Emblem_of_Kushiro_Town,_Hokkaido.svg', license: 'PD-ineligible' }, // 釧路町
  '016624': { file: 'Emblem_of_Akkeshi,_Hokkaido.svg', license: 'PD-ineligible' }, // 厚岸町
  '016632': { file: 'Emblem_of_Hamanaka,_Hokkaido.svg', license: 'PD-ineligible' }, // 浜中町
  '016641': { file: 'Emblem_of_Shibecha,_Hokkaido.svg', license: 'PD-ineligible' }, // 標茶町
  '016659': { file: 'Emblem_of_Teshikaga,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 弟子屈町
  '016675': { file: 'Emblem_of_Tsurui,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 鶴居村
  '016683': { file: 'Emblem_of_Shiranuka,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 白糠町
  '016918': { file: 'Emblem_of_Betsukai,_Hokkaido.svg', license: 'PD-Japan-exempt' }, // 別海町
  '016926': { file: 'Emblem_of_Nakashibetsu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 中標津町
  '016934': { file: 'Emblem_of_Shibetsu,_Nemuro,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 標津町
  '016942': { file: 'Emblem_of_Rausu,_Hokkaido.svg', license: 'PD-Japan-organization' }, // 羅臼町
  '020001': { file: 'Emblem_of_Aomori_Prefecture.svg', license: 'PD-ineligible' }, // 青森県
  '022012': { file: 'Aomori_City_Emblem.svg', license: 'PD-Japan-organization' }, // 青森市
  '022021': { file: 'Emblem_of_Hirosaki,_Aomori.svg', license: 'PD-Japan-organization' }, // 弘前市
  '022039': { file: 'Emblem_of_Hachinohe,_Aomori.svg', license: 'PD-Japan-organization' }, // 八戸市
  '022047': { file: 'Emblem_of_Kuroishi,_Aomori.svg', license: 'PD-Japan-organization' }, // 黒石市
  '022055': { file: 'Emblem_of_Goshogawara,_Aomori.svg', license: 'PD-Japan-exempt' }, // 五所川原市
  '022063': { file: 'Emblem_of_Towada,_Aomori.svg', license: 'PD-ineligible' }, // 十和田市
  '022071': { file: 'Emblem_of_Misawa,_Aomori.svg', license: 'PD-Japan-organization' }, // 三沢市
  '022080': { file: 'Emblem_of_Mutsu,_Aomori.svg', license: 'PD-Japan-organization' }, // むつ市
  '022098': { file: 'Emblem_of_Tsugaru,_Aomori.svg', license: 'PD-ineligible' }, // つがる市
  '022101': { file: 'Emblem_of_Hirakawa,_Aomori.svg', license: 'PD-Japan-exempt' }, // 平川市
  '023019': { file: 'Emblem_of_Hiranai,_Aomori.svg', license: 'PD-Japan-exempt' }, // 平内町
  '023035': { file: 'Emblem_of_Imabetsu,_Aomori.svg', license: 'PD-Japan-organization' }, // 今別町
  '023043': { file: 'Emblem_of_Yomogita,_Aomori.svg', license: 'PD-ineligible' }, // 蓬田村
  '023078': { file: 'Emblem_of_Sotogahama,_Aomori.svg', license: 'PD-ineligible' }, // 外ヶ浜町
  '023213': { file: 'Emblem_of_Ajigasawa,_Aomori.svg', license: 'PD-Japan-exempt' }, // 鰺ヶ沢町
  '023230': { file: 'Emblem_of_Fukaura,_Aomori.svg', license: 'PD-Japan-exempt' }, // 深浦町
  '023434': { file: 'Emblem_of_Nishimeya,_Aomori.svg', license: 'PD-Japan-organization' }, // 西目屋村
  '023621': { file: 'Emblem_of_Ōwani,_Aomori.svg', license: 'PD-Japan-organization' }, // 大鰐町
  '023671': { file: 'Emblem_of_Inakadate,_Aomori.svg', license: 'PD-Japan-organization' }, // 田舎館村
  '023817': { file: 'Emblem_of_Itayanagi_Aomori.svg', license: 'PD-Japan-organization' }, // 板柳町
  '023841': { file: 'Emblem_of_Tsuruta,_Aomori.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 鶴田町
  '023876': { file: 'Emblem_of_Nakadomari,_Aomori.svg', license: 'PD-Japan-exempt' }, // 中泊町
  '024015': { file: 'Emblem_of_Noheji,_Aomori.svg', license: 'PD-Japan-organization' }, // 野辺地町
  '024023': { file: 'Emblem_of_Shichinohe,_Aomori.svg', license: 'PD-ineligible' }, // 七戸町
  '024058': { file: 'Emblem_of_Rokunohe,_Aomori.svg', license: 'PD-Japan-organization' }, // 六戸町
  '024066': { file: 'Emblem_of_Yokohama,_Aomori.svg', license: 'PD-ineligible' }, // 横浜町
  '024082': { file: 'Emblem_of_Tōhoku,_Aomori.svg', license: 'PD-Japan-exempt' }, // 東北町
  '024112': { file: 'Emblem_of_Rokkasho,_Aomori.svg', license: 'PD-Japan-organization' }, // 六ヶ所村
  '024121': { file: 'Emblem_of_Oirase,_Aomori.svg', license: 'PD-ineligible' }, // おいらせ町
  '024236': { file: 'Emblem_of_Ōma,_Aomori.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 大間町
  '024244': { file: 'Emblem_of_Higashidōri,_Aomori.svg', license: 'PD-Japan-exempt' }, // 東通村
  '024252': { file: 'Emblem_of_Kazamaura,_Aomori.svg', license: 'PD-Japan-exempt / PD-ineligible' }, // 風間浦村
  '024261': { file: 'Emblem_of_Sai,_Aomori.svg', license: 'PD-ineligible' }, // 佐井村
  '024414': { file: 'Emblem_of_Sannohe,_Aomori.svg', license: 'PD-Japan-organization' }, // 三戸町
  '024422': { file: 'Emblem_of_Gonohe,_Aomori.svg', license: 'PD-Japan-organization' }, // 五戸町
  '024431': { file: 'Emblem_of_Takko,_Aomori.svg', license: 'PD-Japan-organization' }, // 田子町
  '024457': { file: 'Emblem_of_Nanbu,_Aomori.svg', license: 'PD-ineligible' }, // 南部町
  '024465': { file: 'Emblem_of_Hashikami,_Aomori.svg', license: 'PD-Japan-organization' }, // 階上町
  '024503': { file: 'Emblem_of_Shingo,_Aomori.svg', license: 'PD-ineligible' }, // 新郷村
  '030007': { file: 'Emblem_of_Iwate_Prefecture.svg', license: 'PD-shape' }, // 岩手県
  '032018': { file: 'Emblem_of_Morioka,_Iwate.svg', license: 'PD-Japan-organization' }, // 盛岡市
  '032026': { file: 'Emblem_of_Miyako,_Iwate.svg', license: 'PD-Japan-organization' }, // 宮古市
  '032034': { file: 'Emblem_of_Ofunato,_Iwate.svg', license: 'PD-Japan-exempt' }, // 大船渡市
  '032051': { file: 'Emblem_of_Hanamaki,_Iwate.svg', license: 'PD-Japan-exempt' }, // 花巻市
  '032069': { file: 'Emblem_of_Kitakami,_Iwate.svg', license: 'PD-Japan-exempt' }, // 北上市
  '032077': { file: 'Emblem_of_Kuji,_Iwate.svg', license: 'PD-Japan-exempt' }, // 久慈市
  '032085': { file: 'Emblem_of_Tono,_Iwate.svg', license: 'PD-Japan-organization' }, // 遠野市
  '032093': { file: 'Emblem_of_Ichinoseki,_Iwate.svg', license: 'PD-Japan-exempt' }, // 一関市
  '032107': { file: 'Emblem_of_Rikuzentakata,_Iwate.svg', license: 'PD-Japan-organization' }, // 陸前高田市
  '032115': { file: 'Emblem_of_Kamaishi,_Iwate.svg', license: 'PD-Japan-organization' }, // 釜石市
  '032131': { file: 'Emblem_of_Ninohe,_Iwate.svg', license: 'PD-ineligible / PD-self' }, // 二戸市
  '032140': { file: 'Emblem_of_Hachimantai,_Iwate.svg', license: 'PD-Japan-exempt' }, // 八幡平市
  '032158': { file: 'Emblem_of_Ōshū,_Iwate.svg', license: 'PD-ineligible' }, // 奥州市
  '032166': { file: 'Emblem_of_Takizawa,_Iwate.svg', license: 'PD-Japan-exempt' }, // 滝沢市
  '033014': { file: 'Emblem_of_Shizukuishi,_Iwate.svg', license: 'PD-Japan-organization' }, // 雫石町
  '033022': { file: 'Emblem_of_Kuzumaki,_Iwate.svg', license: 'PD-Japan-exempt' }, // 葛巻町
  '033031': { file: 'Emblem_of_Iwate,_Iwate.svg', license: 'PD-Japan-exempt' }, // 岩手町
  '033219': { file: 'Emblem_of_Shiwa,_Iwate.svg', license: 'PD-Japan-organization' }, // 紫波町
  '033227': { file: 'Emblem_of_Yahaba,_Iwate.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 矢巾町
  '033669': { file: 'Emblem_of_Nishiwaga,_Iwate.svg', license: 'PD-Japan-exempt' }, // 西和賀町
  '033812': { file: 'Emblem_of_Kanegasaki,_Iwate.svg', license: 'PD-Japan-exempt' }, // 金ケ崎町
  '034029': { file: 'Emblem_of_Hiraizumi,_Iwate.svg', license: 'PD-Japan-organization' }, // 平泉町
  '034410': { file: 'Emblem_of_Sumita,_Iwate.svg', license: 'PD-Japan-organization' }, // 住田町
  '034614': { file: 'Emblem_of_Ōtsuchi,_Iwate.svg', license: 'PD-Japan-exempt' }, // 大槌町
  '034827': { file: 'Emblem_of_Yamada,_Iwate.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 山田町
  '034835': { file: 'Emblem_of_Iwaizumi,_Iwate.svg', license: 'PD-Japan-organization' }, // 岩泉町
  '034843': { file: 'Emblem_of_Tanohata,_Iwate.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 田野畑村
  '034851': { file: 'Emblem_of_Fudai,_Iwate.svg', license: 'PD-Japan-organization' }, // 普代村
  '035017': { file: 'Emblem_of_Karumai,_Iwate.svg', license: 'PD-Japan-exempt' }, // 軽米町
  '035033': { file: 'Emblem_of_Noda,_Iwate.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 野田村
  '035068': { file: 'Emblem_of_Kunohe,_Iwate.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 九戸村
  '035076': { file: 'Emblem_of_Hirono,_Iwate.svg', license: 'PD-Japan-exempt' }, // 洋野町
  '035246': { file: 'Emblem_of_Ichinohe,_Iwate.svg', license: 'PD-Japan-organization / PD-Japan-exempt' }, // 一戸町
  '040002': { file: 'Emblem_of_Miyagi_Prefecture.svg', license: 'PD-ineligible / PD-Japan-exempt' }, // 宮城県
  '041009': { file: 'Emblem_of_Sendai,_Miyagi.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 仙台市
  '042021': { file: 'Emblem_of_Ishinomaki,_Miyagi.svg', license: 'PD-user-en' }, // 石巻市
  '042030': { file: 'Emblem_of_Shiogama,_Miyagi.svg', license: 'PD-Japan-organization' }, // 塩竈市
  '042056': { file: 'Emblem_of_Kesennuma,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 気仙沼市
  '042064': { file: 'Emblem_of_Shiroishi,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 白石市
  '042072': { file: 'Emblem_of_Natori,_Miyagi.svg', license: 'PD-Japan-organization / PD-u</nowiki>''' }, // 名取市
  '042081': { file: 'Emblem_of_Kakuda,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 角田市
  '042099': { file: 'Emblem_of_Tagajō,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 多賀城市
  '042111': { file: 'Emblem_of_Iwanuma,_Miyagi.svg', license: 'PD-Japan-organization' }, // 岩沼市
  '042129': { file: 'Emblem_of_Tome,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 登米市
  '042137': { file: 'Emblem_of_Kurihara,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 栗原市
  '042145': { file: 'Emblem_of_Higashimatsushima,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 東松島市
  '042153': { file: 'Emblem_of_Osaki,_Miyagi.svg', license: 'PD-ineligible' }, // 大崎市
  '042161': { file: 'Emblem_of_Tomiya,_Miyagi.svg', license: 'PD-Japan-organization' }, // 富谷市
  '043010': { file: 'Emblem_of_Zaō,_Miyagi.svg', license: 'PD-Japan-organization' }, // 蔵王町
  '043028': { file: 'Emblem_of_Shichikashuku,_Miyagi.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 七ヶ宿町
  '043214': { file: 'Emblem_of_Ogawara,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 大河原町
  '043222': { file: 'Emblem_of_Murata,_Miyagi.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 村田町
  '043231': { file: 'Emblem_of_Shibata,_Miyagi.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 柴田町
  '043249': { file: 'Emblem_of_Kawasaki,_Miyagi.svg', license: 'PD-Japan-organization' }, // 川崎町
  '043419': { file: 'Emblem_of_Marumori,_Miyagi.svg', license: 'PD-Japan-organization' }, // 丸森町
  '043613': { file: 'Emblem_of_Watari,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 亘理町
  '043621': { file: 'Emblem_of_Yamamoto,_Miyagi.svg', license: 'PD-Japan-organization' }, // 山元町
  '044016': { file: 'Emblem_of_Matsushima,_Miyagi.svg', license: 'PD-Japan-organization' }, // 松島町
  '044041': { file: 'Emblem_of_Shichigahama,_Miyagi.svg', license: 'PD-ineligible' }, // 七ヶ浜町
  '044067': { file: 'Emblem_of_Rifu,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 利府町
  '044211': { file: 'Emblem_of_Taiwa,_Miyagi.svg', license: 'PD-ineligible' }, // 大和町
  '044229': { file: 'Emblem_of_Osato,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 大郷町
  '044245': { file: 'Emblem_of_Ōhira,_Miyagi.svg', license: 'PD-ineligible' }, // 大衡村
  '044440': { file: 'Emblem_of_Shikama,_Miyagi_(black).svg', license: 'PD-Japan-organization / PD-textlogo' }, // 色麻町
  '044458': { file: 'Emblem_of_Kami,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 加美町
  '045012': { file: 'Emblem_of_Wakuya,_Miyagi.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 涌谷町
  '045055': { file: 'Emblem_of_Misato,_Miyagi.svg', license: 'PD-Japan-exempt / PD-shape' }, // 美里町
  '045811': { file: 'Emblem_of_Onagawa,_Miyagi.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 女川町
  '046060': { file: 'Emblem_of_Minamisanriku,_Miyagi.svg', license: 'PD-Japan-exempt' }, // 南三陸町
  '050008': { file: 'Emblem_of_Akita_Prefecture.svg', license: 'PD-Japan-organization' }, // 秋田県
  '052019': { file: 'Emblem_of_Akita,_Akita.svg', license: 'PD-Japan-organization' }, // 秋田市
  '052027': { file: 'Emblem_of_Noshiro,_Akita.svg', license: 'PD-ineligible' }, // 能代市
  '052035': { file: 'Emblem_of_Yokote,_Akita.svg', license: 'PD-Japan-exempt' }, // 横手市
  '052043': { file: 'Emblem_of_Odate,_Akita.svg', license: 'PD-Japan-organization' }, // 大館市
  '052060': { file: 'Emblem_of_Oga,_Akita.svg', license: 'PD-Japan-organization' }, // 男鹿市
  '052078': { file: 'Emblem_of_Yuzawa,_Akita.svg', license: 'PD-ineligible' }, // 湯沢市
  '052094': { file: 'Emblem_of_Kazuno,_Akita.svg', license: 'PD-Japan-exempt' }, // 鹿角市
  '052108': { file: 'Emblem_of_Yurihonjo,_Akita.svg', license: 'PD-ineligible' }, // 由利本荘市
  '052116': { file: 'Emblem_of_Katagami,_Akita.svg', license: 'PD-ineligible' }, // 潟上市
  '052124': { file: 'Emblem_of_Daisen,_Akita.svg', license: 'PD-ineligible' }, // 大仙市
  '052132': { file: 'Emblem_of_Kitaakita,_Akita.svg', license: 'PD-ineligible' }, // 北秋田市
  '052141': { file: 'Emblem_of_Nikaho,_Akita.svg', license: 'PD-ineligible' }, // にかほ市
  '052159': { file: 'Emblem_of_Senboku,_Akita.svg', license: 'PD-ineligible' }, // 仙北市
  '053031': { file: 'Emblem_of_Kosaka,_Akita.svg', license: 'PD-Japan-exempt' }, // 小坂町
  '053279': { file: 'Emblem_of_Kamikoani,_Akita.svg', license: 'PD-Japan-organization' }, // 上小阿仁村
  '053465': { file: 'Emblem_of_Fujisato,_Akita.svg', license: 'PD-Japan-organization' }, // 藤里町
  '053481': { file: 'Emblem_of_Mitane,_Akita.svg', license: 'PD-Japan-exempt' }, // 三種町
  '053490': { file: 'Emblem_of_Happo,_Akita.svg', license: 'PD-ineligible' }, // 八峰町
  '053619': { file: 'Emblem_of_Gojome,_Akita.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 五城目町
  '053635': { file: 'Emblem_of_Hachirogata,_Akita.svg', license: 'PD-Japan-organization' }, // 八郎潟町
  '053660': { file: 'Emblem_of_Ikawa,_Akita.svg', license: 'PD-Japan-organization' }, // 井川町
  '053686': { file: 'Emblem_of_Ogata,_Akita.svg', license: 'PD-ineligible' }, // 大潟村
  '054348': { file: 'Emblem_of_Misato,_Akita.svg', license: 'PD-ineligible' }, // 美郷町
  '054631': { file: 'Emblem_of_Ugo,_Akita.svg', license: 'PD-Japan-organization' }, // 羽後町
  '054640': { file: 'Emblem_of_Higashinaruse,_Akita.svg', license: 'PD-Japan-organization' }, // 東成瀬村
  '060003': { file: 'Emblem_of_Yamagata_Prefecture.svg', license: 'PD-geometry' }, // 山形県
  '062014': { file: 'Emblem_of_Yamagata,_Yamagata.svg', license: 'PD-Japan-organization' }, // 山形市
  '062022': { file: 'Emblem_of_Yonezawa,_Yamagata.svg', license: 'PD-ineligible' }, // 米沢市
  '062031': { file: 'Emblem_of_Tsuruoka,_Yamagata.svg', license: 'PD-ineligible' }, // 鶴岡市
  '062049': { file: 'Emblem_of_Sakata,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 酒田市
  '062057': { file: 'Emblem_of_Shinjō,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 新庄市
  '062065': { file: 'Emblem_of_Sagae,_Yamagata.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 寒河江市
  '062073': { file: 'Emblem_of_Kaminoyama,_Yamagata.svg', license: 'PD-Japan-organization' }, // 上山市
  '062081': { file: 'Emblem_of_Murayama,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 村山市
  '062090': { file: 'Emblem_of_Nagai,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 長井市
  '062103': { file: 'Emblem_of_Tendō,_Yamagata.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 天童市
  '062111': { file: 'Emblem_of_Higashine,_Yamagata.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 東根市
  '062120': { file: 'Emblem_of_Obanazawa,_Yamagata.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 尾花沢市
  '062138': { file: 'Emblem_of_Nanyo,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 南陽市
  '063011': { file: 'Emblem_of_Yamanobe,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 山辺町
  '063029': { file: 'Emblem_of_Nakayama,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 中山町
  '063215': { file: 'Emblem_of_Kahoku,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 河北町
  '063223': { file: 'Emblem_of_Nishikawa,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 西川町
  '063231': { file: 'Emblem_of_Asahi,_Yamagata.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 朝日町
  '063240': { file: 'Emblem_of_Oe,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 大江町
  '063410': { file: 'Emblem_of_Oishida,_Yamagata.svg', license: 'PD-Japan-organization / PD-shape' }, // 大石田町
  '063614': { file: 'Emblem_of_Kaneyama,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 金山町
  '063622': { file: 'Emblem_of_Mogami,_Yamagata.svg', license: 'PD-Japan-organization' }, // 最上町
  '063631': { file: 'Emblem_of_Funagata,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 舟形町
  '063649': { file: 'Emblem_of_Mamurogawa,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 真室川町
  '063657': { file: 'Emblem_of_Okura,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 大蔵村
  '063665': { file: 'Emblem_of_Sakegawa,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 鮭川村
  '063673': { file: 'Emblem_of_Tozawa,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 戸沢村
  '063819': { file: 'Emblem_of_Takahata,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 高畠町
  '063827': { file: 'Emblem_of_Kawanishi,_Yamagata.svg', license: 'PD-textlogo' }, // 川西町
  '064017': { file: 'Emblem_of_Oguni,_Yamagata.svg', license: 'PD-Japan-organization' }, // 小国町
  '064025': { file: 'Emblem_of_Shirataka,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 白鷹町
  '064033': { file: 'Emblem_of_Iide,_Yamagata.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 飯豊町
  '064262': { file: 'Emblem_of_Mikawa,_Yamagata.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 三川町
  '064289': { file: 'Emblem_of_Shonai,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 庄内町
  '064611': { file: 'Emblem_of_Yuza,_Yamagata.svg', license: 'PD-Japan-exempt' }, // 遊佐町
  '070009': { file: 'Emblem_of_Fukushima_Prefecture.svg', license: 'PD-ineligible' }, // 福島県
  '072010': { file: 'Emblem_of_Fukushima,_Fukushima.svg', license: 'PD-Japan-organization' }, // 福島市
  '072028': { file: 'Emblem_of_Aizuwakamatsu,_Fukushima.svg', license: 'PD-Japan-organization' }, // 会津若松市
  '072036': { file: 'Emblem_of_Kōriyama,_Fukushima.svg', license: 'PD-Japan-organization' }, // 郡山市
  '072044': { file: 'Emblem_of_Iwaki,_Fukushima.svg', license: 'PD-ineligible' }, // いわき市
  '072052': { file: 'Emblem_of_Shirakawa,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 白河市
  '072079': { file: 'Emblem_of_Sukagawa,_Fukushima.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 須賀川市
  '072087': { file: 'Emblem_of_Kitakata,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 喜多方市
  '072095': { file: 'Emblem_of_Sōma,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 相馬市
  '072109': { file: 'Emblem_of_Nihonmatsu,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 二本松市
  '072117': { file: 'Emblem_of_Tamura,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 田村市
  '072125': { file: 'Emblem_of_Minamisoma,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 南相馬市
  '072133': { file: 'Emblem_of_Date,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 伊達市
  '072141': { file: 'Emblem_of_Motomiya,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 本宮市
  '073016': { file: 'Emblem_of_Koori,_Fukushima.svg', license: 'PD-Japan-organization' }, // 桑折町
  '073032': { file: 'Emblem_of_Kunimi,_Fukushima.svg', license: 'PD-self' }, // 国見町
  '073083': { file: 'Emblem_of_Kawamata,_Fukushima.svg', license: 'PD-Japan-organization' }, // 川俣町
  '073229': { file: 'Emblem_of_Ōtama,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 大玉村
  '073423': { file: 'Emblem_of_Kagamiishi,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 鏡石町
  '073440': { file: 'Emblem_of_Tenei,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 天栄村
  '073628': { file: 'Emblem_of_Shimogō,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 下郷町
  '073644': { file: 'Emblem_of_Hinoemata,_Fukushima.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 檜枝岐村
  '073679': { file: 'Emblem_of_Tadami,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 只見町
  '073687': { file: 'Emblem_of_Minamiaizu,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 南会津町
  '074021': { file: 'Emblem_of_Kitashiobara,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 北塩原村
  '074055': { file: 'Emblem_of_Nishiaizu,_Fukushima.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 西会津町
  '074071': { file: 'Emblem_of_Bandai,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 磐梯町
  '074080': { file: 'Emblem_of_Inawashiro,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 猪苗代町
  '074217': { file: 'Emblem_of_Aizubange,_Fukushima.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 会津坂下町
  '074225': { file: 'Emblem_of_Yugawa,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 湯川村
  '074233': { file: 'Emblem_of_Yanaizu,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 柳津町
  '074446': { file: 'Emblem_of_Mishima,_Fukushima.svg', license: 'PD-Japan-organization' }, // 三島町
  '074454': { file: 'Emblem_of_Kaneyama,_Fukushima.svg', license: 'PD-Japan-organization' }, // 金山町
  '074462': { file: 'Emblem_of_Showa,_Fukushima.svg', license: 'PD-Japan-organization' }, // 昭和村
  '074471': { file: 'Emblem_of_Aizumisato,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 会津美里町
  '074616': { file: 'Emblem_of_Nishigō,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 西郷村
  '074641': { file: 'Emblem_of_Izumisaki,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 泉崎村
  '074659': { file: 'Emblem_of_Nakajima,_Fukushima_(Black).svg', license: 'PD-Japan-exempt' }, // 中島村
  '074667': { file: 'Emblem_of_Yabuki,_Fukushima.svg', license: 'PD-ineligible' }, // 矢吹町
  '074811': { file: 'Emblem_of_Tanagura,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 棚倉町
  '074829': { file: 'Emblem_of_Yamatsuri,_Fukushima.svg', license: 'PD-ineligible' }, // 矢祭町
  '074837': { file: 'Emblem_of_Hanawa,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 塙町
  '074845': { file: 'Emblem_of_Samegawa,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 鮫川村
  '075019': { file: 'Emblem_of_Ishikawa,_Fukushima.svg', license: 'PD-Japan-organization' }, // 石川町
  '075027': { file: 'Emblem_of_Tamakawa,_Fukushima.svg', license: 'PD-ineligible' }, // 玉川村
  '075035': { file: 'Emblem_of_Hirata,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 平田村
  '075043': { file: 'Emblem_of_Asakawa,_Fukushima.svg', license: 'PD-self / PD-ineligible' }, // 浅川町
  '075051': { file: 'Emblem_of_Furudono,_Fukushima.svg', license: 'PD-Japan-organization' }, // 古殿町
  '075213': { file: 'Emblem_of_Miharu,_Fukushima.svg', license: 'PD-Japan-organization' }, // 三春町
  '075221': { file: 'Emblem_of_Ono,_Fukushima.svg', license: 'PD-Japan-exempt / PD-shape' }, // 小野町
  '075418': { file: 'Emblem_of_Hirono,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 広野町
  '075426': { file: 'Emblem_of_Naraha,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 楢葉町
  '075434': { file: 'Emblem_of_Tomioka,_Fukushima.svg', license: 'PD-Japan-organization' }, // 富岡町
  '075442': { file: 'Emblem_of_Kawauchi,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 川内村
  '075451': { file: 'Emblem_of_Ōkuma,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 大熊町
  '075469': { file: 'Emblem_of_Futaba,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 双葉町
  '075477': { file: 'Emblem_of_Namie,_Fukushima.svg', license: 'PD-Japan-organization' }, // 浪江町
  '075485': { file: 'Emblem_of_Katsurao,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 葛尾村
  '075612': { file: 'Emblem_of_Shinchi,_Fukushima.svg', license: 'PD-Japan-exempt' }, // 新地町
  '075647': { file: 'Emblem_of_Iitate,_Fukushima.svg', license: 'PD-Japan-organization' }, // 飯舘村
  '080004': { file: 'Emblem_of_Ibaraki_Prefecture.svg', license: 'PD-shape' }, // 茨城県
  '082015': { file: 'Emblem_of_Mito,_Ibaraki.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 水戸市
  '082023': { file: 'Emblem_of_Hitachi,_Ibaraki.svg', license: 'PD-ineligible' }, // 日立市
  '082031': { file: 'Emblem_of_Tsuchiura,_Ibaraki.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 土浦市
  '082040': { file: 'Emblem_of_Koga,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 古河市
  '082058': { file: 'Emblem_of_Ishioka,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 石岡市
  '082074': { file: 'Emblem_of_Yuki,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 結城市
  '082082': { file: 'Emblem_of_Ryūgasaki,_Ibaraki_(black).svg', license: 'PD-Japan-exempt' }, // 龍ケ崎市
  '082104': { file: 'Emblem_of_Shimotsuma,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 下妻市
  '082112': { file: 'Emblem_of_Jōsō,_Ibaraki.svg', license: 'PD-ineligible' }, // 常総市
  '082121': { file: 'Emblem_of_Hitachiōta,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 常陸太田市
  '082147': { file: 'Emblem_of_Takahagi,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 高萩市
  '082155': { file: 'Emblem_of_Kitaibaraki,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 北茨城市
  '082163': { file: 'Emblem_of_Kasama,_Ibaraki.svg', license: 'PD-ineligible' }, // 笠間市
  '082171': { file: 'Emblem_of_Toride,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 取手市
  '082198': { file: 'Emblem_of_Ushiku,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 牛久市
  '082210': { file: 'Emblem_of_Hitachinaka,_Ibaraki.svg', license: 'PD-ineligible / PD-Japan-exempt' }, // ひたちなか市
  '082228': { file: 'Emblem_of_Kashima,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 鹿嶋市
  '082236': { file: 'Emblem_of_Itako,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 潮来市
  '082244': { file: 'Emblem_of_Moriya,_Ibaraki.svg', license: 'PD-ineligible' }, // 守谷市
  '082252': { file: 'Emblem_of_Hitachiomiya,_Ibaraki.svg', license: 'PD-ineligible' }, // 常陸大宮市
  '082261': { file: 'Emblem_of_Naka,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 那珂市
  '082279': { file: 'Emblem_of_Chikusei,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 筑西市
  '082287': { file: 'Emblem_of_Bandō,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 坂東市
  '082295': { file: 'Emblem_of_Inashiki,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 稲敷市
  '082309': { file: 'Emblem_of_Kasumigaura,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // かすみがうら市
  '082317': { file: 'Emblem_of_Sakuragawa,_Ibaraki.svg', license: 'PD-ineligible' }, // 桜川市
  '082325': { file: 'Emblem_of_Kamisu,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 神栖市
  '082333': { file: 'Emblem_of_Namegata,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 行方市
  '082341': { file: 'Emblem_of_Hokota,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 鉾田市
  '082350': { file: 'Emblem_of_Tsukubamirai,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // つくばみらい市
  '082368': { file: 'Emblem_of_Omitama,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 小美玉市
  '083020': { file: 'Emblem_of_Ibaraki,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 茨城町
  '083097': { file: 'Emblem_of_Ōarai,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 大洗町
  '083101': { file: 'Emblem_of_Shirosato,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 城里町
  '083411': { file: 'Emblem_of_Tōkai,_Ibaraki.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 東海村
  '083640': { file: 'Emblem_of_Daigo,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 大子町
  '084425': { file: 'Emblem_of_Miho,_Ibaraki.svg', license: 'PD-ineligible' }, // 美浦村
  '084433': { file: 'Emblem_of_Ami,_Ibaraki.svg', license: 'PD-textlogo' }, // 阿見町
  '084476': { file: 'Emblem_of_Kawachi,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 河内町
  '085219': { file: 'Emblem_of_Yachiyo,_Ibaraki.svg', license: 'PD-ineligible' }, // 八千代町
  '085421': { file: 'Emblem_of_Goka,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 五霞町
  '085464': { file: 'Emblem_of_Sakai,_Ibaraki.svg', license: 'PD-Japan-exempt' }, // 境町
  '085642': { file: 'Emblem_of_Tone,_Ibaraki.svg', license: 'PD-Japan-organization' }, // 利根町
  '090000': { file: 'Emblem_of_Tochigi_Prefecture.svg', license: 'PD-Japan-organization' }, // 栃木県
  '092011': { file: 'Emblem_of_Utsunomiya,_Tochigi.svg', license: 'PD-Japan-organization' }, // 宇都宮市
  '092029': { file: 'Emblem_of_Ashikaga,_Tochigi.svg', license: 'PD-Japan-organization' }, // 足利市
  '092037': { file: 'Emblem_of_Tochigi,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 栃木市
  '092045': { file: 'Emblem_of_Sano,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 佐野市
  '092053': { file: '栃木県鹿沼市市章.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 鹿沼市
  '092061': { file: 'Emblem_of_Nikkō,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 日光市
  '092088': { file: 'Emblem_of_Oyama,_Tochigi.svg', license: 'PD-Japan-organization' }, // 小山市
  '092096': { file: 'Emblem_of_Mooka,_Tochigi.svg', license: 'PD-Japan-organization' }, // 真岡市
  '092100': { file: 'Emblem_of_Otawara,_Tochigi.svg', license: 'PD-Japan-organization' }, // 大田原市
  '092118': { file: 'Emblem_of_Yaita,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 矢板市
  '092134': { file: '那須塩原市章.svg', license: 'PD-Japan-exempt' }, // 那須塩原市
  '092142': { file: 'Emblem_of_Sakura,_Tochigi.svg', license: 'PD-Japan-organization' }, // さくら市
  '092151': { file: 'Emblem_of_Nasukarasuyama,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 那須烏山市
  '092169': { file: 'Emblem_of_Shimotsuke,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 下野市
  '093017': { file: 'Emblem_of_Kaminokawa,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 上三川町
  '093424': { file: 'Emblem_of_Mashiko,_Tochigi.svg', license: 'PD-Japan-organization' }, // 益子町
  '093432': { file: 'Emblem_of_Motegi,_Tochigi.svg', license: 'PD-ineligible' }, // 茂木町
  '093441': { file: 'Emblem_of_Ichikai,_Tochigi.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 市貝町
  '093459': { file: '栃木県芳賀町町章.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 芳賀町
  '093611': { file: 'Emblem_of_Mibu,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 壬生町
  '093645': { file: 'Emblem_of_Nogi,_Tochigi.svg', license: 'PD-ineligible' }, // 野木町
  '093840': { file: 'Emblem_of_Shioya,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 塩谷町
  '093866': { file: 'Emblem_of_Takanezawa,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 高根沢町
  '094072': { file: 'Emblem_of_Nasu,_Tochigi.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 那須町
  '094111': { file: 'Emblem_of_Nakagawa,_Tochigi.svg', license: 'PD-Japan-exempt' }, // 那珂川町
  '100005': { file: 'Emblem_of_Gunma_Prefecture.svg', license: 'PD-Japan-organization' }, // 群馬県
  '102016': { file: 'Emblem_of_Maebashi,_Gunma.svg', license: 'PD-textlogo' }, // 前橋市
  '102024': { file: '群馬県高崎市市章.svg', license: 'PD-Japan-organization' }, // 高崎市
  '102032': { file: '群馬県桐生市市章.svg', license: 'PD-Japan-organization' }, // 桐生市
  '102041': { file: 'Emblem_of_Isesaki,_Gunma.svg', license: 'PD-Japan-organization' }, // 伊勢崎市
  '102059': { file: 'Emblem_of_Ota,_Gunma.svg', license: 'PD-Japan-exempt' }, // 太田市
  '102067': { file: 'Emblem_of_Numata,_Gunma.svg', license: 'PD-Japan-exempt' }, // 沼田市
  '102075': { file: 'Emblem_of_Tatebayashi,_Gunma.svg', license: 'PD-Japan-exempt' }, // 館林市
  '102083': { file: 'Emblem_of_Shibukawa,_Gunma.svg', license: 'PD-Japan-exempt' }, // 渋川市
  '102091': { file: 'Emblem_of_Fujioka,_Gunma.svg', license: 'PD-Japan-exempt' }, // 藤岡市
  '102105': { file: 'Emblem_of_Tomioka,_Gunma.svg', license: 'PD-Japan-exempt' }, // 富岡市
  '102113': { file: 'Emblem_of_Annaka,_Gunma.svg', license: 'PD-Japan-exempt' }, // 安中市
  '103446': { file: 'Emblem_of_Shinto,_Gunma.svg', license: 'PD-Japan-exempt' }, // 榛東村
  '103454': { file: 'Emblem_of_Yoshioka,_Gunma.svg', license: 'PD-ineligible' }, // 吉岡町
  '103667': { file: 'Emblem_of_Ueno,_Gunma.svg', license: 'PD-Japan-organization' }, // 上野村
  '103675': { file: 'Emblem_of_Kanna,_Gunma.svg', license: 'PD-self' }, // 神流町
  '103829': { file: 'Emblem_of_Shimonita,_Gunma.svg', license: 'PD-Japan-exempt' }, // 下仁田町
  '103845': { file: 'Emblem_of_Kanra,_Gunma.svg', license: 'PD-self' }, // 甘楽町
  '104213': { file: 'Emblem_of_Nakanojo,_Gunma.svg', license: 'PD-Japan-exempt' }, // 中之条町
  '104248': { file: 'Emblem_of_Naganohara,_Gunma.svg', license: 'PD-Japan-exempt' }, // 長野原町
  '104256': { file: 'Emblem_of_Tsumagoi,_Gunma.svg', license: 'PD-Japan-exempt' }, // 嬬恋村
  '104264': { file: 'Emblem_of_Kusatsu,_Gunma.svg', license: 'PD-Japan-organization' }, // 草津町
  '104281': { file: 'Emblem_of_Takayama,_Gunma.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 高山村
  '104434': { file: 'Emblem_of_Katashina,_Gunma.svg', license: 'PD-Japan-exempt' }, // 片品村
  '104442': { file: 'Emblem_of_Kawaba,_Gunma.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 川場村
  '104485': { file: 'Emblem_of_Shōwa,_Gunma.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 昭和村
  '104493': { file: 'Emblem_of_Minakami,_Gunma.svg', license: 'PD-Japan-exempt' }, // みなかみ町
  '104647': { file: 'Emblem_of_Tamamura,_Gunma.svg', license: 'PD-Japan-exempt' }, // 玉村町
  '105210': { file: 'Emblem_of_Itakura,_Gunma.svg', license: 'PD-Japan-exempt' }, // 板倉町
  '105228': { file: 'Emblem_of_Meiwa,_Gunma.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 明和町
  '105236': { file: 'Emblem_of_Chiyoda,_Gunma.svg', license: 'PD-Japan-exempt' }, // 千代田町
  '105244': { file: 'Emblem_of_Oizumi,_Gunma.svg', license: 'PD-Japan-organization' }, // 大泉町
  '105252': { file: 'Emblem_of_Oura,_Gunma.svg', license: 'PD-ineligible' }, // 邑楽町
  '110001': { file: 'Emblem_of_Saitama_Prefecture.svg', license: 'PD-Japan-organization' }, // 埼玉県
  '111007': { file: 'Emblem_of_Saitama,_Saitama.svg', license: 'PD-ineligible' }, // さいたま市
  '112011': { file: 'Emblem_of_Kawagoe,_Saitama.svg', license: 'PD-Japan-organization' }, // 川越市
  '112020': { file: '埼玉県熊谷市市章.svg', license: 'PD-Japan-organization' }, // 熊谷市
  '112038': { file: '埼玉県川口市市章.svg', license: 'PD-Japan-organization' }, // 川口市
  '112062': { file: 'Emblem_of_Gyoda,_Saitama.svg', license: 'PD-Japan-organization' }, // 行田市
  '112071': { file: 'Emblem_of_Chichibu,_Saitama.svg', license: 'CC0' }, // 秩父市
  '112089': { file: 'Emblem_of_Tokorozawa,_Saitama.svg', license: 'PD-Japan-organization' }, // 所沢市
  '112097': { file: '埼玉県飯能市市章.svg', license: 'PD-Japan-organization' }, // 飯能市
  '112101': { file: 'Emblem_of_Kazo,_Saitama.svg', license: 'PD-Japan-exempt' }, // 加須市
  '112119': { file: 'Emblem_of_Honjo,_Saitama.svg', license: 'PD-Japan-exempt' }, // 本庄市
  '112127': { file: 'Emblem_of_Higashimatsuyama,_Saitama.svg', license: 'PD-Japan-organization' }, // 東松山市
  '112143': { file: 'Emblem_of_Kasukabe,_Saitama.svg', license: 'PD-ineligible' }, // 春日部市
  '112151': { file: '埼玉県狭山市市章.svg', license: 'PD-Japan-organization' }, // 狭山市
  '112160': { file: '埼玉県羽生市市章.svg', license: 'PD-Japan-organization' }, // 羽生市
  '112178': { file: 'Emblem_of_Kōnosu,_Saitama.svg', license: 'PD-Japan-exempt' }, // 鴻巣市
  '112186': { file: 'Emblem_of_Fukaya,_Saitama.svg', license: 'PD-ineligible' }, // 深谷市
  '112194': { file: 'Emblem_of_Ageo,_Saitama.svg', license: 'PD-textlogo' }, // 上尾市
  '112216': { file: 'Emblem_of_Soka,_Saitama.svg', license: 'PD-Japan-organization' }, // 草加市
  '112224': { file: 'Emblem_of_Koshigaya,_Saitama.svg', license: 'PD-ineligible' }, // 越谷市
  '112232': { file: '埼玉県蕨市市章.svg', license: 'PD-Japan-organization' }, // 蕨市
  '112241': { file: 'Emblem_of_Toda,_Saitama.svg', license: 'PD-Japan-organization' }, // 戸田市
  '112259': { file: 'Emblem_of_Iruma,_Saitama.svg', license: 'PD-ineligible' }, // 入間市
  '112275': { file: 'Emblem_of_Asaka,_Saitama.svg', license: 'PD-ineligible' }, // 朝霞市
  '112283': { file: 'Emblem_of_Shiki,_Saitama.svg', license: 'PD-Japan-exempt' }, // 志木市
  '112291': { file: 'Emblem_of_Wako,_Saitama.svg', license: 'PD-ineligible' }, // 和光市
  '112305': { file: 'Emblem_of_Niiza,_Saitama.svg', license: 'PD-Japan-exempt' }, // 新座市
  '112313': { file: 'Emblem_of_Okegawa,_Saitama.svg', license: 'PD-Japan-exempt' }, // 桶川市
  '112321': { file: 'Emblem_of_Kuki,_Saitama.svg', license: 'PD-Japan-exempt' }, // 久喜市
  '112330': { file: 'Emblem_of_Kitamoto,_Saitama.svg', license: 'PD-Japan-organization' }, // 北本市
  '112348': { file: 'Emblem_of_Yashio,_Saitama.svg', license: 'PD-Japan-organization' }, // 八潮市
  '112356': { file: 'Emblem_of_Fujimi,_Saitama.svg', license: 'PD-Japan-organization' }, // 富士見市
  '112372': { file: 'Emblem_of_Misato,_Saitama.svg', license: 'PD-Japan-organization' }, // 三郷市
  '112381': { file: 'Emblem_of_Hasuda,_Saitama.svg', license: 'PD-ineligible' }, // 蓮田市
  '112399': { file: 'Emblem_of_Sakado,_Saitama.svg', license: 'PD-Japan-organization' }, // 坂戸市
  '112402': { file: 'Emblem_of_Satte,_Saitama.svg', license: 'PD-Japan-organization' }, // 幸手市
  '112411': { file: 'Emblem_of_Tsurugashima,_Saitama.svg', license: 'PD-Japan-organization' }, // 鶴ヶ島市
  '112429': { file: 'Emblem_of_Hidaka,_Saitama.svg', license: 'PD-Japan-exempt' }, // 日高市
  '112437': { file: 'Emblem_of_Yoshikawa,_Saitama.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 吉川市
  '112453': { file: 'Emblem_of_Fujimino,_Saitama.svg', license: 'PD-ineligible' }, // ふじみ野市
  '112461': { file: '埼玉県白岡町町章.svg', license: 'PD-Japan-organization' }, // 白岡市
  '113018': { file: '埼玉県伊奈町町章.svg', license: 'PD-Japan-organization' }, // 伊奈町
  '113247': { file: 'Emblem_of_Miyoshi,_Saitama.svg', license: 'PD-Japan-exempt' }, // 三芳町
  '113263': { file: 'Emblem_of_Moroyama,_Saitama.svg', license: 'PD-Japan-organization' }, // 毛呂山町
  '113271': { file: 'Emblem_of_Ogose,_Saitama.svg', license: 'PD-Japan-exempt' }, // 越生町
  '113417': { file: 'Emblem_of_Namegawa,_Saitama.svg', license: 'PD-Japan-organization' }, // 滑川町
  '113425': { file: 'Emblem_of_Ranzan,_Saitama.svg', license: 'PD-Japan-organization' }, // 嵐山町
  '113433': { file: 'Emblem_of_Ogawa,_Saitama.svg', license: 'PD-Japan-exempt' }, // 小川町
  '113468': { file: 'Emblem_of_Kawajima,_Saitama.svg', license: 'PD-Japan-organization' }, // 川島町
  '113476': { file: 'Emblem_of_Yoshimi,_Saitama.svg', license: 'PD-Japan-organization' }, // 吉見町
  '113492': { file: 'Emblem_of_Tokigawa,_Saitama.svg', license: 'PD-Japan-exempt' }, // ときがわ町
  '113611': { file: 'Emblem_of_Yokoze,_Saitama.svg', license: 'PD-Japan-exempt' }, // 横瀬町
  '113620': { file: 'Emblem_of_Minano,_Saitama.svg', license: 'PD-Japan-organization' }, // 皆野町
  '113638': { file: 'Emblem_of_Nagatoro,_Saitama.svg', license: 'PD-Japan-exempt' }, // 長瀞町
  '113654': { file: 'Emblem_of_Ogano,_Saitama.svg', license: 'PD-Japan-organization' }, // 小鹿野町
  '113697': { file: 'Emblem_of_Higashichichibu,_Saitama.svg', license: 'PD-Japan-exempt' }, // 東秩父村
  '113816': { file: 'Emblem_of_Misato,_Saitama_(town).svg', license: 'PD-Japan-organization' }, // 美里町
  '113832': { file: 'Emblem_of_Kamikawa,_Saitama.svg', license: 'PD-Japan-exempt' }, // 神川町
  '113859': { file: 'Emblem_of_Kamisato,_Saitama.svg', license: 'PD-ineligible' }, // 上里町
  '114081': { file: 'Emblem_of_Yorii,_Saitama.svg', license: 'PD-Japan-exempt' }, // 寄居町
  '114421': { file: 'Emblem_of_Miyashiro,_Saitama.svg', license: 'PD-Japan-exempt' }, // 宮代町
  '114642': { file: 'Emblem_of_Sugito,_Saitama.svg', license: 'CC0' }, // 杉戸町
  '114651': { file: 'Emblem_of_Matsubushi,_Saitama.svg', license: 'PD-Japan-exempt' }, // 松伏町
  '120006': { file: 'Emblem_of_Chiba_prefecture.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 千葉県
  '121002': { file: 'Emblem_of_Chiba,_Chiba.svg', license: 'PD-Japan-organization' }, // 千葉市
  '122025': { file: '千葉県銚子市市章.svg', license: 'PD-Japan-organization' }, // 銚子市
  '122033': { file: '千葉県市川市市章.svg', license: 'PD-Japan-organization / PD-self' }, // 市川市
  '122041': { file: 'Emblem_of_Funabashi,_Chiba.svg', license: 'PD-Japan-organization' }, // 船橋市
  '122050': { file: '千葉県館山市市章.svg', license: 'PD-Japan-organization' }, // 館山市
  '122068': { file: '千葉県木更津市市章.svg', license: 'PD-Japan-organization' }, // 木更津市
  '122076': { file: 'Emblem_of_Matsudo,_Chiba.svg', license: 'PD-Japan-organization' }, // 松戸市
  '122106': { file: 'Emblem_of_Mobara,_Chiba.svg', license: 'PD-Japan-organization' }, // 茂原市
  '122114': { file: 'Emblem_of_Narita,_Chiba.svg', license: 'PD-Japan-exempt' }, // 成田市
  '122122': { file: 'Emblem_of_Sakura,_Chiba.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 佐倉市
  '122131': { file: 'Emblem_of_Togane,_Chiba.svg', license: 'PD-Japan-exempt' }, // 東金市
  '122157': { file: 'Emblem_of_Asahi,_Chiba.svg', license: 'PD-Japan-exempt' }, // 旭市
  '122165': { file: 'Emblem_of_Narashino,_Chiba.svg', license: 'PD-textlogo' }, // 習志野市
  '122173': { file: '千葉県柏市市章.svg', license: 'PD-Japan-organization' }, // 柏市
  '122181': { file: 'Emblem_of_Katsuura,_Chiba.svg', license: 'PD-Japan-organization' }, // 勝浦市
  '122190': { file: 'Emblem_of_Ichihara,_Chiba.svg', license: 'PD-Japan-exempt' }, // 市原市
  '122203': { file: '千葉県流山市市章.svg', license: 'PD-Japan-organization' }, // 流山市
  '122211': { file: 'Emblem_of_Yachiyo,_Chiba.svg', license: 'PD-Japan-exempt' }, // 八千代市
  '122220': { file: 'Emblem_of_Abiko,_Chiba.svg', license: 'PD-Japan-organization' }, // 我孫子市
  '122238': { file: 'Emblem_of_Kamogawa,_Chiba.svg', license: 'PD-Japan-exempt' }, // 鴨川市
  '122246': { file: 'Emblem_of_Kamagaya,_Chiba.svg', license: 'PD-ineligible' }, // 鎌ケ谷市
  '122254': { file: 'Emblem_of_Kimitsu,_Chiba.svg', license: 'PD-Japan-organization' }, // 君津市
  '122271': { file: 'Emblem_of_Urayasu,_Chiba.svg', license: 'PD-Japan-exempt' }, // 浦安市
  '122289': { file: 'Emblem_of_Yotsukaido,_Chiba.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 四街道市
  '122297': { file: 'Emblem_of_Sodegaura,_Chiba.svg', license: 'PD-Japan-exempt' }, // 袖ケ浦市
  '122301': { file: 'Emblem_of_Yachimata,_Chiba.svg', license: 'PD-Japan-organization' }, // 八街市
  '122319': { file: 'Emblem_of_Inzai,_Chiba.svg', license: 'PD-textlogo' }, // 印西市
  '122327': { file: 'Emblem_of_Shiroi,_Chiba.svg', license: 'PD-Japan-exempt' }, // 白井市
  '122335': { file: 'Emblem_of_Tomisato,_Chiba.svg', license: 'PD-Japan-exempt' }, // 富里市
  '122343': { file: 'Emblem_of_Minamiboso,_Chiba.svg', license: 'PD-Japan-exempt' }, // 南房総市
  '122351': { file: 'Emblem_of_Sosa,_Chiba.svg', license: 'PD-Japan-exempt' }, // 匝瑳市
  '122360': { file: 'Emblem_of_Katori,_Chiba.svg', license: 'PD-Japan-exempt' }, // 香取市
  '122378': { file: 'Emblem_of_Sanmu,_Chiba.svg', license: 'PD-Japan-exempt' }, // 山武市
  '122386': { file: 'Emblem_of_Isumi,_Chiba.svg', license: 'PD-Japan-exempt' }, // いすみ市
  '122394': { file: 'Emblem_of_Ōamishirasato,_Chiba.svg', license: 'PD-Japan-organization' }, // 大網白里市
  '123226': { file: 'Emblem_of_Shisui,_Chiba.svg', license: 'PD-Japan-organization' }, // 酒々井町
  '123293': { file: 'Emblem_of_Sakae,_Chiba.svg', license: 'PD-Japan-organization' }, // 栄町
  '123421': { file: 'Emblem_of_Kozaki,_Chiba_(black).svg', license: 'PD-Japan-organization / PD-textlogo' }, // 神崎町
  '123471': { file: 'Emblem_of_Tako,_Chiba.svg', license: 'PD-Japan-exempt' }, // 多古町
  '123498': { file: 'Emblem_of_Tohnosho,_Chiba.svg', license: 'PD-Japan-organization' }, // 東庄町
  '124036': { file: 'Emblem_of_Kujukuri,_Chiba.svg', license: 'PD-Japan-organization' }, // 九十九里町
  '124095': { file: 'Emblem_of_Shibayama,_Chiba.svg', license: 'PD-Japan-organization' }, // 芝山町
  '124109': { file: 'Emblem_of_Yokoshibahikari,_Chiba.svg', license: 'PD-Japan-exempt' }, // 横芝光町
  '124214': { file: 'Emblem_of_Ichinomiya,_Chiba.svg', license: 'PD-Japan-exempt' }, // 一宮町
  '124222': { file: 'Emblem_of_Mutsuzawa,_Chiba.svg', license: 'PD-textlogo' }, // 睦沢町
  '124231': { file: 'Emblem_of_Chosei,_Chiba.svg', license: 'PD-Japan-exempt' }, // 長生村
  '124249': { file: 'Emblem_of_Shirako,_Chiba.svg', license: 'PD-Japan-exempt' }, // 白子町
  '124265': { file: 'Emblem_of_Nagara,_Chiba.svg', license: 'PD-Japan-exempt' }, // 長柄町
  '124273': { file: 'Emblem_of_Chonan,_Chiba.svg', license: 'PD-Japan-exempt' }, // 長南町
  '124419': { file: 'Emblem_of_Otaki,_Chiba.svg', license: 'PD-Japan-organization' }, // 大多喜町
  '124435': { file: 'Emblem_of_Onjuku,_Chiba.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 御宿町
  '124630': { file: 'Emblem_of_Kyonan,_Chiba.svg', license: 'PD-Japan-exempt' }, // 鋸南町
  '130001': { file: 'Emblem_of_Tokyo_Metropolis.svg', license: 'PD-ineligible' }, // 東京都
  '131016': { file: 'Emblem_of_Chiyoda,_Tokyo.svg', license: 'PD-Japan-organization' }, // 千代田区
  '131024': { file: 'Emblem_of_Chuo,_Tokyo.svg', license: 'PD-Japan-organization' }, // 中央区
  '131032': { file: 'Emblem_of_Minato,_Tokyo.svg', license: 'PD-Japan-organization' }, // 港区
  '131041': { file: 'Emblem_of_Shinjuku,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 新宿区
  '131059': { file: 'Emblem_of_Bunkyo,_Tokyo.svg', license: 'PD-Japan-organization' }, // 文京区
  '131067': { file: 'Emblem_of_Taito,_Tokyo.svg', license: 'PD-Japan-organization' }, // 台東区
  '131075': { file: 'Emblem_of_Sumida,_Tokyo.svg', license: 'PD-Japan-organization' }, // 墨田区
  '131083': { file: 'Emblem_of_Koto,_Tokyo.svg', license: 'PD-Japan-organization' }, // 江東区
  '131091': { file: 'Emblem_of_Shinagawa,_Tokyo.svg', license: 'PD-Japan-organization' }, // 品川区
  '131105': { file: 'Emblem_of_Meguro,_Tokyo.svg', license: 'PD-Japan-organization' }, // 目黒区
  '131113': { file: 'Emblem_of_Ōta,_Tokyo.svg', license: 'PD-Japan-organization' }, // 大田区
  '131121': { file: 'Emblem_of_Setagaya,_Tokyo.svg', license: 'PD-Japan-organization' }, // 世田谷区
  '131130': { file: 'Emblem_of_Shibuya,_Tokyo.svg', license: 'PD-Japan-organization' }, // 渋谷区
  '131148': { file: 'Emblem_of_Nakano,_Tokyo.svg', license: 'PD-Japan-organization' }, // 中野区
  '131156': { file: 'Emblem_of_Suginami,_Tokyo.svg', license: 'PD-Japan-organization' }, // 杉並区
  '131164': { file: 'Emblem_of_Toshima,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 豊島区
  '131172': { file: 'Emblem_of_Kita,_Tokyo.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 北区
  '131181': { file: 'Emblem_of_Arakawa,_Tokyo.svg', license: 'PD-Japan-organization' }, // 荒川区
  '131199': { file: 'Emblem_of_Itabashi,_Tokyo.svg', license: 'PD-Japan-organization' }, // 板橋区
  '131202': { file: 'Emblem_of_Nerima,_Tokyo.svg', license: 'PD-textlogo' }, // 練馬区
  '131211': { file: 'Emblem_of_Adachi,_Tokyo.svg', license: 'PD-Japan-organization' }, // 足立区
  '131229': { file: 'Emblem_of_Katsushika,_Tokyo.svg', license: 'PD-Japan-organization' }, // 葛飾区
  '131237': { file: 'Emblem_of_Edogawa,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 江戸川区
  '132012': { file: 'Emblem_of_Hachiōji,_Tokyo.svg', license: 'PD-Japan-organization' }, // 八王子市
  '132021': { file: 'Emblem_of_Tachikawa,_Tokyo.svg', license: 'PD-Japan-organization' }, // 立川市
  '132039': { file: 'Emblem_of_Musashino,_Tokyo.svg', license: 'PD-Japan-organization' }, // 武蔵野市
  '132047': { file: 'Emblem_of_Mitaka,_Tokyo.svg', license: 'PD-Japan-organization' }, // 三鷹市
  '132055': { file: 'Emblem_of_Ōme,_Tokyo.svg', license: 'PD-Japan-organization' }, // 青梅市
  '132063': { file: 'Emblem_of_Fuchu,_Tokyo.svg', license: 'PD-Japan-organization' }, // 府中市
  '132071': { file: 'Emblem_of_Akishima,_Tokyo.svg', license: 'PD-Japan-organization' }, // 昭島市
  '132080': { file: 'Emblem_of_Chōfu,_Tokyo.svg', license: 'PD-Japan-organization' }, // 調布市
  '132098': { file: 'Emblem_of_Machida,_Tokyo.svg', license: 'PD-Japan-organization' }, // 町田市
  '132101': { file: 'Emblem_of_Koganei,_Tokyo.svg', license: 'PD-Japan-organization' }, // 小金井市
  '132110': { file: 'Emblem_of_Kodaira,_Tokyo.svg', license: 'PD-Japan-organization' }, // 小平市
  '132128': { file: 'Emblem_of_Hino,_Tokyo.svg', license: 'PD-Japan-organization' }, // 日野市
  '132136': { file: 'Emblem_of_Higashimurayama,_Tokyo.svg', license: 'PD-Japan-organization' }, // 東村山市
  '132144': { file: 'Emblem_of_Kokubunji,_Tokyo.svg', license: 'PD-Japan-organization' }, // 国分寺市
  '132152': { file: 'Emblem_of_Kunitachi,_Tokyo.svg', license: 'PD-Japan-organization' }, // 国立市
  '132187': { file: 'Emblem_of_Fussa,_Tokyo.svg', license: 'PD-Japan-organization' }, // 福生市
  '132195': { file: 'Emblem_of_Komae,_Tokyo.svg', license: 'PD-Japan-organization' }, // 狛江市
  '132209': { file: 'Emblem_of_Higashiyamato,_Tokyo.svg', license: 'PD-Japan-organization' }, // 東大和市
  '132217': { file: 'Emblem_of_Kiyose,_Tokyo.svg', license: 'PD-Japan-organization' }, // 清瀬市
  '132225': { file: 'Emblem_of_Higashikurume,_Tokyo.svg', license: 'PD-shape' }, // 東久留米市
  '132233': { file: 'Emblem_of_Musashimurayama,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 武蔵村山市
  '132241': { file: 'Emblem_of_Tama,_Tokyo.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 多摩市
  '132250': { file: 'Emblem_of_Inagi,_Tokyo.svg', license: 'PD-ineligible' }, // 稲城市
  '132276': { file: 'Emblem_of_Hamura,_Tokyo.svg', license: 'PD-Japan-organization' }, // 羽村市
  '132284': { file: 'Emblem_of_Akiruno,_Tokyo.svg', license: 'PD-ineligible' }, // あきる野市
  '132292': { file: 'Emblem_of_Nishitokyo,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 西東京市
  '133035': { file: 'Emblem_of_Mizuho,_Tokyo.svg', license: 'PD-Japan-organization' }, // 瑞穂町
  '133051': { file: 'Emblem_of_Hinode,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 日の出町
  '133078': { file: 'Emblem_of_Hinohara,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 檜原村
  '133086': { file: 'Emblem_of_Okutama,_Tokyo.svg', license: 'PD-Japan-organization' }, // 奥多摩町
  '133612': { file: 'Emblem_of_Oshima,_Tokyo.svg', license: 'PD-Japan-organization' }, // 大島町
  '133621': { file: 'Emblem_of_Toshima_Village,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 利島村
  '133639': { file: 'Emblem_of_Niijima,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 新島村
  '133647': { file: 'Emblem_of_Kozushima,_Tokyo.svg', license: 'PD-textlogo' }, // 神津島村
  '133817': { file: 'Emblem_of_Miyake,_Tokyo.svg', license: 'PD-ineligible' }, // 三宅村
  '133825': { file: 'Emblem_of_Mikurajima,_Tokyo.svg', license: 'PD-Japan-exempt' }, // 御蔵島村
  '134015': { file: 'Emblem_of_Hachijo,_Tokyo.svg', license: 'PD-Japan-organization' }, // 八丈町
  '134023': { file: 'Emblem_of_Aogashima,_Tokyo.svg', license: 'PD-ineligible' }, // 青ヶ島村
  '134210': { file: 'Emblem_of_Ogasawara,_Tokyo.svg', license: 'PD-ineligible / PD-Japan-exempt' }, // 小笠原村
  '140007': { file: 'Emblem_of_Kanagawa_Prefecture.svg', license: 'PD-Japan-organization' }, // 神奈川県
  '141003': { file: 'Emblem_of_Yokohama,_Kanagawa.svg', license: 'PD-textlogo' }, // 横浜市
  '141305': { file: '神奈川県川崎市市章.svg', license: 'PD-Japan-organization' }, // 川崎市
  '141500': { file: '神奈川県相模原市市章.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 相模原市
  '142018': { file: '神奈川県横須賀市市章.svg', license: 'PD-textlogo / PD-self' }, // 横須賀市
  '142034': { file: '神奈川県平塚市市章.svg', license: 'PD-Japan-organization / PD-self' }, // 平塚市
  '142042': { file: 'Emblem_of_Kamakura,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 鎌倉市
  '142051': { file: '神奈川県藤沢市市章.svg', license: 'PD-Japan-organization' }, // 藤沢市
  '142069': { file: '神奈川県小田原市市章.svg', license: 'PD-textlogo / PD-self' }, // 小田原市
  '142077': { file: '神奈川県茅ヶ崎市市章.svg', license: 'PD-textlogo / PD-self' }, // 茅ヶ崎市
  '142085': { file: '神奈川県逗子市市章.svg', license: 'PD-Japan-organization' }, // 逗子市
  '142107': { file: '神奈川県三浦市市章.svg', license: 'PD-Japan-organization / PD-Japan' }, // 三浦市
  '142115': { file: '神奈川県秦野市市章.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 秦野市
  '142123': { file: '神奈川県厚木市市章.svg', license: 'PD-Japan-organization' }, // 厚木市
  '142131': { file: '神奈川県大和市市章.svg', license: 'PD-textlogo / PD-self' }, // 大和市
  '142140': { file: '神奈川県伊勢原市市章.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 伊勢原市
  '142158': { file: 'Emblem_of_Ebina,_Kanagawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 海老名市
  '142166': { file: '神奈川県座間市市章.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 座間市
  '142174': { file: 'Emblem_of_Minamiashigara,_Kanagawa.svg', license: 'PD-Japan-exempt' }, // 南足柄市
  '142182': { file: 'Emblem_of_Ayase,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 綾瀬市
  '143014': { file: 'Emblem_of_Hayama,_Kanagawa.svg', license: 'PD-Japan-exempt' }, // 葉山町
  '143219': { file: 'Emblem_of_Samukawa,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 寒川町
  '143413': { file: 'Emblem_of_Oiso,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 大磯町
  '143421': { file: 'Emblem_of_Ninomiya,_Kanagawa.svg', license: 'PD-Japan-exempt' }, // 二宮町
  '143618': { file: 'Emblem_of_Nakai,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 中井町
  '143626': { file: 'Emblem_of_Oi,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 大井町
  '143634': { file: 'Emblem_of_Matsuda,_Kanagawa.svg', license: 'PD-Japan-exempt' }, // 松田町
  '143642': { file: 'Emblem_of_Yamakita,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 山北町
  '143669': { file: '神奈川県開成町町章.svg', license: 'PD-Japan-organization / PD-self' }, // 開成町
  '143821': { file: 'Emblem_of_Hakone,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 箱根町
  '143839': { file: 'Emblem_of_Manazuru,_Kanagawa.svg', license: 'PD-Japan-organization / PD-shape' }, // 真鶴町
  '143847': { file: 'Emblem_of_Yugawara,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 湯河原町
  '144011': { file: 'Emblem_of_Aikawa,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 愛川町
  '144029': { file: 'Emblem_of_Kiyokawa,_Kanagawa.svg', license: 'PD-Japan-organization' }, // 清川村
  '150002': { file: 'Emblem_of_Niigata_Prefecture.svg', license: 'PD-Japan-organization' }, // 新潟県
  '151009': { file: 'Emblem_of_Niigata,_Niigata.svg', license: 'PD-Japan-organization' }, // 新潟市
  '152021': { file: 'Emblem_of_Nagaoka,_Niigata.svg', license: 'PD-Japan-exempt' }, // 長岡市
  '152048': { file: 'Emblem_of_Sanjo,_Niigata.svg', license: 'PD-ineligible' }, // 三条市
  '152056': { file: 'Emblem_of_Kashiwazaki,_Niigata.svg', license: 'PD-Japan-exempt' }, // 柏崎市
  '152064': { file: 'Emblem_of_Shibata,_Niigata.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 新発田市
  '152081': { file: 'Emblem_of_Ojiya,_Niigata.svg', license: 'PD-Japan-organization' }, // 小千谷市
  '152099': { file: 'Emblem_of_Kamo,_Niigata.svg', license: 'PD-ineligible' }, // 加茂市
  '152102': { file: 'Emblem_of_Tokamachi,_Niigata.svg', license: 'PD-Japan-exempt' }, // 十日町市
  '152111': { file: 'Emblem_of_Mitsuke,_Niigata.svg', license: 'PD-Japan-exempt' }, // 見附市
  '152129': { file: 'Emblem_of_Murakami,_Niigata.svg', license: 'PD-Japan-exempt' }, // 村上市
  '152137': { file: 'Emblem_of_Tsubame,_Niigata.svg', license: 'PD-Japan-exempt' }, // 燕市
  '152161': { file: 'Emblem_of_Itoigawa,_Niigata.svg', license: 'PD-Japan-exempt' }, // 糸魚川市
  '152188': { file: 'Emblem_of_Gosen,_Niigata.svg', license: 'PD-Japan-exempt' }, // 五泉市
  '152226': { file: 'Emblem_of_Jōetsu,_Niigata.svg', license: 'PD-Japan-exempt' }, // 上越市
  '152234': { file: 'Emblem_of_Agano,_Niigata.svg', license: 'PD-ineligible' }, // 阿賀野市
  '152242': { file: 'Emblem_of_Sado,_Niigata.svg', license: 'PD-Japan-exempt' }, // 佐渡市
  '152251': { file: 'Emblem_of_Uonuma,_Niigata.svg', license: 'PD-Japan-organization' }, // 魚沼市
  '152269': { file: 'Emblem_of_Minamiuonuma,_Niigata.svg', license: 'PD-Japan-exempt' }, // 南魚沼市
  '152277': { file: 'Emblem_of_Tainai,_Niigata.svg', license: 'PD-ineligible' }, // 胎内市
  '153079': { file: 'Emblem_of_Seiro,_Niigata.svg', license: 'PD-Japan-exempt' }, // 聖籠町
  '153427': { file: 'Emblem_of_Yahiko,_Niigata.svg', license: 'PD-Japan-exempt / PD-shape' }, // 弥彦村
  '153613': { file: 'Emblem_of_Tagami,_Niigata.svg', license: 'PD-Japan-exempt' }, // 田上町
  '154059': { file: 'Emblem_of_Izumosaki,_Niigata.svg', license: 'PD-Japan-organization' }, // 出雲崎町
  '154610': { file: 'Emblem_of_Yuzawa,_Niigata.svg', license: 'PD-Japan-organization' }, // 湯沢町
  '154822': { file: 'Emblem_of_Tsunan,_Niigata.svg', license: 'PD-Japan-exempt' }, // 津南町
  '155047': { file: 'Emblem_of_Kariwa,_Niigata.svg', license: 'PD-Japan-organization' }, // 刈羽村
  '155811': { file: 'Emblem_of_Sekikawa,_Niigata.svg', license: 'PD-Japan-exempt' }, // 関川村
  '155861': { file: 'Emblem_of_Awashimaura,_Niigata.svg', license: 'PD-Japan-exempt' }, // 粟島浦村
  '160008': { file: 'Emblem_of_Toyama_Prefecture.svg', license: 'PD-Japan-organization' }, // 富山県
  '162019': { file: 'Emblem_of_Toyama,_Toyama.svg', license: 'PD-Japan-organization' }, // 富山市
  '162027': { file: 'Emblem_of_Takaoka,_Toyama.svg', license: 'PD-Japan-exempt' }, // 高岡市
  '162043': { file: 'Emblem_of_Uozu,_Toyama.svg', license: 'PD-ineligible' }, // 魚津市
  '162051': { file: 'Emblem_of_Himi,_Toyama.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 氷見市
  '162060': { file: 'Emblem_of_Namerikawa,_Toyama.svg', license: 'PD-ineligible' }, // 滑川市
  '162086': { file: 'Emblem_of_Tonami,_Toyama.svg', license: 'PD-ineligible' }, // 砺波市
  '162094': { file: 'Emblem_of_Oyabe,_Toyama.svg', license: 'PD-Japan-organization' }, // 小矢部市
  '162108': { file: 'Emblem_of_Nanto,_Toyama.svg', license: 'PD-ineligible' }, // 南砺市
  '162116': { file: 'Emblem_of_Imizu,_Toyama.svg', license: 'PD-Japan-exempt' }, // 射水市
  '163210': { file: 'Emblem_of_Funahashi,_Toyama.svg', license: 'PD-Japan-exempt' }, // 舟橋村
  '163228': { file: 'Emblem_of_Kamiichi,_Toyama.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 上市町
  '163422': { file: 'Emblem_of_Nyuzen,_Toyama.svg', license: 'PD-Japan-organization' }, // 入善町
  '163431': { file: 'Emblem_of_Asahi,_Toyama.svg', license: 'PD-Japan-organization' }, // 朝日町
  '170003': { file: 'Emblem_of_Ishikawa_Prefecture.svg', license: 'PD-Japan-exempt' }, // 石川県
  '172014': { file: 'Emblem_of_Kanazawa,_Ishikawa.svg', license: 'PD-ineligible' }, // 金沢市
  '172022': { file: 'Emblem_of_Nanao,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // 七尾市
  '172031': { file: 'Emblem_of_Komatsu,_Ishikawa.svg', license: 'PD-Japan-organization' }, // 小松市
  '172049': { file: 'Emblem_of_Wajima,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // 輪島市
  '172057': { file: 'Emblem_of_Suzu,_Ishikawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 珠洲市
  '172065': { file: 'Emblem_of_Kaga,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // 加賀市
  '172073': { file: 'Emblem_of_Hakui,_Ishikawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 羽咋市
  '172090': { file: 'Emblem_of_Kahoku,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // かほく市
  '172103': { file: 'Emblem_of_Hakusan,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // 白山市
  '172120': { file: 'Emblem_of_Nonoichi,_Ishikawa.svg', license: 'PD-Japan-organization' }, // 野々市市
  '173240': { file: 'Emblem_of_Kawakita,_Ishikawa.svg', license: 'PD-Japan-organization' }, // 川北町
  '173614': { file: 'Emblem_of_Tsubata,_Ishikawa.svg', license: 'PD-Japan-organization' }, // 津幡町
  '173657': { file: 'Emblem_of_Uchinada,_Ishikawa.svg', license: 'PD-Japan-organization' }, // 内灘町
  '173843': { file: 'Emblem_of_Shika,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // 志賀町
  '173860': { file: 'Emblem_of_Hodatsushimizu,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // 宝達志水町
  '174076': { file: 'Emblem_of_Nakanoto,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // 中能登町
  '174637': { file: 'Emblem_of_Noto,_Ishikawa.svg', license: 'PD-Japan-exempt' }, // 能登町
  '180009': { file: 'Emblem_of_Fukui_Prefecture.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 福井県
  '182010': { file: 'Emblem_of_Fukui,_Fukui.svg', license: 'PD-Japan-organization' }, // 福井市
  '182028': { file: 'Emblem_of_Tsuruga,_Fukui.svg', license: 'PD-Japan-organization' }, // 敦賀市
  '182044': { file: 'Emblem_of_Obama,_Fukui.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 小浜市
  '182052': { file: 'Emblem_of_Ōno,_Fukui.svg', license: 'PD-Japan-exempt' }, // 大野市
  '182061': { file: 'Emblem_of_Katsuyama,_Fukui.svg', license: 'PD-Japan-organization' }, // 勝山市
  '182079': { file: 'Emblem_of_Sabae,_Fukui.svg', license: 'PD-Japan-exempt' }, // 鯖江市
  '182087': { file: 'Emblem_of_Awara,_Fukui.svg', license: 'PD-ineligible' }, // あわら市
  '182095': { file: 'Emblem_of_Echizen,_Fukui.svg', license: 'PD-ineligible' }, // 越前市
  '182109': { file: 'Emblem_of_Sakai,_Fukui.svg', license: 'PD-Japan-exempt' }, // 坂井市
  '183229': { file: 'Emblem_of_Eiheiji,_Fukui.svg', license: 'PD-ineligible' }, // 永平寺町
  '184047': { file: 'Emblem_of_Minamiechizen,_Fukui.svg', license: 'PD-Japan-exempt' }, // 南越前町
  '184233': { file: 'Emblem_of_Echizen_Town,_Fukui.svg', license: 'CC0' }, // 越前町
  '184420': { file: 'Emblem_of_Mihama,_Fukui.svg', license: 'PD-Japan-organization' }, // 美浜町
  '184811': { file: 'Emblem_of_Takahama,_Fukui.svg', license: 'PD-Japan-organization' }, // 高浜町
  '184837': { file: 'Emblem_of_Oi,_Fukui.svg', license: 'PD-Japan-exempt' }, // おおい町
  '185019': { file: 'Emblem_of_Wakasa,_Fukui.svg', license: 'PD-Japan-exempt' }, // 若狭町
  '190004': { file: 'Emblem_of_Yamanashi_prefecture.svg', license: 'PD-ineligible' }, // 山梨県
  '192015': { file: '山梨県甲府市市章.svg', license: 'PD-Japan-organization' }, // 甲府市
  '192023': { file: '山梨県富士吉田市市章.svg', license: 'PD-Japan-organization' }, // 富士吉田市
  '192040': { file: '山梨県都留市市章.svg', license: 'PD-Japan-organization' }, // 都留市
  '192058': { file: 'Emblem_of_Yamanashi,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 山梨市
  '192066': { file: '山梨県大月市市章.svg', license: 'PD-Japan-organization' }, // 大月市
  '192074': { file: '山梨県韮崎市市章.svg', license: 'PD-Japan-organization' }, // 韮崎市
  '192082': { file: 'Emblem_of_Minami-Alps,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 南アルプス市
  '192091': { file: 'Emblem_of_Hokuto,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 北杜市
  '192104': { file: 'Emblem_of_Kai,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 甲斐市
  '192112': { file: 'Emblem_of_Fuefuki,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 笛吹市
  '192121': { file: 'Emblem_of_Uenohara,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 上野原市
  '192139': { file: 'Emblem_of_Koshu,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 甲州市
  '192147': { file: 'Emblem_of_Chuo,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 中央市
  '193461': { file: 'Emblem_of_Ichikawamisato,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 市川三郷町
  '193640': { file: 'Emblem_of_Hayakawa,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 早川町
  '193658': { file: 'Emblem_of_Minobu,_Yananashi.svg', license: 'PD-Japan-exempt' }, // 身延町
  '193666': { file: 'Emblem_of_Nanbu,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 南部町
  '193682': { file: 'Emblem_of_Fujikawa,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 富士川町
  '193844': { file: 'Emblem_of_Showa,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 昭和町
  '194221': { file: 'Emblem_of_Doshi,_Yamanashi.svg', license: 'PD-Japan-organization' }, // 道志村
  '194239': { file: 'Emblem_of_Nishikatsura,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 西桂町
  '194247': { file: 'Emblem_of_Oshino,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 忍野村
  '194255': { file: 'Emblem_of_Yamanakako,_Yamanashi.svg', license: 'PD-Japan-organization' }, // 山中湖村
  '194298': { file: 'Emblem_of_Narusawa,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 鳴沢村
  '194301': { file: 'Emblem_of_Fujikawaguchiko,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 富士河口湖町
  '194425': { file: 'Emblem_of_Kosuge,_Yamanashi.svg', license: 'PD-Japan-exempt' }, // 小菅村
  '194433': { file: 'Emblem_of_Tabayama,_Yamanashi.svg', license: 'PD-ineligible' }, // 丹波山村
  '200000': { file: 'Emblem_of_Nagano_Prefecture.svg', license: 'PD-textlogo / PD-Japan-exempt' }, // 長野県
  '202011': { file: 'Emblem_of_Nagano,_Nagano.svg', license: 'PD-ineligible' }, // 長野市
  '202029': { file: 'Emblem_of_Matsumoto,_Nagano.svg', license: 'PD-Japan-organization' }, // 松本市
  '202037': { file: 'Emblem_of_Ueda,_Nagano.svg', license: 'PD-Japan-exempt' }, // 上田市
  '202045': { file: 'Emblem_of_Okaya,_Nagano.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 岡谷市
  '202053': { file: 'Emblem_of_Iida,_Nagano.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 飯田市
  '202061': { file: 'Emblem_of_Suwa,_Nagano.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 諏訪市
  '202070': { file: 'Emblem_of_Suzaka,_Nagano.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 須坂市
  '202088': { file: 'Emblem_of_Komoro,_Nagano.svg', license: 'PD-Japan-exempt' }, // 小諸市
  '202096': { file: 'Emblem_of_Ina,_Nagano.svg', license: 'PD-ineligible' }, // 伊那市
  '202100': { file: 'Emblem_of_Komagane,_Nagano.svg', license: 'PD-Japan-organization' }, // 駒ヶ根市
  '202118': { file: 'Emblem_of_Nakano,_Nagano.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 中野市
  '202126': { file: 'Emblem_of_Omachi,_Nagano.svg', license: 'PD-Japan-organization' }, // 大町市
  '202134': { file: 'Emblem_of_Iiyama,_Nagano.svg', license: 'PD-Japan-exempt' }, // 飯山市
  '202142': { file: 'Emblem_of_Chino,_Nagano.svg', license: 'PD-Japan-organization' }, // 茅野市
  '202151': { file: 'Emblem_of_Shiojiri,_Nagano.svg', license: 'PD-Japan-organization' }, // 塩尻市
  '202177': { file: 'Emblem_of_Saku,_Nagano.svg', license: 'PD-ineligible' }, // 佐久市
  '202193': { file: 'Emblem_of_Tōmi,_Nagano.svg', license: 'PD-Japan-exempt' }, // 東御市
  '203033': { file: 'Emblem_of_Koumi,_Nagano.svg', license: 'PD-Japan-organization' }, // 小海町
  '203041': { file: 'Emblem_of_Kawakami,_Nagano.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 川上村
  '203068': { file: 'Emblem_of_Minamiaiki,_Nagano.svg', license: 'PD-Japan-exempt' }, // 南相木村
  '203076': { file: 'Emblem_of_Kitaaiki,_Nagano.svg', license: 'PD-Japan-exempt' }, // 北相木村
  '203092': { file: 'Emblem_of_Sakuho,_Nagano.svg', license: 'PD-Japan-exempt' }, // 佐久穂町
  '203211': { file: 'Emblem_of_Karuizawa,_Nagano.svg', license: 'PD-Japan-exempt' }, // 軽井沢町
  '203238': { file: 'Emblem_of_Miyota,_Nagano.svg', license: 'PD-Japan-exempt' }, // 御代田町
  '203246': { file: 'Emblem_of_Tateshina,_Nagano.svg', license: 'PD-Japan-organization' }, // 立科町
  '203491': { file: 'Emblem_of_Aoki,_Nagano.svg', license: 'PD-ineligible' }, // 青木村
  '203505': { file: 'Emblem_of_Nagawa,_Nagano.svg', license: 'PD-Japan-exempt' }, // 長和町
  '203611': { file: 'Emblem_of_Shimosuwa,_Nagano.svg', license: 'PD-Japan-organization' }, // 下諏訪町
  '203629': { file: 'Emblem_of_Fujimi,_Nagano.svg', license: 'PD-Japan-organization' }, // 富士見町
  '203637': { file: 'Emblem_of_Hara,_Nagano.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 原村
  '203823': { file: 'Emblem_of_Tatsuno,_Nagano.svg', license: 'PD-Japan-organization' }, // 辰野町
  '203831': { file: 'Emblem_of_Minowa,_Nagano.svg', license: 'PD-Japan-organization' }, // 箕輪町
  '203840': { file: 'Emblem_of_Iijima,_Nagano.svg', license: 'PD-Japan-organization' }, // 飯島町
  '203858': { file: 'Emblem_of_Minamiminowa,_Nagano.svg', license: 'PD-Japan-exempt' }, // 南箕輪村
  '203866': { file: 'Emblem_of_Nakagawa,_Nagano.svg', license: 'PD-Japan-organization' }, // 中川村
  '203882': { file: 'Emblem_of_Miyada,_Nagano.svg', license: 'PD-Japan-exempt' }, // 宮田村
  '204021': { file: 'Emblem_of_Matsukawa-town,_Nagano.svg', license: 'PD-Japan-exempt' }, // 松川町
  '204030': { file: 'Emblem_of_Takamori,_Nagano.svg', license: 'PD-Japan-organization' }, // 高森町
  '204048': { file: 'Emblem_of_Anan,_Nagano.svg', license: 'PD-Japan-organization' }, // 阿南町
  '204072': { file: 'Emblem_of_Achi,_Nagano.svg', license: 'PD-Japan-exempt' }, // 阿智村
  '204102': { file: 'Emblem_of_Neba,_Nagano.svg', license: 'PD-Japan-exempt' }, // 根羽村
  '204111': { file: 'Emblem_of_Shimojo,_Nagano.svg', license: 'PD-Japan-organization' }, // 下條村
  '204129': { file: 'Emblem_of_Urugi,_Nagano.svg', license: 'PD-ineligible' }, // 売木村
  '204137': { file: 'Emblem_of_Tenryū,_Nagano.svg', license: 'PD-Japan-exempt' }, // 天龍村
  '204145': { file: 'Emblem_of_Yasuoka,_Nagano.svg', license: 'PD-Japan-exempt' }, // 泰阜村
  '204153': { file: 'Emblem_of_Takagi,_Nagano.svg', license: 'PD-Japan-organization' }, // 喬木村
  '204161': { file: 'Emblem_of_Toyooka,_Nagano.svg', license: 'PD-Japan-exempt' }, // 豊丘村
  '204170': { file: 'Emblem_of_Oshika,_Nagano.svg', license: 'PD-Japan-exempt' }, // 大鹿村
  '204226': { file: 'Emblem_of_Agematsu,_Nagano.svg', license: 'PD-Japan-organization / PD-1996' }, // 上松町
  '204234': { file: 'Emblem_of_Nagiso,_Nagano_(monotone).svg', license: 'PD-ineligible' }, // 南木曽町
  '204251': { file: 'Emblem_of_Kiso,_Nagano_(village).svg', license: 'PD-Japan-exempt' }, // 木祖村
  '204293': { file: 'Emblem_of_Otaki,_Nagano.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 王滝村
  '204307': { file: 'Emblem_of_Okuwa,_Nagano.svg', license: 'PD-Japan-exempt' }, // 大桑村
  '204323': { file: 'Emblem_of_Kiso,_Nagano_(town).svg', license: 'PD-Japan-exempt' }, // 木曽町
  '204463': { file: 'Emblem_of_Omi,_Nagano.svg', license: 'PD-Japan-exempt' }, // 麻績村
  '204480': { file: 'Emblem_of_Ikusaka,_Nagano.svg', license: 'PD-Japan-exempt' }, // 生坂村
  '204501': { file: 'Emblem_of_Yamagata,_Nagano.svg', license: 'PD-Japan-exempt' }, // 山形村
  '204811': { file: 'Emblem_of_Ikeda,_Nagano.svg', license: 'PD-Japan-exempt' }, // 池田町
  '204820': { file: 'Emblem_of_Matsukawa_Village,_Nagano.svg', license: 'PD-Japan-organization' }, // 松川村
  '204854': { file: 'Emblem_of_Hakuba,_Nagano.svg', license: 'PD-Japan-organization' }, // 白馬村
  '204862': { file: 'Emblem_of_Otari,_Nagano.svg', license: 'PD-ineligible' }, // 小谷村
  '205214': { file: 'Emblem_of_Sakaki,_Nagano.svg', license: 'PD-Japan-exempt' }, // 坂城町
  '205419': { file: 'Emblem_of_Obuse,_Nagano.svg', license: 'PD-Japan-organization' }, // 小布施町
  '205435': { file: 'Emblem_of_Takayama,_Nagano.svg', license: 'PD-Japan-exempt' }, // 高山村
  '205613': { file: 'Emblem_of_Yamanouchi,_Nagano.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 山ノ内町
  '205621': { file: 'Emblem_of_Kijimadaira,_Nagano.svg', license: 'PD-Japan-exempt' }, // 木島平村
  '205630': { file: 'Emblem_of_Nozawaonsen,_Nagano.svg', license: 'PD-Japan-organization' }, // 野沢温泉村
  '205834': { file: 'Emblem_of_Shinano,_Nagano.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 信濃町
  '205885': { file: 'Emblem_of_Ogawa,_Nagano.svg', license: 'PD-ineligible' }, // 小川村
  '205907': { file: 'Emblem_of_Iizuna,_Nagano.svg', license: 'PD-Japan-exempt' }, // 飯綱町
  '210005': { file: 'Emblem_of_Gifu_Prefecture.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 岐阜県
  '212016': { file: 'Emblem_of_Gifu,_Gifu.svg', license: 'PD-Japan-organization' }, // 岐阜市
  '212024': { file: 'Emblem_of_Ōgaki,_Gifu.svg', license: 'PD-Japan-organization' }, // 大垣市
  '212032': { file: 'Emblem_of_Takayama,_Gifu.svg', license: 'PD-ineligible' }, // 高山市
  '212041': { file: 'Emblem_of_Tajimi,_Gifu.svg', license: 'PD-Japan-exempt' }, // 多治見市
  '212059': { file: 'Emblem_of_Seki,_Gifu.svg', license: 'PD-Japan-organization' }, // 関市
  '212067': { file: 'Emblem_of_Nakatsugawa,_Gifu.svg', license: 'PD-Japan-organization' }, // 中津川市
  '212075': { file: 'Emblem_of_Mino,_Gifu.svg', license: 'PD-Japan-organization' }, // 美濃市
  '212083': { file: 'Emblem_of_Mizunami,_Gifu.svg', license: 'PD-Japan-organization' }, // 瑞浪市
  '212091': { file: 'Emblem_of_Hashima,_Gifu.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 羽島市
  '212105': { file: 'Emblem_of_Ena,_Gifu.svg', license: 'PD-Japan-exempt' }, // 恵那市
  '212113': { file: 'Emblem_of_Minokamo,_Gifu.svg', license: 'PD-Japan-organization' }, // 美濃加茂市
  '212121': { file: 'Emblem_of_Toki,_Gifu.svg', license: 'PD-Japan-organization' }, // 土岐市
  '212130': { file: 'Emblem_of_Kakamigahara,_Gifu.svg', license: 'PD-Japan-organization' }, // 各務原市
  '212148': { file: 'Emblem_of_Kani,_Gifu.svg', license: 'PD-Japan-organization' }, // 可児市
  '212156': { file: 'Emblem_of_Yamagata,_Gifu.svg', license: 'PD-Japan-exempt' }, // 山県市
  '212164': { file: 'Emblem_of_Mizuho,_Gifu.svg', license: 'PD-Japan-exempt' }, // 瑞穂市
  '212172': { file: 'Emblem_of_Hida,_Gifu.svg', license: 'PD-ineligible' }, // 飛騨市
  '212181': { file: 'Emblem_of_Motosu,_Gifu.svg', license: 'PD-Japan-exempt' }, // 本巣市
  '212199': { file: 'Emblem_of_Gujo,_Gifu.svg', license: 'PD-ineligible' }, // 郡上市
  '212202': { file: 'Emblem_of_Gero,_Gifu.svg', license: 'PD-Japan-exempt' }, // 下呂市
  '212211': { file: 'Emblem_of_Kaizu,_Gifu.svg', license: 'PD-ineligible' }, // 海津市
  '213021': { file: 'Emblem_of_Ginan,_Gifu.svg', license: 'PD-Japan-exempt' }, // 岐南町
  '213039': { file: 'Emblem_of_Kasamatsu,_Gifu.svg', license: 'PD-Japan-organization' }, // 笠松町
  '213411': { file: 'Emblem_of_Yoro,_Gifu.svg', license: 'PD-Japan-organization' }, // 養老町
  '213616': { file: 'Emblem_of_Tarui,_Gifu.svg', license: 'PD-Japan-organization' }, // 垂井町
  '213624': { file: 'Emblem_of_Sekigahara,_Gifu.svg', license: 'PD-Japan-organization' }, // 関ケ原町
  '213811': { file: 'Emblem_of_Godo,_Gifu.svg', license: 'PD-Japan-organization' }, // 神戸町
  '213829': { file: 'Emblem_of_Wanouchi,_Gifu.svg', license: 'PD-Japan-organization' }, // 輪之内町
  '213837': { file: 'Emblem_of_Anpachi,_Gifu.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 安八町
  '214019': { file: 'Emblem_of_Ibigawa,_Gifu.svg', license: 'PD-Japan-exempt' }, // 揖斐川町
  '214035': { file: 'Emblem_of_Ōno,_Gifu.svg', license: 'PD-Japan-organization' }, // 大野町
  '214043': { file: 'Emblem_of_Ikeda,_Gifu.svg', license: 'PD-Japan-exempt' }, // 池田町
  '214213': { file: 'Emblem_of_Kitagata,_Gifu.svg', license: 'PD-Japan-organization' }, // 北方町
  '215015': { file: 'Emblem_of_Sakahogi,_Gifu.svg', license: 'PD-ineligible' }, // 坂祝町
  '215023': { file: 'Emblem_of_Tomika,_Gifu.svg', license: 'PD-Japan-exempt' }, // 富加町
  '215040': { file: 'Emblem_of_Hichisō,_Gifu.svg', license: 'PD-Japan-exempt' }, // 七宗町
  '215058': { file: 'Emblem_of_Yaotsu,_Gifu.svg', license: 'PD-Japan-organization' }, // 八百津町
  '215066': { file: 'Emblem_of_Shirakawa_Town,_Gifu.svg', license: 'PD-Japan-organization' }, // 白川町
  '215074': { file: 'Emblem_of_Higashishirakawa,_Gifu.svg', license: 'PD-Japan-organization' }, // 東白川村
  '215210': { file: 'Emblem_of_Mitake,_Gifu.svg', license: 'PD-Japan-exempt' }, // 御嵩町
  '216046': { file: 'Emblem_of_Shirakawa_Village,_Gifu.svg', license: 'PD-Japan-organization' }, // 白川村
  '220001': { file: 'Emblem_of_Shizuoka_Prefecture.svg', license: 'PD-ineligible' }, // 静岡県
  '221007': { file: 'Emblem_of_Shizuoka,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 静岡市
  '221309': { file: 'Emblem_of_Hamamatsu,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 浜松市
  '222038': { file: '静岡県沼津市市章.svg', license: 'PD-Japan-organization' }, // 沼津市
  '222054': { file: '静岡県熱海市市章.svg', license: 'PD-Japan-organization' }, // 熱海市
  '222062': { file: '静岡県三島市市章.svg', license: 'PD-Japan-organization' }, // 三島市
  '222071': { file: '静岡県富士宮市市章.svg', license: 'PD-Japan-organization' }, // 富士宮市
  '222089': { file: '静岡県伊東市市章.svg', license: 'PD-Japan-organization' }, // 伊東市
  '222097': { file: 'Emblem_of_Shimada,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 島田市
  '222101': { file: 'Emblem_of_Fuji,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 富士市
  '222119': { file: 'Emblem_of_Iwata,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 磐田市
  '222127': { file: '静岡県焼津市市章.svg', license: 'PD-Japan-organization' }, // 焼津市
  '222135': { file: 'Emblem_of_Kakegawa,_Shizuoka.svg', license: 'PD-ineligible' }, // 掛川市
  '222143': { file: 'Emblem_of_Fujieda,_Shizuoka.svg', license: 'PD-Japan-organization' }, // 藤枝市
  '222151': { file: '静岡県御殿場市市章.svg', license: 'PD-Japan-organization' }, // 御殿場市
  '222160': { file: 'Emblem_of_Fukuroi,_Shizuoka.svg', license: 'PD-ineligible' }, // 袋井市
  '222194': { file: 'Emblem_of_Shimoda,_Shizuoka.svg', license: 'PD-Japan-organization' }, // 下田市
  '222208': { file: '静岡県裾野市市章.svg', license: 'PD-Japan-organization' }, // 裾野市
  '222216': { file: 'Emblem_of_Kosai,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 湖西市
  '222224': { file: 'Emblem_of_Izu,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 伊豆市
  '222232': { file: 'Emblem_of_Omaezaki,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 御前崎市
  '222241': { file: 'Emblem_of_Kikugawa,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 菊川市
  '222259': { file: 'Emblem_of_Izunokuni,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 伊豆の国市
  '222267': { file: 'Emblem_of_Makinohara,_Shizuoka.svg', license: 'PD-ineligible' }, // 牧之原市
  '223018': { file: 'Emblem_of_Higashiizu,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 東伊豆町
  '223042': { file: 'Emblem_of_Minamiizu,_Shizuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 南伊豆町
  '223051': { file: 'Emblem_of_Matsuzaki,_Shizuoka.svg', license: 'PD-Japan-organization' }, // 松崎町
  '223069': { file: 'Emblem_of_Nishiizu,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 西伊豆町
  '223255': { file: 'Emblem_of_Kannami,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 函南町
  '223417': { file: 'Emblem_of_Shimizutown,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 清水町
  '223425': { file: '静岡県長泉町町章.svg', license: 'PD-Japan-organization' }, // 長泉町
  '223441': { file: 'Emblem_of_Oyama,_Shizuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 小山町
  '224243': { file: 'Emblem_of_Yoshida,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 吉田町
  '224294': { file: 'Emblem_of_Kawanehon,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 川根本町
  '224618': { file: 'Emblem_of_Mori,_Shizuoka.svg', license: 'PD-Japan-exempt' }, // 森町
  '230006': { file: 'Emblem_of_Aichi_Prefecture.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 愛知県
  '231002': { file: 'Emblem_of_Nagoya,_Aichi.svg', license: 'PD-textlogo' }, // 名古屋市
  '232017': { file: 'Emblem_of_Toyohashi,_Aichi.svg', license: 'PD-Japan-exempt' }, // 豊橋市
  '232025': { file: 'Emblem_of_Okazaki,_Aichi.svg', license: 'PD-ineligible' }, // 岡崎市
  '232041': { file: 'Emblem_of_Seto,_Aichi.svg', license: 'PD-Japan-organization' }, // 瀬戸市
  '232050': { file: 'Emblem_of_Handa,_Aichi.svg', license: 'PD-Japan-organization' }, // 半田市
  '232068': { file: 'Emblem_of_Kasugai,_Aichi.svg', license: 'PD-Japan-organization' }, // 春日井市
  '232076': { file: 'Emblem_of_Toyokawa,_Aichi.svg', license: 'PD-Japan-exempt' }, // 豊川市
  '232084': { file: 'Emblem_of_Tsushima,_Aichi.svg', license: 'PD-Japan-organization' }, // 津島市
  '232092': { file: 'Emblem_of_Hekinan,_Aichi.svg', license: 'PD-Japan-organization' }, // 碧南市
  '232106': { file: 'Emblem_of_Kariya,_Aichi.svg', license: 'PD-Japan-organization' }, // 刈谷市
  '232114': { file: 'Emblem_of_Toyota,_Aichi.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 豊田市
  '232122': { file: 'Emblem_of_Anjo,_Aichi.svg', license: 'PD-Japan-organization' }, // 安城市
  '232131': { file: 'Emblem_of_Nishio,_Aichi.svg', license: 'PD-Japan-exempt' }, // 西尾市
  '232149': { file: 'Emblem_of_Gamagori,_Aichi.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 蒲郡市
  '232157': { file: 'Emblem_of_Inuyama,_Aichi.svg', license: 'PD-Japan-exempt' }, // 犬山市
  '232165': { file: 'Emblem_of_Tokoname,_Aichi.svg', license: 'PD-Japan-exempt' }, // 常滑市
  '232173': { file: 'Emblem_of_Konan,_Aichi.svg', license: 'PD-ineligible' }, // 江南市
  '232190': { file: 'Logo_of_Komaki_City.svg', license: 'PD-Japan' }, // 小牧市
  '232203': { file: 'Emblem_of_Inazawa,_Aichi.svg', license: 'PD-Japan-organization' }, // 稲沢市
  '232211': { file: 'Emblem_of_Shinshiro,_Aichi.svg', license: 'PD-Japan-exempt' }, // 新城市
  '232220': { file: 'Emblem_of_Tokai,_Aichi.svg', license: 'PD-ineligible' }, // 東海市
  '232238': { file: 'Emblem_of_Ōbu,_Aichi.svg', license: 'PD-Japan-exempt' }, // 大府市
  '232246': { file: 'Emblem_of_Chita,_Aichi.svg', license: 'PD-Japan-organization' }, // 知多市
  '232254': { file: 'Emblem_of_Chiryū,_Aichi.svg', license: 'PD-Japan-organization' }, // 知立市
  '232262': { file: 'Emblem_of_Owariasahi,_Aichi.svg', license: 'PD-Japan-organization' }, // 尾張旭市
  '232271': { file: 'Emblem_of_Takahama,_Aichi.svg', license: 'PD-Japan-exempt' }, // 高浜市
  '232289': { file: 'Emblem_of_Iwakura,_Aichi.svg', license: 'PD-Japan-organization' }, // 岩倉市
  '232297': { file: 'Emblem_of_Toyoake,_Aichi.svg', license: 'PD-Japan-exempt' }, // 豊明市
  '232301': { file: 'Emblem_of_Nisshin,_Aichi.svg', license: 'PD-self' }, // 日進市
  '232319': { file: 'Emblem_of_Tahara,_Aichi.svg', license: 'PD-ineligible' }, // 田原市
  '232327': { file: 'Emblem_of_Aisai,_Aichi.svg', license: 'PD-Japan-exempt' }, // 愛西市
  '232335': { file: 'Emblem_of_Kiyosu,_Aichi.svg', license: 'PD-Japan-exempt' }, // 清須市
  '232343': { file: 'Emblem_of_Kitanagoya,_Aichi.svg', license: 'PD-Japan-exempt' }, // 北名古屋市
  '232351': { file: 'Emblem_of_Yatomi,_Aichi.svg', license: 'PD-Japan-organization' }, // 弥富市
  '232360': { file: 'Emblem_of_Miyoshi,_Aichi.svg', license: 'PD-ineligible' }, // みよし市
  '232378': { file: 'Emblem_of_Ama,_Aichi.svg', license: 'PD-ineligible' }, // あま市
  '232386': { file: 'Emblem_of_Nagakute,_Aichi.svg', license: 'PD-ineligible' }, // 長久手市
  '233021': { file: 'Emblem_of_Togo,_Aichi.svg', license: 'PD-ineligible' }, // 東郷町
  '233421': { file: 'Emblem_of_Toyoyama,_Aichi.svg', license: 'PD-Japan-exempt' }, // 豊山町
  '233617': { file: 'Emblem_of_Oguchi,_Aichi.svg', license: 'PD-Japan-exempt' }, // 大口町
  '234249': { file: 'Emblem_of_Oharu,_Aichi.svg', license: 'PD-Japan-organization' }, // 大治町
  '234257': { file: 'Emblem_of_Kanie,_Aichi.svg', license: 'PD-Japan-organization' }, // 蟹江町
  '234273': { file: 'Emblem_of_Tobishima,_Aichi.svg', license: 'PD-Japan-exempt' }, // 飛島村
  '234419': { file: 'Emblem_of_Agui,_Aichi.svg', license: 'PD-ineligible' }, // 阿久比町
  '234427': { file: 'Emblem_of_Higashiura,_Aichi.svg', license: 'PD-Japan-exempt' }, // 東浦町
  '234451': { file: 'Emblem_of_Minamichita,_Aichi.svg', license: 'PD-Japan-exempt' }, // 南知多町
  '234460': { file: 'Emblem_of_Mihama,_Aichi.svg', license: 'PD-Japan-organization' }, // 美浜町
  '234478': { file: 'Emblem_of_Taketoyo,_Aichi.svg', license: 'PD-Japan-exempt' }, // 武豊町
  '235016': { file: 'Emblem_of_Kota,_Aichi.svg', license: 'PD-Japan-exempt' }, // 幸田町
  '235610': { file: 'Emblem_of_Shitara,_Aichi.svg', license: 'PD-Japan-exempt' }, // 設楽町
  '235628': { file: 'Emblem_of_Toei,_Aichi.svg', license: 'PD-Japan-exempt' }, // 東栄町
  '235636': { file: 'Emblem_of_Toyone,_Aichi.svg', license: 'PD-ineligible' }, // 豊根村
  '240001': { file: 'Emblem_of_Mie_Prefecture.svg', license: 'PD-text' }, // 三重県
  '242012': { file: 'Emblem_of_Tsu,_Mie.svg', license: 'PD-Japan-exempt' }, // 津市
  '242021': { file: 'Emblem_of_Yokkaichi,_Mie.svg', license: 'PD-Japan-organization' }, // 四日市市
  '242039': { file: 'Emblem_of_Ise,_Mie.svg', license: 'PD-ineligible' }, // 伊勢市
  '242047': { file: 'Emblem_of_Matsusaka,_Mie.svg', license: 'PD-Japan-exempt' }, // 松阪市
  '242055': { file: 'Emblem_of_Kuwana,_Mie.svg', license: 'PD-Japan-exempt' }, // 桑名市
  '242071': { file: 'Emblem_of_Suzuka,_Mie.svg', license: 'PD-Japan-organization' }, // 鈴鹿市
  '242080': { file: 'Emblem_of_Nabari,_Mie.svg', license: 'PD-Japan-organization' }, // 名張市
  '242098': { file: 'Emblem_of_Owase,_Mie.svg', license: 'PD-Japan-organization' }, // 尾鷲市
  '242101': { file: 'Emblem_of_Kameyama,_Mie.svg', license: 'PD-Japan-exempt' }, // 亀山市
  '242110': { file: 'Emblem_of_Toba,_Mie.svg', license: 'PD-Japan-organization' }, // 鳥羽市
  '242128': { file: 'Emblem_of_Kumano,_Mie.svg', license: 'PD-Japan-exempt' }, // 熊野市
  '242144': { file: 'Emblem_of_Inabe,_Mie.svg', license: 'PD-Japan-exempt' }, // いなべ市
  '242152': { file: 'Emblem_of_Shima,_Mie.svg', license: 'PD-Japan-exempt' }, // 志摩市
  '242161': { file: 'Emblem_of_Iga,_Mie.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 伊賀市
  '243035': { file: 'Emblem_of_Kisosaki,_Mie.svg', license: 'PD-Japan-exempt' }, // 木曽岬町
  '243248': { file: 'Emblem_of_Toin,_Mie.svg', license: 'PD-Japan-exempt' }, // 東員町
  '243418': { file: 'Emblem_of_Komono,_Mie.svg', license: 'PD-Japan-exempt' }, // 菰野町
  '243434': { file: 'Emblem_of_Asahi,_Mie.svg', license: 'PD-Japan-exempt' }, // 朝日町
  '243442': { file: 'Emblem_of_Kawagoe,_Mie.svg', license: 'PD-Japan-organization / PD-Japan-exempt' }, // 川越町
  '244414': { file: 'Emblem_of_Taki,_Mie.svg', license: 'PD-Japan-exempt' }, // 多気町
  '244422': { file: 'Emblem_of_Meiwa,_Mie.svg', license: 'PD-Japan-organization' }, // 明和町
  '244431': { file: 'Emblem_of_Odai,_Mie.svg', license: 'PD-Japan-exempt' }, // 大台町
  '244619': { file: 'Emblem_of_Tamaki,_Mie.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 玉城町
  '244708': { file: 'Emblem_of_Watarai,_Mie.svg', license: 'PD-Japan-organization / PD-Japan-exempt' }, // 度会町
  '244716': { file: 'Emblem_of_Taiki,_Mie.svg', license: 'PD-ineligible' }, // 大紀町
  '244724': { file: 'Emblem_of_Minamiise,_Mie.svg', license: 'PD-Japan-exempt' }, // 南伊勢町
  '245437': { file: 'Emblem_of_Kihoku,_Mie.svg', license: 'PD-Japan-exempt' }, // 紀北町
  '245615': { file: 'Emblem_of_Mihama,_Mie.svg', license: 'PD-Japan-exempt' }, // 御浜町
  '245623': { file: 'Emblem_of_Kiho,_Mie.svg', license: 'PD-Japan-exempt' }, // 紀宝町
  '250007': { file: 'Emblem_of_Shiga_Prefecture.svg', license: 'PD-Japan-organization' }, // 滋賀県
  '252034': { file: 'Emblem_of_Nagahama,_Shiga.svg', license: 'PD-Japan-organization' }, // 長浜市
  '252042': { file: 'Emblem_of_Ōmihachiman,_Shiga.svg', license: 'PD-Japan-organization' }, // 近江八幡市
  '252077': { file: 'Emblem_of_Moriyama,_Shiga.svg', license: 'PD-Japan-organization' }, // 守山市
  '252093': { file: 'Emblem_of_Kōka,_Shiga.svg', license: 'PD-Japan-exempt' }, // 甲賀市
  '252123': { file: 'Emblem_of_Takashima,_Shiga.svg', license: 'PD-Japan-exempt' }, // 高島市
  '253839': { file: 'Emblem_of_Hino,_Shiga.svg', license: 'PD-Japan-organization' }, // 日野町
  '254428': { file: 'Emblem_of_Kōra,_Shiga.svg', license: 'PD-self / PD-ineligible' }, // 甲良町
  '254436': { file: 'Emblem_of_Taga,_Shiga.svg', license: 'PD-Japan-exempt' }, // 多賀町
  '260002': { file: 'Emblem_of_Kyoto_Prefecture.svg', license: 'PD-Japan-exempt' }, // 京都府
  '261009': { file: 'Emblem_of_Kyoto,_Kyoto.svg', license: 'PD-Japan-organization' }, // 京都市
  '262013': { file: 'Emblem_of_Fukuchiyama,_Kyoto.svg', license: 'PD-ineligible' }, // 福知山市
  '262021': { file: 'Emblem_of_Maizuru,_Kyoto.svg', license: 'PD-Japan-organization' }, // 舞鶴市
  '262030': { file: 'Emblem_of_Ayabe,_Kyoto.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 綾部市
  '262048': { file: 'Emblem_of_Uji,_Kyoto.svg', license: 'PD-Japan-organization' }, // 宇治市
  '262056': { file: 'Emblem_of_Miyazu,_Kyoto.svg', license: 'PD-Japan-organization' }, // 宮津市
  '262064': { file: 'Emblem_of_Kameoka,_Kyoto.svg', license: 'PD-Japan-organization' }, // 亀岡市
  '262072': { file: 'Emblem_of_Joyo,_Kyoto.svg', license: 'PD-Japan-organization' }, // 城陽市
  '262081': { file: 'Emblem_of_Mukō,_Kyoto.svg', license: 'PD-Japan-exempt' }, // 向日市
  '262099': { file: 'Emblem_of_Nagaokakyō,_Kyoto.svg', license: 'PD-Japan-organization' }, // 長岡京市
  '262102': { file: 'Emblem_of_Yawata,_Kyoto.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 八幡市
  '262111': { file: 'Emblem_of_Kyōtanabe,_Kyoto.svg', license: 'PD-Japan-organization' }, // 京田辺市
  '262129': { file: 'Emblem_of_Kyōtango,_Kyoto.svg', license: 'PD-Japan-exempt' }, // 京丹後市
  '262145': { file: 'Emblem_of_Kizugawa,_Kyoto.svg', license: 'PD-Japan-exempt' }, // 木津川市
  '263036': { file: 'Emblem_of_Ōyamazaki,_Kyoto.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 大山崎町
  '263222': { file: 'Emblem_of_Kumiyama,_Kyoto.svg', license: 'PD-Japan-exempt' }, // 久御山町
  '263435': { file: 'Emblem_of_Ide,_Kyoto.svg', license: 'PD-Japan-organization' }, // 井手町
  '263443': { file: 'Emblem_of_Ujitawara,_Kyoto.svg', license: 'PD-Japan-exempt' }, // 宇治田原町
  '263648': { file: 'Emblem_of_Kasagi,_Kyoto.svg', license: 'PD-Japan-exempt' }, // 笠置町
  '263656': { file: 'Emblem_of_Wazuka,_Kyoto.svg', license: 'PD-self / PD-ineligible' }, // 和束町
  '263672': { file: 'Emblem_of_Minamiyamashiro,_Kyoto.svg', license: 'PD-Japan-organization' }, // 南山城村
  '264636': { file: 'Emblem_of_Ine,_Kyoto.svg', license: 'PD-Japan-organization' }, // 伊根町
  '270008': { file: 'Emblem_of_Osaka_Prefecture.svg', license: 'PD-ineligible' }, // 大阪府
  '271004': { file: 'Emblem_of_Osaka,_Osaka.svg', license: 'PD-Japan-organization' }, // 大阪市
  '271403': { file: 'Emblem_of_Sakai,_Osaka.svg', license: 'PD-Japan-organization' }, // 堺市
  '272027': { file: 'Emblem_of_Kishiwada,_Osaka.svg', license: 'PD-textlogo' }, // 岸和田市
  '272035': { file: 'Emblem_of_Toyonaka,_Osaka.svg', license: 'PD-Japan-organization' }, // 豊中市
  '272043': { file: 'Emblem_of_Ikeda,_Osaka.svg', license: 'PD-Japan-organization / PD-1996' }, // 池田市
  '272051': { file: 'Emblem_of_Suita,_Osaka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 吹田市
  '272060': { file: 'Emblem_of_Izumiōtsu,_Osaka.svg', license: 'PD-Japan-organization' }, // 泉大津市
  '272078': { file: 'Emblem_of_Takatsuki,_Osaka.svg', license: 'PD-Japan-organization / PD-1996' }, // 高槻市
  '272086': { file: 'Emblem_of_Kaizuka,_Osaka.svg', license: 'PD-Japan-organization' }, // 貝塚市
  '272094': { file: 'Emblem_of_Moriguchi,_Osaka.svg', license: 'PD-Japan-organization' }, // 守口市
  '272108': { file: 'Emblem_of_Hirakata,_Osaka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 枚方市
  '272116': { file: 'Emblem_of_Ibaraki,_Osaka.svg', license: 'PD-Japan-organization' }, // 茨木市
  '272124': { file: 'Emblem_of_Yao,_Osaka.svg', license: 'PD-textlogo' }, // 八尾市
  '272132': { file: 'Emblem_of_Izumisano,_Osaka.svg', license: 'PD-Japan-organization' }, // 泉佐野市
  '272141': { file: 'Emblem_of_Tondabayashi,_Osaka.svg', license: 'PD-Japan-organization' }, // 富田林市
  '272159': { file: 'Emblem_of_Neyagawa,_Osaka.svg', license: 'PD-Japan-organization' }, // 寝屋川市
  '272167': { file: 'Emblem_of_Kawachinagano,_Osaka.svg', license: 'PD-Japan-organization' }, // 河内長野市
  '272175': { file: 'Emblem_of_Matsubara,_Osaka.svg', license: 'PD-Japan-organization' }, // 松原市
  '272183': { file: 'Emblem_of_Daitō,_Osaka.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 大東市
  '272191': { file: 'Emblem_of_Izumi,_Osaka.svg', license: 'PD-Japan-organization' }, // 和泉市
  '272205': { file: 'Emblem_of_Minoh,_Osaka.svg', license: 'PD-Japan-organization' }, // 箕面市
  '272213': { file: 'Emblem_of_Kashiwara,_Osaka.svg', license: 'PD-Japan-organization' }, // 柏原市
  '272221': { file: 'Emblem_of_Habikino,_Osaka.svg', license: 'PD-Japan-organization' }, // 羽曳野市
  '272230': { file: 'Emblem_of_Kadoma,_Osaka.svg', license: 'PD-Japan-organization' }, // 門真市
  '272248': { file: 'Emblem_of_Settsu,_Osaka.svg', license: 'PD-Japan-exempt' }, // 摂津市
  '272256': { file: 'Emblem_of_Takaishi,_Osaka.svg', license: 'PD-ineligible' }, // 高石市
  '272264': { file: 'Emblem_of_Fujiidera,_Osaka.svg', license: 'PD-Japan-exempt' }, // 藤井寺市
  '272272': { file: 'Emblem_of_Higashiosaka.svg', license: 'PD-ineligible' }, // 東大阪市
  '272281': { file: 'Emblem_of_Sennan,_Osaka.svg', license: 'PD-Japan-organization' }, // 泉南市
  '272299': { file: 'Emblem_of_Shijōnawate,_Osaka.svg', license: 'PD-ineligible' }, // 四條畷市
  '272302': { file: 'Emblem_of_Katano,_Osaka.svg', license: 'PD-Japan-organization' }, // 交野市
  '272311': { file: 'Emblem_of_Osakasayama,_Osaka.svg', license: 'PD-Japan-exempt' }, // 大阪狭山市
  '272329': { file: 'Emblem_of_Hannan,_Osaka.svg', license: 'PD-ineligible' }, // 阪南市
  '273015': { file: 'Emblem_of_Shimamoto,_Osaka.svg', license: 'PD-Japan-organization' }, // 島本町
  '273228': { file: 'Emblem_of_Nose,_Osaka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 能勢町
  '273414': { file: 'Emblem_of_Tadaoka,_Osaka.svg', license: 'PD-textlogo' }, // 忠岡町
  '273619': { file: 'Emblem_of_Kumatori,_Osaka.svg', license: 'PD-Japan-organization' }, // 熊取町
  '273627': { file: 'Emblem_of_Tajiri,_Osaka.svg', license: 'PD-Japan-organization' }, // 田尻町
  '273660': { file: 'Emblem_of_Misaki,_Osaka.svg', license: 'PD-Japan-organization' }, // 岬町
  '273813': { file: 'Emblem_of_Taishi,_Osaka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 太子町
  '273821': { file: 'Emblem_of_Kanan,_Osaka.svg', license: 'PD-Japan-organization' }, // 河南町
  '273830': { file: 'Emblem_of_Chihayaakasaka,_Osaka.svg', license: 'PD-Japan-organization' }, // 千早赤阪村
  '280003': { file: 'Emblem_of_Hyogo_Prefecture.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 兵庫県
  '281000': { file: 'Emblem_of_Kobe,_Hyogo.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 神戸市
  '282014': { file: 'Emblem_of_Himeji,_Hyogo.svg', license: 'PD-Japan-organization' }, // 姫路市
  '282031': { file: 'Emblem_of_Akashi,_Hyogo.svg', license: 'PD-textlogo' }, // 明石市
  '282057': { file: 'Emblem_of_Sumoto,_Hyogo.svg', license: 'PD-Japan-organization / PD-1996' }, // 洲本市
  '282065': { file: 'Emblem_of_Ashiya,_Hyogo.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 芦屋市
  '282073': { file: 'Emblem_of_Itami,_Hyogo.svg', license: 'PD-Japan-organization / PD-1996' }, // 伊丹市
  '282090': { file: 'Emblem_of_Toyooka,_Hyogo.svg', license: 'PD-Japan-exempt' }, // 豊岡市
  '282120': { file: 'Emblem_of_Akō,_Hyōgo.svg', license: 'PD-Japan-organization' }, // 赤穂市
  '282138': { file: 'Emblem_of_Nishiwaki,_Hyōgo.svg', license: 'PD-Japan-exempt' }, // 西脇市
  '282146': { file: 'Emblem_of_Takarazuka,_Hyogo.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 宝塚市
  '282219': { file: 'Emblem_of_Tambasasayama,_Hyogo.svg', license: 'PD-Japan-exempt' }, // 丹波篠山市
  '282227': { file: 'Emblem_of_Yabu,_Hyogo.svg', license: 'PD-Japan-exempt' }, // 養父市
  '282260': { file: 'Emblem_of_Awaji,_Hyōgo.svg', license: 'PD-ineligible' }, // 淡路市
  '282278': { file: 'Emblem_of_Shisō,_Hyōgo.svg', license: 'PD-Japan-exempt' }, // 宍粟市
  '282294': { file: 'Emblem_of_Tatsuno,_Hyōgo.svg', license: 'PD-Japan-exempt' }, // たつの市
  '283819': { file: 'Emblem_of_Inami,_Hyōgo.svg', license: 'PD-Japan-exempt' }, // 稲美町
  '284424': { file: 'Emblem_of_Ichikawa,_Hyogo.svg', license: 'PD-Japan-organization' }, // 市川町
  '284432': { file: 'Emblem_of_Fukusaki,_Hyogo.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 福崎町
  '284645': { file: 'Emblem_of_Taishi,_Hyogo.svg', license: 'PD-Japan-organization / PD-Japan-exempt' }, // 太子町
  '284815': { file: 'Emblem_of_Kamigori,_Hyogo.svg', license: 'PD-Japan-organization' }, // 上郡町
  '285013': { file: 'Emblem_of_Sayo,_Hyogo.svg', license: 'PD-Japan-exempt' }, // 佐用町
  '285854': { file: 'Emblem_of_Kami,_Hyogo.svg', license: 'PD-Japan-exempt' }, // 香美町
  '285862': { file: 'Emblem_of_Shinonsen,_Hyogo.svg', license: 'PD-Japan-exempt' }, // 新温泉町
  '290009': { file: 'Emblem_of_Nara_Prefecture.svg', license: 'PD-Ineligible / PD-textlogo / PD-ineligible' }, // 奈良県
  '292010': { file: 'Emblem_of_Nara,_Nara.svg', license: 'PD-Japan-organization' }, // 奈良市
  '292028': { file: 'Emblem_of_Yamatotakada,_Nara.svg', license: 'PD-Japan-organization' }, // 大和高田市
  '292036': { file: 'Emblem_of_Yamatokōriyama,_Nara.svg', license: 'PD-Japan-exempt' }, // 大和郡山市
  '292044': { file: 'Emblem_of_Tenri,_Nara.svg', license: 'PD-Japan-organization' }, // 天理市
  '292052': { file: 'Emblem_of_Kashihara,_Nara.svg', license: 'PD-Japan-organization' }, // 橿原市
  '292061': { file: 'Emblem_of_Sakurai,_Nara.svg', license: 'PD-Japan-exempt' }, // 桜井市
  '292079': { file: 'Emblem_of_Gojo,_Nara.svg', license: 'PD-Japan-organization' }, // 五條市
  '292087': { file: 'Emblem_of_Gose,_Nara.svg', license: 'PD-Japan-organization' }, // 御所市
  '292095': { file: 'Emblem_of_Ikoma,_Nara.svg', license: 'PD-Japan-exempt' }, // 生駒市
  '292109': { file: 'Emblem_of_Kashiba,_Nara.svg', license: 'PD-Japan-exempt' }, // 香芝市
  '292117': { file: 'Emblem_of_Katsuragi,_Nara.svg', license: 'PD-Japan-exempt' }, // 葛城市
  '292125': { file: 'Emblem_of_Uda,_Nara.svg', license: 'PD-Japan-exempt' }, // 宇陀市
  '293229': { file: 'Emblem_of_Yamazoe,_Nara.svg', license: 'PD-Japan-exempt' }, // 山添村
  '293458': { file: 'Emblem_of_Ando,_Nara.svg', license: 'PD-ineligible' }, // 安堵町
  '293610': { file: 'Emblem_of_Kawanishi,_Nara.svg', license: 'PD-Japan-organization' }, // 川西町
  '293628': { file: 'Emblem_of_Miyake,_Nara.svg', license: 'PD-Japan-exempt' }, // 三宅町
  '293636': { file: 'Emblem_of_Tawaramoto,_Nara.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 田原本町
  '293857': { file: 'Emblem_of_Soni,_Nara.svg', license: 'PD-ineligible' }, // 曽爾村
  '293865': { file: 'Emblem_of_Mitsue,_Nara.svg', license: 'PD-ineligible' }, // 御杖村
  '294012': { file: 'Emblem_of_Takatori,_Nara.svg', license: 'PD-Japan-exempt' }, // 高取町
  '294021': { file: 'Emblem_of_Asuka,_Nara.svg', license: 'PD-self / PD-ineligible' }, // 明日香村
  '294250': { file: 'Emblem_of_Oji,_Nara.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 王寺町
  '294268': { file: 'Emblem_of_Kōryō,_Nara.svg', license: 'PD-Japan-organization' }, // 広陵町
  '294276': { file: 'Emblem_of_Kawai,_Nara.svg', license: 'PD-Japan-exempt' }, // 河合町
  '294420': { file: 'Emblem_of_Oyodo,_Nara.svg', license: 'PD-Japan-exempt' }, // 大淀町
  '294438': { file: 'Emblem_of_Shimoichi,_Nara.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 下市町
  '294446': { file: 'Emblem_of_Kurotaki,_Nara.svg', license: 'PD-ineligible' }, // 黒滝村
  '294497': { file: 'Emblem_of_Totsukawa,_Nara.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 十津川村
  '294535': { file: 'Emblem_of_Higashiyoshino,_Nara.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 東吉野村
  '300004': { file: 'Emblem_of_Wakayama_Prefecture.svg', license: 'PD-ineligible' }, // 和歌山県
  '302015': { file: 'Emblem_of_Wakayama,_Wakayama.svg', license: 'PD-Japan-organization' }, // 和歌山市
  '302040': { file: 'Emblem_of_Arida,_Wakayama.svg', license: 'PD-Japan-organization' }, // 有田市
  '302058': { file: 'Emblem_of_Gobo,_Wakayama.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 御坊市
  '302091': { file: 'Emblem_of_Iwade,_Wakayama.svg', license: 'PD-Japan-organization' }, // 岩出市
  '303411': { file: 'Emblem_of_Katsuragi,_Wakayama.svg', license: 'PD-Japan-organization' }, // かつらぎ町
  '303437': { file: 'Emblem_of_Kudoyama,_Wakayama.svg', license: 'PD-Japan-organization' }, // 九度山町
  '303445': { file: 'Emblem_of_Koya,_Wakayama.svg', license: 'PD-Japan-organization' }, // 高野町
  '303623': { file: 'Emblem_of_Hirogawa,_Wakayama.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 広川町
  '303666': { file: 'Emblem_of_Aridagawa,_Wakayama.svg', license: 'PD-Japan-exempt' }, // 有田川町
  '303828': { file: 'Emblem_of_Hidaka,_Wakayama.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 日高町
  '303836': { file: 'Emblem_of_Yura,_Wakayama.svg', license: 'PD-Japan-organization' }, // 由良町
  '303909': { file: 'Emblem_of_Inami,_Wakayama.svg', license: 'PD-Japan-organization' }, // 印南町
  '303917': { file: 'Emblem_of_Minabe,_Wakayama.svg', license: 'PD-ineligible' }, // みなべ町
  '303925': { file: 'Emblem_of_Hidakagawa,_Wakayama.svg', license: 'PD-Japan-exempt' }, // 日高川町
  '304069': { file: 'Emblem_of_Susami,_Wakayama.svg', license: 'PD-Japan-organization / PD-textlogo' }, // すさみ町
  '304221': { file: 'Emblem_of_Taiji,_Wakayama.svg', license: 'PD-Japan-exempt' }, // 太地町
  '304247': { file: 'Emblem_of_Kozagawa,_Wakayama.svg', license: 'PD-Japan-exempt' }, // 古座川町
  '304280': { file: 'Emblem_of_Kushimoto,_Wakayama.svg', license: 'PD-Japan-exempt' }, // 串本町
  '310000': { file: 'Emblem_of_Tottori_Prefecture.svg', license: 'PD-ineligible' }, // 鳥取県
  '312011': { file: 'Emblem_of_Tottori,_Tottori.svg', license: 'PD-Japan-organization' }, // 鳥取市
  '312029': { file: 'Emblem_of_Yonago,_Tottori.svg', license: 'PD-Japan-organization' }, // 米子市
  '312037': { file: 'Emblem_of_Kurayoshi,_Tottori.svg', license: 'PD-Japan-organization' }, // 倉吉市
  '312045': { file: 'Emblem_of_Sakaiminato,_Tottori.svg', license: 'PD-Japan-organization' }, // 境港市
  '313025': { file: 'Emblem_of_Iwami,_Tottori.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 岩美町
  '313254': { file: 'Emblem_of_Wakasa,_Tottori.svg', license: 'PD-Japan-exempt' }, // 若桜町
  '313297': { file: 'Emblem_of_Yazu,_Tottori.svg', license: 'PD-Japan-exempt' }, // 八頭町
  '313645': { file: 'Emblem_of_Misasa,_Tottori.svg', license: 'PD-Japan-exempt' }, // 三朝町
  '313700': { file: 'Emblem_of_Yurihama,_Tottori.svg', license: 'PD-Japan-exempt' }, // 湯梨浜町
  '313718': { file: 'Emblem_of_Kotoura,_Tottori.svg', license: 'PD-Japan-exempt' }, // 琴浦町
  '313726': { file: 'Emblem_of_Hokuei,_Tottori.svg', license: 'PD-Japan-exempt' }, // 北栄町
  '313840': { file: 'Emblem_of_Hiezu,_Tottori.svg', license: 'PD-Japan-exempt' }, // 日吉津村
  '313866': { file: 'Emblem_of_Daisen,_Tottori.svg', license: 'PD-ineligible' }, // 大山町
  '313891': { file: 'Emblem_of_Nanbu,_Tottori.svg', license: 'PD-Japan-exempt' }, // 南部町
  '313904': { file: 'Emblem_of_Hoki,_Tottori.svg', license: 'PD-Japan-exempt' }, // 伯耆町
  '314021': { file: 'Emblem_of_Hino,_Tottori.svg', license: 'PD-Japan-organization' }, // 日野町
  '314030': { file: 'Emblem_of_Kōfu,_Tottori.svg', license: 'PD-Japan-organization' }, // 江府町
  '320005': { file: 'Emblem_of_Shimane_Prefecture.svg', license: 'PD-ineligible' }, // 島根県
  '322032': { file: 'Emblem_of_Izumo,_Shimane.svg', license: 'PD-Japan-exempt' }, // 出雲市
  '322059': { file: 'Emblem_of_Ōda,_Shimane.svg', license: 'PD-Japan-organization' }, // 大田市
  '322067': { file: 'Emblem_of_Yasugi,_Shimane.svg', license: 'PD-Japan-exempt' }, // 安来市
  '322091': { file: 'Emblem_of_Unnan,_Shimane.svg', license: 'PD-Japan-exempt' }, // 雲南市
  '324418': { file: 'Emblem_of_Kawamoto,_Shimane.svg', license: 'PD-Japan-organization' }, // 川本町
  '324485': { file: 'Emblem_of_Misato,_Shimane.svg', license: 'PD-Japan-exempt' }, // 美郷町
  '324493': { file: 'Emblem_of_Ōnan,_Shimane.svg', license: 'PD-Japan-exempt' }, // 邑南町
  '325015': { file: 'Emblem_of_Tsuwano,_Shimane.svg', license: 'PD-Japan-exempt' }, // 津和野町
  '325252': { file: 'Emblem_of_Ama,_Shimane.svg', license: 'PD-Japan-organization' }, // 海士町
  '325261': { file: 'Emblem_of_Nishinoshima,_Shimane.svg', license: 'PD-Japan-exempt' }, // 西ノ島町
  '325279': { file: 'Emblem_of_Chibu,_Shimane.svg', license: 'PD-Japan-organization' }, // 知夫村
  '325287': { file: 'Emblem_of_Okinoshima,_Shimane.svg', license: 'PD-Japan-exempt' }, // 隠岐の島町
  '330001': { file: 'Emblem_of_Okayama_Prefecture.svg', license: 'PD-ineligible' }, // 岡山県
  '331007': { file: 'Emblem_of_Okayama,_Okayama.svg', license: 'PD-Japan-organization' }, // 岡山市
  '332020': { file: 'Emblem_of_Kurashiki,_Okayama.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 倉敷市
  '332054': { file: 'Emblem_of_Kasaoka,_Okayama.svg', license: 'PD-Japan-organization' }, // 笠岡市
  '332071': { file: 'Emblem_of_Ibara,_Okayama.svg', license: 'PD-Japan-exempt' }, // 井原市
  '332143': { file: 'Emblem_of_Maniwa,_Okayama.svg', license: 'PD-ineligible' }, // 真庭市
  '332151': { file: 'Emblem_of_Mimasaka,_Okayama.svg', license: 'PD-Japan-exempt' }, // 美作市
  '334456': { file: 'Emblem_of_Satosho,_Okayama.svg', license: 'PD-Japan-exempt' }, // 里庄町
  '334618': { file: 'Emblem_of_Yakage,_Okayama.svg', license: 'PD-Japan-exempt' }, // 矢掛町
  '335860': { file: 'Emblem_of_Shinjō,_Okayama.svg', license: 'PD-Japan-exempt' }, // 新庄村
  '336220': { file: 'Emblem_of_Shoo,_Okayama.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 勝央町
  '336432': { file: 'Emblem_of_Nishiawakura,_Okayama.svg', license: 'PD-Japan-exempt' }, // 西粟倉村
  '336637': { file: 'Emblem_of_Kumenan,_Okayama.svg', license: 'PD-Japan-exempt' }, // 久米南町
  '336661': { file: 'Emblem_of_Misaki,_Okayama.svg', license: 'PD-Japan-exempt' }, // 美咲町
  '336815': { file: 'Emblem_of_Kibichūō,_Okayama.svg', license: 'PD-Japan-exempt' }, // 吉備中央町
  '340006': { file: 'Emblem_of_Hiroshima_Prefecture.svg', license: 'PD-shape' }, // 広島県
  '341002': { file: 'Emblem_of_Hiroshima,_Hiroshima.svg', license: 'PD-textlogo' }, // 広島市
  '342025': { file: 'Emblem_of_Kure,_Hiroshima.svg', license: 'PD-Japan-organization' }, // 呉市
  '342033': { file: 'Emblem_of_Takehara,_Hiroshima.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 竹原市
  '342041': { file: 'Emblem_of_Mihara,_Hiroshima.svg', license: 'PD-Japan-exempt' }, // 三原市
  '342050': { file: 'Emblem_of_Onomichi,_Hiroshima.svg', license: 'PD-Japan-organization' }, // 尾道市
  '342076': { file: 'Emblem_of_Fukuyama,_Hiroshima.svg', license: 'PD-Japan-organization' }, // 福山市
  '342084': { file: 'Emblem_of_Fuchū_City,_Hiroshima.svg', license: 'PD-Japan-organization' }, // 府中市
  '342092': { file: 'Emblem_of_Miyoshi,_Hiroshima.svg', license: 'PD-ineligible' }, // 三次市
  '342106': { file: 'Emblem_of_Shōbara,_Hiroshima.svg', license: 'PD-ineligible' }, // 庄原市
  '342114': { file: 'Emblem_of_Otake,_Hiroshima.svg', license: 'PD-Japan-organization' }, // 大竹市
  '342131': { file: 'Emblem_of_Hatsukaichi,_Hiroshima.svg', license: 'PD-Japan-exempt' }, // 廿日市市
  '342149': { file: 'Emblem_of_Akitakata,_Hiroshima.svg', license: 'PD-Japan-exempt' }, // 安芸高田市
  '342157': { file: 'Emblem_of_Etajima,_Hiroshima.svg', license: 'PD-Japan-exempt' }, // 江田島市
  '343072': { file: 'Emblem_of_Kumano,_Hiroshima.svg', license: 'PD-Japan-organization' }, // 熊野町
  '343099': { file: 'Emblem_of_Saka,_Hiroshima.svg', license: 'PD-Japan-exempt' }, // 坂町
  '343684': { file: 'Emblem_of_Akiōta,_Hiroshima.svg', license: 'PD-ineligible' }, // 安芸太田町
  '344311': { file: 'Emblem_of_Osakikamijima,_Hiroshima.svg', license: 'PD-Japan-exempt' }, // 大崎上島町
  '350001': { file: 'Emblem_of_Yamaguchi_Prefecture.svg', license: 'PD-ineligible' }, // 山口県
  '352012': { file: 'Emblem_of_Shimonoseki,_Yamaguchi.svg', license: 'PD-ineligible' }, // 下関市
  '352021': { file: 'Emblem_of_Ube,_Yamaguchi.svg', license: 'PD-Japan-exempt' }, // 宇部市
  '352039': { file: 'Emblem_of_Yamaguchi,_Yamaguchi.svg', license: 'PD-Japan-exempt' }, // 山口市
  '352047': { file: 'Emblem_of_Hagi,_Yamaguchi.svg', license: 'PD-Japan-exempt' }, // 萩市
  '352071': { file: 'Emblem_of_Kudamatsu,_Yamaguchi.svg', license: 'PD-Japan-organization' }, // 下松市
  '352101': { file: 'Emblem_of_Hikari,_Yamaguchi.svg', license: 'PD-Japan-exempt' }, // 光市
  '352110': { file: 'Emblem_of_Nagato,_Yamaguchi.svg', license: 'PD-Japan-exempt' }, // 長門市
  '352128': { file: 'Emblem_of_Yanai,_Yamaguchi.svg', license: 'PD-Japan-exempt' }, // 柳井市
  '353051': { file: 'Emblem_of_Suo-Oshima,_Yamaguchi.svg', license: 'PD-Japan-exempt' }, // 周防大島町
  '353213': { file: 'Emblem_of_Waki,_Yamaguchi.svg', license: 'PD-Japan-exempt' }, // 和木町
  '360007': { file: 'Emblem_of_Tokushima_Prefecture.svg', license: 'PD-ineligible' }, // 徳島県
  '362018': { file: 'Emblem_of_Tokushima,_Tokushima.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 徳島市
  '362026': { file: 'Emblem_of_Naruto,_Tokushima.svg', license: 'PD-Japan-organization / PD-shape' }, // 鳴門市
  '362034': { file: 'Emblem_of_Komatsushima,_Tokushima.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 小松島市
  '362042': { file: 'Emblem_of_Anan,_Tokushima.svg', license: 'PD-Japan-organization' }, // 阿南市
  '362051': { file: 'Emblem_of_Yoshinogawa,_Tokushima.svg', license: 'Pd-ineligible' }, // 吉野川市
  '362069': { file: 'Emblem_of_Awa,_Tokushima.svg', license: 'PD-ineligible' }, // 阿波市
  '362077': { file: 'Emblem_of_Mima,_Tokushima.svg', license: 'PD-Japan-exempt' }, // 美馬市
  '362085': { file: 'Emblem_of_Miyoshi,_Tokushima.svg', license: 'PD-Japan-exempt' }, // 三好市
  '363014': { file: 'Emblem_of_Katsuura,_Tokushima.svg', license: 'PD-Japan-exempt' }, // 勝浦町
  '363022': { file: 'Emblem_of_Kamikatsu,_Tokushima.svg', license: 'PD-Japan-organization' }, // 上勝町
  '363219': { file: 'Emblem_of_Sanagochi,_Tokushima.svg', license: 'PD-ineligible' }, // 佐那河内村
  '363421': { file: 'Emblem_of_Kamiyama,_Tokushima.svg', license: 'PD-Japan-organization' }, // 神山町
  '363685': { file: 'Emblem_of_Naka,_Tokushima.svg', license: 'Pd-ineligible' }, // 那賀町
  '363871': { file: 'Emblem_of_Minami,_Tokushima.svg', license: 'PD-Japan-exempt' }, // 美波町
  '363880': { file: 'Emblem_of_Kaiyo,_Tokushima.svg', license: 'PD-ineligible' }, // 海陽町
  '364011': { file: 'Emblem_of_Matsushige,_Tokushima.svg', license: 'PD-Japan-organization' }, // 松茂町
  '364053': { file: 'Emblem_of_Kamiita,_Tokushima.svg', license: 'PD-Japan-exempt' }, // 上板町
  '364894': { file: 'Emblem_of_Higashimiyoshi,_Tokushima.svg', license: 'PD-Japan-exempt' }, // 東みよし町
  '370002': { file: 'Emblem_of_Kagawa_Prefecture.svg', license: 'PD-Japan-exempt / PD-shape / PD-Japan' }, // 香川県
  '372013': { file: 'Emblem_of_Takamatsu,_Kagawa.svg', license: 'PD-Japan-organization / PD-100' }, // 高松市
  '372021': { file: 'Emblem_of_Marugame,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 丸亀市
  '372030': { file: 'Emblem_of_Sakaide,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 坂出市
  '372048': { file: 'Emblem_of_Zentsuji,_Kagawa.svg', license: 'PD-ineligible' }, // 善通寺市
  '372056': { file: 'Emblem_of_Kanonji,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 観音寺市
  '372064': { file: 'Emblem_of_Sanuki,_Kagawa.svg', license: 'PD-Japan-exempt' }, // さぬき市
  '372072': { file: 'Emblem_of_Higashikagawa,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 東かがわ市
  '372081': { file: 'Emblem_of_Mitoyo,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 三豊市
  '373222': { file: 'Emblem_of_Tonosho,_Kagawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 土庄町
  '373249': { file: 'Emblem_of_Shodoshima,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 小豆島町
  '373419': { file: 'Emblem_of_Miki,_Kagawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 三木町
  '373648': { file: 'Emblem_of_Naoshima,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 直島町
  '373869': { file: 'Emblem_of_Utazu,_Kagawa.svg', license: 'PD-Japan-organization' }, // 宇多津町
  '373877': { file: 'Emblem_of_Ayagawa,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 綾川町
  '374032': { file: 'Emblem_of_Kotohira,_Kagawa.svg', license: 'PD-Japan-exempt' }, // 琴平町
  '374041': { file: 'Emblem_of_Tadotsu,_Kagawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 多度津町
  '374067': { file: 'Emblem_of_Manno,_Kagawa.svg', license: 'PD-Japan-exempt' }, // まんのう町
  '380008': { file: 'Emblem_of_Ehime_prefecture.svg', license: 'PD-Japan-exempt' }, // 愛媛県
  '382035': { file: 'Emblem_of_Uwajima,_Ehime.svg', license: 'PD-ineligible' }, // 宇和島市
  '382043': { file: 'Emblem_of_Yawatahama,_Ehime.svg', license: 'PD-ineligible' }, // 八幡浜市
  '382051': { file: 'Emblem_of_Niihama,_Ehime.svg', license: 'PD-Japan-organization' }, // 新居浜市
  '382060': { file: 'Emblem_of_Saijō,_Ehime.svg', license: 'PD-Japan-exempt' }, // 西条市
  '382078': { file: 'Emblem_of_Ozu,_Ehime.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 大洲市
  '382108': { file: 'Emblem_of_Iyo,_Ehime.svg', license: 'PD-Japan-exempt' }, // 伊予市
  '382132': { file: 'Emblem_of_Shikokuchūō,_Ehime.svg', license: 'PD-Japan-exempt' }, // 四国中央市
  '382141': { file: 'Emblem_of_Seiyo,_Ehime.svg', license: 'PD-ineligible' }, // 西予市
  '382159': { file: 'Emblem_of_Tōon,_Ehime.svg', license: 'PD-Japan-exempt' }, // 東温市
  '383562': { file: 'Emblem_of_Kamijima,_Ehime.svg', license: 'PD-ineligible' }, // 上島町
  '383864': { file: 'Emblem_of_Kumakōgen,_Ehime.svg', license: 'PD-ineligible' }, // 久万高原町
  '384011': { file: 'Emblem_of_Masaki,_Ehime.svg', license: 'PD-Japan-organization' }, // 松前町
  '384020': { file: 'Emblem_of_Tobe,_Ehime.svg', license: 'PD-Japan-organization' }, // 砥部町
  '384887': { file: 'Emblem_of_Kihoku,_Ehime.svg', license: 'PD-Japan-exempt' }, // 鬼北町
  '385069': { file: 'Emblem_of_Ainan,_Ehime.svg', license: 'PD-ineligible' }, // 愛南町
  '390003': { file: 'Emblem_of_Kochi_Prefecture.svg', license: 'PD-textlogo / PD-self' }, // 高知県
  '392014': { file: 'Emblem_of_Kochi,_Kochi.svg', license: 'PD-Japan-organization / PD-1923' }, // 高知市
  '392022': { file: 'Emblem_of_Muroto,_Kōchi.svg', license: 'PD-Japan-exempt' }, // 室戸市
  '392031': { file: 'Emblem_of_Aki,_Kōchi.svg', license: 'PD-Japan-organization' }, // 安芸市
  '392049': { file: 'Emblem_of_Nankoku,_Kochi.svg', license: 'PD-Japan-organization' }, // 南国市
  '392065': { file: 'Emblem_of_Susaki,_Kōchi.svg', license: 'PD-Japan-organization' }, // 須崎市
  '392090': { file: 'Emblem_of_Tosashimizu,_Kochi.svg', license: 'PD-Japan-organization' }, // 土佐清水市
  '392103': { file: 'Emblem_of_Shimanto,_Kōchi.svg', license: 'PD-Japan-exempt' }, // 四万十市
  '392111': { file: 'Emblem_of_Konan,_Kochi.svg', license: 'PD-Japan-exempt' }, // 香南市
  '393011': { file: 'Emblem_of_Toyo,_Kochi.svg', license: 'PD-Japan-organization' }, // 東洋町
  '393029': { file: 'Emblem_of_Nahari,_Kochi.svg', license: 'PD-Japan-exempt' }, // 奈半利町
  '393037': { file: 'Emblem_of_Tano,_Kochi.svg', license: 'PD-Japan-organization' }, // 田野町
  '393053': { file: 'Emblem_of_Kitagawa,_Kochi.svg', license: 'PD-Japan-organization / PD-100' }, // 北川村
  '393061': { file: 'Emblem_of_Umaji,_Kochi.svg', license: 'PD-Japan-exempt' }, // 馬路村
  '393444': { file: 'Emblem_of_Otoyo,_Kochi.svg', license: 'PD-Japan-exempt' }, // 大豊町
  '393631': { file: 'Emblem_of_Tosa-town,_Kochi.svg', license: 'PD-Japan-exempt' }, // 土佐町
  '393860': { file: 'Emblem_of_Ino,_Kochi.svg', license: 'PD-Japan-organization' }, // いの町
  '393878': { file: 'Emblem_of_Niyodogawa,_Kōchi.svg', license: 'PD-Japan-exempt' }, // 仁淀川町
  '394017': { file: 'Emblem_of_Nakatosa,_Kochi.svg', license: 'PD-Japan-exempt' }, // 中土佐町
  '394050': { file: 'Emblem_of_Yusuhara,_Kochi.svg', license: 'PD-Japan-exempt' }, // 檮原町
  '394106': { file: 'Emblem_of_Hidaka,_Kochi.svg', license: 'PD-Japan-exempt' }, // 日高村
  '394114': { file: 'Emblem_of_Tsuno,_Kochi.svg', license: 'PD-Japan-exempt' }, // 津野町
  '394122': { file: 'Emblem_of_Shimanto-town,_Kochi.svg', license: 'PD-Japan-exempt' }, // 四万十町
  '394246': { file: 'Emblem_of_Otsuki,_Kochi.svg', license: 'PD-Japan-organization' }, // 大月町
  '394271': { file: 'Emblem_of_Mihara,_Kochi.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 三原村
  '394289': { file: 'Emblem_of_Kuroshio,_Kochi.svg', license: 'PD-Japan-exempt' }, // 黒潮町
  '400009': { file: 'Emblem_of_Fukuoka_Prefecture.svg', license: 'PD-ineligible' }, // 福岡県
  '401005': { file: 'Emblem_of_Kitakyushu,_Fukuoka.svg', license: 'PD-Japan-organization' }, // 北九州市
  '401307': { file: 'Emblem_of_Fukuoka,_Fukuoka.svg', license: 'PD-Japan-organization / PD-100' }, // 福岡市
  '402028': { file: 'Emblem_of_Omuta,_Fukuoka.svg', license: 'PD-Japan-organization' }, // 大牟田市
  '402036': { file: 'Emblem_of_Kurume,_Fukuoka.svg', license: 'PD-Japan-organization' }, // 久留米市
  '402044': { file: 'Emblem_of_Nogata,_Fukuoka.svg', license: 'PD-textlogo / PD-Japan-organization' }, // 直方市
  '402061': { file: 'Emblem_of_Tagawa,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 田川市
  '402117': { file: 'Emblem_of_Chikugo,_Fukuoka.svg', license: 'PD-Japan-organization' }, // 筑後市
  '402141': { file: 'Emblem_of_Buzen,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 豊前市
  '402150': { file: 'Emblem_of_Nakama,_Fukuoka.svg', license: 'PD-Japan-organization' }, // 中間市
  '402184': { file: 'Emblem_of_Kasuga,_Fukuoka.svg', license: 'PD-Japan-organization' }, // 春日市
  '402206': { file: 'Emblem_of_Munakata,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 宗像市
  '402214': { file: 'Emblem_of_Dazaifu,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 太宰府市
  '402231': { file: 'Emblem_of_Koga,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 古賀市
  '402281': { file: 'Emblem_of_Asakura,_Fukuoka.svg', license: 'PD-ineligible' }, // 朝倉市
  '403423': { file: 'Emblem_of_Sasaguri,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 篠栗町
  '403431': { file: 'Emblem_of_Shime,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 志免町
  '403440': { file: 'Emblem_of_Sue,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 須恵町
  '403458': { file: 'Emblem_of_Shingu,_Fukuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 新宮町
  '403482': { file: 'Emblem_of_Hisayama,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 久山町
  '403491': { file: 'Emblem_of_Kasuya,_Fukuoka_(black).svg', license: 'PD-Japan-organization / PD-textlogo' }, // 粕屋町
  '403814': { file: 'Emblem_of_Ashiya,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 芦屋町
  '403822': { file: 'Emblem_of_Mizumaki,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 水巻町
  '403831': { file: 'Emblem_of_Okagaki,_Fukuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 岡垣町
  '403849': { file: 'Emblem_of_Onga,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 遠賀町
  '404012': { file: 'Emblem_of_Kotake,_Fukuoka.svg', license: 'PD-Japan-organization' }, // 小竹町
  '404217': { file: 'Emblem_of_Keisen,_Fukuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 桂川町
  '405035': { file: 'Emblem_of_Tachiarai,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 大刀洗町
  '405221': { file: 'Emblem_of_Oki,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 大木町
  '405442': { file: 'Emblem_of_Hirokawa,_Fukuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 広川町
  '406023': { file: 'Emblem_of_Soeda,_Fukuoka.svg', license: 'PD-100' }, // 添田町
  '406040': { file: 'Emblem_of_Itoda,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 糸田町
  '406058': { file: 'Emblem_of_Kawasaki,_Fukuoka.svg', license: 'PD-ineligible' }, // 川崎町
  '406082': { file: 'Emblem_of_Oto,_Fukuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 大任町
  '406104': { file: 'Emblem_of_Fukuchi,_Fukuoka.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 福智町
  '406210': { file: 'Emblem_of_Kanda,_Fukuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 苅田町
  '406252': { file: 'Emblem_of_Miyako,_Fukuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // みやこ町
  '406422': { file: 'Emblem_of_Yoshitomi,_Fukuoka.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 吉富町
  '406465': { file: 'Emblem_of_Koge,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 上毛町
  '406473': { file: 'Emblem_of_Chikujo,_Fukuoka.svg', license: 'PD-Japan-exempt' }, // 築上町
  '410004': { file: 'Emblem_of_Saga_Prefecture.svg', license: 'PD-Japan-organization / PD-1996' }, // 佐賀県
  '412015': { file: 'Emblem_of_Saga,_Saga.svg', license: 'PD-Japan-exempt' }, // 佐賀市
  '412104': { file: 'Emblem_of_Kanzaki,_Saga.svg', license: 'PD-Japan-exempt' }, // 神埼市
  '413411': { file: 'Emblem_of_Kiyama,_Saga.svg', license: 'PD-Japan-exempt' }, // 基山町
  '414018': { file: 'Emblem_of_Arita,_Saga.svg', license: 'PD-Japan-exempt' }, // 有田町
  '414417': { file: 'Emblem_of_Tara,_Saga.svg', license: 'PD-textlogo' }, // 太良町
  '420000': { file: 'Emblem_of_Nagasaki_Prefecture.svg', license: 'PD-Japan-exempt' }, // 長崎県
  '422011': { file: 'Nagasaki_Nagasaki_chapter.svg', license: 'PD-Japan-organization' }, // 長崎市
  '422045': { file: 'Emblem_of_Isahaya,_Nagasaki.svg', license: 'PD-Japan-exempt' }, // 諫早市
  '422070': { file: 'Emblem_of_Hirado,_Nagasaki.svg', license: 'PD-Japan-exempt' }, // 平戸市
  '422088': { file: 'Emblem_of_Matsuura,_Nagasaki.svg', license: 'PD-Japan-exempt' }, // 松浦市
  '422100': { file: 'Emblem_of_Iki,_Nagasaki.svg', license: 'PD-Japan-exempt' }, // 壱岐市
  '422126': { file: 'Emblem_of_Saikai,_Nagasaki.svg', license: 'PD-Japan-exempt' }, // 西海市
  '422134': { file: 'Emblem_of_Unzen,_Nagasaki.svg', license: 'PD-Japan-exempt' }, // 雲仙市
  '423084': { file: 'Emblem_of_Togitsu,_Nagasaki.svg', license: 'PD-ineligible' }, // 時津町
  '423831': { file: 'Emblem_of_Ojika,_Nagasaki.svg', license: 'PD-Japan-exempt' }, // 小値賀町
  '424111': { file: 'Emblem_of_Shinkamigoto,_Nagasaki.svg', license: 'PD-Japan-exempt' }, // 新上五島町
  '430005': { file: 'Emblem_of_Kumamoto_Prefecture.svg', license: 'PD-Japan-organization' }, // 熊本県
  '431001': { file: 'Emblem_of_Kumamoto,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 熊本市
  '432024': { file: 'Emblem_of_Yatsushiro,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 八代市
  '432032': { file: 'Emblem_of_Hitoyoshi,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 人吉市
  '432041': { file: 'Emblem_of_Arao,_Kumamoto.svg', license: 'PD-Japan-organization' }, // 荒尾市
  '432105': { file: 'Emblem_of_Kikuchi,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 菊池市
  '432113': { file: 'Emblem_of_Uto_Kumamoto.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 宇土市
  '432121': { file: 'Emblem_of_Kamiamakusa,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 上天草市
  '433489': { file: 'Emblem_of_Misato,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 美里町
  '433641': { file: 'Emblem_of_Gyokuto,_Kumamoto.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 玉東町
  '433691': { file: 'Emblem_of_Nagomi,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 和水町
  '434043': { file: 'Emblem_of_Kikuyo,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 菊陽町
  '434248': { file: 'Emblem_of_Oguni,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 小国町
  '434256': { file: 'Emblem_of_Ubuyama,_Kumamoto.svg', license: 'PD-Japan-exempt / PD-shape' }, // 産山村
  '434337': { file: 'Emblem_of_Minamiaso,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 南阿蘇村
  '434426': { file: 'Emblem_of_Kashima,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 嘉島町
  '434434': { file: 'Emblem_of_Mashiki,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 益城町
  '434680': { file: 'Emblem_of_Hikawa,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 氷川町
  '434825': { file: 'Emblem_of_Ashikita,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 芦北町
  '434841': { file: 'Emblem_of_Tsunagi,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 津奈木町
  '435074': { file: 'Emblem_of_Mizukami,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 水上村
  '435104': { file: 'Emblem_of_Sagara,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 相良村
  '435112': { file: 'Emblem_of_Itsuki,_Kumamoto.svg', license: 'PD-Japan-exempt' }, // 五木村
  '435139': { file: 'Emblem_of_Kuma,_Kumamoto.svg', license: 'PD-ineligible' }, // 球磨村
  '435147': { file: 'Emblem_of_Asagiri,_Kumamoto.svg', license: 'PD-ineligible' }, // あさぎり町
  '435317': { file: 'Emblem_of_Reihoku,_Kumamoto_(gradient).svg', license: 'PD-Japan-organization / PD-textlogo' }, // 苓北町
  '440001': { file: 'Emblem_of_Oita_Prefecture.svg', license: 'PD-ineligible' }, // 大分県
  '442011': { file: 'Emblem_of_Oita,_Oita.svg', license: 'PD-Japan-organization' }, // 大分市
  '442046': { file: 'Emblem_of_Hita,_Oita.svg', license: 'PD-Japan-exempt' }, // 日田市
  '442054': { file: 'Emblem_of_Saiki,_Oita.svg', license: 'PD-Japan-exempt' }, // 佐伯市
  '442062': { file: 'Emblem_of_Usuki,_Oita.svg', license: 'PD-Japan-exempt' }, // 臼杵市
  '442071': { file: 'Emblem_of_Tsukumi,_Oita.svg', license: 'PD-Japan-exempt' }, // 津久見市
  '442097': { file: 'Emblem_of_Bungotakada,_Oita.svg', license: 'PD-Japan-exempt' }, // 豊後高田市
  '442101': { file: 'Emblem_of_Kitsuki,_Oita.svg', license: 'PD-Japan-exempt' }, // 杵築市
  '442119': { file: 'Emblem_of_Usa,_Oita.svg', license: 'PD-Japan-exempt' }, // 宇佐市
  '442135': { file: 'Emblem_of_Yufu,_Oita.svg', license: 'PD-Japan-exempt' }, // 由布市
  '442143': { file: 'Emblem_of_Kunisaki,_Oita.svg', license: 'PD-ineligible' }, // 国東市
  '444618': { file: 'Emblem_of_Kokonoe,_Oita_(black).svg', license: 'PD-Japan-exempt' }, // 九重町
  '450006': { file: 'Emblem_of_Miyazaki_Prefecture.svg', license: 'PD-Japan-organization / PD-1923' }, // 宮崎県
  '452025': { file: 'Emblem_of_Miyakonojo,_Miyazaki.svg', license: 'PD-ineligible' }, // 都城市
  '452041': { file: 'Emblem_of_Nichinan,_Miyazaki.svg', license: 'PD-Japan-exempt' }, // 日南市
  '452050': { file: 'Emblem_of_Kobayashi,_Miyazaki.svg', license: 'PD-Japan-exempt' }, // 小林市
  '453412': { file: 'Emblem_of_Mimata,_Miyazaki.svg', license: 'PD-Japan-organization' }, // 三股町
  '454010': { file: 'Emblem_of_Takanabe,_Miyazaki.svg', license: 'PD-Japan-organization' }, // 高鍋町
  '454061': { file: 'Emblem_of_Tsuno,_Miyazaki.svg', license: 'PD-Japan-organization' }, // 都農町
  '454303': { file: 'Emblem_of_Shiiba_Miyazaki.svg', license: 'PD-Japan-exempt' }, // 椎葉村
  '454311': { file: 'Emblem_of_Misato,_Miyazaki.svg', license: 'PD-Japan-exempt' }, // 美郷町
  '454427': { file: 'Emblem_of_Hinokage,_Miyazaki.svg', license: 'PD-Japan-organization' }, // 日之影町
  '454435': { file: 'Emblem_of_Gokase,_Miyazaki.svg', license: 'PD-Japan-organization' }, // 五ヶ瀬町
  '460001': { file: 'Emblem_of_Kagoshima_Prefecture.svg', license: 'PD-Japan-exempt' }, // 鹿児島県
  '462012': { file: 'Emblem_of_Kagoshima,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 鹿児島市
  '462039': { file: 'Emblem_of_Kanoya,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 鹿屋市
  '462080': { file: 'Emblem_of_Izumi,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 出水市
  '462101': { file: 'Emblem_of_Ibusuki,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 指宿市
  '462136': { file: 'Emblem_of_Nishinoomote,_Kagoshima.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 西之表市
  '462144': { file: 'Emblem_of_Tarumizu,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 垂水市
  '462152': { file: 'Emblem_of_Satsumasendai,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 薩摩川内市
  '462161': { file: 'Emblem_of_Hioki,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 日置市
  '462187': { file: 'Emblem_of_Kirishima,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 霧島市
  '462225': { file: 'Emblem_of_Amami,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 奄美市
  '462233': { file: 'Emblem_of_Minamikyushu,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 南九州市
  '462241': { file: 'Emblem_of_Isa,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 伊佐市
  '463035': { file: 'Emblem_of_Mishima,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 三島村
  '463043': { file: 'Emblem_of_Toshima,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 十島村
  '463922': { file: 'Emblem_of_Satsuma,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // さつま町
  '464040': { file: 'Emblem_of_Nagashima,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 長島町
  '464520': { file: 'Emblem_of_Yusui,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 湧水町
  '464686': { file: 'Emblem_of_Ōsaki,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 大崎町
  '464902': { file: 'Emblem_of_Kinko,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 錦江町
  '464911': { file: 'Emblem_of_Minamiosumi,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 南大隅町
  '464929': { file: 'Emblem_of_Kimotsuki,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 肝付町
  '465011': { file: 'Emblem_of_Nakatanega,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 中種子町
  '465020': { file: 'Emblem_of_Minamitane,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 南種子町
  '465054': { file: 'Emblem_of_Yakushima,_Kagoshima.svg', license: 'PD-ineligible' }, // 屋久島町
  '465232': { file: 'Emblem_of_Yamato,_Kagoshima.svg', license: 'PD-Japan-exempt / PD-shape' }, // 大和村
  '465241': { file: 'Emblem_of_Uken,_Kagoshima.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 宇検村
  '465259': { file: 'Emblem_of_Setouchi,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 瀬戸内町
  '465275': { file: 'Emblem_of_Tatsugo,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 龍郷町
  '465291': { file: 'Emblem_of_Kikai,_Kagoshima.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 喜界町
  '465305': { file: 'Emblem_of_Tokunoshima,_Kagoshima.svg', license: 'PD-Japan-organization / PD-Japan-exempt' }, // 徳之島町
  '465313': { file: 'Emblem_of_Amagi,_Kagoshima.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 天城町
  '465321': { file: 'Emblem_of_Isen,_Kagoshima.svg', license: 'PD-Japan-exempt' }, // 伊仙町
  '465330': { file: 'Emblem_of_Wadomari,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 和泊町
  '465348': { file: 'Emblem_of_China,_Kagoshima.svg', license: 'PD-Japan-organization' }, // 知名町
  '465356': { file: 'Emblem_of_Yoron,_Kagoshima.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 与論町
  '470007': { file: 'Emblem_of_Okinawa_Prefecture.svg', license: 'PD-Japan-exempt / PD-shape' }, // 沖縄県
  '472018': { file: 'Emblem_of_Naha,_Okinawa.svg', license: 'PD-Japan-organization / PD-100' }, // 那覇市
  '472051': { file: 'Emblem_of_Ginowan,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 宜野湾市
  '472077': { file: 'Emblem_of_Ishigaki,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 石垣市
  '472085': { file: 'Emblem_of_Urasoe,_Okinawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 浦添市
  '472093': { file: 'Emblem_of_Nago,_Okinawa.svg', license: 'PD-textlogo' }, // 名護市
  '472107': { file: 'Emblem_of_Itoman,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 糸満市
  '472115': { file: 'Emblem_of_Okinawa,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 沖縄市
  '472123': { file: 'Emblem_of_Tomigusuku,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 豊見城市
  '472131': { file: 'Emblem_of_Uruma,_Okinawa.svg', license: 'PD-Japan-exempt' }, // うるま市
  '472140': { file: 'Emblem_of_Miyakojima,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 宮古島市
  '472158': { file: 'Emblem_of_Nanjo,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 南城市
  '473014': { file: 'Emblem_of_Kunigami,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 国頭村
  '473022': { file: 'Emblem_of_Ōgimi,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 大宜味村
  '473031': { file: 'Emblem_of_Higashi,_Okinawa.svg', license: 'PD-Japan-organization' }, // 東村
  '473065': { file: 'Emblem_of_Nakijin,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 今帰仁村
  '473081': { file: 'Emblem_of_Motobu,_Okinawa.svg', license: 'PD-Japan-exempt / PD-textlogo' }, // 本部町
  '473111': { file: 'Emblem_of_Onna,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 恩納村
  '473138': { file: 'Emblem_of_Ginoza,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 宜野座村
  '473146': { file: 'Emblem_of_Kin,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 金武町
  '473154': { file: 'Emblem_of_Ie,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 伊江村
  '473243': { file: 'Emblem_of_Yomitan,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 読谷村
  '473251': { file: 'Emblem_of_Kadena,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 嘉手納町
  '473260': { file: 'Emblem_of_Chatan,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 北谷町
  '473278': { file: 'Emblem_of_Kitanakagusuku,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 北中城村
  '473286': { file: 'Emblem_of_Nakagusuku,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 中城村
  '473294': { file: 'Emblem_of_Nishihara,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 西原町
  '473481': { file: 'Emblem_of_Yonabaru,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 与那原町
  '473502': { file: 'Emblem_of_Haebaru,_Okinawa.svg', license: 'PD-Japan-organization' }, // 南風原町
  '473537': { file: 'Emblem_of_Tokashiki,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 渡嘉敷村
  '473545': { file: 'Emblem_of_Zamami,_Okinawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 座間味村
  '473553': { file: 'Emblem_of_Aguni,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 粟国村
  '473561': { file: 'Emblem_of_Tonaki,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 渡名喜村
  '473570': { file: 'Emblem_of_Minamidaito,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 南大東村
  '473596': { file: 'Emblem_of_Iheya,_Okinawa.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 伊平屋村
  '473600': { file: 'Emblem_of_Izena,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 伊是名村
  '473618': { file: 'Emblem_of_Kumejima,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 久米島町
  '473626': { file: 'Emblem_of_Yaese,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 八重瀬町
  '473821': { file: 'Emblem_of_Yonaguni,_Okinawa.svg', license: 'PD-Japan-exempt' }, // 与那国町
}
