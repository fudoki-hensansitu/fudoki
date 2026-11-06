// 自治体の紋章（都章・区章・市章・町村章）。SVG は public/jurisdictions/<code>/emblem.svg に置く。
// どれも Wikimedia Commons で Public domain とされている SVG をそのまま使う。file は Commons の File 名、license は Commons の著作権タグ
export interface Emblem {
  file: string
  license: string
}

export const EMBLEMS: Record<string, Emblem> = {
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
  '281000': { file: 'Emblem_of_Kobe,_Hyogo.svg', license: 'PD-Japan-organization / PD-textlogo' }, // 神戸市
}

export const commonsUrl = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`
