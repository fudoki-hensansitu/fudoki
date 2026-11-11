// 自治体の頁の見出しとホームに出す都市像。各自治体の基本計画（基本構想）に載っている文をそのまま写す。集め方は .agents/skills/web-app/references/jurisdiction-page.md
export interface Vision {
  text: string
  /** 都市像が載っている公式サイトの頁か PDF */
  source: string
}

export const VISIONS: Record<string, Vision> = {
  // 東京都
  '130001': {
    text: '世界で一番の都市・東京',
    source: 'https://www.seisakukikaku.metro.tokyo.lg.jp/documents/d/seisakukikaku/2050tokyo-pocket',
  },
  // 中央区
  '131024': {
    text: '輝く未来へ橋をかける 人が集まる粋なまち',
    source: 'https://www.city.chuo.lg.jp/a0001/kusei/kousoukeikaku/kihonkoso/h2906/kuchouaisatu.html',
  },
  // 港区
  '131032': {
    text: 'やすらぎある世界都心・MINATO',
    source: 'https://www.city.minato.tokyo.jp/kikaku/kuse/shisaku/kihonkoso/koso.html',
  },
  // 新宿区
  '131041': {
    text: '「新宿力」で創造する、やすらぎとにぎわいのまち',
    source: 'https://www.city.shinjuku.lg.jp/kusei/kikaku01_002197.html',
  },
  // 文京区
  '131059': {
    text: '歴史と文化と緑に育まれた、みんなが主役のまち「文の京」',
    source: 'https://www.city.bunkyo.lg.jp/b001/p005541.html',
  },
  // 台東区
  '131067': {
    text: '世界に輝く ひと まち たいとう',
    source: 'https://www.city.taito.lg.jp/kusei/kunokeikaku/kihonkoso/kihonkousou/015811042018112814.files/taitoku_kihonkoso.pdf',
  },
  // 墨田区
  '131075': {
    text: '人がつながり 夢をカタチに 墨田区',
    source: 'https://www.city.sumida.lg.jp/kugikai/kaigi_info/teireikai/2025/0709gian.files/0709kousou.pdf',
  },
  // 江東区
  '131083': {
    text: 'みんなでつくる伝統、未来、水彩都市・江東',
    source: 'https://www.city.koto.lg.jp/010162/kuse/shisaku/kekaku/kekakur0211/choukikeikaku0211.html',
  },
  // 品川区
  '131091': {
    text: '輝く笑顔 住み続けたいまち しながわ',
    source: 'https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/004/987/kihonkoso0327.pdf',
  },
  // 目黒区
  '131105': {
    text: 'さくら咲き 心地よいまち ずっと めぐろ',
    source: 'https://www.city.meguro.tokyo.jp/kikakukeiei/kusei/keikaku/kihonkoso_r3.html',
  },
  // 大田区
  '131113': {
    text: '心やすらぎ 未来へはばたく 笑顔のまち 大田区',
    source: 'https://www.city.ota.tokyo.jp/kuseijoho/ota_plan/kihonkousou/shin_kihonkousou/ota-kihonkousou_r6.files/ota_kihonkoso_r6.pdf',
  },
  // 世田谷区
  '131121': {
    text: '信頼関係に支えられてだれもが安心して暮らすことができる都市',
    source: 'https://www.city.setagaya.lg.jp/02005/5962.html',
  },
  // 渋谷区
  '131130': {
    text: 'ちがいを ちからに 変える街。渋谷区',
    source: 'https://www.city.shibuya.tokyo.jp/kusei/shisaku/koso/koso.html',
  },
  // 中野区
  '131148': {
    text: 'つながる はじまる なかの',
    source: 'https://www.city.tokyo-nakano.lg.jp/kusei/kousou/kihonrinen/kihonkousou/kihonkoso-r3.html',
  },
  // 杉並区
  '131156': {
    text: 'みどり豊かな 住まいのみやこ',
    source: 'https://www.city.suginami.tokyo.jp/s010/2105.html',
  },
  // 豊島区
  '131164': {
    text: '未来へ ひびきあう 人 まち・としま',
    source: 'https://www.city.toshima.lg.jp/001/documents/p4-7kihonkousoukihonkeikaku.pdf',
  },
  // 北区
  '131172': {
    text: 'ともにつくる だれもが住みよい 彩り豊かな躍動するまち 北区',
    source: 'https://www.city.kita.tokyo.jp/kikaku/kuse/shisaku/koso/koso.html',
  },
  // 荒川区
  '131181': {
    text: '幸福実感都市あらかわ',
    source: 'https://www.city.arakawa.tokyo.jp/documents/1636/02_kihonkeikaku_1syou.pdf',
  },
  // 板橋区
  '131199': {
    text: '未来をひらく 緑と文化のかがやくまち“板橋”',
    source: 'https://www.city.itabashi.tokyo.jp/kusei/seisakukeiei/kihon/1060138.html',
  },
  // 練馬区
  '131202': {
    text: 'みどりや農に囲まれた都心に近く住みやすいまち練馬',
    source: 'https://www.city.nerima.tokyo.jp/kusei/sougoukeikaku/vision3/vision3rd20240401.files/vision3rd-all.pdf',
  },
  // 足立区
  '131211': {
    text: '協創力でつくる 活力にあふれ 進化し続ける ひと・まち 足立',
    source: 'https://www.city.adachi.tokyo.jp/sesaku/kihonkousoukeikaku.html',
  },
  // 葛飾区
  '131229': {
    text: 'みんなでつくる、水と緑と人情が輝く暮らしやすいまち・葛飾',
    source: 'https://www.city.katsushika.lg.jp/_res/projects/default_project/_page_/001/026/642/gaiyou.pdf',
  },
  // 江戸川区
  '131237': {
    text: 'ともに、生きる。江戸川区',
    source: 'https://www.city.edogawa.tokyo.jp/e001/kuseijoho/keikaku/kuseiunei/kyosei/torikumi/vision/index.html',
  },
  // 八王子市
  '132012': {
    text: '人とひと、人と自然が響き合い、みんなで幸せを紡ぐまち八王子',
    source: 'https://www.city.hachioji.tokyo.jp/shisei/001/001/005/001/p031827.html',
  },
  // 立川市
  '132021': {
    text: '魅力咲きほこり つどい華やぐまち 立川',
    source: 'https://www.city.tachikawa.lg.jp/shisei/sesaku/1006565/1023910.html',
  },
  // 武蔵野市
  '132039': {
    text: '誰もが安心して暮らし続けられる魅力と活力があふれるまち',
    source: 'https://www.city.musashino.lg.jp/_res/projects/default_project/_page_/001/024/760/dairokki_toshin.pdf',
  },
  // 三鷹市
  '132047': {
    text: 'あすへのまち三鷹',
    source: 'https://www.city.mitaka.lg.jp/c_service/012/012731.html',
  },
  // 青梅市
  '132055': {
    text: '美しい山と渓谷に抱かれ、東京に暮らす 青梅',
    source: 'https://www.city.ome.tokyo.jp/soshiki/3/17.html',
  },
  // 府中市
  '132063': {
    text: 'きずなを紡ぎ 未来を拓く 心ゆたかに暮らせるまち 府中',
    source: 'https://www.city.fuchu.tokyo.jp/gyosei/kekaku/kekaku/gyosei/sogokekaku/sogo7zenki/dai7jifuchusisougoukeikaku.files/fuchu_sogokeikaku_gaiyo.pdf',
  },
  // 昭島市
  '132071': {
    text: '水と緑が育む ふるさと昭島',
    source: 'https://www.city.akishima.lg.jp/shisei/keikaku/1005193/1005194.html',
  },
  // 調布市
  '132080': {
    text: 'ともに生き ともに創る 彩りのまち調布',
    source: 'https://www.city.chofu.lg.jp/010010/p000090.html',
  },
  // 町田市
  '132098': {
    text: 'なんだ かんだ まちだ',
    source: 'https://www.city.machida.tokyo.jp/shisei/sinokeikau/kihonkousou-kihonkeikaku/machida-miraizukuri-vision2040.html',
  },
  // 小金井市
  '132101': {
    text: 'いかそうみどり 増やそう笑顔 つなごう人の輪 小金井市',
    source: 'https://www.city.koganei.lg.jp/shisei/seisakukeikaku/tyokikankeisiryo/daigoji-zenki/tyoukisingikai/toushin.files/03toushin.pdf',
  },
  // 日野市
  '132128': {
    text: 'しあわせのタネを育てあう日野',
    source: 'https://www.city.hino.lg.jp/shisei/keikaku/zentai/1019642/1023089.html',
  },
  // 東村山市
  '132136': {
    text: 'みどり にぎわい いろどり豊かに 笑顔つながる 東村山',
    source: 'https://www.city.higashimurayama.tokyo.jp/shisei/keikaku/sogo/sougoukeikaku5/files/5koukikeikakuann.pdf',
  },
  // 国立市
  '132152': {
    text: '文教都市くにたち',
    source: 'https://www.city.kunitachi.tokyo.jp/material/files/group/6/01_001.pdf',
  },
  // 福生市
  '132187': {
    text: '人を育み 夢を育む 未来につながるまち ふっさ',
    source: 'https://www.city.fussa.tokyo.jp/_res/projects/default_project/_page_/001/009/660/keikaku5ki_zennpebn.pdf',
  },
  // 狛江市
  '132195': {
    text: 'ともに創る 文化育むまち ～水と緑の狛江～',
    source: 'https://www.city.komae.tokyo.jp/_resources/content/99757/20200409-102749.pdf',
  },
  // 東大和市
  '132209': {
    text: '水と緑と笑顔が輝くまち 東大和',
    source: 'https://www.city.higashiyamato.lg.jp/shisei/keikaku/1005130/1005131.html',
  },
  // 清瀬市
  '132217': {
    text: 'ともに未来をひらき 笑顔とみどりがあふれるまち 清瀬',
    source: 'https://www.city.kiyose.lg.jp/siseijouhou/keikakusisaku/kihonkousoukeikaku/1004591/index.html',
  },
  // 東久留米市
  '132225': {
    text: 'みんないきいき 活力あふれる 湧水のまち 東久留米',
    source: 'https://www.city.higashikurume.lg.jp/shisei/sesaku/keikaku/choki/1011913/1017092.html',
  },
  // 武蔵村山市
  '132233': {
    text: '人と人との絆をつむぐ 誰もが活躍できるまち むさしむらやま',
    source: 'https://www.city.musashimurayama.lg.jp/shisei/shisaku/plan/1010558.html',
  },
  // 多摩市
  '132241': {
    text: 'つながり 支え 認め合い いきいきと かがやけるまち 多摩',
    source: 'https://www.city.tama.lg.jp/shisei/keikaku/sougoukeikaku/jiki/1013553.html',
  },
  // 稲城市
  '132250': {
    text: '緑につつまれ 友愛に満ちた市民のまち 稲城',
    source: 'https://www.city.inagi.tokyo.jp/shisei/keikaku_hokoku/1008815/1008816/1008817/1008820.html',
  },
  // 羽村市
  '132276': {
    text: 'まちに広がる笑顔と活気 もっと！くらしやすいまち はむら',
    source: 'https://www.city.hamura.tokyo.jp/0000016056.html',
  },
  // あきる野市
  '132284': {
    text: '豊かな自然と人々の絆に包まれ 人やまち、文化を育む 安全・安心なまち あきる野',
    source: 'https://www.city.akiruno.tokyo.jp/0000014162.html',
  },
  // 西東京市
  '132292': {
    text: 'ともにみらいにつなぐ やさしさといこいの西東京',
    source: 'https://www.city.nishitokyo.lg.jp/siseizyoho/sesaku_keikaku/sougou_keikaku/3_sougoukeikaku/granddezain.files/granddezain.pdf',
  },
  // 瑞穂町
  '133035': {
    text: 'すみたいまち つながるまち あたらしいまち',
    source: 'https://www.town.mizuho.tokyo.jp/tyosei/002/001/002/p008109.html',
  },
  // 日の出町
  '133051': {
    text: '暮らしたくなるまち',
    source: 'https://www.town.hinode.tokyo.jp/0000004579.html',
  },
  // 檜原村
  '133078': {
    text: '自然に育まれ 活力と幸せあふれる檜原村',
    source: 'https://www.vill.hinohara.tokyo.jp/cmsfiles/contents/0000001/1812/1-souron-image.pdf',
  },
  // 奥多摩町
  '133086': {
    text: '自然の中で わたしが くらし つながり 挑戦できる おくたま',
    source: 'https://www.town.okutama.tokyo.jp/1/kikakuzaiseika/shisaku_keikaku/choukisougoukeikaku/3241.html',
  },
  // 利島村
  '133621': {
    text: '生き生きとした活力のある島 自立する村 利島',
    source: 'https://www.toshimamura.org/fs/1/6/4/3/3/9/_/____4__________________4____7__.pdf',
  },
  // 八丈町
  '134015': {
    text: 'ともに支えあうあたたかい町',
    source: 'https://www.town.hachijo.tokyo.jp/chousei/hachijojima-g/kihon-kousou/',
  },
}
