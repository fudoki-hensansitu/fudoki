// 自治体の頁の見出しとホームに出す都市像。各自治体の基本計画（基本構想）に載っている文をそのまま写す。集め方は .agents/skills/web-app/references/jurisdiction-page.md
export interface Vision {
  text: string
  /** 都市像が載っている公式サイトの頁か PDF */
  source: string
}

export const VISIONS: Record<string, Vision> = {
  // 北海道
  '010006': {
    text: '北海道の力が日本そして世界を変えていく 一人ひとりが豊かで安心して住み続けられる地域を創る',
    source: 'https://www.pref.hokkaido.lg.jp/fs/1/0/7/7/4/5/0/7/_/%E6%A6%82%E8%A6%81%E7%89%88.pdf',
  },
  // 札幌市
  '011002': {
    text: '「ひと」「ゆき」「みどり」の織りなす輝きが、豊かな暮らしと新たな価値を創る、持続可能な世界都市・さっぽろ',
    source: 'https://www.city.sapporo.jp/kikaku/vision/vision2/documents/honsyo_13_mezasubekitoshizoto.pdf',
  },
  // 函館市
  '012025': {
    text: '北のクロスロード ＨＡＫＯＤＡＴＥ ～ともに始める 未来を拓く～',
    source: 'https://www.city.hakodate.hokkaido.jp/docs/2016122100014/file_contents/2016122100014_hk_docs_2016122100014_files_04_zissikeikaku_2017-2020.pdf',
  },
  // 小樽市
  '012033': {
    text: '自然と人が紡ぐ笑顔あふれるまち 小樽 ～あらたなる１００年の歴史へ～',
    source: 'https://www.city.otaru.lg.jp/docs/2024072900011/file_contents/dai7ji_kihon.pdf',
  },
  // 旭川市
  '012041': {
    text: '世界にきらめく いきいき旭川 ～笑顔と自然あふれる 北の拠点～',
    source: 'https://www.city.asahikawa.hokkaido.jp/700/735/736/738/p006642_d/fil/kousou.pdf',
  },
  // 室蘭市
  '012050': {
    text: '室蘭が好き。みんなで創る、住み続けたいまち～まち・ひと・みなと つながりが未来を創る～',
    source: 'https://www.city.muroran.lg.jp/administration/?content=2682',
  },
  // 釧路市
  '012068': {
    text: 'つながる まち・ひと・みらい ひがし北海道の拠点都市・釧路',
    source: 'https://www.city.kushiro.lg.jp/_res/projects/default_project/_page_/001/007/078/000120519.pdf',
  },
  // 帯広市
  '012076': {
    text: 'あおあお ひろびろ いきいき 未来を信じる 帯広',
    source: 'https://www.city.obihiro.hokkaido.jp/_res/projects/default_project/_page_/001/007/323/00_7th_comprehensiveplan.pdf',
  },
  // 北見市
  '012084': {
    text: 'ひと・まち・自然きらめく オホーツク中核都市 ― 未来を拓く活力創造都市 北見 ―',
    source: 'https://www.city.kitami.lg.jp/common/img/content/content_20250521_142222.pdf',
  },
  // 岩見沢市
  '012106': {
    text: '人と緑とまちがつながり ともに育み未来をつくる 健康経営都市',
    source: 'https://www.city.iwamizawa.hokkaido.jp/material/files/group/7/1110.pdf',
  },
  // 網走市
  '012114': {
    text: '豊かな自然に ひと・もの・まちが輝く健康都市 網走',
    source: 'https://www.city.abashiri.hokkaido.jp/soshiki/2/20430.html',
  },
  // 留萌市
  '012122': {
    text: 'みんなでつくる まち・ひと・きぼう 次の時代へ続く留萌',
    source: 'https://www.e-rumoi.jp/content/000010222.pdf',
  },
  // 苫小牧市
  '012131': {
    text: '人間環境都市',
    source: 'https://www.city.tomakomai.hokkaido.jp/shisei/shisei/shiseihoshin/kikaku/sogokeikaku.html',
  },
  // 稚内市
  '012149': {
    text: '海と大地と風の恵み 人が輝き挑戦し続けるまち稚内',
    source: 'https://www.city.wakkanai.hokkaido.jp/files/00013100/00013176/5sookeikaku06.pdf',
  },
  // 美唄市
  '012157': {
    text: 'ともに支え合い 分かち合う 田園文化創造都市 びばい',
    source: 'https://www.city.bibai.hokkaido.jp/soshiki/3/9198.html',
  },
  // 芦別市
  '012165': {
    text: 'みんなで築く 豊かで住みよい 人と文化の輝くまち',
    source: 'https://www.city.ashibetsu.hokkaido.jp/docs/2063961.html',
  },
  // 江別市
  '012173': {
    text: '幸せが未来へつづくまち えべつ',
    source: 'https://www.city.ebetsu.hokkaido.jp/site/nanajisoukei/',
  },
  // 赤平市
  '012181': {
    text: 'ひと・自然・産業が輝く 協働と共創のまち 赤平',
    source: 'https://www.city.akabira.hokkaido.jp/fs/8/5/0/2/0/_/_6________.pdf',
  },
  // 士別市
  '012203': {
    text: '天塩の流れとともに 人と大地が躍動する すこやかなまち',
    source: 'https://www.city.shibetsu.lg.jp/material/files/group/2/shibetsu_sougoukeikaku_digest_web.pdf',
  },
  // 名寄市
  '012211': {
    text: '自然の恵みと財産を活かし みんなでつくり育む 未来を拓く北の都市・名寄',
    source: 'http://www.city.nayoro.lg.jp/section/sougouseisaku/prkeql000000j8yp-att/prkeql000004awqh.pdf',
  },
  // 三笠市
  '012220': {
    text: '日本一安心して誰もが暮らし続けたい自然豊かな元気田園産業都市',
    source: 'https://www.city.mikasa.hokkaido.jp/hotnews/detail/00011941.html',
  },
  // 根室市
  '012238': {
    text: '未来志向で共に創る 海と大地に生きるまち 根室',
    source: 'https://www.city.nemuro.hokkaido.jp/lifeinfo/shinitsuite/shisei/5/1/14285.html',
  },
  // 千歳市
  '012246': {
    text: '人をつなぐ 世界をつなぐ 空のまち ちとせ',
    source: 'https://www.city.chitose.lg.jp/c70/1002791/1002792/1002793/1004425.html',
  },
  // 滝川市
  '012254': {
    text: '心が育ち 人を紡ぐ いつまでも住み続けたい“ちょうどいい田舎”',
    source: 'https://www.city.takikawa.lg.jp/uploaded/attachment/3492.pdf',
  },
  // 砂川市
  '012262': {
    text: '自然に笑顔があふれ 明るい未来をひらくまち',
    source: 'https://www.city.sunagawa.hokkaido.jp/shisei/kikaku_keikaku/7sougoukeikaku/index.html',
  },
  // 歌志内市
  '012271': {
    text: '主役はみんな “きょうどう”でつながる 笑顔あふれるまち',
    source: 'https://www.city.utashinai.hokkaido.jp/hotnews/detail/00004683.html',
  },
  // 深川市
  '012289': {
    text: '豊かな自然と暮らしが調和した 田園都市 ふかがわ',
    source: 'https://www.city.fukagawa.lg.jp/cms/section/machimi/ik75k40000000xlw.html',
  },
  // 登別市
  '012301': {
    text: '人が輝きまちがときめくふれあい交流都市のぼりべつ',
    source: 'https://www.city.noboribetsu.lg.jp/docs/2013022500043/',
  },
  // 恵庭市
  '012319': {
    text: '未来をひらく つながり広がる 文化創造都市',
    source: 'https://www.city.eniwa.hokkaido.jp/kurashi/shiseijoho/shinokakushukeikaku/sogokeikaku_sogosenryaku/eniwasougoukeikaku/19781.html',
  },
  // 伊達市
  '012335': {
    text: 'みんなが豊かさを感じられる市民幸福度最高のまち',
    source: 'https://www.city.date.hokkaido.jp/hotnews/detail/00005341.html',
  },
  // 北広島市
  '012343': {
    text: '自然と創造の調和した豊かな都市',
    source: 'https://www.city.kitahiroshima.hokkaido.jp/hotnews/detail/00155865.html',
  },
  // 北斗市
  '012360': {
    text: 'ほっとする くらしがある ともにすすめる まちづくり ～新たな時代への挑戦～',
    source: 'https://www.city.hokuto.hokkaido.jp/fs/9/3/2/3/6/_/2001_p23-28.pdf',
  },
  // 松前町
  '013315': {
    text: '生活満足度の高いまち',
    source: 'https://www.town.matsumae.hokkaido.jp/hotnews/detail/00000735.html',
  },
  // 知内町
  '013331': {
    text: 'かがやきは、ここから。',
    source: 'https://www.town.shiriuchi.hokkaido.jp/chosei/keikaku/sogokeikaku.html',
  },
  // 木古内町
  '013340': {
    text: '未来をつくるハブタウン きこない',
    source: 'https://www.town.kikonai.hokkaido.jp/files/00000600/00000603/5.147%E6%AC%A1%E6%8C%AF%E8%88%88%E8%A8%88%E7%94%BB.pdf',
  },
  // 七飯町
  '013374': {
    text: '人と自然が調和し 未来への笑顔輝くまち ななえ',
    source: 'https://www.town.nanae.hokkaido.jp/hotnews/files/00017800/00017880/20260515134125.pdf',
  },
  // 鹿部町
  '013439': {
    text: 'きらめく海・駒ケ岳 うるおいの湯郷',
    source: 'https://www.town.shikabe.lg.jp/choseijoho/seisaku_keikaku/keikaku/sogokeikaku/2104.html',
  },
  // 森町
  '013455': {
    text: 'みんなで創ろう海と緑の理想郷 もりまち ～こころふれあう はつらつとした爽やかなまち～',
    source: 'https://www.town.hokkaido-mori.lg.jp/material/files/group/1/2_shinkokeikaku.pdf',
  },
  // 八雲町
  '013463': {
    text: '八雲発！自然と人を未来へつなぐ',
    source: 'https://www.town.yakumo.lg.jp/uploaded/attachment/16148.pdf',
  },
  // 長万部町
  '013471': {
    text: 'ひらけ！つながれ！おしゃまんべ！！ ―みんなで楽しい未来へー',
    source: 'https://www.town.oshamambe.lg.jp/uploaded/attachment/10116.pdf',
  },
  // 江差町
  '013617': {
    text: '誇りある暮らしを未来へ紡ぎ、みんなでつくる自分たちごとのまちづくり',
    source: 'https://www.hokkaido-esashi.jp/files/chousei/shisaku_keikaku/6jisougoukeikaku/uid000001_02%2002%20zentaiban_kihon%20kousou.pdf',
  },
  // 上ノ国町
  '013625': {
    text: 'みんなで創る 誇れるふるさと上ノ国 ～みんなで育む まちの力～',
    source: 'https://www.town.kaminokuni.lg.jp/hotnews/detail/00003684.html',
  },
  // 厚沢部町
  '013633': {
    text: '『好きな』まちに『て』を加え『素敵な』まちに～町民が主役となって進める素敵な過疎のまちづくり～',
    source: 'https://www.town.assabu.lg.jp/uploaded/attachment/5922.pdf',
  },
  // 奥尻町
  '013676': {
    text: '島を受け継ぎ、島をつくる ４つのスタイルが息づく町',
    source: 'https://www.town.okushiri.lg.jp/hotnews/detail/00007095.html',
  },
  // せたな町
  '013714': {
    text: '輪になって つなぐ「せたな」の 夢未来 ～みんなが主役 笑顔あふれるまちづくり～',
    source: 'https://www.town.setana.lg.jp/setanasougoukeikaku2%28gaiyou%29.pdf',
  },
  // 黒松内町
  '013935': {
    text: '人と自然が彩る なんか居心地のいいまち くろまつない',
    source: 'http://www.kuromatsunai.com/masterplan4/kuromasterplan4.pdf',
  },
  // ニセコ町
  '013951': {
    text: 'こども未来共創都市ニセコ〜ニセコ町の美しい景観と自然を未来のこどもたちへ〜',
    source: 'https://www.town.niseko.lg.jp/resources/output/contents/file/release/10318/49593/6th_NisekoCP_A4.pdf',
  },
  // 真狩村
  '013960': {
    text: '笑顔でつなぐ うるおいあふれる村 まっかり',
    source: 'https://www.vill.makkari.lg.jp/resources/output/contents/file/release/189/320/gaiyou.pdf',
  },
  // 留寿都村
  '013978': {
    text: 'ようこそ、風薫る高原の村 留寿都へ',
    source: 'https://www.vill.rusutsu.lg.jp/hotnews/detail/00002767.html',
  },
  // 喜茂別町
  '013986': {
    text: '人と自然がきらめくまち、きもべつ 「次世代につなぐ、安心して幸せに暮らせる『まち』へ」',
    source: 'https://www.town.kimobetsu.hokkaido.jp/common/img/content/content_20250319_154209.pdf',
  },
  // 倶知安町
  '014001': {
    text: 'いつまでも住み続けたい町❝くっちゃん❞',
    source: 'https://www.town.kutchan.hokkaido.jp/town_administration/seisaku_keikaku_jigyou/machi_keikaku/',
  },
  // 岩内町
  '014028': {
    text: '健やかなまちづくり',
    source: 'https://www.town.iwanai.hokkaido.jp/wp-content/uploads/2020/09/139968edd168e4a6611fc5466d569210.pdf',
  },
  // 泊村
  '014036': {
    text: 'ふらり とまり',
    source: 'https://www.vill.tomari.hokkaido.jp/fs/4/3/3/5/_/_________.pdf',
  },
  // 神恵内村
  '014044': {
    text: '世界 ～S･E･K･A･I～ をつなぐ 笑顔でつなぐ むらづくり',
    source: 'https://www.vill.kamoenai.hokkaido.jp/hotnews/files/00001000/00001004/kihonnkousou.pdf',
  },
  // 古平町
  '014061': {
    text: '古からの息吹と 平穏なくらしを守る',
    source: 'https://www.town.furubira.lg.jp/common/img/content/cassette_1_pdf01_20210331_090818.pdf',
  },
  // 仁木町
  '014079': {
    text: '魅力ある、住みよい、 個人の主体性と地域の共生・調和を大切にするまち',
    source: 'https://www.town.niki.hokkaido.jp/section/kikakuka/irv97600000003bl-att/irv97600000009o1.pdf',
  },
  // 余市町
  '014087': {
    text: '未来に向けて住みやすいまちをつくる',
    source: 'https://www.town.yoichi.hokkaido.jp/chousei/jouhou/files/5thplan.pdf',
  },
  // 赤井川村
  '014095': {
    text: '自然とともに暮らし、人とつながり、美しく穏やかな村',
    source: 'https://www.akaigawa.com/kurashi/post_127.html',
  },
  // 南幌町
  '014231': {
    text: '緑豊かな田園文化のまち',
    source: 'https://www.town.nanporo.hokkaido.jp/seisaku/',
  },
  // 奈井江町
  '014249': {
    text: 'みんなで奏でる おもいやりのまち',
    source: 'https://www.town.naie.hokkaido.jp/file/contents/264/5459/dai7_kihonkousou2.pdf',
  },
  // 上砂川町
  '014257': {
    text: '小さな町の輝く未来へ挑戦するまち',
    source: 'https://town.kamisunagawa.hokkaido.jp/material/files/group/7/keikaku1.pdf',
  },
  // 由仁町
  '014273': {
    text: '小さくてもキラリと輝くまちへ',
    source: 'https://www.town.yuni.lg.jp/wp-content/uploads/2024/03/第七次由仁町総合計画　概要版.pdf',
  },
  // 長沼町
  '014281': {
    text: 'ひとと自然の共生 きらめく田園と交流のまち ながぬま',
    source: 'https://www.maoi-net.jp/files/00000200/00000289/3.pdf',
  },
  // 栗山町
  '014290': {
    text: 'みんなが元気なまち',
    source: 'https://www.town.kuriyama.hokkaido.jp/soshiki/31/21905.html',
  },
  // 月形町
  '014303': {
    text: 'みんなでつくる未来 ともに歩むまちづくり',
    source: 'http://www.town.tsukigata.hokkaido.jp/uploaded/attachment/3916.pdf',
  },
  // 浦臼町
  '014311': {
    text: '志と覚悟をもって挑戦し、未来を拓く',
    source: 'https://www.town.urausu.hokkaido.jp/kurashi/tyousei/mati-keikaku/files/dai5zi_sougousinnkoukeikaku001.pdf',
  },
  // 新十津川町
  '014320': {
    text: '新たな未来へ ともに歩もう つながる絆 かわらぬ自然と笑顔のまち',
    source: 'https://www.town.shintotsukawa.lg.jp/hotnews/files/00004000/00004082/19%20hyousi%20souron%20kihonkousou.pdf',
  },
  // 妹背牛町
  '014338': {
    text: '小さなまちから 広がるつながり 暮らしやすいまち',
    source: 'https://www.town.moseushi.hokkaido.jp/gyousei/documents/files/dai9jisougousinkoukeikaku.pdf',
  },
  // 雨竜町
  '014362': {
    text: '子どもたちに「夢」を若者に「希望」をお年寄りは「安心」のもてるまちづくり',
    source: 'https://www.town.uryu.hokkaido.jp/fs/2/1/1/7/1/_/____.pdf',
  },
  // 北竜町
  '014371': {
    text: 'あかるい農法 ひまわりの北竜町',
    source: 'https://www.town.hokuryu.hokkaido.jp/wp-content/uploads/2026/06/sogokeikaku-0201.pdf',
  },
  // 沼田町
  '014389': {
    text: '子どもたちが誇りをもてる ふるさと創造 沼田町',
    source: 'https://www.town.numata.hokkaido.jp/section/sangyou/kikakuseisaku/ujj7s3000000039c-att/h0opp2000000mta3.pdf',
  },
  // 鷹栖町
  '014524': {
    text: '笑顔 幸せ みんなでつくる あったかす',
    source: 'https://www.town.takasu.hokkaido.jp/uploaded/attachment/1361.pdf',
  },
  // 東神楽町
  '014532': {
    text: '花と大地と笑顔の東神楽',
    source: 'https://www.town.higashikagura.lg.jp/fs/5/0/3/9/7/_/higasikagura_9sogo_Full_small.pdf',
  },
  // 比布町
  '014559': {
    text: '住んで良かったと思えるまち',
    source: 'https://www.town.pippu.hokkaido.jp/cms/section/soumu/p1rhin0000000jtv-att/elhgch00000006t0.pdf',
  },
  // 愛別町
  '014567': {
    text: '子どもの笑顔かがやく 恵みの大地 あいべつ',
    source: 'https://www.town.aibetsu.hokkaido.jp/sites/default/files/user-data/soumu/pdf/%E7%AC%AC11%E6%AC%A1%E6%84%9B%E5%88%A5%E7%94%BA%E6%8C%AF%E8%88%88%E8%A8%88%E7%94%BB%E7%B7%8F%E8%AB%96%E3%83%BB%E5%9F%BA%E6%9C%AC%E6%A7%8B%E6%83%B3%5BR2%EF%BD%9ER11%5D.pdf',
  },
  // 上川町
  '014575': {
    text: '恵み豊かな大地と人がおりなすおもてなしのまち 上川',
    source: 'https://www.town.hokkaido-kamikawa.lg.jp/section/chiikimiryoku/chs81200000009vw-att/chs8120000000a5c.pdf',
  },
  // 東川町
  '014583': {
    text: '大雪山の恵みを受けて、豊かな暮らしを共に育むまちづくり',
    source: 'https://higashikawa-town.jp/storage/files/files/panel/081/0.plan2024_all.pdf',
  },
  // 上富良野町
  '014605': {
    text: '暮らし輝き 交流あふれる 四季彩のまち・かみふらの',
    source: 'https://www.town.kamifurano.hokkaido.jp/contents/20down/townplanning/sokei/6jisokei/digest/6jisokei_djall.pdf',
  },
  // 中富良野町
  '014613': {
    text: '絆でつながる 田園空間 なかふらの',
    source: 'https://www.town.nakafurano.lg.jp/hotnews/files/00001800/00001860/20200803173021.pdf',
  },
  // 南富良野町
  '014621': {
    text: '地域の自然を活かし 協働と共創で築くまち 南富良野',
    source: 'https://www.town.minamifurano.hokkaido.jp/wp-content/uploads/2015/02/e9973ad3114c1497f6e9dc99789c7c2c.pdf',
  },
  // 下川町
  '014681': {
    text: '誰ひとり取り残されず、しなやかに強く、幸せに暮らせる持続可能なまち',
    source: 'https://www.town.shimokawa.hokkaido.jp/gyousei/.assets/kihonnkousou2.pdf',
  },
  // 美深町
  '014699': {
    text: '未来へ続く 笑顔あふれるまち 美深',
    source: 'http://www.town.bifuka.hokkaido.jp/cms/section/nuv41p0000001o5n.html',
  },
  // 音威子府村
  '014702': {
    text: '森とともに 一人ひとりの匠が活躍する村',
    source: 'https://www.vill.otoineppu.hokkaido.jp/gyousei/keikaku/files/6th_general_plan.pdf',
  },
  // 中川町
  '014711': {
    text: '森と大地と天塩川 未来を拓く 中川町',
    source: 'https://www.town.nakagawa.hokkaido.jp/section/chiikisinko/onb6dr00000008nf.html',
  },
  // 幌加内町
  '014729': {
    text: '町民が夢と誇りを持って生きいきと暮らすまち',
    source: 'https://www.town.horokanai.hokkaido.jp/wp-content/uploads/2016/08/40c7d67301904a6b66fddc2139ce0051.pdf',
  },
  // 増毛町
  '014818': {
    text: 'だれもが住みたい・住み続けたい ふるさと増毛をめざして',
    source: 'https://www.town.mashike.hokkaido.jp/documents/m_files/1741568549.pdf',
  },
  // 小平町
  '014826': {
    text: '人がつながり 未来がひろがる 共創のまち',
    source: 'http://www.town.obira.hokkaido.jp/hotnews/files/00002600/00002624/20190223153825.pdf',
  },
  // 苫前町
  '014834': {
    text: '自然と産業、人のつながりが調和し、営みが世代を超えて受け継がれるまち',
    source: 'http://www.town.tomamae.lg.jp/section/kikakushinko/gknp5u00000018if-att/gknp5u00000018mt.pdf',
  },
  // 初山別村
  '014851': {
    text: '人と自然 結び合いきらめく村 しょさんべつ',
    source: 'http://www.vill.shosanbetsu.lg.jp/files/00000000/00000082/3kihonkouzou.pdf',
  },
  // 遠別町
  '014869': {
    text: 'ともに創る。 住み続けられるまちづくり',
    source: 'https://www.town.embetsu.hokkaido.jp/fs/1/9/6/0/9/_/__7_________R8_R17____1P_45P_.pdf',
  },
  // 天塩町
  '014877': {
    text: 'みんなで創ろう 育てよう 明るく楽しく元気なまちを',
    source: 'https://www.teshiotown.hokkaido.jp/wp-content/uploads/2024/05/4900f723e8ac85d619b072bade4bddfc.pdf',
  },
  // 猿払村
  '015113': {
    text: 'さらなる豊かさの追求',
    source: 'https://www.vill.sarufutsu.hokkaido.jp/hotnews/files/00005000/00005039/20261105092109.pdf',
  },
  // 浜頓別町
  '015121': {
    text: '住み続けたいまち かえりたいまち 輝くふるさと はまとんべつ',
    source: 'http://www.town.hamatonbetsu.hokkaido.jp/common/img/content/content_20220210_095108.pdf',
  },
  // 中頓別町
  '015130': {
    text: '小さな中頓別の しあわせをデザインする',
    source: 'https://www.town.nakatombetsu.hokkaido.jp/wp-content/uploads/d56ead0d5ad02c7c672ae9dff5904369.pdf',
  },
  // 礼文町
  '015172': {
    text: '島の絆',
    source: 'https://www.town.rebun.hokkaido.jp/hotnews/files/00001600/00001646/20250507104041.pdf',
  },
  // 利尻富士町
  '015199': {
    text: '～ふるさとを魅力あふれる宝の島に～',
    source: 'https://www.town.rishirifuji.hokkaido.jp/rishirifuji/secure/1769/1_kihonkousou.pdf',
  },
  // 幌延町
  '015202': {
    text: '共に拓き、共に創り、未来へつなぐ！ 笑顔と希望に満ちあふれるまち ほろのべ',
    source: 'https://www.town.horonobe.lg.jp/www4/section/soumu/le009f000001l3vf-att/le009f000001l3ze.pdf',
  },
  // 美幌町
  '015431': {
    text: 'ひとがつながる、みらいへつなげる ここにしかないまち びほろ',
    source: 'http://www.town.bihoro.hokkaido.jp/uploaded/attachment/4403.pdf',
  },
  // 津別町
  '015440': {
    text: '暮らしたい、魅力あふれるエコタウン',
    source: 'https://www.town.tsubetsu.hokkaido.jp/material/files/group/1/250327.pdf',
  },
  // 斜里町
  '015458': {
    text: 'みんなで一緒にとりくむ、持続可能なまちづくり',
    source: 'https://www.town.shari.hokkaido.jp/material/files/group/3/sharitowndai7jisougoukeikaku_241025.pdf',
  },
  // 清里町
  '015466': {
    text: 'うるおいと温もりで未来を創るまち きよさと',
    source: 'https://www.town.kiyosato.hokkaido.jp/assets/images/content/content_20260618_134518.pdf',
  },
  // 小清水町
  '015474': {
    text: '未来につながるまちづくり',
    source: 'https://www.town.koshimizu.hokkaido.jp/hotnews/files/00005700/00005708/20200327111405.pdf',
  },
  // 訓子府町
  '015491': {
    text: '「ちょっといいね！」がたくさんあるまち くんねっぷ',
    source: 'https://www.town.kunneppu.hokkaido.jp/fs/2/3/7/1/3/_/kousou.pdf',
  },
  // 置戸町
  '015504': {
    text: '笑顔と夢を未来につなぐまち おけと',
    source: 'https://www.town.oketo.hokkaido.jp/file/contents/1251/9518/sougoukeikakudigest.pdf',
  },
  // 佐呂間町
  '015521': {
    text: '自然の恵みに感謝し、人が人を支え、 共に創（つく）る、生涯の郷（さと）、サロマ',
    source: 'https://www.town.saroma.hokkaido.jp/shoukai/keikaku_shisaku/no4_sougoukeikaku.html',
  },
  // 遠軽町
  '015555': {
    text: '森林と清流 未来に響く 豊かなまち',
    source: 'https://engaru.jp/common/img/content/content_20250723_135508.pdf',
  },
  // 湧別町
  '015598': {
    text: '人と自然が輝くオホーツクのまち',
    source: 'https://www.town.yubetsu.lg.jp/common/img/content/content_20220301_085533.pdf',
  },
  // 滝上町
  '015601': {
    text: '人と自然とがつながり幸せを実感できるまち',
    source: 'https://town.takinoue.hokkaido.jp/files/00008100/00008107/202403koukikihonkeikakudigest.pdf',
  },
  // 興部町
  '015610': {
    text: '”地域の誇り”未来の産業を育てる',
    source: 'https://www.town.okoppe.lg.jp/cms/section/kikaku/nbm3tm0000000e7q.html',
  },
  // 西興部村
  '015628': {
    text: '夢、おこす村 にしおこっぺ',
    source: 'https://www.vill.nishiokoppe.lg.jp/section/kikaku/feeuub00000dorv8-att/i2lndh0000001ht8.pdf',
  },
  // 大空町
  '015644': {
    text: '安心と希望を未来につなぐまち 大空町',
    source: 'https://www.town.ozora.hokkaido.jp/machinoshirase/seisaku_keikaku/2/3948.html',
  },
  // 豊浦町
  '015717': {
    text: '人とつながり 自然と笑顔あふれるまち とようら',
    source: 'https://www.town.toyoura.hokkaido.jp/hotnews/files/00002900/00002929/20230405190652.pdf',
  },
  // 壮瞥町
  '015750': {
    text: '笑顔あふれる元気なまち そうべつ',
    source: 'https://www.town.sobetsu.lg.jp/uploads/dai5_machidukuri_all.pdf',
  },
  // 白老町
  '015784': {
    text: '共に築く希望の未来 しあわせ感じる元気まち',
    source: 'https://www.town.shiraoi.hokkaido.jp/docs/5507.html',
  },
  // 厚真町
  '015814': {
    text: '田園の風が誘う 挑戦と誇りを育むまち あつま',
    source: 'https://www.town.atsuma.lg.jp/page/4424.html',
  },
  // 洞爺湖町
  '015849': {
    text: '湖海と火山と緑の大地が結びあい元気をつくる交流のまち',
    source: 'http://www.town.toyako.hokkaido.jp/file/contents/319/10874/sogokeikaku-2022-kaitei.pdf',
  },
  // 安平町
  '015857': {
    text: '育てたい 暮らしたい 帰りたい みんなで未来へ駈けるまち',
    source: 'https://www.town.abira.lg.jp/webopen/parts/739/4.pdf',
  },
  // むかわ町
  '015865': {
    text: '人とつながる、笑顔でつながる、未来につながるまち むかわ',
    source: 'https://www.town.mukawa.lg.jp/secure/9521/12rinnku.pdf',
  },
  // 日高町
  '016012': {
    text: 'いきいきと働き、学び、安心と笑顔で暮らせるまち',
    source: 'https://www.town.hidaka.hokkaido.jp/assets/images/content/content_20241211_143923.pdf',
  },
  // 新冠町
  '016047': {
    text: '思いやりと笑顔あふれる 〝レ・コードなまち〟 にいかっぷ',
    source: 'https://www.niikappu.jp/gyose/zaisekaikaku/documents/kousou.pdf',
  },
  // 新ひだか町
  '016101': {
    text: 'みんなでつくる希望にあふれるまち！',
    source: 'https://www.shinhidaka-hokkaido.jp/hotnews/files/00001700/00001799/R070701_KIHONKOUSOU.pdf',
  },
  // 音更町
  '016314': {
    text: 'みんなが住みよい 選ばれるまち おとふけ',
    source: 'https://www.town.otofuke.hokkaido.jp/files/00003800/00003809/20210705202154.pdf',
  },
  // 士幌町
  '016322': {
    text: '誰もが関わりたくなる 農村ユートピアしほろ',
    source: 'https://www.shihoro.jp/common/img/content/content_20260603_193505.pdf',
  },
  // 上士幌町
  '016331': {
    text: '「未来につなぐ 笑顔かがやく 元気まち上士幌」',
    source: 'https://www.kamishihoro.jp/dl.php?doc_code=5024&type=1',
  },
  // 鹿追町
  '016349': {
    text: '愛・夢・笑顔 あふれる未来へ',
    source: 'https://www.town.shikaoi.lg.jp/file/contents/1636/11747/gaiyouban.pdf',
  },
  // 新得町
  '016357': {
    text: '人がつながり 未来につなげる 心地よいまち',
    source: 'https://www.shintoku-town.jp/gyousei/koukai_kouhyou/tiikisenryaku/sougoukeikakusakutei/',
  },
  // 清水町
  '016365': {
    text: 'まちに気づく まちを築く とかち清水',
    source: 'https://www.town.shimizu.hokkaido.jp/plans/02/files/5a2a43ff5095f76f2fb01a6f0a999780_2.pdf',
  },
  // 芽室町
  '016373': {
    text: 'みんなで創り みんなでつなぐ ずっと輝くまち めむろ',
    source: 'https://www.memuro.net/administration/soshiki/seisaku/machi-keikaku/files/5th_soukei.pdf',
  },
  // 中札内村
  '016381': {
    text: 'みんなでつくる！ 自然と笑顔になるまち なかさつない',
    source: 'https://www.vill.nakasatsunai.hokkaido.jp/output/contents/file/release/1548/16536/dainanakimachi.pdf',
  },
  // 更別村
  '016390': {
    text: '住みたい 住み続けたいまち ともにつくろう みんなの夢大地',
    source: 'https://www.sarabetsu.jp/file/contents/458/3797/soukeigaiyo.pdf',
  },
  // 大樹町
  '016411': {
    text: '人とひと・人と自然・人と宇宙がつながる 誰にでも居場所のあるまち大樹',
    source: 'https://www.town.taiki.hokkaido.jp/material/files/group/3/sogo_keikaku_gaiyou.pdf',
  },
  // 広尾町
  '016420': {
    text: '海・山・川が織りなす、希望が灯るサンタランド・ひろお',
    source: 'https://www.town.hiroo.lg.jp/gyousei/keikaku/machidukuri/machi_sougoukeikaku6_kouki/',
  },
  // 幕別町
  '016438': {
    text: 'みんながつながる 住まいる まくべつ',
    source: 'https://www.town.makubetsu.lg.jp/chosei/choseiunei/vision/3893.html',
  },
  // 池田町
  '016446': {
    text: 'ひとが育ち まちが育つ みんなでつくろう 明るいふるさと いけだ',
    source: 'https://www.town.hokkaido-ikeda.lg.jp/machi/keikaku-tirikumi/keikaku-kaigi/8082.html',
  },
  // 豊頃町
  '016454': {
    text: 'やさしさと躍動のふれ愛タウンとよころ',
    source: 'https://www.toyokoro.jp/uploaded/attachment/3777.pdf',
  },
  // 本別町
  '016462': {
    text: '心を合わせて みんなの笑顔を 未来につなぐ',
    source: 'https://www.town.honbetsu.hokkaido.jp/web/administration/details/7.html',
  },
  // 足寄町
  '016471': {
    text: '誰もが安心して暮らせる 豊かで活気あふれるまち あしょろ',
    source: 'https://www.town.ashoro.hokkaido.jp/kurashi/assets/7soukei_daijyesuto.pdf',
  },
  // 陸別町
  '016489': {
    text: '人と自然が響き合う 日本一寒い町 りくべつ',
    source: 'https://www.rikubetsu.jp/file/contents/1699/13393/6_soukei_gaiyou.pdf',
  },
  // 釧路町
  '016616': {
    text: '未来につなぐ豊かな自然と生きがいあふれるまち',
    source: 'http://www.town.kushiro.lg.jp/sokei6/keikaku/index.html',
  },
  // 厚岸町
  '016624': {
    text: 'みんなの“あっけし” 新時代の創造に向かって',
    source: 'https://www.akkeshi-town.jp/file/contents/3711/46119/sougouplan6_r0701.pdf',
  },
  // 浜中町
  '016632': {
    text: '笑顔輝く共創のふるさとを 未来へ 自然とともに生きる 豊かな大地と海のまち はまなか',
    source: 'https://www.townhamanaka.jp/kakuka/kikakuzaiseika/kikakuchousei/files/hamanaka_sougoukeikaku_No6_2020_web.pdf',
  },
  // 標茶町
  '016641': {
    text: 'みんないきいき みんなでつくる ～自然とともに生きるまち しべちゃ～',
    source: 'https://town.shibecha.hokkaido.jp/gyousei/sesaku_keikaku_kouhyoushiryou/sougoukeikaku/files/sogokeikaku5.pdf',
  },
  // 弟子屈町
  '016659': {
    text: '「水」と「森」を守り、「人」が共に輝く、 誇りと活力あふれる 夢づくりのまち 弟子屈',
    source: 'https://www.town.teshikaga.hokkaido.jp/material/files/group/1/6koukikihonkousou.pdf',
  },
  // 鶴居村
  '016675': {
    text: '未来を奏でる鶴居スタイルの確立',
    source: 'https://www.vill.tsurui.lg.jp/muranoshokai_sonsei/muranokeikaku/892.html',
  },
  // 白糠町
  '016683': {
    text: '生き活きしらぬか 笑顔輝くまちを目指して',
    source: 'https://www.town.shiranuka.lg.jp/section/kikaku/h8v21a0000003nb8-att/h8v21a000000l0dm.pdf',
  },
  // 別海町
  '016918': {
    text: '人がつながり 未来につながる 海と大地に夢があふれるまち',
    source: 'https://betsukai.jp/resources/output/contents/file/release/6107/73414/sougoukeikakusho.pdf',
  },
  // 中標津町
  '016926': {
    text: '空とみどりが人をつないでいくまち 中標津',
    source: 'https://www.nakashibetsu.jp/file/contents/814/14864/sogokeikaku-kihonkousou.pdf',
  },
  // 羅臼町
  '016942': {
    text: 'ひと・まち・自然いきいき未来創造',
    source: 'https://www.rausu-town.jp/pages/view/303',
  },
  // 青森県
  '020001': {
    text: '若者が、未来を自由に描き、実現できる社会',
    source: 'https://www.pref.aomori.lg.jp/koho/dayori/dayori_text202404.html',
  },
  // 青森市
  '022012': {
    text: 'みんなで未来を育てるまちに',
    source: 'https://www.city.aomori.aomori.jp/_res/projects/default_project/_page_/001/007/599/20241015kaiken-1-1.pdf',
  },
  // 弘前市
  '022021': {
    text: 'みんなで創り みんなをつなぐ あずましいりんご色のまち',
    source: 'https://www.city.hirosaki.aomori.jp/jouhou/keikaku/files/koukikihonkeikaku8.3.31_2.pdf',
  },
  // 八戸市
  '022039': {
    text: 'ひと・産業・文化が輝く北の創造都市',
    source: 'https://www.city.hachinohe.aomori.jp/material/files/group/3/04_07plan_dai3shou.pdf',
  },
  // 黒石市
  '022047': {
    text: 'いくつになっても住みよいまち 次世代につなぐ故郷（ふるさと） くろいし',
    source: 'https://www.city.kuroishi.aomori.jp/shisei/keikaku/dai7ji-sougoukeikaku.html',
  },
  // 五所川原市
  '022055': {
    text: '市民ひとりひとりの『思い』で輝く五所川原',
    source: 'https://www.city.goshogawara.lg.jp/jouhou/keikaku/sougoukeikaku.html',
  },
  // 十和田市
  '022063': {
    text: '～わたしたちが創る～ 希望と活力あふれる 十和田',
    source: 'https://www.city.towada.lg.jp/shisei/gyousei/machidukuri/files/sougoukeikakugaiyou.pdf',
  },
  // 三沢市
  '022071': {
    text: '未来へつなぐ 心安らぐ 国際文化都市',
    source: 'https://www.city.misawa.lg.jp/index.cfm/12,29705,c,html/29705/20180405-103913.pdf',
  },
  // むつ市
  '022080': {
    text: '笑顔かがやく 希望のまち むつ',
    source: 'https://www.city.mutsu.lg.jp/government/seisaku/mutusisougoukeieikeikaku.html',
  },
  // つがる市
  '022098': {
    text: '「アキない」挑戦と交流が生まれ、「あづましい」暮らしを育むつがる市',
    source: 'https://www.city.tsugaru.aomori.jp/material/files/group/44/dai3jisougoukeikaku-gaiyouban.pdf',
  },
  // 平川市
  '022101': {
    text: 'あふれる笑顔 くらし輝く 平川市',
    source: 'https://www.city.hirakawa.lg.jp/jouhou/keikaku/tyoukisougou.html',
  },
  // 平内町
  '023019': {
    text: '人と自然と産業が輝く 魅力あふれるまち',
    source: 'https://www.town.hiranai.aomori.jp/chosei/machizukuri/5/994.html',
  },
  // 今別町
  '023035': {
    text: '誰もが快適で便利な環境のもと暮らし続けたくなるふるさと',
    source: 'https://www.town.imabetsu.lg.jp/gyousei/shisaku/files/No.6_sougou.pdf',
  },
  // 外ヶ浜町
  '023078': {
    text: 'あらゆる人が希望を持てる持続可能なまちづくり',
    source: 'https://www.town.sotogahama.lg.jp/gyosei/keikaku/files/sougoukeikaku_4ji.pdf',
  },
  // 鰺ヶ沢町
  '023213': {
    text: '歴史と海・山・川が 人と人をつなぐまち 鰺ヶ沢',
    source: 'https://www.town.ajigasawa.lg.jp/gyosei_jyoho/sogokeikaku.files/7sougoukeikaku.pdf',
  },
  // 深浦町
  '023230': {
    text: 'みんなと共に未来を創る“ふかうらまち”',
    source: 'https://www.town.fukaura.lg.jp/doc/2025071100013/file_contents/2025071100013_fixed_docs_2025071100013_file_contents_01keikaku_.pdf',
  },
  // 西目屋村
  '023434': {
    text: '親から子へつなぐ 悠久の森 源流の里 にしめや',
    source: 'https://www.nishimeya.jp/material/files/group/3/sougoukeikakukouhyou.pdf',
  },
  // 藤崎町
  '023612': {
    text: 'みんなで築く 希望に満ち、活力があふれるまち ふじさき',
    source: 'https://www.town.fujisaki.lg.jp/index.cfm/9,241,42,173,html',
  },
  // 大鰐町
  '023621': {
    text: 'わになって みんなポカポカ 大鰐町',
    source: 'http://www.town.owani.lg.jp/aboutowani/plan/files/20230327-154628.pdf',
  },
  // 田舎館村
  '023671': {
    text: 'つながりが 笑顔を育む わが田舎',
    source: 'http://www.vill.inakadate.lg.jp/docs/2021042600025/',
  },
  // 板柳町
  '023817': {
    text: 'りんごの里いたやなぎ',
    source: 'https://www.town.itayanagi.aomori.jp/administration/salary/files/itayanagi_cyoukishinkoukeikaku.pdf',
  },
  // 鶴田町
  '023841': {
    text: '若い世代から選ばれるまちづくり',
    source: 'http://www.town.tsuruta.lg.jp/syoukai/syoukai-sougou/6sou.html',
  },
  // 中泊町
  '023876': {
    text: '豊かな自然とともに創る、暮らす、未来へつなぐ自立と協働のまち 中泊',
    source: 'https://www.town.nakadomari.lg.jp/material/files/group/3/tyokisougoukeikaku.pdf',
  },
  // 野辺地町
  '024015': {
    text: '未来につなげる幸せのまち のへじ',
    source: 'https://www.town.noheji.aomori.jp/life/chosei/machidukuri/machi-keikaku/6',
  },
  // 七戸町
  '024023': {
    text: 'ともに育み 未来へつなぐ 田園文化都市しちのへ',
    source: 'https://www.town.shichinohe.lg.jp/gyosei/1376fbb0584b0255cf6bd1654eec4c26.pdf',
  },
  // 六戸町
  '024058': {
    text: '恵みの大地と人が結び合う やすらぎと感動の定住拠点・六戸',
    source: 'https://www.town.rokunohe.aomori.jp/docs/2022051100079/file_contents/9.pdf',
  },
  // 横浜町
  '024066': {
    text: 'こころと自然が豊かな菜の花の町よこはま',
    source: 'https://www.town.yokohama.lg.jp/index.cfm/9,89,c,html/89/20210419-101701.pdf',
  },
  // 東北町
  '024082': {
    text: 'たゆまぬ挑戦 さらなる創造 未来輝く東北町',
    source: 'https://www.town.tohoku.lg.jp/chousei/plan/file/plan_shinkou-04.pdf',
  },
  // 六ヶ所村
  '024112': {
    text: '世界に開かれ すべての人が輝く 未来創造のまち',
    source: 'https://www.rokkasho.jp/index.cfm/6,823,c,html/823/20260622-082434.pdf',
  },
  // おいらせ町
  '024121': {
    text: '子どものびのび 大人いきいき ともにつくる おいらせ町',
    source: 'https://www.town.oirase.aomori.jp/soshiki/1232/dainijioirasetyousougoukeikakukoukikihokkeikaku.html',
  },
  // 大間町
  '024236': {
    text: '力強く、おおらかな、本州最北端のまち「大間」',
    source: 'https://www.town.ooma.lg.jp/organization/kikakukeiei/news/files/20210407-01_6.pdf',
  },
  // 佐井村
  '024261': {
    text: 'みんなが“愛と誇り”を実感できるむら',
    source: 'https://www.vill.sai.lg.jp/wp-content/uploads/2020/03/saimuradai5jichokisogokeikaku-gaiyoban.pdf',
  },
  // 五戸町
  '024422': {
    text: '人とまちの活力で新たなまちづくりへ 住みたくなる 育てたくなる 還りたくなる郷 ごのへ',
    source: 'https://www.town.gonohe.aomori.jp/chosei/3rd_masterplan_rev1_20250501.pdf',
  },
  // 南部町
  '024457': {
    text: 'みんながつながり達者に暮らす 笑顔あふれるまち 南部町',
    source: 'https://www.town.aomori-nanbu.lg.jp/uploaded/attachment/2573.pdf',
  },
  // 階上町
  '024465': {
    text: '心豊かで安心安全なくらしと 活力あふれる地域をみんなでつくる はしかみ New era plan',
    source: 'https://www.town.hashikami.lg.jp/index.cfm/9,23680,c,html/23680/20250609-094659.pdf',
  },
  // 岩手県
  '030007': {
    text: '東日本大震災津波の経験に基づき、引き続き復興に取り組みながら、お互いに幸福を守り育てる希望郷いわて',
    source: 'https://www.pref.iwate.jp/_res/projects/default_project/_page_/001/019/685/010long-term-vision.pdf',
  },
  // 盛岡市
  '032018': {
    text: '輝きが増し 活力に満ち 夢をかなえるまち盛岡',
    source: 'https://www.city.morioka.iwate.jp/shisei/keikaku/sogotekiplan/1009760/1045034/1051240.html',
  },
  // 宮古市
  '032026': {
    text: '「森・川・海」とひとが調和し共生する安らぎのまち',
    source: 'https://www.city.miyako.iwate.jp/gyosei/shigoto_sangyo/kaihatsu_toshikeikaku/4/5/4879.html',
  },
  // 大船渡市
  '032034': {
    text: 'ともに創る やすらぎに包まれ 活気あふれる 三陸のにぎわい拠点 大船渡',
    source: 'https://www.city.ofunato.iwate.jp/uploads/contents/archive_0000006019_00/★後期基本計画_概要版1.pdf',
  },
  // 花巻市
  '032051': {
    text: '豊かな自然 安らぎと賑わい みんなでつなぐ イーハトーブ花巻',
    source: 'https://www.city.hanamaki.iwate.jp/faq/seisaku/1006199/1006842.html',
  },
  // 北上市
  '032069': {
    text: '“うきうき” “わくわく” するまち 北上',
    source: 'https://www.city.kitakami.iwate.jp/material/files/group/2/gaiyou2021-2030.pdf',
  },
  // 遠野市
  '032085': {
    text: '自然と文化を愛し 世界とつながるまち 遠野',
    source: 'https://www.city.tono.iwate.jp/index.cfm/49,80225,265,547,html',
  },
  // 一関市
  '032093': {
    text: 'ひとりひとりが輝く 挑戦し続けるまち いちのせき',
    source: 'https://www.city.ichinoseki.iwate.jp/archive/contents-169905',
  },
  // 陸前高田市
  '032107': {
    text: '夢と希望と愛に満ち 次世代につなげる 共生と交流のまち 陸前高田',
    source: 'https://www.city.rikuzentakata.iwate.jp/material/files/group/1/koukisogokeikakuzenpage.pdf',
  },
  // 二戸市
  '032131': {
    text: '人が輝き 未来をひらくまち にのへ',
    source: 'https://www.city.ninohe.lg.jp/div/seisaku/pdf/sougoukeikaku/kihonkousou_henkougo.pdf',
  },
  // 八幡平市
  '032140': {
    text: '次世代に希望をつなぐ八幡平市',
    source: 'https://www.city.hachimantai.lg.jp/soshiki/kizai/30333.html',
  },
  // 奥州市
  '032158': {
    text: '地域の個性がひかり輝く 自治と協働のまち 奥州市',
    source: 'https://www.city.oshu.iwate.jp/gyosei/seisaku_keikaku/1/8994.html',
  },
  // 滝沢市
  '032166': {
    text: 'やさしさに包まれた滝沢',
    source: 'https://www.city.takizawa.iwate.jp/uploads/public/pages_0000000207_00/kihonnkousou.pdf',
  },
  // 雫石町
  '033014': {
    text: 'みんながつくる 未来につなぐ ふるさとしずくいし',
    source: 'https://www.town.shizukuishi.iwate.jp/docs/2020073000057/',
  },
  // 葛巻町
  '033022': {
    text: '未来を協創する 高原文化のまち',
    source: 'https://www.town.kuzumaki.lg.jp/docs/2020070800018/file_contents/kuzumaki_sougou_keikaku_3_digest.pdf',
  },
  // 岩手町
  '033031': {
    text: 'わたしたちが創る 笑顔がいっぱい いわてまち',
    source: 'https://town.iwate.iwate.jp/town/gyosei/sogohatten2021-2030/',
  },
  // 紫波町
  '033219': {
    text: '暮らし心地の良いまち',
    source: 'https://www.town.shiwa.iwate.jp/shiwatown/cms/chosei/keikaku1/keikaku2/第三次紫波町総合計画後期基本計画.pdf',
  },
  // 矢巾町
  '033227': {
    text: 'みんなで築く 躍動感あふれ幸せな未来へ進化するまち やはば',
    source: 'https://www.town.yahaba.iwate.jp/yahabatown/003_kikaku/community/sokei/8kihonkoso.pdf',
  },
  // 西和賀町
  '033669': {
    text: '豊かな自然と学びが拓く 笑顔が行き交うにぎわいのまち',
    source: 'https://www.town.nishiwaga.lg.jp/material/files/group/1/keikakusyo.pdf',
  },
  // 金ケ崎町
  '033812': {
    text: '人と地域が支えあうまち 金ケ崎',
    source: 'https://www.town.kanegasaki.iwate.jp/docs/2021022600052/file_contents/11.pdf',
  },
  // 平泉町
  '034029': {
    text: '輝きつむぐ理想郷',
    source: 'https://www.town.hiraizumi.iwate.jp/%e7%ac%ac%ef%bc%96%e6%ac%a1%e5%b9%b3%e6%b3%89%e7%94%ba%e7%b7%8f%e5%90%88%e8%a8%88%e7%94%bb%e5%be%8c%e6%9c%9f%e5%9f%ba%e6%9c%ac%e8%a8%88%e7%94%bb%ef%bc%882026%e3%80%9c2030%ef%bc%89%e3%82%92%e7%ad%96-37664/',
  },
  // 住田町
  '034410': {
    text: '豊かな森と水に育まれ 安心した暮らしの中でにぎわいがあふれる 共生のまち 住田',
    source: 'https://www.town.sumita.iwate.jp/docs/2025040900026/files/sougoukeikaku_R7-R11.pdf',
  },
  // 大槌町
  '034614': {
    text: '魅力ある人を育て 新しい価値を創造し続けるまち大槌',
    source: 'https://www.town.otsuchi.iwate.jp/fs/1/9/7/9/4/9/_/06_9_____________.pdf',
  },
  // 山田町
  '034827': {
    text: '自然とともに響きあう やさしさあふれる山田町',
    source: 'https://www.town.yamada.iwate.jp/fs/1/3/7/1/6/6/_/02__10________________________.pdf',
  },
  // 岩泉町
  '034835': {
    text: '希望の大地から未来の花咲くいわいずみ',
    source: 'https://www.town.iwaizumi.lg.jp/docs/2023072500016/file_contents/02_.pdf',
  },
  // 田野畑村
  '034843': {
    text: '人と自然が織りなす 心豊かな協働の村 たのはた',
    source: 'https://www.vill.tanohata.iwate.jp/docs/2015081800010/files/01_Sougoukeikaku_zenkikihon_kousou.pdf',
  },
  // 普代村
  '034851': {
    text: '一人ひとりが幸せな チーム「北緯40度の地球村ふだい」',
    source: 'https://www.vill.fudai.iwate.jp/fs/7/2/5/9/_/_6______________.pdf',
  },
  // 軽米町
  '035017': {
    text: '一人一人の活力と思いやりが循環するまち',
    source: 'https://www.town.karumai.iwate.jp/article/cat778/entry-basename-67.html',
  },
  // 野田村
  '035033': {
    text: '「やりがい」と「生きがい」を実感でき、住んでいることを誇りに思えるむら',
    source: 'https://www.vill.noda.iwate.jp/material/files/group/4/daijyesutobann_sougoukeikaku.pdf',
  },
  // 九戸村
  '035068': {
    text: '小さくても活力と笑顔あふれるしあわせの郷 九戸村',
    source: 'https://www.vill.kunohe.iwate.jp/fs/2/1/8/1/4/_/%E7%AC%AC3%E6%AC%A1%E4%B9%9D%E6%88%B8%E6%9D%91%E7%B7%8F%E5%90%88%E7%99%BA%E5%B1%95%E8%A8%88%E7%94%BB_%E5%BE%8C%E6%9C%9F%E5%9F%BA%E6%9C%AC%E8%A8%88%E7%94%BB.pdf',
  },
  // 洋野町
  '035076': {
    text: '海と高原の牧場 絆をつなぎ 輝く未来を拓くまち',
    source: 'https://www.town.hirono.iwate.jp/doc/2017040100032/file_contents/2017040100032_docs_2017032800025_files_99dai2jigaiyou.pdf',
  },
  // 仙台市
  '041009': {
    text: '挑戦を続ける、新たな杜の都へ',
    source: 'https://www.city.sendai.jp/machizukuri-kakuka/shise/zaise/kekaku/sogo/documents/kihonkeikaku_2021-2030_gaiyou.pdf',
  },
  // 石巻市
  '042021': {
    text: 'ひとりひとりが 多彩に煌めき 共に歩むまち',
    source: 'https://www.city.ishinomaki.lg.jp/cont/10451000/sangyousinkoukeikaku/20211203153232.html',
  },
  // 塩竈市
  '042030': {
    text: '海と社に育まれる 楽しい塩竈',
    source: 'https://www.city.shiogama.miyagi.jp/soshiki/6/3568.html',
  },
  // 気仙沼市
  '042056': {
    text: '世界とつながる豊かなローカル',
    source: 'https://www.kesennuma.miyagi.jp/sec/s019/020/020/020/111/20220905114022.html',
  },
  // 白石市
  '042064': {
    text: '人と地域が輝き、ともに新しい価値を創造するまち しろいし',
    source: 'https://www.city.shiroishi.miyagi.jp/uploaded/attachment/18827.pdf',
  },
  // 名取市
  '042072': {
    text: '愛されるふるさと なとり',
    source: 'https://www.city.natori.miyagi.jp/page/4337.html',
  },
  // 角田市
  '042081': {
    text: '市民力咲き誇る。角田市',
    source: 'https://www.city.kakuda.lg.jp/uploaded/attachment/4962.pdf',
  },
  // 多賀城市
  '042099': {
    text: '日々のよろこびふくらむまち 史都 多賀城',
    source: 'https://www.city.tagajo.miyagi.jp/kikaku/shise/shisaku/sogo/kekaku/documents/kihonkoso.pdf',
  },
  // 岩沼市
  '042111': {
    text: 'ひとが集い 輝くまち いわぬま',
    source: 'https://www.city.iwanuma.miyagi.jp/shisei/shisaku/keikaku/documents/iwa-sogokeikaku-2024-gaiyo.pdf',
  },
  // 登米市
  '042129': {
    text: 'あふれる笑顔 豊かな自然 住みたいまち とめ',
    source: 'https://www.city.tome.miyagi.jp/machi/shisejoho/gyose/sogokekaku/documents/03_3jisou_kihonkousou.pdf',
  },
  // 栗原市
  '042137': {
    text: '市民が創る くらしたい栗原',
    source: 'https://www.kuriharacity.jp/w007/020/050/010/050/2jisoukei_kihonkoso.pdf',
  },
  // 東松島市
  '042145': {
    text: '住み続けられ持続・発展する東松島市',
    source: 'https://www.city.higashimatsushima.miyagi.jp/shisei/shisaku-keikaku/kihonkeikaku/kikaku2-soukei3.files/sougoukeikaku-3-kikaku.pdf',
  },
  // 大崎市
  '042153': {
    text: '宝の都（くに）・大崎',
    source: 'https://www.city.osaki.miyagi.jp/shisei/soshikikarasagasu/shiminkyodousuishimbu/seisakuka/2_1/3334.html',
  },
  // 富谷市
  '042161': {
    text: '住みたくなるまち日本一',
    source: 'https://www.tomiya-city.miyagi.jp/uploads/pdf/9d10875f0cbb1acce5829e9b0aab731e53bb9bfc.pdf',
  },
  // 蔵王町
  '043010': {
    text: 'ずっと愛にあふれるオンリーワンなまち・ざおう',
    source: 'https://www.town.zao.miyagi.jp/kurashi_guide/shisaku_machi/shisaku_machi/sougoukeikaku/daigozityousou.files/kousou_5zi.pdf',
  },
  // 七ヶ宿町
  '043028': {
    text: '小さくても持続可能なまち',
    source: 'https://town.shichikashuku.miyagi.jp/town/plan/upload_images/b526da5a89ce103345303ca0d96e364c8f102d30.pdf',
  },
  // 大河原町
  '043214': {
    text: 'ひと・まち・桜が咲きほこる先進のまち',
    source: 'https://www.town.ogawara.miyagi.jp/secure/8869/Gaiyouban.pdf',
  },
  // 村田町
  '043222': {
    text: '安心して豊かに暮らせるまち むらた',
    source: 'https://www.town.murata.miyagi.jp/cyosei/seisaku/cyokisougou/file/20210407_02.pdf',
  },
  // 柴田町
  '043231': {
    text: '笑顔があふれ 誇りと愛着を育む 花のまち',
    source: 'https://www.town.shibata.miyagi.jp/index.cfm/82,35937,c,html/35937/20190528-153413.pdf',
  },
  // 川崎町
  '043249': {
    text: 'かわさき 誰もが主役になれるまち',
    source: 'https://www.town.kawasaki.miyagi.jp/soshiki/chishin/2401.html',
  },
  // 丸森町
  '043419': {
    text: 'つくろう、あたらしい日常を。',
    source: 'https://www.town.marumori.miyagi.jp/common/img/content/content_20250515_111220.pdf',
  },
  // 亘理町
  '043613': {
    text: '人に愛され、愛でつながるまち わたり',
    source: 'https://www.town.watari.miyagi.jp/common/img/content/content_20260423_151108.pdf',
  },
  // 山元町
  '043621': {
    text: 'キラリやまもと！みんなでつくる笑顔あふれるまち',
    source: 'https://www.town.yamamoto.miyagi.jp/uploaded/attachment/11533.pdf',
  },
  // 松島町
  '044016': {
    text: '誰にでもやさしく、活力あふれる“ほっと”松島',
    source: 'https://www.town.miyagi-matsushima.lg.jp/page/1385.html',
  },
  // 七ヶ浜町
  '044041': {
    text: '安心 笑顔 心いやされるまち',
    source: 'https://www.shichigahama.com/sousei/',
  },
  // 利府町
  '044067': {
    text: 'もっと先へ、チャレンジ利府！',
    source: 'https://www.town.rifu.miyagi.jp/material/files/group/3/kihonnkousou.pdf',
  },
  // 大和町
  '044211': {
    text: '七ツ森の輝く緑 元気なくらしが広がる 大和町',
    source: 'https://www.town.taiwa.miyagi.jp/choseijoho/seisaku_keikaku/sogokeikaku/3887.html',
  },
  // 大郷町
  '044229': {
    text: '住民とともに未来を拓くまち',
    source: 'https://www.town.miyagi-osato.lg.jp/soshiki/machidukuri/sougoukeikaku2025.html',
  },
  // 大衡村
  '044245': {
    text: '新しい時代につなぐ豊かな万葉の里・おおひら',
    source: 'https://www.village.ohira.miyagi.jp/material/files/group/5/5276.pdf',
  },
  // 色麻町
  '044440': {
    text: '自然を愛し、人が輝き、夢のある持続可能なまちづくり',
    source: 'https://www.town.shikama.miyagi.jp/material/files/group/1/F02_2_kihonkousou.pdf',
  },
  // 加美町
  '044458': {
    text: '住民満足度 100 パーセント、日本一の加美町',
    source: 'https://www.town.kami.miyagi.jp/material/files/group/6/3_sougoukeikaku_3.pdf',
  },
  // 美里町
  '045055': {
    text: '心豊かな人材を育み、地域産業が発展し、 にぎわいのある、生き生きとした暮らしができるまち',
    source: 'https://www.town.misato.miyagi.jp/13jyoho/zaisei/pdf/sougoukeikaku3.pdf',
  },
  // 女川町
  '045811': {
    text: '「いのち」と「くらし」を みんなが紡ぐまち',
    source: 'https://www.town.onagawa.miyagi.jp/pdf/sogokeikaku/2019_onagawa_keikaku_s.pdf',
  },
  // 南三陸町
  '046060': {
    text: 'ひと 森 里 海 いのちめぐるまち 南三陸',
    source: 'https://www.town.minamisanriku.miyagi.jp/chosei/shisaku-keikaku/1/1/6412.html',
  },
  // 秋田県
  '050008': {
    text: '新時代に咲き誇る秋田',
    source: 'https://www.pref.akita.lg.jp/uploads/public/archive_0000094577_00/基本理念、目指す姿.pdf',
  },
  // 秋田市
  '052019': {
    text: '響きあう 心躍る 人・まち・くらし',
    source: 'https://www.city.akita.lg.jp/_res/projects/default_project/_page_/001/047/065/0327kihonrinen.pdf',
  },
  // 能代市
  '052027': {
    text: '“わ”のまち能代',
    source: 'https://www.city.noshiro.lg.jp/reiki/reiki_honbun/r241RG00000921.html',
  },
  // 横手市
  '052035': {
    text: '時代を受け継ぎ 磨き上げ 凛々しく羽ばたくまち よこて',
    source: 'https://www.city.yokote.lg.jp/_res/projects/default_project/_page_/001/013/097/r8shiseihoushin.pdf',
  },
  // 大館市
  '052043': {
    text: '匠と歴史を伝承し、多様性（ちがい）を力に変えていく「未来創造都市」',
    source: 'https://www.city.odate.lg.jp/city/soshiki/kikakuchosei/p7375',
  },
  // 男鹿市
  '052060': {
    text: '人口減少社会に対応した 元気で心豊かに暮らす男鹿',
    source: 'https://www.city.oga.akita.jp/living_information/shiseijoho/1/8400.html',
  },
  // 湯沢市
  '052078': {
    text: '人のつながりで磨かれる、熱（エネルギー）あふれる美しいまち',
    source: 'https://www.city-yuzawa.jp/soshiki/10/4579.html',
  },
  // 鹿角市
  '052094': {
    text: 'ふるさとを誇り 未来を拓くまち 鹿角',
    source: 'https://www.city.kazuno.lg.jp/shisei_machizukuri/gaiyo_keikaku/13/7th_sougoukeikaku/14475.html',
  },
  // 由利本荘市
  '052108': {
    text: '市民一人ひとりが希望を叶え自分らしく暮らすまち',
    source: 'https://www.city.yurihonjo.lg.jp/_res/projects/default_project/_page_/001/012/962/miraiplan_gaiyou.pdf',
  },
  // 潟上市
  '052116': {
    text: 'みんなで創る みんなが輝く 愛され 誇れる 私たちの潟上市',
    source: 'https://www.city.katagami.lg.jp/gyosei/machizukuri/seisaku/5543.html',
  },
  // 大仙市
  '052124': {
    text: '人が活き 人が集う 夢のある田園交流都市',
    source: 'https://www.city.daisen.lg.jp/archive/p20260318104851',
  },
  // 北秋田市
  '052132': {
    text: '森と歴史が息づき、幸せを紡ぐまち 北秋田',
    source: 'https://www.city.kitaakita.akita.jp/archive/p20250221161222',
  },
  // にかほ市
  '052141': {
    text: '夢あるまち 豊かなまち 元気なまち 住みたいまち にかほ',
    source: 'https://www.city.nikaho.akita.jp/soshikikarasagasu/sogoseisakuka/gyomuannai/9/4267.html',
  },
  // 仙北市
  '052159': {
    text: '幸福度全国Ｎｏ.１を目指すまち',
    source: 'https://www.city.semboku.akita.jp/government/keikaku/documents/2026_sougoukeikaku_kikaku_1.pdf',
  },
  // 小坂町
  '053031': {
    text: 'ひとと自然と文化を未来につなぐ 魅力あふれるまち',
    source: 'https://www.town.kosaka.akita.jp/material/files/group/4/6kokikeikaku-honpen.pdf',
  },
  // 三種町
  '053481': {
    text: '人・地域がつながり、元気を未来へつなぐまち',
    source: 'https://www.town.mitane.akita.jp/material/files/group/3/plangaiyouban.pdf',
  },
  // 八峰町
  '053490': {
    text: '自然の力をまちの力に！八峰、新しい挑戦へ！',
    source: 'https://www.town.happo.lg.jp/archive/p20260331100009',
  },
  // 五城目町
  '053619': {
    text: 'ひとが輝き、まちが輝き、そして未来が輝く五城目',
    source: 'https://www.town.gojome.akita.jp/up/files/town/sosikiannai/machi/matiduku/hattenkeikaku202203gaiyouban.pdf',
  },
  // 八郎潟町
  '053635': {
    text: '人と地域に寄り添い 希望と活力に満ちた 共生創造のまち',
    source: 'https://www.town.hachirogata.akita.jp/_res/projects/default_project/_page_/001/004/526/gaiyouban222.pdf',
  },
  // 井川町
  '053660': {
    text: '豊かに咲き誇る 笑顔で心が弾むまち',
    source: 'http://www.town.ikawa.akita.jp/uploaded/attachment/1523.pdf',
  },
  // 大潟村
  '053686': {
    text: '継承と挑戦で未来を拓く 希望の大地',
    source: 'https://www.vill.ogata.akita.jp/uploads/public/news_0000006394_00/第3期総合村づくり計画　第２部基本構想-cleaned.pdf',
  },
  // 美郷町
  '054348': {
    text: '美郷らしさを誇り、語りたくなるまち',
    source: 'https://www.town.misato.akita.jp/archive/contents-4565',
  },
  // 羽後町
  '054631': {
    text: '個性豊かに、未来へつながるまちづくり',
    source: 'https://www.town.ugo.lg.jp/uploads/user/kikaku-c/File/%E7%99%BA%E5%B1%95%E8%A8%88%E7%94%BB/%E7%AC%AC%EF%BC%97%E6%AC%A1%E7%BE%BD%E5%BE%8C%E7%94%BA%E7%B7%8F%E5%90%88%E7%99%BA%E5%B1%95%E8%A8%88%E7%94%BB%EF%BC%88%E6%A6%82%E8%A6%81%E7%89%88%EF%BC%89.pdf',
  },
  // 東成瀬村
  '054640': {
    text: '人と自然、世代と地域をつなぐ共創の村',
    source: 'https://vill.higashinaruse.lg.jp/wp-content/uploads/2026/04/20260416-masterplan.pdf',
  },
  // 山形県
  '060003': {
    text: '人と自然がいきいきと調和し、真の豊かさと幸せを実感できる山形',
    source: 'https://www.pref.yamagata.jp/documents/8136/tyokikoso_gaiyo.pdf',
  },
  // 山形市
  '062014': {
    text: 'みんなで創る山形らしさが輝くまち',
    source: 'https://www.city.yamagata-yamagata.lg.jp/shiseijoho/keikaku/1006988/1002628.html',
  },
  // 米沢市
  '062022': {
    text: 'しあわせ循環学園都市 よねざわ',
    source: 'https://www.city.yonezawa.yamagata.jp/soshiki/2/1006/4/3/1/10872.html',
  },
  // 鶴岡市
  '062031': {
    text: 'ほんとうの豊かさを追求する みんなが暮らしやすい 創造と伝統のまち 鶴岡',
    source: 'https://www.city.tsuruoka.lg.jp/shisei/sogokeikaku/nijisougou/seisaku01202403151.html',
  },
  // 酒田市
  '062049': {
    text: '賑わいも暮らしやすさも共に創る（ともにつくる）公益のまち酒田',
    source: 'https://www.city.sakata.lg.jp/shisei/shisakukeikaku/kikaku/sougokeikaku/sakatashisogokeikaku.files/gaiyo.pdf',
  },
  // 新庄市
  '062057': {
    text: '「住みよさ」をかたちに新庄市',
    source: 'https://www.city.shinjo.yamagata.jp/s002/040/005/005/20201126111607.html',
  },
  // 寒河江市
  '062065': {
    text: 'さくらんぼと幸せ実る 夢育むまち 寒河江',
    source: 'https://www.city.sagae.yamagata.jp/shisei/keikaku/shinkokeikaku/7keikaku.html',
  },
  // 上山市
  '062073': {
    text: 'つながりつなげる いろどりのまち かみのやま',
    source: 'https://www.city.kaminoyama.yamagata.jp/soshiki/3/dai8jisinkokeikaku202407.html',
  },
  // 村山市
  '062081': {
    text: '次の世代に引き継ぎ・受け継がれる魅力あるまち',
    source: 'https://www.city.murayama.lg.jp/shisei/keikaku_seisaku/keikaku/sougoukeikaku.files/6-hp.pdf',
  },
  // 長井市
  '062090': {
    text: 'みんながしあわせに暮らせる長井',
    source: 'https://www.city.nagai.yamagata.jp/event_shisei/shisaku_keikaku/2/14267.html',
  },
  // 天童市
  '062103': {
    text: '笑顔あふれ 幸せひろがる 安心都市',
    source: 'https://www.city.tendo.yamagata.jp/municipal/shisaku/sougoukeikaku.html',
  },
  // 東根市
  '062111': {
    text: '豊かな環境 みんなが選ぶ 住みよいまち',
    source: 'https://www.city.higashine.yamagata.jp/files/original/20260810093548110cc7f904a.pdf',
  },
  // 尾花沢市
  '062120': {
    text: 'このまちで ともに 生きる しあわせな時を刻むまち 尾花沢',
    source: 'https://www.city.obanazawa.yamagata.jp/shisei/plan/751',
  },
  // 南陽市
  '062138': {
    text: 'つながり つどう 縁結ぶまち 南陽',
    source: 'http://www.city.nanyo.yamagata.jp/rokujiso/3673',
  },
  // 山辺町
  '063011': {
    text: 'みんながつながる 協働のまち やまのべ',
    source: 'https://www.town.yamanobe.yamagata.jp/uploaded/attachment/8436.pdf',
  },
  // 中山町
  '063029': {
    text: '郷土の誇りを 未来につなぐ ひとが輝く健幸のまち なかやま',
    source: 'https://www.town.nakayama.yamagata.jp/section/sougou_plan/overview.pdf',
  },
  // 河北町
  '063215': {
    text: '輝く人・町 夢と未来へ挑戦するまち',
    source: 'https://www.town.kahoku.yamagata.jp/soshiki/kikakuzaiseika/seisaku/5789.html',
  },
  // 朝日町
  '063231': {
    text: '「チャレンジ・つながり・希望」',
    source: 'https://www.town.asahi.yamagata.jp/portal/administration/keikaku_shisaku/keikaku_koso/4299.html',
  },
  // 大江町
  '063240': {
    text: 'ちょうどいい 幸せ感じるまち',
    source: 'https://www.town.oe.yamagata.jp/government/mainpolicy/keikaku/278',
  },
  // 大石田町
  '063410': {
    text: '美しい自然と共生し、安心して暮らせる あたたかいまち',
    source: 'https://www.town.oishida.yamagata.jp/chousei/keikaku/kasokeikaku2021.files/7jisougou1.pdf',
  },
  // 金山町
  '063614': {
    text: 'みんなが主役、みんなの故郷、金山町',
    source: 'https://www.town.kaneyama.yamagata.jp/material/files/group/3/senryaku.pdf',
  },
  // 舟形町
  '063631': {
    text: '住んでいる人が誇れるまちづくり「わくわく未来ふながた」',
    source: 'https://www.town.funagata.yamagata.jp/s007/sugata/040/020/210/gaiyouban.pdf',
  },
  // 真室川町
  '063649': {
    text: '生きがいを感じ 幸せを感じるまち 真室川',
    source: 'https://www.town.mamurogawa.yamagata.jp/material/files/group/9/sougoukeikakukoukigaiyou.pdf',
  },
  // 大蔵村
  '063657': {
    text: 'おかえり、なりわい灯す きよらなる里',
    source: 'https://www.vill.ohkura.yamagata.jp/material/files/group/12/7bcf70c0c8c1e889ca0b6cc61a2886ed.pdf',
  },
  // 鮭川村
  '063665': {
    text: '多世代と自然が織りなす‟うるわしの里” さけがわ',
    source: 'https://www.vill.sakegawa.yamagata.jp/files/original/20210401083322416f63c07fc.pdf',
  },
  // 高畠町
  '063819': {
    text: 'ゆきかう「またね∞」 あふれる「うふふ∞」',
    source: 'https://www.town.takahata.yamagata.jp/uploaded/attachment/1728.pdf',
  },
  // 川西町
  '063827': {
    text: 'わたしもあなたも満たされるまち',
    source: 'https://www.town.kawanishi.yamagata.jp/machinojoho/seisaku/kawanshi6sou_gaiyouban.pdf',
  },
  // 白鷹町
  '064025': {
    text: '人、そして地域がつながり 輝き続ける 潤いのまち',
    source: 'https://www.town.shirataka.lg.jp/secure/4394/sougoukeikaku-all.pdf',
  },
  // 三川町
  '064262': {
    text: 'あふれる笑顔 みんなが住みやすいまち ハートフルタウン みかわ',
    source: 'https://www.town.mikawa.yamagata.jp/town/kikaku/sougoukeikaku/4sogo/4thcp2021.files/4thcomprehensiveplanoverview.pdf',
  },
  // 庄内町
  '064289': {
    text: 'みんなが しあわせを かんじるまち',
    source: 'https://www.town.shonai.lg.jp/gyousei/shisaku/3_plan.files/sogokeikaku3_siryoari.pdf',
  },
  // 遊佐町
  '064611': {
    text: '鳥海山の恵みと共生し「生命育む循環の郷」遊佐',
    source: 'https://www.town.yuza.yamagata.jp/archive/p20260116182555',
  },
  // 福島県
  '070009': {
    text: 'やさしさ、すこやかさ、おいしさあふれる ふくしまを共に創り、つなぐ',
    source: 'https://www.pref.fukushima.lg.jp/sec/11015b/comprehensiveplan2022-2030.html',
  },
  // 福島市
  '072010': {
    text: '人・まち・自然が奏でるハーモニー 未来協奏（共創）都市',
    source: 'https://www.city.fukushima.fukushima.jp/shisei/shisaku-keikaku/1/1/2/10804.html',
  },
  // 会津若松市
  '072028': {
    text: 'ともに歩み、ともに創る「温故創しん（おんこそうしん）」会津若松',
    source: 'https://www.city.aizuwakamatsu.fukushima.jp/docs/2016110400058/',
  },
  // 郡山市
  '072036': {
    text: '東北の鼓動 未来を奏でる 選ばれるまち 郡山',
    source: 'https://www.city.koriyama.lg.jp/uploaded/attachment/124919.pdf',
  },
  // 白河市
  '072052': {
    text: '星がある。城がある。君がいる。白河',
    source: 'https://www.city.shirakawa.fukushima.jp/data/doc/1780468711_doc_22_0.pdf',
  },
  // 須賀川市
  '072079': {
    text: '共につくる 住み続けたいまち すかがわ',
    source: 'https://www.city.sukagawa.fukushima.jp/shisei/gyoseiunei/keikaku/sogo_keikaku/1010579/index.html',
  },
  // 喜多方市
  '072087': {
    text: '力強い産業 人が輝く 活力満ちる安心・快適なまち',
    source: 'https://www.city.kitakata.fukushima.jp/soshiki/kikaku/9652.html',
  },
  // 二本松市
  '072109': {
    text: '笑顔あふれる しあわせのまち 二本松',
    source: 'https://www.city.nihonmatsu.lg.jp/shisei/jigyo_keikaku_gyosei/cyoki_keikaku/page007047.html',
  },
  // 田村市
  '072117': {
    text: 'ワクワクがとまらない 自然とチャレンジがいきるまち 田村市',
    source: 'https://www.city.tamura.lg.jp/soshiki/1/kikaku-dainijisougoukeikaku-zenki.html',
  },
  // 伊達市
  '072133': {
    text: '人と緑と歴史が結び合う ひかり輝く田園空間・伊達市',
    source: 'https://www.city.fukushima-date.lg.jp/soshiki/1/64152.html',
  },
  // 本宮市
  '072141': {
    text: '『笑顔』あふれる『人』と『地域』が輝くまち もとみや',
    source: 'https://www.city.motomiya.lg.jp/soshiki/46/dai2zisougoukeikaku-5.html',
  },
  // 桑折町
  '073016': {
    text: 'みんなが幸せを実感できる 元気なまち こおり',
    source: 'https://www.town.koori.fukushima.jp/uploaded/attachment/3980.pdf',
  },
  // 国見町
  '073032': {
    text: 'みんなが真ん中 すこやかで活気あふれるまち',
    source: 'https://www.town.kunimi.fukushima.jp/soshiki/2/21556.html',
  },
  // 川俣町
  '073083': {
    text: 'みんなの笑顔と若い活力にあふれ 自然豊かな 歴史と文化が薫るまち',
    source: 'https://www.town.kawamata.lg.jp/site/chosei-shisetsu/6th-shinkoukeikaku.html',
  },
  // 大玉村
  '073229': {
    text: '小さくても輝く 大いなる田舎 美しい村 大玉村',
    source: 'https://www.vill.otama.fukushima.jp/gyousei_jouhou/keikaku/sinnkoukeikaku5/',
  },
  // 鏡石町
  '073423': {
    text: '未来へつなぐ ずっと安心 みんな元気に"進（ススム）"かがみいし',
    source: 'https://www.town.kagamiishi.fukushima.jp/kurashi/chousei/seisaku/009671.html',
  },
  // 天栄村
  '073440': {
    text: '自然と共に 人・未来を創造する村 てんえい',
    source: 'https://www.vill.tenei.fukushima.jp/soshiki/35/daigojisougoukeikakukouki.html',
  },
  // 只見町
  '073679': {
    text: '誰もが心豊かに安心して住み続けられるまち',
    source: 'https://www.town.tadami.lg.jp/referenceroom/2026/04/02/53b355f755b81aaea38be706b80f235c.pdf',
  },
  // 南会津町
  '073687': {
    text: '自然と人が笑顔を育むまち',
    source: 'https://www.town.minamiaizu.lg.jp/official/choseijoho/kakushukeikaku/shinko/2862.html',
  },
  // 北塩原村
  '074021': {
    text: '輝け未来 みんなの五色 プロジェクト 北塩原',
    source: 'https://www.vill.kitashiobara.fukushima.jp/soshiki/somukikaku/6638.html',
  },
  // 西会津町
  '074055': {
    text: '未来を編む。幸せひろがる 日本の田舎、西会津町。',
    source: 'https://www.town.nishiaizu.fukushima.jp/uploaded/attachment/14422.pdf',
  },
  // 磐梯町
  '074071': {
    text: '自分たちの子や孫たちが暮らし続けたい魅力あるまちづくり',
    source: 'https://www.town.bandai.fukushima.jp/site/machizukuri/sougoukeikaku.html',
  },
  // 猪苗代町
  '074080': {
    text: 'ともに地域を育て、みんなが心地よく暮らせるまち猪苗代',
    source: 'https://www.town.inawashiro.fukushima.jp/soshiki/2/1311.html',
  },
  // 会津坂下町
  '074217': {
    text: 'やっぱり“ばんげ”がいい！',
    source: 'https://www.town.aizubange.fukushima.jp/uploaded/attachment/5102.pdf',
  },
  // 湯川村
  '074225': {
    text: '会津盆地のど真ん中 おいしいお米と ほこれる文化 みんなで創ろう 笑顔あふれる 湯川村',
    source: 'https://www.vill.yugawa.fukushima.jp/uploaded/attachment/4226.pdf',
  },
  // 柳津町
  '074233': {
    text: 'みらい創生。 ひと・ゆめ・れきしをつなぐまち',
    source: 'https://www.town.yanaizu.fukushima.jp/docs/2021060100019/file_contents/gaiyou_2026.pdf',
  },
  // 三島町
  '074446': {
    text: '住みたい、住み続けたいふるさと（桐源郷）を創る',
    source: 'https://www.town.mishima.fukushima.jp/uploaded/attachment/1144.pdf',
  },
  // 昭和村
  '074462': {
    text: '昭和村で「ここちよく」暮らす',
    source: 'https://www.vill.showa.fukushima.jp/uploads/2026/04/the_6th_general_plan_secondhalf_full.pdf',
  },
  // 会津美里町
  '074471': {
    text: 'もっとつながる ほっと安らぐ ずっと住みたい 美しきふる里 会津美里町',
    source: 'https://www.town.aizumisato.fukushima.jp/material/files/group/3/daiyozisougoukeikaku.pdf',
  },
  // 西郷村
  '074616': {
    text: '「さわやか高原公園都市」にしごう',
    source: 'https://www.vill.nishigo.fukushima.jp/sonseijoho/shisaku_keikaku/seisaku_sogokeikaku/4/1261.html',
  },
  // 泉崎村
  '074641': {
    text: '活力あふれ、人が輝く｢住んでよし、誇れる村づくり｣',
    source: 'https://www.vill.izumizaki.fukushima.jp/gyosei/machidukuri/keikaku/page000283.html',
  },
  // 中島村
  '074659': {
    text: 'みんなが輝（き）らめく 豊かな なかじまむら',
    source: 'https://www.vill-nakajima.jp/page/page001251.html',
  },
  // 棚倉町
  '074811': {
    text: '人と緑と歴史が結び合う幸住空間 躍動 たなぐら',
    source: 'https://www.town.tanagura.fukushima.jp/data/doc/1741742024_doc_48_0.pdf',
  },
  // 矢祭町
  '074829': {
    text: 'すてきな未来を みんなでつくる やまつりまち',
    source: 'https://www.town.yamatsuri.fukushima.jp/data/doc/1788766967_doc_14_0.pdf',
  },
  // 塙町
  '074837': {
    text: '豊かな自然と和のこころ 未来につなぐ にぎわいの里 はなわ',
    source: 'https://www.town.hanawa.fukushima.jp/data/doc/1662345793_doc_61_0.pdf',
  },
  // 石川町
  '075019': {
    text: '共に創る 幸せ実現のまち',
    source: 'https://www.town.ishikawa.fukushima.jp/admin/project/03/rokijisougou.html',
  },
  // 玉川村
  '075027': {
    text: '未来（あす）への挑戦！明るく元気な たまかわ',
    source: 'https://www.vill.tamakawa.fukushima.jp/guide/plan/007197.html',
  },
  // 古殿町
  '075051': {
    text: 'みんながいつも元気でいられる活気あふれる町',
    source: 'https://www.town.furudono.fukushima.jp/chouseijyouhou/torikumikeikaku/7jisinnkoukeikaku/212',
  },
  // 三春町
  '075213': {
    text: 'いつまでも“ゆかしい”まち 三春',
    source: 'https://www.town.miharu.fukushima.jp/soshiki/27/uploads/250108%E9%95%B7%E6%9C%9F%E8%A8%88%E7%94%BB%28%E5%9F%BA%E6%9C%AC%E6%A7%8B%E6%83%B3%29.pdf',
  },
  // 小野町
  '075221': {
    text: '人が輝き みんなでつくる しあわせおのまち',
    source: 'https://www.town.ono.fukushima.jp/soshiki/3/sougoukeikaku1_1.html',
  },
  // 楢葉町
  '075426': {
    text: '笑顔とチャレンジがあふれるまち ならは',
    source: 'https://www.town.naraha.lg.jp/Files/2026/%E7%AC%AC%E5%85%AD%E6%AC%A1%E6%A5%A2%E8%91%89%E7%94%BA%E5%8B%A2%E6%8C%AF%E8%88%88%E8%A8%88%E7%94%BB_%E5%BE%8C%E6%9C%9F%E8%A8%88%E7%94%BB%EF%BC%88%E6%A6%82%E8%A6%81%E7%89%88%EF%BC%89.pdf',
  },
  // 富岡町
  '075434': {
    text: '一人ひとりの幸せで みんなの未来を創る 富岡町',
    source: 'https://www.tomioka-town.jp/uploaded/attachment/6561.pdf',
  },
  // 川内村
  '075442': {
    text: 'つながり、思いやり、支えあう。',
    source: 'https://www.kawauchimura.jp/gyosei/keikaku-yosan/sogokeikaku-fukkokeikaku/page001246.html',
  },
  // 浪江町
  '075477': {
    text: '夢と希望があふれ 住んでいたいまち 住んでみたいまち',
    source: 'https://www.town.namie.fukushima.jp/uploaded/life/43359_197153_misc.pdf',
  },
  // 葛尾村
  '075485': {
    text: '自然 人 温もりをむすぶ 結いのむら かつらお',
    source: 'https://www.katsurao.org/soshiki/1/shinkoukeikaku5.html',
  },
  // 新地町
  '075612': {
    text: '安心して暮らせる 活力あるまち しんち',
    source: 'https://www.shinchi-town.jp/img/shinchi_keikaku_gaiyou.pdf',
  },
  // 飯舘村
  '075647': {
    text: '美わしく 清らかな村 いいたて',
    source: 'https://www.vill.iitate.fukushima.jp/uploaded/attachment/17587.pdf',
  },
  // 茨城県
  '080004': {
    text: '活力があり、県民が日本一幸せな県',
    source: 'https://www.pref.ibaraki.jp/somu/hodo/hodo/pressrelease/hodohappyoushiryou/2203/documents/260327keikakusuisin.pdf',
  },
  // 水戸市
  '082015': {
    text: 'こども育む くらし楽しむ みらいに躍動する 魁のまち・水戸',
    source: 'https://www.city.mito.lg.jp/page/69724.html',
  },
  // 日立市
  '082023': {
    text: '共創で新たな歴史を刻む 次世代型みらい都市 ひたち',
    source: 'https://www-source.city.hitachi.lg.jp/_res/projects/default_project/_page_/001/020/487/sakutei.pdf',
  },
  // 土浦市
  '082031': {
    text: '夢のある、元気のある土浦',
    source: 'https://www.city.tsuchiura.lg.jp/data/doc/1658280480_doc_159_0.pdf',
  },
  // 古河市
  '082040': {
    text: '華のある都市 古河',
    source: 'https://www.city.ibaraki-koga.lg.jp/material/files/group/2/dai3kikeikaku_gaiyouban.pdf',
  },
  // 石岡市
  '082058': {
    text: '誰もが輝く未来へ 共に創る石岡市',
    source: 'https://www.city.ishioka.lg.jp/data/doc/1711935963_doc_17_0.pdf',
  },
  // 結城市
  '082074': {
    text: 'みんなの想いを 未来へつなぐ 活力あふれ文化が薫るまち 結城',
    source: 'https://www.city.yuki.lg.jp/shisei/keikaku/sougoukeikaku/6th/page007080.html',
  },
  // 龍ケ崎市
  '082082': {
    text: 'Creation －ともに創るまち・龍ケ崎－',
    source: 'https://www.city.ryugasaki.ibaraki.jp/shisei/zaisei/kakusyukeikaku/toplevelplan/mirai_vison_for2030.files/miraisouzouvision_2030_gaiyou.pdf',
  },
  // 下妻市
  '082104': {
    text: '人と自然を活かし、住みよさを創るまち しもつま',
    source: 'https://www.city.shimotsuma.lg.jp/data/doc/1685513886_doc_456_0.pdf',
  },
  // 常総市
  '082112': {
    text: 'みんなでつくる しあわせのまち じょうそう',
    source: 'https://www.city.joso.lg.jp/data/doc/1675917543_doc_5_0.pdf',
  },
  // 常陸太田市
  '082121': {
    text: '幸せを感じ、暮らし続けたいと思うまち 常陸太田',
    source: 'https://www.city.hitachiota.ibaraki.jp/shisei/plan/kikaku/page004238.html',
  },
  // 高萩市
  '082147': {
    text: '地域力が笑顔を育むまち 高萩',
    source: 'https://www.city.takahagi.ibaraki.jp/gyousei/keikaku/keikaku2/page008118.html',
  },
  // 北茨城市
  '082155': {
    text: '誰もが住みたい 安らぎと活力にあふれるまち 北茨城',
    source: 'https://www.city.kitaibaraki.lg.jp/docs/2020031300021/',
  },
  // 笠間市
  '082163': {
    text: '文化交流都市 笠間',
    source: 'https://www.city.kasama.lg.jp/data/doc/1648690174_doc_70_0.pdf',
  },
  // 取手市
  '082171': {
    text: 'ぬくもりとやすらぎに満ち、共に活力を育むまち とりで',
    source: 'https://www.city.toride.ibaraki.jp/seisaku/shise/machizukuri/sogo/plan2024/documents/toridemiraisouzouplan2024-dai1bu.pdf',
  },
  // 牛久市
  '082198': {
    text: '笑顔あふれる にぎわいとやすらぎのあるまち うしく',
    source: 'https://www.city.ushiku.lg.jp/data/doc/1744152203_doc_274_0.pdf',
  },
  // つくば市
  '082201': {
    text: 'つながりを力に未来をつくる',
    source: 'https://www.city.tsukuba.lg.jp/shisei/joho/1005290/1005288.html',
  },
  // ひたちなか市
  '082210': {
    text: '暮らしをデザインできる、職住育共創のまち',
    source: 'https://www.city.hitachinaka.lg.jp/shisei/keikaku/1001631/1014639/index.html',
  },
  // 鹿嶋市
  '082228': {
    text: 'Colorful Stage KASHIMA',
    source: 'https://www.city.kashima.ibaraki.jp/uploaded/life/70595_95278_misc.pdf',
  },
  // 潮来市
  '082236': {
    text: '暮らしを愉しみ市民が活躍する「水の郷」',
    source: 'https://www.city.itako.lg.jp/shisei/kei-sen-sankaku/kei-sen-sankaku-machi/kei-sen-sankaku-sougouk/page004546.html',
  },
  // 守谷市
  '082244': {
    text: '水と緑のパワースポット もりや',
    source: 'https://www.city.moriya.ibaraki.jp/shisei/keikaku/1004442/1004443/index.html',
  },
  // 常陸大宮市
  '082252': {
    text: '人が輝き 安心・快適で 活力と誇りあふれるまち',
    source: 'https://www.city.hitachiomiya.lg.jp/kurashi_gyousei/gyousei/plan/sougou_keikaku/sougou/page002606.html',
  },
  // 那珂市
  '082261': {
    text: '人と地域が輝く安心・安全な住みよいまち',
    source: 'https://www.city.naka.lg.jp/gyousei/keikaku/page002632.html',
  },
  // 筑西市
  '082279': {
    text: 'あらゆる世代が安心して暮らせる元気都市 筑西',
    source: 'https://www.city.chikusei.lg.jp/gyousei/measures/page009191.html',
  },
  // 坂東市
  '082287': {
    text: 'みんなでつくる やすらぎと生きがい 賑わいのある都市(まち) 坂東',
    source: 'https://www.city.bando.lg.jp/page/page010692.html',
  },
  // 稲敷市
  '082295': {
    text: '自然とともに豊かさと幸せを実感できるまち',
    source: 'https://www.city.inashiki.lg.jp/data/doc/1713329563_doc_210_0.pdf',
  },
  // かすみがうら市
  '082309': {
    text: 'きらり輝く 湖と山 笑顔と活気のふれあい都市',
    source: 'https://www.city.kasumigaura.lg.jp/data/doc/1650846384_doc_10_0.pdf',
  },
  // 桜川市
  '082317': {
    text: 'ヤマザクラと市民の幸せが咲くまち 桜川',
    source: 'https://www.city.sakuragawa.lg.jp/shisei/gyousei_keikaku/page005075.html',
  },
  // 神栖市
  '082325': {
    text: '魅力ある誇れる神栖市を目指して',
    source: 'https://www.city.kamisu.ibaraki.jp/_res/projects/default_project/_page_/001/010/592/02_kousou.pdf',
  },
  // 行方市
  '082333': {
    text: '一人一人にとって豊かで魅力あふれるふるさと、行方',
    source: 'https://www.city.namegata.ibaraki.jp/data/doc/1777360728_doc_365_0.pdf',
  },
  // 鉾田市
  '082341': {
    text: '『いのち』と『くらし』の先進都市',
    source: 'https://www.city.hokota.lg.jp/page/page000890.html',
  },
  // つくばみらい市
  '082350': {
    text: 'しあわせと笑顔があふれる みどりがつなぐ“みらい”都市',
    source: 'https://www.city.tsukubamirai.lg.jp/gyousei/seisaku/sougou/sougou-kouki/page004830.html',
  },
  // 小美玉市
  '082368': {
    text: '「ひと もの 地域」が輝き はばたく ダイヤモンドシティ',
    source: 'https://www.city.omitama.lg.jp/manage/contents/upload/6aa8b499738ea.pdf',
  },
  // 茨城町
  '083020': {
    text: '三世代が共に輝く元気交流空間 夢と希望を未来へつなぐまち',
    source: 'https://www.town.ibaraki.lg.jp/manage/contents/upload/64102a738cc61.pdf',
  },
  // 大洗町
  '083097': {
    text: '幸せ無限大・不幸ゼロのまち大洗',
    source: 'https://www.town.oarai.lg.jp/chouseijouhou/keikaku/sougoukeikaku/9130/',
  },
  // 東海村
  '083411': {
    text: '一人ひとりの“想い”をつなぎ 誰もが“幸せ”になれる 「いいムラ」を創る',
    source: 'https://www.vill.tokai.ibaraki.jp/sonseijoho/keikaku_torikumi/sogokeikaku_jisshikeikaku/10482.html',
  },
  // 大子町
  '083640': {
    text: '豊かな資源をつむぎ 人々が豊かに暮らし、訪れるまち 奥久慈に輝く日本一幸せなＤＡＩＧＯ',
    source: 'https://www.town.daigo.ibaraki.jp/page/page007319.html',
  },
  // 美浦村
  '084425': {
    text: '人と自然が輝くまち 美浦',
    source: 'https://www.vill.miho.lg.jp/data/doc/1747642174_doc_165_1.pdf',
  },
  // 阿見町
  '084433': {
    text: '地域力が高く誰もが幸せに暮らせるまち',
    source: 'https://www.town.ami.lg.jp/cmsfiles/contents/0000012/12869/gaiyouban.pdf',
  },
  // 河内町
  '084476': {
    text: '空と緑と金色と 穂平線の見えるまち KAWACHI',
    source: 'https://www.town.ibaraki-kawachi.lg.jp/data/doc/1775212882_doc_22_0.pdf',
  },
  // 八千代町
  '085219': {
    text: 'ともにつむぎ ひびきあう 協奏のまち 八千代',
    source: 'https://www.town.ibaraki-yachiyo.lg.jp/page/page012057.html',
  },
  // 五霞町
  '085421': {
    text: 'キラリ☆五霞町～快適で居心地のよいまち～',
    source: 'https://www.town.goka.lg.jp/kurashi-machi-shigoto/gyousei/machizukuri/keikaku-shisaku/page006460.html',
  },
  // 境町
  '085464': {
    text: '河岸の歴史と自然の恵みあふれる,次世代を育む安らぎとイノベーションのまち 境',
    source: 'https://www.town.ibaraki-sakai.lg.jp/page/page002206.html',
  },
  // 利根町
  '085642': {
    text: 'ともに創ろう みんなが住みたくなるまち とね',
    source: 'https://www.town.tone.ibaraki.jp/chosei/jugyou-keikaku/shinkoukeikaku/page005724.html',
  },
  // 栃木県
  '090000': {
    text: '共に創る 人も地域も輝く“元気なとちぎ”',
    source: 'https://www.pref.tochigi.lg.jp/a01/newplan/documents/20260129144139.pdf',
  },
  // 宇都宮市
  '092011': {
    text: '輝く人の和 つながるまちの環 魅力と夢の輪 うつのみや',
    source: 'https://www.city.utsunomiya.lg.jp/shisei/machi/1034530/sougoukeikaku/1028177.html',
  },
  // 足利市
  '092029': {
    text: '誇り高く 仁(ひと)を育み 挑戦し続けるまち足利',
    source: 'https://www.city.ashikaga.tochigi.jp/goverment/000085/000472/p000045.html',
  },
  // 栃木市
  '092037': {
    text: '豊かな自然と共生し 優しさと強さが調和した 活力あふれる栃木市',
    source: 'https://www.city.tochigi.lg.jp/soshiki/2/59473.html',
  },
  // 佐野市
  '092045': {
    text: '水と緑にあふれる北関東のどまん中 支え合い、人と地域が輝く交流拠点都市',
    source: 'https://www.city.sano.lg.jp/material/files/group/2/05_52199219.pdf',
  },
  // 鹿沼市
  '092053': {
    text: '豊かな自然と文化につつまれ人が輝き地域が輝くみんなが住みたいまち',
    source: 'https://www.city.kanuma.tochigi.jp/0366/info-0000011019-0.html',
  },
  // 日光市
  '092061': {
    text: '誰もが楽しく 健やかに暮らす 新しいまち',
    source: 'https://www.city.nikko.lg.jp/torikumi/keikaku/5282.html',
  },
  // 小山市
  '092088': {
    text: '自然の豊かさと 都市の活力が共存・持続するまち 田園環境都市おやま',
    source: 'https://www.city.oyama.tochigi.jp/data/doc/1785457055_doc_289_0.pdf',
  },
  // 真岡市
  '092096': {
    text: 'JUMP UP もおか〜だれもが“わくわく”するまち〜',
    source: 'https://www.city.moka.lg.jp/material/files/group/47/sougoukeikaku20252029gaiyoubann.pdf',
  },
  // 大田原市
  '092100': {
    text: '知恵と愛のある 協働互敬のまち おおたわら',
    source: 'https://www.city.ohtawara.tochigi.jp/docs/2017032900039/',
  },
  // 那須塩原市
  '092134': {
    text: '人がつながり 新しい力が湧きあがるまち 那須塩原',
    source: 'https://www.city.nasushiobara.tochigi.jp/shiseijoho/shinoseisakutokeikaku/kikakubu/12/3/1/9926.html',
  },
  // さくら市
  '092142': {
    text: '安心して暮らせ、地域・ひと・ものを結ぶ、魅力いっぱいのまち',
    source: 'https://www.city.tochigi-sakura.lg.jp/manage/contents/upload/6a445c2a9f7f3.pdf',
  },
  // 那須烏山市
  '092151': {
    text: '新たな未来への第一歩 市民が主役のまち 那須烏山市',
    source: 'https://www.city.nasukarasuyama.lg.jp/city-administration/plans-policies/plans/policy-division/master-plan/page003154.html',
  },
  // 下野市
  '092169': {
    text: 'しあわせ うまれる 下野市',
    source: 'https://www.city.shimotsuke.lg.jp/manage/contents/upload/69b89b678a331.pdf',
  },
  // 上三川町
  '093017': {
    text: 'GOOD LIFE かみのかわ',
    source: 'https://www.town.kaminokawa.lg.jp/0166/info-0000002342-0.html',
  },
  // 益子町
  '093424': {
    text: 'つどい ともに輝くまち 益子',
    source: 'https://www.town.mashiko.lg.jp/page/page004618.html',
  },
  // 芳賀町
  '093459': {
    text: 'スーパースマートタウン～幸せを実現できるまち～',
    source: 'https://www.town.tochigi-haga.lg.jp/chouseijouhou/gyouseihyouka/keikaku/dai6jishinkoukeikaku.html',
  },
  // 壬生町
  '093611': {
    text: '壬力いっぱい みんなが主役 ずーっと住みたい わくわく壬生町',
    source: 'https://www.town.mibu.tochigi.jp/docs/2026032600016/file_contents/7_.pdf',
  },
  // 野木町
  '093645': {
    text: '水と緑と人の和でうるおいのあるまち',
    source: 'https://www.town.nogi.lg.jp/data/doc/1774252561_doc_44_0.pdf',
  },
  // 高根沢町
  '093866': {
    text: '未来への安心と希望に満ちたまち',
    source: 'http://www.town.takanezawa.tochigi.jp/gyosei/plan/sogo/2026/index.html',
  },
  // 那須町
  '094072': {
    text: 'みどり輝き 活気と笑顔あふれ ともに未来を創るまち 那須',
    source: 'https://www.town.nasu.lg.jp/0235/info-0000004387-1.html',
  },
  // 那珂川町
  '094111': {
    text: 'なかがわの 輝きとうるおいにみちあふれた わくわくするまち',
    source: 'https://www.town.tochigi-nakagawa.lg.jp/manage/contents/upload/69cc81edb43d3.pdf',
  },
  // 前橋市
  '102016': {
    text: 'めぶく。～良いものが育つまち～',
    source: 'https://www.city.maebashi.gunma.jp/gyosei/6/1/2/51545.html',
  },
  // 桐生市
  '102032': {
    text: '感性育み 未来織りなす 粋なまち桐生',
    source: 'https://www.city.kiryu.lg.jp/shisei/keikaku/1018137/1013502/index.html',
  },
  // 伊勢崎市
  '102041': {
    text: 'えがお咲く未来へ 持続可能な共生都市 いせさき',
    source: 'https://www.city.isesaki.lg.jp/gyoseijoho/seisaku_keikaku/sogokeikaku/18463.html',
  },
  // 太田市
  '102059': {
    text: 'みんなの笑顔がすぐそばにあるまち おおた',
    source: 'https://www.city.ota.gunma.jp/page/1028810.html',
  },
  // 沼田市
  '102067': {
    text: 'こころ豊かに暮らし、しあわせを実感できるまち 沼田',
    source: 'https://www.city.numata.gunma.jp/_res/projects/default_project/_page_/001/006/729/01_6jisou_honpen_bunkatu_01.pdf',
  },
  // 館林市
  '102075': {
    text: '里沼の息づく次世代へ安心をつなぐ暮らしやすいまち館林',
    source: 'https://www.city.tatebayashi.gunma.jp/s003/shisei/040/100/180/040/040/20260220165601.html',
  },
  // 渋川市
  '102083': {
    text: 'やすらぎとふれあいに満ちたほっとなまち',
    source: 'https://www.city.shibukawa.lg.jp/shisei/000259/000261/index.html',
  },
  // 藤岡市
  '102091': {
    text: '郷土を愛し 未来を創生する藤岡',
    source: 'https://www.city.fujioka.gunma.jp/shiseijoho/machizukuri_keikaku_kyotei/2/1/2625.html',
  },
  // 富岡市
  '102105': {
    text: '世界遺産にふさわしいまち とみおか',
    source: 'https://www.city.tomioka.lg.jp/www/contents/1459297260160/index.html',
  },
  // 安中市
  '102113': {
    text: '住んで良かった 豊かで魅力ある元気な 新しいあんなか',
    source: 'https://www.city.annaka.lg.jp/uploaded/attachment/10559.pdf',
  },
  // みどり市
  '102121': {
    text: '輝くひと輝くみどり 豊かな生活創造都市',
    source: 'https://www.city.midori.gunma.jp/shisei/1001659/1001840/1003150.html',
  },
  // 榛東村
  '103446': {
    text: 'enjoy SHINTO ～暮らしも遊びも仕事も～',
    source: 'https://www.vill.shinto.gunma.jp/manage/contents/upload/6a0d2fa4eb51b.pdf',
  },
  // 吉岡町
  '103454': {
    text: '思いを紡ぎ、未来につなげるまちづくり 吉岡',
    source: 'https://www.town.yoshioka.lg.jp/chousei/pdf/eba8a8c0f09a9e2d90a7063f6c0140a9.pdf',
  },
  // 上野村
  '103667': {
    text: '人・地域がつながり、輝ける未来へつなぐ',
    source: 'https://www.uenomura.jp/358fd4bf34423f5f738a73adcccdb5eb.pdf',
  },
  // 神流町
  '103675': {
    text: 'みんなで紡ぐ“笑顔でにぎわう”まち',
    source: 'https://www.town.kanna.gunma.jp/material/files/group/2/sougoukeikaku.pdf',
  },
  // 下仁田町
  '103829': {
    text: '人が輝き、暮らしが輝き、未来が輝くまち しもにた',
    source: 'https://www.town.shimonita.lg.jp/kikaku-zaisei/m05/m02/20170419094948.html',
  },
  // 南牧村
  '103837': {
    text: 'みんなで創る 一人ひとりが住みやすい 南牧村',
    source: 'https://nanmoku.ne.jp/wp-content/uploads/2024/06/総合計画-.pdf',
  },
  // 甘楽町
  '103845': {
    text: 'しあわせホームタウン甘楽',
    source: 'https://www.town.kanra.lg.jp/kikaku/chousei/cityplan/20220401.html',
  },
  // 中之条町
  '104213': {
    text: 'ここで暮らす幸せ、なかのじょう',
    source: 'https://www.town.nakanojo.gunma.jp/uploaded/attachment/6069.pdf',
  },
  // 長野原町
  '104248': {
    text: 'ともに生きる力をつくる',
    source: 'https://www.town.naganohara.gunma.jp/assets/images/content/content_20260324_200330.pdf',
  },
  // 嬬恋村
  '104256': {
    text: '高原に抱かれた美しい希望の里 嬬恋村',
    source: 'https://www.vill.tsumagoi.gunma.jp/www/contents/1000000000269/simple/no6.sogokeikaku.pdf',
  },
  // 高山村
  '104281': {
    text: 'つどい・つむぎ・つなぐ村 たかやま',
    source: 'https://vill.takayama.gunma.jp/02chiiki/sogo-keikaku/soukei06.pdf',
  },
  // 東吾妻町
  '104299': {
    text: '住民が誇りを持って暮らすまち',
    source: 'https://www.town.higashiagatsuma.gunma.jp/www/contents/1203254599713/simple/kouki_honpen1.pdf',
  },
  // 片品村
  '104434': {
    text: '伝統と革新が融合する 永遠の輝きを放つ村 尾瀬の郷・かたしな',
    source: 'https://www.vill.katashina.gunma.jp/gaiyou/keikaku/files/sougoukeikaku.pdf',
  },
  // 川場村
  '104442': {
    text: '田園理想郷',
    source: 'https://www.vill.kawaba.gunma.jp/kurashi/sonsei/item/c9280cdaca44b65e660f50f66ddf658a.pdf',
  },
  // 昭和村
  '104485': {
    text: 'ともにつくろう 輝く昭和村',
    source: 'https://www.vill.showa.gunma.jp/kurashi/gyousei/plan/files/01/dai6zi_sougoukeikaku.pdf',
  },
  // みなかみ町
  '104493': {
    text: '水と森林と人を育む 利根川源流のまち みなかみ',
    source: 'https://www.town.minakami.gunma.jp/politics/04machikeikaku/machidukuri/2023-0303-0917-71.html',
  },
  // 玉村町
  '104647': {
    text: '暮らすなら、ここがいい。',
    source: 'https://www.town.tamamura.lg.jp/docs/2021040200012/',
  },
  // 板倉町
  '105210': {
    text: '地域で支え合う安全なまち いたくら',
    source: 'https://www.town.itakura.gunma.jp/cont/s004000/d004040/20251002_sougoukeikaku.pdf',
  },
  // 明和町
  '105228': {
    text: '人と緑が輝く オールインワンのまち',
    source: 'https://www.town.meiwa.gunma.jp/material/files/group/3/kihonkousou.pdf',
  },
  // 千代田町
  '105236': {
    text: '共につくろう 人と自然が輝く 元気で活力あるまち ちよだ',
    source: 'https://www.town.chiyoda.gunma.jp/kikakuzaisei/kikaku/keikaku/kikaku005.html',
  },
  // 大泉町
  '105244': {
    text: '住んでみたい 住み続けたいまち おおいずみ',
    source: 'https://www.town.oizumi.gunma.jp/s005/gyosei/010/020/030/20260406/2026kihonkousoudai2bu.pdf',
  },
  // 邑楽町
  '105252': {
    text: '幸せあふれる住みよいまち“おうら”',
    source: 'https://www.town.ora.gunma.jp/s008/060/060/seventhplan.html',
  },
  // 埼玉県
  '110001': {
    text: '日本一暮らしやすい埼玉へ',
    source: 'https://www.pref.saitama.lg.jp/a0102/5-keikaku/04-gaiyo.html',
  },
  // 川越市
  '112011': {
    text: 'ずっと安心、もっと幸せ、魅力あふれるまち 川越',
    source: 'https://www.city.kawagoe.saitama.jp/_res/projects/default_project/_page_/001/020/411/3_kihonkoso.pdf',
  },
  // 熊谷市
  '112020': {
    text: '子どもたちの笑顔があふれるまち 熊谷 〜輝く未来へトライ〜',
    source: 'https://www.city.kumagaya.lg.jp/about/soshiki/sogo/kikaku/sousin/dai2_sousin_kouki.files/dai2_soushinkouki_03kihonkoso.pdf',
  },
  // 川口市
  '112038': {
    text: '産業と文化と自然が調和した 輝きあふれるまち 川口',
    source: 'https://www.city.kawaguchi.lg.jp/material/files/group/7/2026_soukei_02.pdf',
  },
  // 秩父市
  '112071': {
    text: '笑顔がつながる 自然と文化のまち ちちぶ',
    source: 'https://www.city.chichibu.lg.jp/6440.html',
  },
  // 所沢市
  '112089': {
    text: '絆、自然、文化 元気あふれる『よきふるさと所沢』',
    source: 'https://www.city.tokorozawa.saitama.jp/shiseijoho/keikaku/5sogokeikaku/6sogokeikaku/kihonkousou-kouki/6jikouki.files/6th_gaiyouhen.pdf',
  },
  // 飯能市
  '112097': {
    text: '人・自然・未来がつながる 森林文化都市 はんのう ～好循環を育む ずっと暮らしたいまち～',
    source: 'https://www.city.hanno.lg.jp/shiseijoho/keikaku_shisaku/keikaku_infrastructurekei/13325.html',
  },
  // 加須市
  '112101': {
    text: 'みんなでつくる 元気あふれる 安全・安心・未来のまち 加須',
    source: 'https://www.city.kazo.lg.jp/material/files/group/4/kazoshisougoushinkoukeikakukaitei.pdf',
  },
  // 本庄市
  '112119': {
    text: 'あなたと活かす みんなで育む 歴史と教育のまち 本庄 ～世のため、後のため～',
    source: 'https://www.city.honjo.lg.jp/soshiki/kikakuzaisei/kikaku/tantoujouhou/sogosinkou/sogoshinkokeikakukokikihonkeikaku_reiwa5_reiwa9/14164.html',
  },
  // 東松山市
  '112127': {
    text: '元気と希望と歩むまち 住みよさ やさしさ 東松山',
    source: 'https://www.city.higashimatsuyama.lg.jp/soshiki/3/2799.html',
  },
  // 春日部市
  '112143': {
    text: 'つながる にぎわう すまいるシティ 春日部',
    source: 'https://www.city.kasukabe.lg.jp/shiseijoho/shisaku_keikaku/sogoshinkokeikaku/38380.html',
  },
  // 狭山市
  '112151': {
    text: '緑と健康で豊かな文化都市',
    source: 'https://www.city.sayama.saitama.jp/shisei/shisaku/sougoukeikaku/5shinko/index.files/5soukei_02.pdf',
  },
  // 羽生市
  '112160': {
    text: '誰もが幸せを感じる、住み続けたいまち 羽生',
    source: 'https://www.city.hanyu.lg.jp/docs/2022102700075/',
  },
  // 鴻巣市
  '112178': {
    text: '花かおり 緑あふれ 人輝くまち こうのす',
    source: 'https://www.city.kounosu.saitama.jp/page/3138.html',
  },
  // 深谷市
  '112186': {
    text: '元気と笑顔の生産地 ふかや',
    source: 'https://www.city.fukaya.saitama.jp/shisei/keikakushisakuchosa/sogokeikaku/soukei2/1521549468237.html',
  },
  // 上尾市
  '112194': {
    text: 'みんなでつくる みんなが輝くまち あげお',
    source: 'https://www.city.ageo.lg.jp/page/00221042401.html',
  },
  // 草加市
  '112216': {
    text: '快適都市～地域の豊かさの創出～',
    source: 'https://www.city.soka.saitama.jp/cont/s1201/PAGE000000000000064232.html',
  },
  // 越谷市
  '112224': {
    text: '水と緑と太陽に恵まれた みんなが活躍する安全・安心・共生都市',
    source: 'https://www.city.koshigaya.saitama.jp/',
  },
  // 蕨市
  '112232': {
    text: '安心・にぎわい・未来 みんなで創る みんなにあたたかい みんなのまち蕨',
    source: 'https://www.city.warabi.saitama.jp/shisei/vision/1009576/index.html',
  },
  // 戸田市
  '112241': {
    text: '『このまちで良かった』みんな輝く 未来共創のまち とだ',
    source: 'https://www.city.toda.saitama.jp/soshiki/152/kikaku-dai5jikouki.html',
  },
  // 入間市
  '112259': {
    text: 'みんなでつくる 住みやすさが実感できるまち いるま',
    source: 'https://www.city.iruma.saitama.jp/material/files/group/4/0104kousou.pdf',
  },
  // 朝霞市
  '112275': {
    text: 'だれもが誇れる 暮らしつづけたいまち 朝霞',
    source: 'https://www.city.asaka.lg.jp/soshiki/2/6jisougoukeikaku.html',
  },
  // 志木市
  '112283': {
    text: 'よりそう想い 広がる絆 いいね！がいっぱい 志木のまち',
    source: 'https://www.city.shiki.lg.jp/soshiki/32/39206.html',
  },
  // 和光市
  '112291': {
    text: 'みんなをつなぐ ワクワクふるさと 和光',
    source: 'https://www.city.wako.lg.jp/shisei/seisaku/1006568/1006569/1006582/index.html',
  },
  // 新座市
  '112305': {
    text: '未来もずっと 暮らしに『プラス』が生まれる 豊かなまち 新座',
    source: 'https://www.city.niiza.lg.jp/site/kihon-keikaku/5-keikaku.html',
  },
  // 桶川市
  '112313': {
    text: '学び豊かな 笑顔あふれる 幸せ未来都市 おけがわ',
    source: 'https://www.city.okegawa.lg.jp/shisei/shinoshokaikanko/keikaku_sengen/sogo/7471.html',
  },
  // 久喜市
  '112321': {
    text: '人が笑顔 街が元気 自然が豊か 久しく喜び合う住みやすいまち 久喜',
    source: 'https://www.city.kuki.lg.jp/shisei/plan/zenpan/1007026/1005499.html',
  },
  // 北本市
  '112330': {
    text: '緑にかこまれた健康な文化都市',
    source: 'https://www.city.kitamoto.lg.jp/soshiki/seisakusuisinbu/seisakusuisin/keikaku/k1/dairokujikitamotoshisougoushinnkoukeikaku/17360.html',
  },
  // 八潮市
  '112348': {
    text: '住みやすさナンバー1のまち 八潮',
    source: 'https://www.city.yashio.lg.jp/shisei/keikaku/sogokeikaku/soukei.html',
  },
  // 富士見市
  '112356': {
    text: '私たちは、自らの歩みで充実した日々を送ることができる未来を目指します。',
    source: 'https://www.city.fujimi.saitama.jp/shisei/04gyouseizaisei/sogokeikaku/2020-1225-1700.files/kihonnkousou.pdf',
  },
  // 三郷市
  '112372': {
    text: 'きらりとひかる田園都市みさと～ひとにも企業にも選ばれる魅力的なまち～',
    source: 'https://www.city.misato.lg.jp/shiseijoho/seisaku_keikaku/shiseizempannikansurumono/6678.html',
  },
  // 蓮田市
  '112381': {
    text: '四季かおる つながり 安心 活きるまち',
    source: 'https://www.city.hasuda.saitama.jp/sesaku/shise/shisaku/shinkokekaku/documents/dai5jisougoushinkoukeikaku_kaitei.pdf',
  },
  // 坂戸市
  '112399': {
    text: '住みつづけたいまち 子育てしたいまち さかど',
    source: 'https://www.city.sakado.lg.jp/uploaded/attachment/22711.pdf',
  },
  // 幸手市
  '112402': {
    text: '幸せを手にするまち 幸手',
    source: 'https://www.city.satte.lg.jp/material/files/group/37/03_kihon_kousou.pdf',
  },
  // 鶴ヶ島市
  '112411': {
    text: 'しあわせ共感 安心のまち つるがしま',
    source: 'https://www.city.tsurugashima.lg.jp/data/doc/1745452222_doc_464_0.docx',
  },
  // 日高市
  '112429': {
    text: '誰もが安心して住み続けられる ふれあい清流文化都市 日高',
    source: 'https://www.city.hidaka.lg.jp/information/79/96/dai6jisougoukeikaku/34689.html',
  },
  // 吉川市
  '112437': {
    text: '幸せつながる みんなのまち よしかわ',
    source: 'https://www.city.yoshikawa.saitama.jp/index.cfm/27,81759,174,859,html',
  },
  // ふじみ野市
  '112453': {
    text: '人がつながる 豊かで住み続けたいまち ふじみ野',
    source: 'https://www.city.fujimino.saitama.jp/material/files/group/2/gaiyou_53054199.pdf',
  },
  // 白岡市
  '112461': {
    text: 'みんなでつくる 自然と利便性の調和したまち しらおか',
    source: 'https://www.city.shiraoka.lg.jp/material/files/group/2/dai6jisougoushinkoukeikaku.pdf',
  },
  // 伊奈町
  '113018': {
    text: 'これからも安心して住み続けられる ぬくもりのあるまちづくり',
    source: 'https://www.town.saitama-ina.lg.jp/0000000030.html',
  },
  // 三芳町
  '113247': {
    text: '共に創ろう ひと・まち・みどりが つながる 幸せのまち',
    source: 'https://www.town.saitama-miyoshi.lg.jp/town/keikaku/documents/6sougoukeikaku_part2.pdf',
  },
  // 毛呂山町
  '113263': {
    text: 'みんなでつくる 住みやすいまち 住み続けたいまち もろやま',
    source: 'https://www.town.moroyama.saitama.jp/gyoseisite/choseijoho/seisaku_keikaku/1/2/12162.html',
  },
  // 越生町
  '113271': {
    text: 'みどりとせせらぎのまち 越生',
    source: 'https://www.town.ogose.saitama.jp/material/files/group/3/dai6kouki_02-kihonkousou.pdf',
  },
  // 滑川町
  '113417': {
    text: 'まちづくり ひとづくり 笑顔あふれる滑川町',
    source: 'https://www.town.namegawa.saitama.jp/choseijoho/namegawamachinogaiyo/sumairutownzukuri/1682.html',
  },
  // 嵐山町
  '113425': {
    text: '未来へつなぐ ひと しぜん くらし ともに学び育むまち らんざん',
    source: 'https://www.town.ranzan.saitama.jp/0000005219.html',
  },
  // 吉見町
  '113476': {
    text: '未来へつなぐ みんなで安心して暮らせるまちよしみ',
    source: 'https://www.town.yoshimi.saitama.jp/soshiki/sougou_seisaku/14/1561.html',
  },
  // 鳩山町
  '113484': {
    text: '暮しに幸せを感じるまち HAPPY TOWN はとやま',
    source: 'https://www.town.hatoyama.saitama.jp/data/doc/1661166732_doc_7_0.pdf',
  },
  // ときがわ町
  '113492': {
    text: '人と自然の優しさにふれるまち ときがわ',
    source: 'https://www.town.tokigawa.lg.jp/info/1873',
  },
  // 皆野町
  '113620': {
    text: '住んでみたいまち 住み続けたいまち ときめきの皆野',
    source: 'https://www.town.minano.saitama.jp/wp-content/uploads/2018/04/16265f27acfad1e9b314e4da71f16129.pdf',
  },
  // 長瀞町
  '113638': {
    text: '人も社会も自然もすべてが健康で、はつらつとしている長瀞をつくろう',
    source: 'https://www.town.nagatoro.saitama.jp/towninformation/plan01/',
  },
  // 美里町
  '113816': {
    text: '町民の誰もが住み続けたくなる豊かなまち 美里',
    source: 'https://www.town.saitama-misato.lg.jp/0000002638.html',
  },
  // 神川町
  '113832': {
    text: '人を育てて まちが育つ 未来につなぐ 住みよい 神川',
    source: 'https://www.town.kamikawa.saitama.jp/material/files/group/3/201810sougoukeikaku.pdf',
  },
  // 上里町
  '113859': {
    text: 'ひと・まち・自然が共に輝く”ハーモニータウン かみさと”',
    source: 'https://www.town.kamisato.saitama.jp/5771.htm',
  },
  // 杉戸町
  '114642': {
    text: 'みんなで育てるまち すぎと ～自然とやさしさがあふれるまちへ～',
    source: 'https://www.town.sugito.lg.jp/uploaded/attachment/16531.pdf',
  },
  // 松伏町
  '114651': {
    text: 'みんなの笑顔を未来へつなぐ 緑あふれるまち まつぶし',
    source: 'https://www.town.matsubushi.lg.jp/0000002693.html',
  },
  // 千葉県
  '120006': {
    text: '県民を守り、支え、そして飛躍する千葉の実現',
    source: 'https://www.pref.chiba.lg.jp/seisaku/sougou/soukei-text/part2-chapter2-1.html',
  },
  // 千葉市
  '121002': {
    text: 'みんなが輝く 都市と自然が織りなす・千葉市',
    source: 'https://www.city.chiba.jp/sogoseisaku/sogoseisaku/kikaku/sougoukeikaku/kihonkeikaku.html',
  },
  // 銚子市
  '122025': {
    text: '握手 ～つながる まちづくりのちから～',
    source: 'https://www.city.choshi.chiba.jp/content/000003773.pdf',
  },
  // 市川市
  '122033': {
    text: 'いのちを尊び 知性と希望を育み 環境と共生して 和がつながるまち いちかわ ～住み続けたいまちを次世代へ～',
    source: 'https://www.city.ichikawa.lg.jp/uploaded/attachment/48908.pdf',
  },
  // 船橋市
  '122041': {
    text: '人も まちも 輝く 笑顔あふれる 船橋',
    source: 'https://www.city.funabashi.lg.jp/shisei/keikaku/002/p104014_d/fil/R8-10_jissikeikaku.pdf',
  },
  // 館山市
  '122050': {
    text: 'みんなが主役 住んで楽しい 来て楽しい まち・館山',
    source: 'https://www.city.tateyama.chiba.jp/files/300398840.pdf',
  },
  // 木更津市
  '122068': {
    text: '魅力あふれる 創造都市 きさらづ',
    source: 'https://www.city.kisarazu.lg.jp/gyoseijoho/sesaku_keikaku/kihon/7123.html',
  },
  // 松戸市
  '122076': {
    text: '多世代がともにいきいきと思い思いに暮らすことができるまち やさシティ、まつど。',
    source: 'https://www.city.matsudo.chiba.jp/shisei/keikaku-kousou/sougoukeikaku2021/sougoukeikaku_r4-r11.files/soukei_tyuukanminaoshi_gaiyou.pdf',
  },
  // 野田市
  '122084': {
    text: '～人のつながりがまちを変える～ みんなでつくる 学びと笑顔あふれる コウノトリも住めるまち',
    source: 'https://www.city.noda.chiba.jp/_res/projects/default_project/_page_/001/007/641/230327kousou1.pdf',
  },
  // 茂原市
  '122106': {
    text: '未来へつながる「交流拠点都市」もばら',
    source: 'https://www.city.mobara.chiba.jp/cmsfiles/contents/0000006/6546/1sougoukeikaku.pdf',
  },
  // 成田市
  '122114': {
    text: '住んでよし 働いてよし 訪れてよしの 生涯を完結できる空の港まち なりた',
    source: 'https://www.city.narita.chiba.jp/shisei/page002400.html',
  },
  // 佐倉市
  '122122': {
    text: '笑顔輝き 佐倉 咲く みんなで創ろう「健康・安心・未来都市」',
    source: 'https://www.city.sakura.lg.jp/material/files/group/3/01_5jisoukei_all.pdf',
  },
  // 東金市
  '122131': {
    text: '豊かな自然と伝統を守り 未来へ続くMy City東金',
    source: 'https://www.city.togane.chiba.jp/0000009105.html',
  },
  // 旭市
  '122157': {
    text: 'みんなで創る未来 ず～っと大好きなまち旭 ～健康で心豊かな暮らし“ウェルビーイング”の向上～',
    source: 'https://www.city.asahi.lg.jp/uploaded/attachment/29856.pdf',
  },
  // 習志野市
  '122165': {
    text: '多彩で豊かな交流が広がるまち 習志野',
    source: 'https://www.city.narashino.lg.jp/joho/keikaku/seisakukeiei/tyouki/22833.html',
  },
  // 勝浦市
  '122181': {
    text: '“豊かな自然”に抱かれて “心豊か”に過ごせるまち かつうら',
    source: 'https://www.city.katsuura.lg.jp/uploaded/attachment/1035.pdf',
  },
  // 流山市
  '122203': {
    text: '都心から一番近い森のまち',
    source: 'https://www.city.nagareyama.chiba.jp/information/1007116/1007327/index.html',
  },
  // 八千代市
  '122211': {
    text: '人がつながり 未来につなぐ 緑豊かな 笑顔あふれるまち やちよ',
    source: 'https://www.city.yachiyo.lg.jp/uploaded/attachment/1093.pdf',
  },
  // 我孫子市
  '122220': {
    text: '未来につなぐ 心やすらぐ 水辺のまち 我・孫・子',
    source: 'https://www.city.abiko.chiba.jp/shisei/keikauhoushin/sougoukeikaku/r4_15dai4ji/20220401.html',
  },
  // 鴨川市
  '122238': {
    text: '健康と観光の融合都市 ～自然と共に生きるウェルネスシティ鴨川～',
    source: 'https://www.city.kamogawa.lg.jp/soshiki/2/40993.html',
  },
  // 鎌ケ谷市
  '122246': {
    text: '人と緑と産業が 調和し未来へひろがる鎌ケ谷',
    source: 'https://www.city.kamagaya.chiba.jp/sesakumidashi/sesaku-sougoukeikaku/sesaku-sougoukeikaku/jissikeikakuhoseiban.html',
  },
  // 君津市
  '122254': {
    text: 'ひとが輝き 幸せつなぐ きみつ',
    source: 'https://www.city.kimitsu.lg.jp/soshiki/7/42001.html',
  },
  // 富津市
  '122262': {
    text: '誇りと愛着を持てるまち ふっつ',
    source: 'https://www.city.futtsu.lg.jp/cmsfiles/contents/0000007/7179/miraikousou.pdf',
  },
  // 浦安市
  '122271': {
    text: '人が輝き躍動するまち・浦安～すべての市民の幸せのために～',
    source: 'https://www.city.urayasu.lg.jp/_res/projects/default_project/_page_/001/029/052/kousou.pdf',
  },
  // 四街道市
  '122289': {
    text: '幸せつなぐ 未来への道しるべ - Yotsukaido Happy Road -',
    source: 'https://www.city.yotsukaido.chiba.jp/shisei/torikumi/koso/sogokeikaku/yotsukaido_keikaku/kousou/soukeikousou2024.html',
  },
  // 袖ケ浦市
  '122297': {
    text: 'みんなでつくる 人つどい 緑かがやく 安心のまち 袖ケ浦',
    source: 'https://www.city.sodegaura.lg.jp/uploaded/attachment/22269.pdf',
  },
  // 八街市
  '122301': {
    text: '緑豊かに心豊かに健やかに ともに支えあい安心して暮らせる八街',
    source: 'https://www.city.yachimata.lg.jp/soshiki/3/49372.html',
  },
  // 印西市
  '122319': {
    text: '住みよさ実感都市 ずっと このまち いんざいで',
    source: 'https://www.city.inzai.lg.jp/0000022392.html',
  },
  // 白井市
  '122327': {
    text: '世代を超えた 笑顔と豊かさを 未来へつなぐまち',
    source: 'https://www.city.shiroi.chiba.jp/soshiki/seisaku/s03/kis004/kis019/kis024/14956.html',
  },
  // 富里市
  '122335': {
    text: '心ひとつに 未来に向かって飛び立つ 躍動のとみさと',
    source: 'https://www.city.tomisato.lg.jp/cmsfiles/contents/0000000/735/kihonkousou.pdf',
  },
  // 南房総市
  '122343': {
    text: 'ひと・ゆめ・みらい 地域で創る魅力の郷 南房総',
    source: 'https://www.city.minamiboso.chiba.jp/0000016243.html',
  },
  // 匝瑳市
  '122351': {
    text: '海・みどり・ひとがはぐくむ 活力あるまち 匝瑳市',
    source: 'https://www.city.sosa.lg.jp/data/doc/1561614834_doc_109_0.pdf',
  },
  // 香取市
  '122360': {
    text: '豊かな暮らしを育む 歴史文化・自然の郷 香取 ～人が輝き 人が集うまち～',
    source: 'https://www.city.katori.lg.jp/government/plan_policy/plan/zempan/sogokeikaku/sougou2_koki/index.html',
  },
  // いすみ市
  '122386': {
    text: '幸せ、安心、笑顔あふれるまち いすみ',
    source: 'https://www.city.isumi.lg.jp/material/files/group/17/c8febed5ae9f99380fc26978a0f75a07.pdf',
  },
  // 大網白里市
  '122394': {
    text: '未来に向けて みんなでつくろう！ 住みたい・住み続けたいまち',
    source: 'https://www.city.oamishirasato.lg.jp/cmsfiles/contents/0000015/15138/2026.01.pdf',
  },
  // 栄町
  '123293': {
    text: '笑顔あふれるあたたかいまち 水と緑のふるさと さかえ',
    source: 'https://www.town.sakae.chiba.jp/chosei/town-plan/sougoukeikaku/page008141.html',
  },
  // 神崎町
  '123421': {
    text: '生き生きわくわく 人も発酵するまち こうざき',
    source: 'https://www.town.kozaki.chiba.jp/profile/machizukuri/files/5-4kousou.pdf',
  },
  // 多古町
  '123471': {
    text: '世代を超えて みんなで暮らしつづけたい 多古町',
    source: 'https://www.town.tako.chiba.jp/docs/2025032500029/',
  },
  // 東庄町
  '123498': {
    text: '躍動 連携 地域力 とうのしょう ～ 地域の宝を地域の力で次代へ ～',
    source: 'https://www.town.tohnosho.chiba.jp/material/files/group/4/R04sougoukeikaku_kou1.pdf',
  },
  // 九十九里町
  '124036': {
    text: '人、自然、風土を力に 未来に広がる海浜文化都市 九十九里',
    source: 'https://www.town.kujukuri.chiba.jp/0000000586.html',
  },
  // 芝山町
  '124095': {
    text: 'まち・子育て・仕事・暮らし 充実と希望が生まれる国際空港町・芝山',
    source: 'https://www.town.shibayama.lg.jp/cmsfiles/contents/0000004/4310/bunkatuban2_sougoukeikaku.pdf',
  },
  // 横芝光町
  '124109': {
    text: '人と自然と賑わいがつなぐ『幸せ実感』のまち 横芝光',
    source: 'https://www.town.yokoshibahikari.chiba.jp/uploaded/attachment/30252.pdf',
  },
  // 長生村
  '124231': {
    text: '夢がある、生きがいを感じる、住んで良かった 長生村',
    source: 'https://www.vill.chosei.chiba.jp/cmsfiles/contents/0000000/388/6th_keikaku_kihonkousou.pdf',
  },
  // 白子町
  '124249': {
    text: '笑顔 元気 ずっと暮らしたい町 しらこ',
    source: 'https://www.town.shirako.lg.jp/0000002288.html',
  },
  // 長柄町
  '124265': {
    text: '水と緑と笑顔が輝く ヒューマンリゾートながら',
    source: 'https://www.town.nagara.chiba.jp/uploaded/attachment/6709.pdf',
  },
  // 長南町
  '124273': {
    text: '人とつながり 地域とつながり 次代へつなげる 「ただいま、おかえり」 心のふるさと 長南',
    source: 'https://www.town.chonan.chiba.jp/wp-content/uploads/2011/08/dai5sougoukeikaku.pdf',
  },
  // 大多喜町
  '124419': {
    text: 'みんなでつくる 持続可能な住みやすいまち 大多喜',
    source: 'https://www.town.otaki.chiba.jp/gyousei/zaisei_seisaku/1/sougoukeikaku/2788.html',
  },
  // 鋸南町
  '124630': {
    text: 'みんなでつくる三ツ星のふるさと・鋸南',
    source: 'https://www.town.kyonan.chiba.jp/soshiki/6/0011450.html',
  },
  // 東京都
  '130001': {
    text: '世界で一番の都市・東京',
    source: 'https://www.seisakukikaku.metro.tokyo.lg.jp/documents/d/seisakukikaku/2050tokyo-pocket',
  },
  // 千代田区
  '131016': {
    text: '伝統と未来が調和し、躍進するまち～彩りあふれる、希望の都心～',
    source: 'https://www.city.chiyoda.lg.jp/documents/28170/kihonkoso1.pdf',
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
  // 小平市
  '132110': {
    text: 'つながり、共に創るまち こだいら',
    source: 'https://www.city.kodaira.tokyo.jp/kurashi/files/88018/088018/att_0000018.pdf',
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
  // 国分寺市
  '132144': {
    text: '歴史をつなぎ 未来をひらく 個性がひかり輝くまち',
    source: 'https://www.city.kokubunji.tokyo.jp/shisei/houshin/1021957/1030715.html',
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
  // 大島町
  '133612': {
    text: '郷土大島を豊かにし、共につくる島',
    source: 'https://www.town.oshima.tokyo.jp/uploaded/attachment/5911.pdf',
  },
  // 利島村
  '133621': {
    text: '生き生きとした活力のある島 自立する村 利島',
    source: 'https://www.toshimamura.org/fs/1/6/4/3/3/9/_/____4__________________4____7__.pdf',
  },
  // 新島村
  '133639': {
    text: '３、２、１、でつながる島 にいじまいんど 〜モヤイの心〜 あふれる島',
    source: 'https://www.niijima.com/gyousei/keikaku/files/20210513sougoukeikaku.pdf',
  },
  // 神津島村
  '133647': {
    text: '誰もが健やかで、生き生きと活力のある島づくり',
    source: 'https://www.vill.kouzushima.tokyo.jp/images/2023/03/20210414-keikaku5.pdf',
  },
  // 三宅村
  '133817': {
    text: '思いやりが環（めぐ）る豊かな島',
    source: 'https://www.vill.miyake.tokyo.jp/gyousei/houshin_keikaku/files/04-04-21.pdf',
  },
  // 八丈町
  '134015': {
    text: 'ともに支えあうあたたかい町',
    source: 'https://www.town.hachijo.tokyo.jp/chousei/hachijojima-g/kihon-kousou/',
  },
  // 小笠原村
  '134210': {
    text: '心豊かに暮らし続けられる島',
    source: 'https://www.vill.ogasawara.tokyo.jp/kikaku_seisaku/comprehensiveplan/',
  },
  // 神奈川県
  '140007': {
    text: 'いのち輝くマグネット神奈川',
    source: 'https://www.pref.kanagawa.jp/documents/100941/pamphlet1.pdf',
  },
  // 横浜市
  '141003': {
    text: '市民力と創造力により新しい「横浜らしさ」を生み出す都市',
    source: 'https://cgi.city.yokohama.lg.jp/somu/reiki/reiki_honbun/g202RG00001518.html',
  },
  // 川崎市
  '141305': {
    text: '成長と成熟の調和による持続可能な最幸のまち かわさき',
    source: 'https://www.city.kawasaki.jp/170/page/0000073259.html',
  },
  // 相模原市
  '141500': {
    text: '潤いと活力に満ち 笑顔と希望があふれるまち さがみはら',
    source: 'https://www.city.sagamihara.kanagawa.jp/shisei/1026766/seisaku/1015646/index.html',
  },
  // 横須賀市
  '142018': {
    text: '変化を力に進むまち。横須賀市',
    source: 'https://www.city.yokosuka.kanagawa.jp/shisei/unei/vision/index.html',
  },
  // 平塚市
  '142034': {
    text: '市民が幸せに暮らすまち',
    source: 'https://www.city.hiratsuka.kanagawa.jp/common/200149388.pdf',
  },
  // 鎌倉市
  '142042': {
    text: '古都としての風格を保ちながら、生きる喜びと新しい魅力を創造するまち',
    source: 'https://www.city.kamakura.kanagawa.jp/keiki/4th-plan/documents/vision2034tougoubannp6_p9.pdf',
  },
  // 藤沢市
  '142051': {
    text: '郷土愛あふれる藤沢 ～松風に人の和うるわし 湘南の元気都市～',
    source: 'https://www.city.fujisawa.kanagawa.jp/documents/31717/hpshishin2028gaiyo.pdf',
  },
  // 小田原市
  '142069': {
    text: '誰もが笑顔で暮らせる、愛すべきふるさと小田原',
    source: 'https://www.city.odawara.kanagawa.jp/field/municipality/vision/7th/',
  },
  // 茅ヶ崎市
  '142077': {
    text: '笑顔と活力にあふれ みんなで未来を創るまち 茅ヶ崎',
    source: 'https://www.city.chigasaki.kanagawa.jp/_res/projects/default_project/_page_/001/041/840/sougoukeikaku20210401_gaiyoubann_A3.pdf',
  },
  // 逗子市
  '142085': {
    text: '自然に生かされ、自然を生かすまち コミュニティに支えられ、コミュニティを支えるまち',
    source: 'https://www.city.zushi.kanagawa.jp/_res/projects/default_project/_page_/001/005/540/soukei2025_02.pdf',
  },
  // 三浦市
  '142107': {
    text: 'ともにつくる 支え合いの輪が広がる 海とみどりの都市 あたらしいみうら',
    source: 'https://www.city.miura.kanagawa.jp/material/files/group/5/dai5jimiurasisougoukeikaku1.pdf',
  },
  // 秦野市
  '142115': {
    text: '水とみどりに育まれ誰もが輝く暮らしよい都市（まち）',
    source: 'https://www.city.hadano.kanagawa.jp/shisei/gyoseiunei/2/1/9960.html',
  },
  // 厚木市
  '142123': {
    text: 'つながる未来都市-A-T-S-U-G-I-',
    source: 'https://www.city.atsugi.kanagawa.jp/soshiki/kikakuseisakuka/13/11sougoukeikaku/51588.html',
  },
  // 大和市
  '142131': {
    text: 'みんながつながる健幸都市やまと',
    source: 'https://www.city.yamato.lg.jp/material/files/group/7/03_kihonnkousou.pdf',
  },
  // 伊勢原市
  '142140': {
    text: '人と自然と歴史が織りなす 暮らしやすさ実感都市 伊勢原',
    source: 'https://www.city.isehara.kanagawa.jp/docs/2023032000037/file_contents/hyoushi-aisatsu-mokuji.pdf',
  },
  // 海老名市
  '142158': {
    text: 'みんなが笑顔 住みやすいまち えびな',
    source: 'https://www.city.ebina.kanagawa.jp/shisei/seisaku/sougou/1010554.html',
  },
  // 座間市
  '142166': {
    text: 'ひと・まちが輝き 未来へつなぐ',
    source: 'https://www.city.zama.kanagawa.jp/_res/projects/default_project/_page_/001/013/231/houshin.pdf',
  },
  // 南足柄市
  '142174': {
    text: '自然を活かし 人を育み 未来を拓く 南足柄',
    source: 'https://www.city.minamiashigara.kanagawa.jp/global-image/units/175157/1-20240404180420.pdf',
  },
  // 綾瀬市
  '142182': {
    text: '緑と文化が薫るふれあいのまち あやせ',
    source: 'https://www.city.ayase.kanagawa.jp/material/files/group/5/sougoukeikaku2030_kaitei_01.pdf',
  },
  // 葉山町
  '143014': {
    text: '自分らしく、つながるまち',
    source: 'https://www.town.hayama.lg.jp/soshiki/seisaku/11/4/5thgeneralplan/5thgeneralplan1stseason/15708.html',
  },
  // 寒川町
  '143219': {
    text: 'つながる力で 新化するまち',
    source: 'https://www.town.samukawa.kanagawa.jp/soshiki/kikaku/kikakuseisaku/kikaku/info/sogokeikaku/19832.html',
  },
  // 大磯町
  '143413': {
    text: '紺碧の海に緑の映える住みよい大磯',
    source: 'https://www.town.oiso.kanagawa.jp/soshiki/seisaku/seisaku/tantou/sougou_5/11556.html',
  },
  // 二宮町
  '143421': {
    text: '豊かな自然と心を育み、人から人へつなぐ笑顔の未来',
    source: 'https://www.town.ninomiya.kanagawa.jp/0000001948.html',
  },
  // 中井町
  '143618': {
    text: '町民が幸福を実感できるまち なかい～里都まちで「よく生きる」～',
    source: 'https://www.town.nakai.kanagawa.jp/choseijoho/keikaku_seisaku/nakaimachisogokeikaku/3156.html',
  },
  // 大井町
  '143626': {
    text: 'みんなでつなぐ 大井の未来',
    source: 'https://www.town.oi.kanagawa.jp/uploaded/attachment/18885.pdf',
  },
  // 松田町
  '143634': {
    text: 'いのち“育み” 未来へ“ツナグ” 進化“つづける”故郷',
    source: 'https://town.matsuda.kanagawa.jp/uploaded/attachment/13820.pdf',
  },
  // 山北町
  '143642': {
    text: 'みんなでつくる こころ豊かに暮らせるまち やまきた',
    source: 'https://www.town.yamakita.kanagawa.jp/0000006362.html',
  },
  // 開成町
  '143669': {
    text: '人と地域が輝き、笑顔と躍動感あふれるまち・開成',
    source: 'https://www.town.kaisei.kanagawa.jp/info/2214',
  },
  // 箱根町
  '143821': {
    text: 'やすらぎとおもてなしのあふれる町－箱根',
    source: 'https://www.town.hakone.kanagawa.jp/www/contents/1100000001649/simple/20220421-103830.pdf',
  },
  // 真鶴町
  '143839': {
    text: '小さくて昔から変わらないけれど、実は最先端。 のんびりスマート真鶴',
    source: 'https://www.town.manazuru.kanagawa.jp/soshiki/seisakusuishin/seisakusuishin/3639.html',
  },
  // 湯河原町
  '143847': {
    text: '湯けむりと笑顔あふれる四季彩のまち 湯河原',
    source: 'https://www.town.yugawara.kanagawa.jp/soshiki/17/2586.html',
  },
  // 愛川町
  '144011': {
    text: 'ひかり、みどり、ゆとり、共生のまち愛川',
    source: 'https://www.town.aikawa.kanagawa.jp/material/files/group/4/dai6jisougoukeikaku.pdf',
  },
  // 清川村
  '144029': {
    text: '水と緑あふれる心のふるさと',
    source: 'https://www.town.kiyokawa.kanagawa.jp/Administration/kiyokawamura/3790.html',
  },
  // 新潟県
  '150002': {
    text: '住んでよし、訪れてよしの新潟県',
    source: 'https://www.pref.niigata.lg.jp/sec/seisaku/1356915122382.html',
  },
  // 新潟市
  '151009': {
    text: '田園の恵みを感じながら 心豊かに暮らせる 日本海拠点都市',
    source: 'https://www.city.niigata.lg.jp/shisei/seisaku/seisaku/sogo/sogokeikaku2030/index.html',
  },
  // 長岡市
  '152021': {
    text: '住み続けたい 戻ってきたい 選ばれるまち～イノベーション先進都市～',
    source: 'https://www.city.nagaoka.niigata.jp/shisei/cate01/sougoukeikaku/index.html',
  },
  // 三条市
  '152048': {
    text: '豊かな自然に恵まれた 歴史と文化の息づく 創意にみちた ものづくりのまち',
    source: 'https://www.city.sanjo.niigata.jp/material/files/group/2/R5-10_sougoukeikaku_gaiyouban.pdf',
  },
  // 柏崎市
  '152056': {
    text: '笑顔とenergy(エナジー)あふれる未来都市・かしわざき',
    source: 'https://www.city.kashiwazaki.lg.jp/shiseijoho/shisaku_keikaku/sogokeikaku_sogosenryaku/sougoukeikaku/6jisogokeikaku_zenki/48473.html',
  },
  // 新発田市
  '152064': {
    text: '住みよいまち日本一 健康田園文化都市・しばた',
    source: 'https://www.city.shibata.lg.jp/machidukuri/seisaku/sougoukeikaku/1024694.html',
  },
  // 小千谷市
  '152081': {
    text: '笑顔と希望を育む「おぢやの輪」をみんなで未来へつなぐまち',
    source: 'https://www.city.ojiya.niigata.jp/soshiki/kikakuseisaku/sougoukeikakutoha.html',
  },
  // 加茂市
  '152099': {
    text: '笑顔あふれるまち 加茂',
    source: 'https://www.city.kamo.niigata.jp/fs/9/0/1/2/4/_/01____.pdf',
  },
  // 十日町市
  '152102': {
    text: '雪と生きる。大地に遊ぶ。未来を創造するまち とおかまち',
    source: 'https://www.city.tokamachi.lg.jp/shisei_machizukuri/shichonoheya/shisei_seisaku/11118.html',
  },
  // 見附市
  '152111': {
    text: '魅力たっぷり 未来につなげる みんなのみつけ',
    source: 'https://www.city.mitsuke.niigata.jp/soshiki/2/1106.html',
  },
  // 村上市
  '152129': {
    text: 'あふれる笑顔のまち村上',
    source: 'https://www.city.murakami.lg.jp/uploaded/attachment/52581.pdf',
  },
  // 燕市
  '152137': {
    text: '人と自然と産業が調和しながら進化する燕市 ～「日本一輝いているまち」を目指して～',
    source: 'https://www.city.tsubame.niigata.jp/material/files/group/5/dai3jisougoukeikaku_gaiyou.pdf',
  },
  // 糸魚川市
  '152161': {
    text: '翠の交流都市 さわやか すこやか 輝きのまち',
    source: 'https://www.city.itoigawa.lg.jp/page/2567.html',
  },
  // 妙高市
  '152170': {
    text: 'みんなでつくる“自分の好きを選べるまち”妙高',
    source: 'https://www.city.myoko.niigata.jp/fs/2/6/8/8/1/9/_/07_%E7%AC%AC4%E6%AC%A1%E5%A6%99%E9%AB%98%E5%B8%82%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB(%E6%9C%AC%E7%B7%A8)%20%E7%AC%AC3%E7%AB%A0.pdf',
  },
  // 五泉市
  '152188': {
    text: 'ずっと五泉。～次の一歩を、ともに未来へ～',
    source: 'https://www.city.gosen.lg.jp/municipal_administration/3/1/2606.html',
  },
  // 上越市
  '152226': {
    text: '暮らしやすく、希望あふれるまち 上越',
    source: 'https://www.city.joetsu.niigata.jp/uploaded/attachment/233487.pdf',
  },
  // 阿賀野市
  '152234': {
    text: '自然環境、歴史環境、地政学的条件をいかしたまちづくり',
    source: 'https://www.city.agano.niigata.jp/material/files/group/5/aganosisougoukeikaku_2025-2028_1jikaitei.pdf',
  },
  // 佐渡市
  '152242': {
    text: '歴史と文化が薫り 人と自然が共生できる持続可能な島',
    source: 'https://www.city.sado.niigata.jp/soshiki/2005/36307.html',
  },
  // 魚沼市
  '152251': {
    text: 'ひとり一人の笑顔がかがやき、幸せを感じられる魚沼市',
    source: 'https://www.city.uonuma.lg.jp/uploaded/attachment/28801.pdf',
  },
  // 南魚沼市
  '152269': {
    text: '自然・人・産業の和で築く 安心のまち',
    source: 'https://www.city.minamiuonuma.niigata.jp/docs/80385.html',
  },
  // 胎内市
  '152277': {
    text: '自然が活きる、人が輝く、交流のまち “胎内”',
    source: 'https://www.city.tainai.niigata.jp/gyose/sogoseisasu/documents/00_2nd_tainaicity_sougoukeikaku.pdf',
  },
  // 聖籠町
  '153079': {
    text: '生まれてよかった 住んでよかった聖籠町',
    source: 'https://www.town.seiro.niigata.jp/7/10/2943.html',
  },
  // 弥彦村
  '153427': {
    text: '住みたい、住み続けたい弥彦村の実現',
    source: 'https://www.vill.yahiko.niigata.jp/administration/?content=861',
  },
  // 田上町
  '153613': {
    text: '誰もがずっと住み続けたいまち たがみ',
    source: 'https://www.town.tagami.niigata.jp/fs/3/8/3/5/6/_/6th-tagami-sougoukeikaku-2.pdf',
  },
  // 阿賀町
  '153851': {
    text: '豊かな自然・かがやく文化・みんなで築く安心のまち',
    source: 'https://www.town.aga.niigata.jp/material/files/group/3/agatownmasterplan_sougou.pdf',
  },
  // 出雲崎町
  '154059': {
    text: 'いままでも、これからも、住み続けたい 関わりたい 帰ってきたい 出雲崎',
    source: 'https://www.town.izumozaki.niigata.jp/chosei/gyosei/dai6sougoukeikaku.html',
  },
  // 湯沢町
  '154610': {
    text: '君と一緒に暮らす町',
    source: 'https://www.town.yuzawa.lg.jp/material/files/group/9/koukikihonnkeikaku2026.pdf',
  },
  // 津南町
  '154822': {
    text: '希望と愛、参加できるまち',
    source: 'https://www.town.tsunan.niigata.jp/uploaded/attachment/6370.pdf',
  },
  // 刈羽村
  '155047': {
    text: '笑顔の村 かりわ',
    source: 'https://www.vill.kariwa.niigata.jp/www/info/detail.jsp?id=8905',
  },
  // 関川村
  '155811': {
    text: '豊かで住みよい活気ある村',
    source: 'https://www.vill.sekikawa.niigata.jp/politics/14/c8bb87d3e8f6/index.html',
  },
  // 富山県
  '160008': {
    text: '幸せ人口1000万 〜ウェルビーイング先進地域、富山〜',
    source: 'https://www.pref.toyama.jp/documents/8598/toyamakensogokeikakugaiyoban.pdf',
  },
  // 富山市
  '162019': {
    text: '人・まち・自然が調和する 活力都市 とやま',
    source: 'https://www.city.toyama.lg.jp/shisei/seisaku/1010738/1011468/1002415/1010740/1002459.html',
  },
  // 高岡市
  '162027': {
    text: '豊かな自然と歴史・文化につつまれ 人と人がつながる 市民創造都市 高岡',
    source: 'https://www.city.takaoka.toyama.jp/gyosei/gyoseijoho/seisaku_keikaku/8/7102.html',
  },
  // 魚津市
  '162043': {
    text: 'ともにつくる 未来につなぐ 人と自然が輝くまち魚津',
    source: 'https://www.city.uozu.toyama.jp/event-topics/svTopiDtl.aspx?servno=13794',
  },
  // 氷見市
  '162051': {
    text: '人 自然 食 文化で未来を拓く交流都市 ひみ',
    source: 'https://www.city.himi.toyama.jp/gyosei/chihousousei/sougou/8021.html',
  },
  // 滑川市
  '162060': {
    text: '笑顔いっぱい 幸せいっぱい 光り輝く 滑川',
    source: 'https://www.city.namerikawa.toyama.jp/shisei/9/11/10181.html',
  },
  // 黒部市
  '162078': {
    text: '大自然のシンフォニー 文化・交流のまち 黒部',
    source: 'https://www.city.kurobe.toyama.jp/category/page.aspx?servno=27390',
  },
  // 小矢部市
  '162094': {
    text: '魅力・安心・充実 しあわせ おやべ',
    source: 'https://www.city.oyabe.toyama.jp/shiseijyouhou/1001905/1001920/1001921/1001923.html',
  },
  // 南砺市
  '162108': {
    text: '誰ひとり取り残さない 誰もが笑顔で暮らし続けられるまちへ',
    source: 'https://www.city.nanto.toyama.jp/gyoseijoho/seisaku-keikaku/1/3945.html',
  },
  // 射水市
  '162116': {
    text: 'いろどり ひろがる ムズムズ射水',
    source: 'https://www.city.imizu.toyama.jp/guide/svGuideDtl.aspx?servno=45946',
  },
  // 舟橋村
  '163210': {
    text: '命かがやく 笑顔あふれる しあわせいっぱい ふなはし',
    source: 'https://www.vill.funahashi.toyama.jp/gyosei_new/measure.html',
  },
  // 上市町
  '163228': {
    text: 'つながる にぎわう ささえあう すべては私とミライのために みんなが主役のまち 上市',
    source: 'https://www.town.kamiichi.toyama.jp/page/17126.html',
  },
  // 立山町
  '163236': {
    text: '資源を磨き 明日を拓く 美しい町 立山',
    source: 'https://www.town.tateyama.toyama.jp/soshikikarasagasu/kikakuseisakuka/kikakukohogakari/7/1/daijyujitateyamamachisougoukeikaku/4206.html',
  },
  // 入善町
  '163422': {
    text: '扇状地に夢と笑顔があふれるまち入善',
    source: 'https://www.town.nyuzen.toyama.jp/gyosei/chosei/shisaku_keikaku/3/4389.html',
  },
  // 朝日町
  '163431': {
    text: '夢と希望があふれるまち 朝日町',
    source: 'https://www.town.asahi.toyama.jp/material/files/group/1/dai6zisougoukeikakugaiyouban.pdf',
  },
  // 石川県
  '170003': {
    text: '幸福度日本一に向けた石川の未来の創造',
    source: 'https://www.pref.ishikawa.lg.jp/kikaku/keikaku/seichosenryaku.html',
  },
  // 金沢市
  '172014': {
    text: '未来を拓く世界の共創文化都市・金沢',
    source: 'https://www4.city.kanazawa.lg.jp/shiseijoho/seisaku_keikaku/kihon-toshikousou/26161.html',
  },
  // 七尾市
  '172022': {
    text: '能登の未来を牽引し 七色に輝く 市民活躍都市 ななお',
    source: 'https://www.city.nanao.lg.jp/kikaku-s/shise/sesaku/1sogokekaku/honpen/2sogokeikaku.html',
  },
  // 小松市
  '172031': {
    text: '世界に時めく日本海側の拠点都市こまつ',
    source: 'https://www.city.komatsu.lg.jp/shiseijoho/seisaku_keikaku/5127.html',
  },
  // 輪島市
  '172049': {
    text: '“あい”の風がはぐくむ 快適・活気・夢のまち',
    source: 'https://www.city.wajima.ishikawa.jp/docs/2013031800011/',
  },
  // 珠洲市
  '172057': {
    text: '魅力ある最先端の珠洲市を目指して',
    source: 'https://www.city.suzu.lg.jp/uploaded/attachment/8581.pdf',
  },
  // 加賀市
  '172065': {
    text: 'もっと住民が幸せな加賀市へ',
    source: 'https://www.city.kaga.ishikawa.jp/shisei_gikai/seisaku_kikaku/seisaku_kikaku/16748.html',
  },
  // 羽咋市
  '172073': {
    text: 'はぐくもう ＃はくいびと くらしてほっと きてほっと いざ！チャレンジ ＃ＨＯＴ羽咋',
    source: 'https://www.city.hakui.lg.jp/material/files/group/5/rokujigaiyou02.pdf',
  },
  // かほく市
  '172090': {
    text: '海とみどりに抱かれた、魅力と活力あふれるまち',
    source: 'https://www.city.kahoku.lg.jp/006/603/608/d011745_d/fil/soukei3.pdf',
  },
  // 白山市
  '172103': {
    text: '健康で笑顔あふれる元気都市 白山',
    source: 'https://www.city.hakusan.lg.jp/machi/sogokeikaku/1007848/index.html',
  },
  // 能美市
  '172111': {
    text: '市民が躍動し、地域が輝く 能き美しきまちづくり',
    source: 'https://www.city.nomi.lg.jp/fs/2/4/9/8/_/sougoukeikaku_gaiyouban.pdf',
  },
  // 野々市市
  '172120': {
    text: 'かがやき無限大 みんなでつくる インパクトシティののいち',
    source: 'https://www.city.nonoichi.lg.jp/uploaded/attachment/26896.pdf',
  },
  // 川北町
  '173240': {
    text: 'キラリと輝く“心のふるさと川北”',
    source: 'https://www.town.kawakita.ishikawa.jp/archives/001/202604/%E5%B7%9D%E5%8C%97%E7%94%BA%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB_2026.pdf',
  },
  // 津幡町
  '173614': {
    text: '元気あり！住んでよし！誰もが輝くまち つばた',
    source: 'https://www.town.tsubata.lg.jp/uploaded/attachment/7398.pdf',
  },
  // 内灘町
  '173657': {
    text: 'ともに支え、ともに歩む 希望育むまち うちなだ',
    source: 'https://www.town.uchinada.lg.jp/soshiki/kikaku/24731.html',
  },
  // 志賀町
  '173843': {
    text: 'ここにしかない未来を。',
    source: 'https://www.town.shika.lg.jp/uploaded/attachment/6605.pdf',
  },
  // 宝達志水町
  '173860': {
    text: '育てよ！町の宝',
    source: 'https://www.hodatsushimizu.jp/soshiki/johosuishinka/15/1_2/873.html',
  },
  // 中能登町
  '174076': {
    text: 'つながりと明るい希望が持てるまちづくり',
    source: 'https://www.town.nakanoto.ishikawa.jp/soshiki/kikaku/3/5/sougou/10105.html',
  },
  // 能登町
  '174637': {
    text: 'ともに活きる、能登で生きる',
    source: 'https://www.town.noto.lg.jp/chosei/seisaku-keikaku/7/5318.html',
  },
  // 福井県
  '180009': {
    text: '「安心のふくい」を未来につなぎ、 もっと挑戦！ もっとおもしろく！',
    source: 'https://www.pref.fukui.lg.jp/doc/seiki/vision2019/top_d/fil/2025vision_gaiyou5.pdf',
  },
  // 福井市
  '182010': {
    text: '彩り豊かな想いかがやく、未来ひらくまち。ふくい ～さあ、楽しもう！チャレンジする毎日を！～',
    source: 'https://www.city.fukui.lg.jp/sisei/plan/plan/p015748.html',
  },
  // 敦賀市
  '182028': {
    text: '好循環が継続する、発展し続ける地域',
    source: 'https://www.city.tsuruga.lg.jp/page/3072.html',
  },
  // 小浜市
  '182044': {
    text: 'みんなで描く、悠久の歴史と風土が活きるまち',
    source: 'https://www1.city.obama.fukui.jp/shisei/shinoseisaku/obamashisogokeikaku/4845_d/fil/c.pdf',
  },
  // 大野市
  '182052': {
    text: '人がつながり地域がつながる 住み続けたい結のまち',
    source: 'https://www.city.ono.fukui.jp/shisei/seisaku-keikaku/sogoplan/dai6jisogo-koki/index.files/6sougou_kouki.pdf',
  },
  // 勝山市
  '182061': {
    text: 'わいわい わくわく 安全安心のまち かつやま',
    source: 'https://www.city.katsuyama.fukui.jp/soshiki/2/20209.html',
  },
  // 鯖江市
  '182079': {
    text: '行動しよう 思いをカタチに',
    source: 'https://www.city.sabae.fukui.jp/about_city/kekaku_torikumi/kakushukeikaku/vision/bison2040.files/sabaevision2040gaiyou1.pdf',
  },
  // あわら市
  '182087': {
    text: '明日への挑戦 未来をきりひらくまち',
    source: 'https://www.city.awara.lg.jp/mokuteki/cityinfo/cityinfo01/3300/p015322_d/fil/bunkatsu02.pdf',
  },
  // 越前市
  '182095': {
    text: '幸せを実感できるふるさと',
    source: 'https://www.city.echizen.lg.jp/office/030/011/sougoukeikakukaitei2022_d/fil/gaiyoban.pdf',
  },
  // 坂井市
  '182109': {
    text: '輝く未来へ…みんなで創る希望のまち',
    source: 'https://www.city.fukui-sakai.lg.jp/kikakuseisaku/shisei/keikaku/sogo-keikaku/documents/kousou2.pdf',
  },
  // 永平寺町
  '183229': {
    text: 'めぐる感動 心つながる清流のまち えいへいじ',
    source: 'https://www.town.eiheiji.lg.jp/200/300/313/p011291_d/fil/2.pdf',
  },
  // 越前町
  '184233': {
    text: '人と技 海土里 織りなす 快適なまち',
    source: 'https://www.town.echizen.fukui.jp/chousei/11/03/p009783_d/fil/3ji_gaiyou.pdf',
  },
  // 美浜町
  '184420': {
    text: 'ひと育み 未来に挑む 共創のまち',
    source: 'https://www.town.fukui-mihama.lg.jp/soshiki/5/15943.html',
  },
  // 高浜町
  '184811': {
    text: 'くるむ つなぐ かがやく',
    source: 'https://www.town.takahama.fukui.jp/page/sougouseisaku/p006244.html',
  },
  // おおい町
  '184837': {
    text: '輝く笑顔がうみだす希望 情熱よせ合うふるさと“おおい”',
    source: 'https://www.town.ohi.fukui.jp/1002/1209/100/p17262_d/fil/keikaku2.pdf',
  },
  // 若狭町
  '185019': {
    text: '新しい感動と笑顔がひろがるまち',
    source: 'https://www.town.fukui-wakasa.lg.jp/material/files/group/4/2soukei.pdf',
  },
  // 山梨県
  '190004': {
    text: '県民一人ひとりが豊かさを実感できるやまなし',
    source: 'https://www.pref.yamanashi.jp/documents/107891/04_kihonnrinenn.pdf',
  },
  // 甲府市
  '192015': {
    text: '幸せ実感 希望ある未来を創り続けるまち 甲府',
    source: 'https://www.city.kofu.lg.jp/shise/shisaku/sogo/7jisgkeikaku/index.html',
  },
  // 富士吉田市
  '192023': {
    text: '富士の恵みと幸せを紡いでまちを織る 活力創造都市 富士吉田',
    source: 'https://www.city.fujiyoshida.yamanashi.jp/page/1475.html',
  },
  // 都留市
  '192040': {
    text: 'ひと集い 学びあふれる 生涯きらめきのまち つる',
    source: 'https://www.city.tsuru.yamanashi.jp/material/files/group/3/6chouki_kouki1.pdf',
  },
  // 山梨市
  '192058': {
    text: '誇れる日本を、ここ山梨市から。',
    source: 'https://www.city.yamanashi.yamanashi.jp/soshiki/5/1891.html',
  },
  // 大月市
  '192066': {
    text: 'ひとと自然をいかし、希望のもてる未来をみんなで実現していくまち 大月',
    source: 'https://www.city.otsuki.yamanashi.jp/shisei/shisaku_keikaku/otsuki_8th_sougoukeikaku.html',
  },
  // 韮崎市
  '192074': {
    text: 'すべての人が輝き 幸せを創造するふるさと にらさき',
    source: 'https://www.city.nirasaki.lg.jp/shiseijoho/keikaku/5/3762.html',
  },
  // 南アルプス市
  '192082': {
    text: '人がつどい 次世代につなぐ 活力あふれるまち 南アルプス',
    source: 'https://www.city.minami-alps.yamanashi.jp/fs/1/3/8/0/8/4/_/_3___________.pdf',
  },
  // 北杜市
  '192091': {
    text: '人と自然と文化が躍動する 環境創造都市',
    source: 'https://www.city.hokuto.yamanashi.jp/fs/4/9/9/6/1/9/_/03_4__________1_______.pdf',
  },
  // 甲斐市
  '192104': {
    text: '緑と活力あふれる生活快適都市',
    source: 'https://www.city.kai.yamanashi.jp/page/3279.html',
  },
  // 笛吹市
  '192112': {
    text: 'ハートフルタウン笛吹～優しさあふれるまち～',
    source: 'https://www.city.fuefuki.yamanashi.jp/documents/11872/dai3zisogokeikakugaiyoubann.pdf',
  },
  // 甲州市
  '192139': {
    text: '豊かな自然 歴史と文化に彩られた 果樹園交流のまち 甲州市',
    source: 'https://www.city.koshu.yamanashi.jp/docs/2026102000029/',
  },
  // 中央市
  '192147': {
    text: '実り豊かな生活文化都市',
    source: 'https://www.city.chuo.yamanashi.jp/material/files/group/1/kouki04.pdf',
  },
  // 市川三郷町
  '193461': {
    text: 'ひと・自然・伝統 「つなぐ。つながる。」 いちか『わ』みさと',
    source: 'https://www.town.ichikawamisato.yamanashi.jp/40administration/12kikaku/files/dai3jisougoukeikakuhp.pdf',
  },
  // 早川町
  '193640': {
    text: 'みんながつながり、山の暮らしを守り伝えるまち',
    source: 'https://www.town.hayakawa.yamanashi.jp/town/images/R8.3sougoukeikaku.pdf',
  },
  // 身延町
  '193658': {
    text: 'つながりと安らぎのなかで 住みつづけたいまち みのぶ',
    source: 'https://www.town.minobu.lg.jp/page/10049.html',
  },
  // 南部町
  '193666': {
    text: '水と緑が溢れるふれあい豊かな町づくり',
    source: 'https://www.town.nanbu.yamanashi.jp/syoukai/files/sougoukeikaku-st3_01.pdf',
  },
  // 昭和町
  '193844': {
    text: '未来への魅力あふれる昭和町',
    source: 'https://www.town.showa.yamanashi.jp/uploaded/attachment/7125.pdf',
  },
  // 道志村
  '194221': {
    text: '１人ひとりが輝く、住んでよかった村づくり',
    source: 'http://www.vill.doshi.lg.jp/info/info.php?if_id=523&ca_id=18',
  },
  // 西桂町
  '194239': {
    text: '豊かな自然 輝く未来を紡ぐ 水のまち にしかつら',
    source: 'https://www.town.nishikatsura.yamanashi.jp/div/0012/pdf/6jisougoukeikaku01.pdf',
  },
  // 忍野村
  '194247': {
    text: 'みんなで築く 豊かなふるさと 忍野村',
    source: 'https://www.vill.oshino.lg.jp/page/7858.html',
  },
  // 山中湖村
  '194255': {
    text: '名山 富士山によく似合う 希望豊かに日々暮らす 未来へ羽ばたく 里を共に築きます',
    source: 'https://www.vill.yamanakako.lg.jp/info/442',
  },
  // 鳴沢村
  '194298': {
    text: '心地よく健やかに暮らせるために みんなでつくる鳴沢村',
    source: 'https://www.vill.narusawa.yamanashi.jp/material/files/group/4/201703tyoukisougoukeikaku1.pdf',
  },
  // 富士河口湖町
  '194301': {
    text: 'ひとを優しくつなぐ 世界に誇る ふじのまち',
    source: 'https://www.town.fujikawaguchiko.lg.jp/upload/file/seisaku/sousoukeikaku/dai2sougoukeikaku_koukikeikaku_2022/hp_koukai/honpen/The%20second%20fujikawaguchiko%20town%20comprehensive%20plan.pdf',
  },
  // 小菅村
  '194425': {
    text: 'みんなでつくる源流の輪 こすげ',
    source: 'http://www.vill.kosuge.yamanashi.jp/data/files/%E7%AC%AC%EF%BC%95%E6%AC%A1%E5%B0%8F%E8%8F%85%E6%9D%91%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB.pdf',
  },
  // 丹波山村
  '194433': {
    text: '縁めぐる里 丹波山村',
    source: 'https://www.vill.tabayama.yamanashi.jp/gyousei/images/tabasogokeikaku5.pdf',
  },
  // 長野県
  '200000': {
    text: '確かな暮らしを守り、信州からゆたかな社会を創る',
    source: 'https://www.pref.nagano.lg.jp/kikaku/message/02kikaku.html',
  },
  // 長野市
  '202011': {
    text: '幸せ実感都市『ながの』',
    source: 'https://www.city.nagano.nagano.jp/n041000/contents/p004191.html',
  },
  // 松本市
  '202029': {
    text: '豊かさと幸せに 挑み続ける 三ガク都',
    source: 'https://www.city.matsumoto.nagano.jp/soshiki/214/195785.html',
  },
  // 上田市
  '202037': {
    text: 'ひと・まち 輝く しあわせ実感都市',
    source: 'https://www.city.ueda.nagano.jp/uploaded/attachment/80432.pdf',
  },
  // 岡谷市
  '202045': {
    text: '人結び 夢と希望を紡ぐ たくましいまち岡谷',
    source: 'https://www.city.okaya.lg.jp/soshikikarasagasu/kikakuka/693/690/620/7426.html',
  },
  // 飯田市
  '202053': {
    text: 'リニアがもたらす大交流時代に「くらし豊かなまち」をデザインする ～合言葉はムトス 誰もが主役 飯田未来舞台～',
    source: 'https://www.city.iida.lg.jp/uploaded/attachment/77220.pdf',
  },
  // 諏訪市
  '202061': {
    text: '魅力の架け橋 高原湖畔都市 ～シゼンとヒトがつながる、すわ。～',
    source: 'https://www.city.suwa.lg.jp/soshiki/5/44343.html',
  },
  // 須坂市
  '202070': {
    text: '「豊かさ」と「しあわせ」を感じる共創のまち 須坂',
    source: 'https://www.city.suzaka.nagano.jp/material/files/group/3/04_part2_kihonkousou.pdf',
  },
  // 小諸市
  '202088': {
    text: '住みたい 行きたい 帰ってきたい まち 小諸 ～自然と文化と人々が織りなすハーモニーで みんなにやさしい 活気あふれる 高原の城下町に～',
    source: 'https://www.city.komoro.lg.jp/material/files/group/3/Mplan5.pdf',
  },
  // 伊那市
  '202096': {
    text: '未来を織りなす 創造と循環のまち 伊那市',
    source: 'https://www.inacity.jp/shisei/kakushuplanshiryo/shimin_chiki/174kija20210820.files/inashidai2kiSDGsmiraitoshikeikaku.pdf',
  },
  // 駒ヶ根市
  '202100': {
    text: '誰もが自由闊達にいきいきと活躍する広場のようなまち',
    source: 'https://www.city.komagane.nagano.jp/gyosei/shiseijoho/seisaku_keikaku/shinokeikaku/sogokeikaku/8835.html',
  },
  // 中野市
  '202118': {
    text: '緑豊かなふるさと 文化が香る元気なまち',
    source: 'https://www.city.nakano.nagano.jp/docs/2026020400017/',
  },
  // 大町市
  '202126': {
    text: '未来を育む ひとが輝く 信濃おおまち',
    source: 'https://www.city.omachi.nagano.jp/shisei/keikaku/jisshikeikaku/tp07yj1io7tsbqcrpdl1q51k',
  },
  // 飯山市
  '202134': {
    text: '飯山郷創 〜世界にひらく 里山の未来〜',
    source: 'https://www.city.iiyama.nagano.jp/assets/files/kikakuzaisei/kikakuchosei/6th_soukei/02kihonkousou.pdf',
  },
  // 茅野市
  '202142': {
    text: '八ヶ岳の自然、人、技、歴史が織りなすやさしさと活力あるまち',
    source: 'https://www.city.chino.lg.jp/site/5thsougoukeikaku/',
  },
  // 塩尻市
  '202151': {
    text: '多彩な暮らし、叶えるまち。―田園都市しおじり―',
    source: 'https://www.city.shiojiri.lg.jp/soshiki/7/49139.html',
  },
  // 佐久市
  '202177': {
    text: '快適健康都市 佐久',
    source: 'https://www.city.saku.nagano.jp/shisei/seisaku_shisaku/sogokeikaku/sokei2.files/04_fundamental.pdf',
  },
  // 千曲市
  '202185': {
    text: '人をてらす 人をはぐくむ 人がつながる 月の都 ～文化伝承創造都市・千曲～',
    source: 'https://www.city.chikuma.lg.jp/material/files/group/10/3keikaku_gaiyou.pdf',
  },
  // 東御市
  '202193': {
    text: '人と自然にやさしい 豊かな暮らしを実感できるまち とうみ',
    source: 'https://www.city.tomi.nagano.jp/file/148341.pdf',
  },
  // 安曇野市
  '202207': {
    text: '自然・文化・産業が織りなす 共生の街 安曇野',
    source: 'https://www.city.azumino.nagano.jp/soshiki/6/136.html',
  },
  // 川上村
  '203041': {
    text: '元気で優しい明るい村づくり',
    source: 'https://www.vill.kawakami.nagano.jp/www/contents/1682482503264/files/2.pdf',
  },
  // 北相木村
  '203076': {
    text: '「おらほうならではの贅沢な時間 北相木」 ～標高1000ｍの冷涼な気候と人の温かさ～',
    source: 'http://www.vill.kitaaiki.nagano.jp/fs/7/9/0/1/7/_/_____6_____.pdf',
  },
  // 佐久穂町
  '203092': {
    text: '自律し多様なコミュニティが人々のくらしを支え、挑戦や行動を支援するまち',
    source: 'https://www.town.sakuho.nagano.jp/choseijoho/gyoseijoho/shisakukeikaku/sogoseisaku_7448.html',
  },
  // 軽井沢町
  '203211': {
    text: '～豊かな自然と共生する～ 人と自然と文化で築く 環境先進都市 軽井沢',
    source: 'https://www.town.karuizawa.lg.jp/page/1737.html',
  },
  // 御代田町
  '203238': {
    text: '未来へつなぐ サステナブルタウン 御代田',
    source: 'https://www.town.miyota.nagano.jp/file/183024.pdf',
  },
  // 立科町
  '203246': {
    text: '人と自然が輝く町',
    source: 'https://www.town.tateshina.nagano.jp/gyoseijoho/seisaku_keikaku/sogokeikaku/2364.html',
  },
  // 青木村
  '203491': {
    text: '明るい！優しい！あったかい！笑顔あふれる青木村 ～人と自然と産業が融和した豊かな郷～',
    source: 'http://www.vill.aoki.nagano.jp/asset/00032/gyousei/soumuka/zigyoushuishin/deta/20220408cyoukif.pdf',
  },
  // 長和町
  '203505': {
    text: '森のささやき 清らかな流れ 悠久の歴史 未来へ耀く 美しの郷',
    source: 'https://www.town.nagawa.nagano.jp/soshiki/sogoseisaku/kikakuseisakukakari/1/9/1/136.html',
  },
  // 下諏訪町
  '203611': {
    text: '「小さくてもきらりと光る美しいまち」 〜人の輪 自然と文化の和 幸せ実感しもすわ〜',
    source: 'https://www.town.shimosuwa.lg.jp/www/contents/1780474484416/files/8jisougoukeikaku_kihonkousou.pdf',
  },
  // 富士見町
  '203629': {
    text: '世界に展かれた高原の文化都市',
    source: 'https://www.town.fujimi.lg.jp/uploaded/attachment/31939.pdf',
  },
  // 原村
  '203637': {
    text: '豊かな自然と文化のもとに多彩な個性が集う 魅力ある村',
    source: 'https://www.vill.hara.lg.jp/docs/307184.html',
  },
  // 辰野町
  '203823': {
    text: '一人ひとりの活躍がつくり出す 住み続けたいまち',
    source: 'https://www.town.tatsuno.lg.jp/gyosei/choseijoho/shisaku_keikaku/sogokeikaku/4226.html',
  },
  // 飯島町
  '203840': {
    text: '新しい発想で考える アルプスのまち 豊かな未来・自然・暮らし',
    source: 'https://www.town.iijima.lg.jp/assets/images/content/content_20260811_133206.pdf',
  },
  // 南箕輪村
  '203858': {
    text: '豊かな自然 つながり育み 夢かなう 南箕輪 〜自然とともに 世代を超えて育む 持続可能なむらづくり〜',
    source: 'https://www.vill.minamiminowa.lg.jp/uploaded/attachment/19162.pdf',
  },
  // 中川村
  '203866': {
    text: '一人ひとりの元気が活きる美しい村 “なかがわ”',
    source: 'https://www.vill.nakagawa.nagano.jp/uploaded/attachment/7096.pdf',
  },
  // 松川町
  '204021': {
    text: 'いっしょに育てよう 一人ひとりが輝く 笑顔あふれるまち まつかわ',
    source: 'https://www.town.matsukawa.lg.jp/soshikikarasagasu/machizukuriseisakuka/kikakutyouseikakari/2/dairokuji/10709.html',
  },
  // 高森町
  '204030': {
    text: 'なりたい「あなた」に会えるまち',
    source: 'https://www.town.nagano-takamori.lg.jp/docs/53150.html',
  },
  // 阿南町
  '204048': {
    text: 'おいなんよ あなんＴＯＷＮ',
    source: 'http://www.town.anan.nagano.jp/storage/2025/04/第６次阿南町総合計画（後期基本計画）-1.pdf',
  },
  // 阿智村
  '204072': {
    text: '暮らす、生きる。阿智家族',
    source: 'https://www.vill.achi.lg.jp/uploaded/life/14339_38216_misc.pdf',
  },
  // 下條村
  '204111': {
    text: '自然と伝統 人が織り成す 下條村',
    source: 'https://www.vill-shimojo.jp/gyousei/gyousei-info/kakuka/soumu_osirase/files/d6kouki-2.pdf',
  },
  // 天龍村
  '204137': {
    text: '一隅を照らす ひと・むら・ミライ ～小さくとも、だれもがいきいきと輝き続ける村～',
    source: 'https://www.vill-tenryu.jp/wp-content/uploads/2026/02/no6_tenryu_sogo_plan.pdf',
  },
  // 喬木村
  '204153': {
    text: '人が輝き 未来につながる 美し郷 喬木',
    source: 'https://www.vill.takagi.lg.jp/doc/2022121300034/',
  },
  // 豊丘村
  '204161': {
    text: 'もっと ずっと ともに とよおか',
    source: 'https://www.vill.nagano-toyooka.lg.jp/19gyousei/07keikaku/01shinkoukeikaku/6sinkoukeikaku.pdf',
  },
  // 大鹿村
  '204170': {
    text: '南アルプスの自然と文化 いろどり豊かに暮らすむら 大鹿',
    source: 'https://www.vill.ooshika.nagano.jp/storage/2024/03/no5_sogo_shinkokeikaku_gaiyo.pdf',
  },
  // 上松町
  '204226': {
    text: '新しい時代にいのち輝き笑顔あふれる“あげまつ”',
    source: 'https://www.town.agematsu.nagano.jp/aboutus/gyosei/joho/kihonkousou.pdf',
  },
  // 南木曽町
  '204234': {
    text: '南木曽をもっと元気に 住むなら南木曽町',
    source: 'https://www.town.nagiso.nagano.jp/cmsfiles/contents/0000000/79/no11nagisokeikaku.pdf',
  },
  // 木祖村
  '204251': {
    text: '笑顔あふれる「源流の里」木祖村',
    source: 'https://www.vill.kiso.nagano.jp/gyoseijoho/shisaku_keikaku/documents/sougoukeikaku/kisomurasougoukeikaku.pdf',
  },
  // 王滝村
  '204293': {
    text: '人も自然も元気でいきいき みんなでつなぐ新たな絆',
    source: 'https://www.vill.otaki.nagano.jp/aboutus/keikaku/keikaku/documents/otaki_sougoukeikaku/6thkeikakuzentai2.pdf',
  },
  // 大桑村
  '204307': {
    text: 'ここに住みたい ここで暮らしたい ここで育てたい 大桑村',
    source: 'https://www.vill.okuwa.lg.jp/okuwa/shisaku-keikau/keikaku/sougoukeikaku_6th.html',
  },
  // 木曽町
  '204323': {
    text: 'みんなで創る 笑顔あふれるまち・木曽 豊かな地域資源を育て未来につなげよう',
    source: 'https://www.town-kiso.com/files/file/box/db/db24f5f28fc06932ce27e8cf1325c49ffd046df0.pdf',
  },
  // 麻績村
  '204463': {
    text: '更なる飛躍を 心ときめく 麻績村へ',
    source: 'https://www.vill.omi.nagano.jp/files/muradukuri/第７次麻績村振興計画.pdf',
  },
  // 生坂村
  '204480': {
    text: '確かな暮らしを明日につなぎ 明るく 健やかに生きる村',
    source: 'https://www.village.ikusaka.nagano.jp/gyousei/muradukuri/muradukuri/08murazukuri_keikkaku.pdf',
  },
  // 山形村
  '204501': {
    text: 'めぐみの大地に抱かれて チャレンジ！やまがた',
    source: 'https://www.vill.yamagata.nagano.jp/docs/6jisousakutei.html',
  },
  // 朝日村
  '204510': {
    text: '人・自然・産業が輝き、 夢・希望・笑顔あふれる 朝日村',
    source: 'https://www.vill.asahi.nagano.jp/material/files/group/11/6thplan_summary.pdf',
  },
  // 筑北村
  '204528': {
    text: '自然に恵まれた「安心」と「活力」のあふれるむら －外に開かれ、中で支えあう、新しい連携と住みよいむらづくりをめざして－',
    source: 'https://www.vill.chikuhoku.lg.jp/fs/3/9/7/_/2_sogo_plan_summary.pdf',
  },
  // 池田町
  '204811': {
    text: '温かい心・豊かな文化・活力ある産業が育ち魅力あふれる美しいまち',
    source: 'https://www.ikedamachi.net/cmsfiles/contents/0000003/3282/dai6jikoukikihonkeikakuv1.pdf',
  },
  // 松川村
  '204820': {
    text: 'みんなで創る「心豊かに暮らせる支え合いの村」',
    source: 'https://www.vill.matsukawa.nagano.jp/assets/images/content/content_20250311_090611.pdf',
  },
  // 白馬村
  '204854': {
    text: '共に生き 豊かさを育む 支え合いと幸せがめぐる Best Living Village',
    source: 'https://www.vill.hakuba.lg.jp/gyosei/soshikikarasagasu/somuka/kikakuchoseigakari/12/6th_comp-plan/13947.html',
  },
  // 小谷村
  '204862': {
    text: '豊かな自然 力をあわせ 元気に暮らす小谷村',
    source: 'https://www.vill.otari.nagano.jp/gyoseijoho/seisaku-keikaku/1/1082.html',
  },
  // 坂城町
  '205214': {
    text: '輝く未来を奏でるまち',
    source: 'https://www.town.sakaki.nagano.jp/uploaded/attachment/8221.pdf',
  },
  // 小布施町
  '205419': {
    text: '私たちがいきいきと暮らし、 つながりの力で輝くまち小布施',
    source: 'https://www.town.obuse.nagano.jp/fs/1/9/5/0/2/3/_/5_7th_chapter2.pdf',
  },
  // 高山村
  '205435': {
    text: 'ずっと住みたい また訪れたい いいね 信州高山 ～自然の恵み 豊かさ実感 幸せ実感～',
    source: 'https://www.vill.takayama.nagano.jp/docs/7589795.html',
  },
  // 山ノ内町
  '205613': {
    text: '未来に羽ばたく 夢と希望のある 健康な郷土',
    source: 'https://www.town.yamanouchi.nagano.jp/soshiki/chiikisozo_1/gyomu/seisaku_keikaku/sogokeikaku/637.html',
  },
  // 木島平村
  '205621': {
    text: '誇りと愛着を育み、一人ひとりが希望を持てる木島平 ～誰もが暮らしやすい持続可能な村～',
    source: 'https://www.vill.kijimadaira.lg.jp/articles/2024102800014/file_contents/gaiyouban.pdf',
  },
  // 野沢温泉村
  '205630': {
    text: '胸湧きたち 未来へ歩み続ける 湯の郷・野沢温泉',
    source: 'https://www.vill.nozawaonsen.nagano.jp/www/contents/1050000000231/files/honsatsu.pdf',
  },
  // 信濃町
  '205834': {
    text: 'みんなでつくる ふるさと しなのまち',
    source: 'https://www.town.shinano.lg.jp/docs/1772314.html',
  },
  // 飯綱町
  '205907': {
    text: 'あふれる自然 共に豊かな暮らし創生',
    source: 'https://www.town.iizuna.nagano.jp/fs/6/0/9/0/8/_/_2______________.pdf',
  },
  // 栄村
  '206024': {
    text: '一人一人が希望に満ちた生き方を創造できる村',
    source: 'http://www.vill.sakae.nagano.jp/fs/3/6/8/7/8/_/_6______________________.pdf',
  },
  // 岐阜県
  '210005': {
    text: '幸せと確かな暮らしのあるふるさと岐阜県をともに目指して',
    source: 'https://www.pref.gifu.lg.jp/uploaded/attachment/350991.pdf',
  },
  // 岐阜市
  '212016': {
    text: '人がつながる 創造が生まれる しなやかさのあるまち',
    source: 'https://www.city.gifu.lg.jp/_res/projects/default_project/_page_/001/004/125/gifushimirainomachidukurikousoua34.pdf',
  },
  // 大垣市
  '212024': {
    text: 'みんなで創る 希望あふれる産業文化都市',
    source: 'https://www.city.ogaki.lg.jp/0000037472.html',
  },
  // 高山市
  '212032': {
    text: '暮らす人、訪れる人が「しあわせ」を実感するまち飛騨高山',
    source: 'https://www.city.takayama.lg.jp/shisei/1004958/1021589/index.html',
  },
  // 多治見市
  '212041': {
    text: '「多治見らしさ」を育み、 市民が誇れる魅力に満ちたまち 多治見',
    source: 'https://www.city.tajimi.lg.jp/_res/projects/default_project/_page_/001/007/322/8jisou_kihonkousou.pdf',
  },
  // 関市
  '212059': {
    text: '「産業」を鍛え、「学び」を伸ばし、「文化」を磨き、 未来を切り拓く「協働」のまち ～# Smart SEKIism～',
    source: 'https://www.city.seki.lg.jp/cmsfiles/contents/0000023/23419/2_Shiryou2.pdf',
  },
  // 中津川市
  '212067': {
    text: 'WONDERFUL WOODs（ワンダフル ウッズ） 〜ワクワクする森 なかつがわ〜',
    source: 'https://www.city.nakatsugawa.lg.jp/shisei/policy/cp/cpr9/37585.html',
  },
  // 美濃市
  '212075': {
    text: '一人ひとりが挑戦 夢かなえるまち',
    source: 'https://www.city.mino.gifu.jp/fs/1/5/4/8/5/8/_/2_kihonnkousou.pdf',
  },
  // 瑞浪市
  '212083': {
    text: '幸せ実感都市みずなみ ～いっしょに創ろう 夢ある未来～',
    source: 'https://www.city.mizunami.lg.jp/shisei/keikaku/1009684/1009730/1009732/1009951/index.html',
  },
  // 羽島市
  '212091': {
    text: '未来へつなぐ スマイル羽島',
    source: 'https://www.city.hashima.lg.jp/secure/6189/7kihonkousou.pdf',
  },
  // 恵那市
  '212105': {
    text: '自然とともに ひととまちが輝く 活力あふれる恵那',
    source: 'https://www.city.ena.lg.jp/material/files/group/5/enafuturevision2045_gaiyou.pdf',
  },
  // 美濃加茂市
  '212113': {
    text: 'Walkable City Minokamo ～すべての健康のために、歩き続けるまち～',
    source: 'https://www.city.minokamo.lg.jp/uploaded/life/23955_45399_misc.pdf',
  },
  // 土岐市
  '212121': {
    text: '人を育み 伝統を紡ぎ いきいき暮らせる陶のまち',
    source: 'https://www.city.toki.lg.jp/shisei/shisaku/1004914/1011141.html',
  },
  // 各務原市
  '212130': {
    text: 'もっと みんながつながる 笑顔があふれる 元気なまち〜しあわせ実感 かかみがはら〜',
    source: 'https://www.city.kakamigahara.lg.jp/_res/projects/default_project/_page_/001/023/552/joron1.pdf',
  },
  // 可児市
  '212148': {
    text: '住みごこち一番・可児',
    source: 'https://www.city.kani.lg.jp/24585.htm',
  },
  // 山県市
  '212156': {
    text: '子育ち応援のまち 山県市',
    source: 'https://www.city.yamagata.gifu.jp/soshiki/kikaku/41833.html',
  },
  // 瑞穂市
  '212164': {
    text: 'こどもが輝き 誰もが笑顔あふれる 安心で住みよい都市 ～ウェルビーイングに満ちあふれたコミュニティの創造～',
    source: 'https://www.city.mizuho.lg.jp/secure/12973/3rd-01-jorontokihonkousou2.pdf',
  },
  // 飛騨市
  '212172': {
    text: 'いつまでも みんなが楽しく 心豊かに暮らせるまち',
    source: 'https://www.city.hida.gifu.jp/uploaded/attachment/29515.pdf',
  },
  // 本巣市
  '212181': {
    text: 'ひととまちがつながる 笑顔あふれ 暮らしやすいまち・本巣',
    source: 'https://www.city.motosu.lg.jp/cmsfiles/contents/0000002/2991/no1_motosu_siseiuneihousin_summary.pdf',
  },
  // 郡上市
  '212199': {
    text: '心満ちる 心おどる 心地よいまち 郡上',
    source: 'https://www.city.gujo.gifu.jp/admin/detail/12600.html',
  },
  // 下呂市
  '212202': {
    text: 'ぬくもり つながり わくわく下呂市',
    source: 'https://www.city.gero.lg.jp/soshiki/7/31892.html',
  },
  // 海津市
  '212211': {
    text: '水と緑と人がきらめく 輪でつながるまち 海津',
    source: 'https://www.city.kaizu.lg.jp/shisei/cmsfiles/contents/0000000/37/05kihonnkousou.pdf',
  },
  // 岐南町
  '213021': {
    text: 'みんなでつくる魅力あるまち・ぎなん',
    source: 'https://www.town.ginan.lg.jp/secure/3108/gaiyoubandai6zisougoukeikaku.pdf',
  },
  // 笠松町
  '213039': {
    text: '清流木曽川に抱かれた 『豊かさ』と『やすらぎ』あふれる創造文化都市',
    source: 'https://www.town.kasamatsu.gifu.jp/docs/2026031600017/file_contents/file_2026316113510_1.pdf',
  },
  // 養老町
  '213411': {
    text: '人があつまり 楽しく生きがいのあるまち',
    source: 'https://www.town.yoro.gifu.jp/',
  },
  // 垂井町
  '213616': {
    text: 'ひととまちが輝く地域共創都市～さらなるやさしさと活気を求めて～',
    source: 'https://www.town.tarui.lg.jp/site/sougoukeikaku/1429.html',
  },
  // 関ケ原町
  '213624': {
    text: '笑顔あふれ 活気みなぎる 古戦場のまち せきがはら',
    source: 'https://www.town.sekigahara.gifu.jp/secure/5871/02.pdf',
  },
  // 神戸町
  '213811': {
    text: 'みんなの笑顔 未来へつなごう ともに支えあうまち ごうど',
    source: 'https://www.town.godo.gifu.jp/politics/pdf/politics08_01/plan14-02.pdf',
  },
  // 輪之内町
  '213829': {
    text: '自然と住みやすさが共存でき、子どもがのびのびと育つまち',
    source: 'https://town.wanouchi.gifu.jp/wp-content/uploads/d4210ce503ecab9797cda73b1224083f-4.pdf',
  },
  // 安八町
  '213837': {
    text: '笑顔と活力が循環し 光輝くまち',
    source: 'https://www.town.anpachi.lg.jp/cmsfiles/contents/0000001/1906/web02_kousou.pdf',
  },
  // 揖斐川町
  '214019': {
    text: 'みんなの想い みんなの力を ぎゅっと！いびがわ ～共に創る住み続けたいまち～',
    source: 'https://www.town.ibigawa.lg.jp/page/7143.html',
  },
  // 大野町
  '214035': {
    text: '快適で 笑顔あふれるやすらぎのまち おおの',
    source: 'https://www.town-ono.jp/cmsfiles/contents/0000000/94/02_7thonosogokeikaku.pdf',
  },
  // 池田町
  '214043': {
    text: 'ぬくもりがあふれるまち 池田町 ～ふれあいが未来を育む、人と人がつながり合い成長する都市へ～',
    source: 'https://www.town.gifu-ikeda.lg.jp/cmsfiles/contents/0000002/2041/02.pdf',
  },
  // 北方町
  '214213': {
    text: '新たな感動とつながり 未来輝く北方',
    source: 'https://www.town.kitagata.gifu.jp/material/files/group/3/sougoukeikaku_08_sougousenryaku_03.pdf',
  },
  // 富加町
  '215023': {
    text: 'JUSTomika Life（ジャストミカ ライフ） ともに みらいへ 笑顔かがやくまち とみか',
    source: 'https://www.town.tomika.gifu.jp/fs/3/5/2/9/7/6/_/____6________3_____.pdf',
  },
  // 川辺町
  '215031': {
    text: '清流と人が織りなす活力あるまち',
    source: 'https://www.kawabe-gifu.jp/wp-content/uploads/2025/04/5次総後期基本計画.pdf',
  },
  // 七宗町
  '215040': {
    text: '共創のまち 夢がかなうまち ひちそう',
    source: 'https://www.hichiso.jp/wp-content/uploads/2026b/七宗町総合計画（概要版）.pdf',
  },
  // 八百津町
  '215058': {
    text: '安らぎとにぎわいが織りなす やおつらしさを育むまち ～ Smiles for Well-Being ～',
    source: 'https://www.town.yaotsu.lg.jp/secure/1114/04dai2hen.pdf',
  },
  // 白川町
  '215066': {
    text: '「活力」をカタチに みんなの思いが 活きる つながる 広がるまち 白川町',
    source: 'https://www.town.shirakawa.lg.jp/chousei/keikaku/1002762/1002097.html',
  },
  // 御嵩町
  '215210': {
    text: '永く継ぐ。嵩く積む。',
    source: 'https://www.town.mitake.lg.jp/wp-content/uploads/b2d628005567e12dd81bd7f8a44b2000.pdf',
  },
  // 静岡県
  '220001': {
    text: '幸福度日本一の静岡県',
    source: 'https://www.pref.shizuoka.jp/kensei/keikaku/sogokeikaku/1054440.html',
  },
  // 静岡市
  '221007': {
    text: '誰もが安心して暮らし、幸せを実感し、住み続けたいと感じられるまち',
    source: 'https://www.city.shizuoka.lg.jp/s2934/soukei/s013122.html',
  },
  // 浜松市
  '221309': {
    text: '市民協働で築く『未来へかがやく創造都市・浜松』',
    source: 'https://www.city.hamamatsu.shizuoka.jp/documents/166043/toshinosyouraizou.pdf',
  },
  // 沼津市
  '222038': {
    text: '人・まち・自然が調和し、躍動するまち',
    source: 'https://www.city.numazu.shizuoka.jp/shisei/keikaku/sogo/index.htm',
  },
  // 熱海市
  '222054': {
    text: '共に創り 未来へつなぐ 湯のまち 熱海',
    source: 'https://www.city.atami.lg.jp/_res/projects/default_project/_page_/001/007/480/5jiso-aisatsu.pdf',
  },
  // 三島市
  '222062': {
    text: 'せせらぎと緑と活力あふれる幸せ実感都市・三島',
    source: 'https://www.city.mishima.shizuoka.jp/uploaded/attachment/14201.pdf',
  },
  // 富士宮市
  '222071': {
    text: '富士山を心に 人の和と豊かな自然が織りなす 幸せ感じる富士宮',
    source: 'https://www.city.fujinomiya.lg.jp/documents/7760/04_kihonkousou.pdf',
  },
  // 伊東市
  '222089': {
    text: '出会い つながり みんなで育む 自然豊かなやさしいまち いとう',
    source: 'https://www.city.ito.shizuoka.jp/material/files/group/2/dai5ji_sougoukeikaugaiyouban.pdf',
  },
  // 島田市
  '222097': {
    text: '笑顔あふれる 安心のまち 島田',
    source: 'https://www.city.shimada.shizuoka.jp/fs/9/6/5/5/4/8/_/3rd_shimada_comp_plan_p33-p46.pdf',
  },
  // 富士市
  '222101': {
    text: '富士山とともに 輝く未来を拓くまち ふじ',
    source: 'https://www.city.fuji.shizuoka.jp/documents/13930/sakuteihoushin.pdf',
  },
  // 磐田市
  '222119': {
    text: 'たくさんの元気と笑顔があふれるまち 磐田',
    source: 'https://www.city.iwata.shizuoka.jp/_res/projects/default_project/_page_/001/010/720/koki.pdf',
  },
  // 焼津市
  '222127': {
    text: 'やさしさ 愛しさ いいもの いっぱい 世界へ拡げる 水産文化都市 YAIZU',
    source: 'https://www.city.yaizu.lg.jp/documents/20618/gaiyouban.pdf',
  },
  // 藤枝市
  '222143': {
    text: '“幸せになるまち”藤枝づくり',
    source: 'https://www.city.fujieda.shizuoka.jp/material/files/group/1/sogokeikaku-kokikeikaku.pdf',
  },
  // 御殿場市
  '222151': {
    text: '緑きらきら、人いきいき、未来へつなぐ交流都市 御殿場',
    source: 'https://www.city.gotemba.lg.jp/gyousei/g-2/g-2-1/29474.html',
  },
  // 袋井市
  '222160': {
    text: 'にぎわい ずっと続くまち ふくろい',
    source: 'https://www.city.fukuroi.shizuoka.jp/shiseijoho/sougoukeikaku/13940.html',
  },
  // 下田市
  '222194': {
    text: '時代の流れを力に つながる下田 新しい未来',
    source: 'https://www.city.shimoda.shizuoka.jp/category/080102sougou_keikaku/159127.html',
  },
  // 裾野市
  '222208': {
    text: 'みんなが誇る豊かな田園未来都市すその',
    source: 'https://www.city.susono.shizuoka.jp/shisei/11/2/15242.html',
  },
  // 湖西市
  '222216': {
    text: '「ひと・自然・業（わざ）」がつながり 未来へ続く わがまち KOSAI',
    source: 'https://www.city.kosai.shizuoka.jp/material/files/group/7/dai6jisougoukeikakukihonkousou.pdf',
  },
  // 伊豆市
  '222224': {
    text: '守りながら 変わり続けるまち 伊豆市',
    source: 'https://www.city.izu.shizuoka.jp/material/files/group/1/dai3sokeigaiyo.pdf',
  },
  // 菊川市
  '222241': {
    text: '誰もが夢叶う 幸せ創生都市 “菊川”',
    source: 'https://www.city.kikugawa.shizuoka.jp/kikakuseisaku/3sougoukeikaku.html',
  },
  // 伊豆の国市
  '222259': {
    text: '歴史が息づき、未来にわたり誰もが幸せに暮らせるまち 伊豆の国',
    source: 'https://www.city.izunokuni.shizuoka.jp/kikaku/shisei/seisaku/sougoukeikaku/documents/gaiyou.pdf',
  },
  // 牧之原市
  '222267': {
    text: 'ＲＩＤＥ ＯＮ ＭＡＫＩＮＯＨＡＲＡ 夢に乗るまち 牧之原',
    source: 'https://www.city.makinohara.shizuoka.jp/uploaded/attachment/40578.pdf',
  },
  // 東伊豆町
  '223018': {
    text: 'チェンジメーカー 東伊豆',
    source: 'https://www.town.higashiizu.lg.jp/material/files/group/10/kik_sougoushishin_compressed.pdf',
  },
  // 河津町
  '223026': {
    text: '住みたい・来たいまち 河津',
    source: 'https://www.town.kawazu.shizuoka.jp/wp/wp-content/uploads/2021/03/dai5jisogokeikaku.pdf',
  },
  // 南伊豆町
  '223042': {
    text: '次世代につなぐ 光と水と緑に輝く南伊豆町',
    source: 'https://www.town.minamiizu.shizuoka.jp/docs/2020081000018/file_contents/keikaku_honpen.pdf',
  },
  // 松崎町
  '223051': {
    text: 'ここでは、誇り高く、穏やかに、豊かに生きられる',
    source: 'https://www.town.matsuzaki.shizuoka.jp/docs/2023030700014/file_contents/1.pdf',
  },
  // 西伊豆町
  '223069': {
    text: '“ふるさと”と言いたくなる夕陽のまち',
    source: 'https://www.town.nishiizu.shizuoka.jp/pdf/kikaku/sogo_kouki_3.pdf',
  },
  // 函南町
  '223255': {
    text: '環境・健康・交流都市 函南',
    source: 'https://www.town.kannami.shizuoka.jp/material/files/group/3/kouki3.pdf',
  },
  // 清水町
  '223417': {
    text: 'くらしやすさで未来をともにつくるまち・清水町',
    source: 'https://www.town.shimizu.shizuoka.jp/content/300356848.pdf',
  },
  // 長泉町
  '223425': {
    text: 'みんなでつくる 輝きつづける“ちょうどいい” まち',
    source: 'https://www.town.nagaizumi.lg.jp/about_town/plan/5/10358.html',
  },
  // 小山町
  '223441': {
    text: '育てたい、暮らしたい、帰りたいまち 小山町',
    source: 'https://www.fuji-oyama.jp/page/1362.html',
  },
  // 吉田町
  '224243': {
    text: '豊かで活気にあふれ 心を魅了するまち 吉田町',
    source: 'https://www.town.yoshida.shizuoka.jp/7672.htm',
  },
  // 川根本町
  '224294': {
    text: '水と森の番人が創る癒しの里 川根本町',
    source: 'https://www.town.kawanehon.shizuoka.jp/material/files/group/1/2jisougoukeikau.pdf',
  },
  // 愛知県
  '230006': {
    text: '暮らし・経済・環境が調和した輝くあいち',
    source: 'https://www.pref.aichi.jp/uploaded/attachment/504640.pdf',
  },
  // 名古屋市
  '231002': {
    text: 'リニアがつなぐ巨大交流圏の中心で躍動する世界都市、誰もが幸せと希望を感じられる名古屋',
    source: 'https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/010/858/gaiyoban.pdf',
  },
  // 豊橋市
  '232017': {
    text: '未来を担う人を育むまち・豊橋',
    source: 'https://www.city.toyohashi.lg.jp/secure/69038/第６次豊橋市総合計画概要版（ダウンロード版）.pdf',
  },
  // 岡崎市
  '232025': {
    text: '一歩先の暮らしで三河を拓く 中枢・中核都市おかざき',
    source: 'https://www.city.okazaki.lg.jp/shisei/vision/1008016/1008017.html',
  },
  // 一宮市
  '232033': {
    text: '木曽の清流に映え、心ふれあう躍動都市 一宮',
    source: 'https://www.city.ichinomiya.aichi.jp/sougouseisaku/seisaku/1044355/1000458/1022818/index.html',
  },
  // 瀬戸市
  '232041': {
    text: '住みたいまち 誇れるまち 新しいせと',
    source: 'https://www.city.seto.aichi.jp/docs/2017/03/16/00015/files/6jisoukei.pdf',
  },
  // 半田市
  '232050': {
    text: '人がまちを育み まちが人を育む チャレンジあふれる都市・はんだ',
    source: 'https://www.city.handa.lg.jp/shisei/shisaku/1003838/1003839/1003841.html',
  },
  // 春日井市
  '232068': {
    text: '暮らしやすさと幸せをつなぐまち かすがい',
    source: 'https://www.city.kasugai.lg.jp/_res/projects/default_project/_page_/001/031/454/2kihonkousou.pdf',
  },
  // 豊川市
  '232076': {
    text: '光・緑・人 輝くとよかわ',
    source: 'https://www.city.toyokawa.lg.jp/shisei/seisaku/8/5/16684.html',
  },
  // 津島市
  '232084': {
    text: '～未来につなぐ～ 住んでみたい 住んでよかったまち 津島',
    source: 'https://www.city.tsushima.lg.jp/shisei/machidukuri/sougoukeikaku/souke5.html',
  },
  // 碧南市
  '232092': {
    text: '新たな力とともに創る 笑顔と元気のみなとまち へきなん',
    source: 'https://www.city.hekinan.lg.jp/material/files/group/4/sougoukeikaku6_gaiyouban.pdf',
  },
  // 刈谷市
  '232106': {
    text: '人が輝く 安心快適な産業文化都市',
    source: 'https://www.city.kariya.lg.jp/_res/projects/default_project/_page_/001/013/290/8th-2.pdf',
  },
  // 豊田市
  '232114': {
    text: 'つながる つくる 暮らし楽しむまち・とよた',
    source: 'https://www.city.toyota.aichi.jp/_res/projects/default_project/_page_/001/055/819/r0703/09.pdf',
  },
  // 安城市
  '232122': {
    text: 'ともに育み、未来をつくる しあわせ共創都市 安城',
    source: 'https://www.city.anjo.aichi.jp/shisei/joreikeikaku/sogokeikaku/documents/3to5kihonnkousou.pdf',
  },
  // 西尾市
  '232131': {
    text: 'もっとワクワクするまち にしお',
    source: 'https://www.city.nishio.aichi.jp/shisei/keikaku/1001514/1008364.html',
  },
  // 蒲郡市
  '232149': {
    text: '豊かな自然 一人ひとりが輝き つながりあうまち',
    source: 'https://www.city.gamagori.lg.jp/unit/kikaku/sogokeikaku-fifth.html',
  },
  // 犬山市
  '232157': {
    text: '水と緑と伝統 みんなつながり みんなうるおう 豊かさ実感都市 犬山',
    source: 'https://www.city.inuyama.aichi.jp/_res/projects/default_project/_page_/001/009/687/000_zentai.pdf',
  },
  // 常滑市
  '232165': {
    text: 'とことん住みたい 世界とつながる 魅力創造都市',
    source: 'https://www.city.tokoname.aichi.jp/shisei/sogokeikaku/1004292/1006301.html',
  },
  // 江南市
  '232173': {
    text: '地域とつくる多様な暮らしを選べる生活都市',
    source: 'https://www.city.konan.lg.jp/_res/projects/default_project/_page_/001/003/708/2_kousou.pdf',
  },
  // 新城市
  '232211': {
    text: 'つながる力 豊かさ開拓 山の湊しんしろ',
    source: 'https://www.city.shinshiro.lg.jp/shisei/keikaku/sogo/dai2ji-sogo.html',
  },
  // 東海市
  '232220': {
    text: 'ともにつながり 笑顔と希望あふれるまち とうかい',
    source: 'https://www.city.tokai.aichi.jp/_res/projects/default_project/_page_/001/003/514/7th_plan_gaiyou.pdf',
  },
  // 大府市
  '232238': {
    text: 'いつまでも 住み続けたい サスティナブル健康都市 おおぶ',
    source: 'https://www.city.obu.aichi.jp/_res/projects/default_project/_page_/001/002/912/gaiyou_mihiraki.pdf',
  },
  // 知立市
  '232254': {
    text: '輝くまち みんなの知立',
    source: 'https://www.city.chiryu.aichi.jp/shisei/machi/6/17303.html',
  },
  // 尾張旭市
  '232262': {
    text: '幸せつむぐ 笑顔あふれる 尾張旭',
    source: 'https://www.city.owariasahi.lg.jp/site/soukei6/',
  },
  // 高浜市
  '232271': {
    text: '人と想いが つなぐつながるしあわせなまち 大家族たかはま',
    source: 'https://www.city.takahama.lg.jp/uploaded/attachment/21897.pdf',
  },
  // 岩倉市
  '232289': {
    text: '健康で明るい緑の文化都市',
    source: 'https://www.city.iwakura.aichi.jp/0000007834.html',
  },
  // 豊明市
  '232297': {
    text: '未来へつなぐ みんなでつくる しあわせのまち とよあけ',
    source: 'https://www.city.toyoake.lg.jp/secure/33813/4_2syo.pdf',
  },
  // 日進市
  '232301': {
    text: 'ともに暮らす 私たちがつないで創る 人とみどりを大切にするまち 日進',
    source: 'https://www.city.nisshin.lg.jp/material/files/group/3/6thsoukeidigset.pdf',
  },
  // 田原市
  '232319': {
    text: 'うるおいと活力あふれるガーデンシティ',
    source: 'https://www.city.tahara.aichi.jp/_res/projects/default_project/_page_/001/010/774/2sokei.pdf',
  },
  // 清須市
  '232335': {
    text: '水と歴史に織りなされた 安心・快適で魅力あふれる“はぐくみ都市”',
    source: 'https://www.city.kiyosu.aichi.jp/shisei_joho/keikaku_shisaku/zentai_keikaku/dai3jisogokeikaku.files/kiyosushidai3jisogokeikaku_visionbook.pdf',
  },
  // 北名古屋市
  '232343': {
    text: '健康快適都市',
    source: 'https://www.city.kitanagoya.lg.jp/shisei/seisaku/1005031/1005033/index.html',
  },
  // 弥富市
  '232351': {
    text: '地域でつくる「人・自然・文化」の調和 輝く未来へ繋ぐまち・弥富',
    source: 'https://www.city.yatomi.lg.jp/_res/projects/default_project/_page_/001/000/764/gaiyoubann.pdf',
  },
  // みよし市
  '232360': {
    text: 'みんなで育む 笑顔輝く ずっと住みたいまち',
    source: 'https://www.city.aichi-miyoshi.lg.jp/gyoseijoho/20260819seisakukeikaku/shiminkensyou_sougoukeikaku/11739.html',
  },
  // あま市
  '232378': {
    text: 'ともに想い ともに創る ずっと大好きなまち“あま”',
    source: 'https://www.city.ama.aichi.jp/_res/projects/default_project/_page_/001/002/692/sougoukeikaku1.pdf',
  },
  // 長久手市
  '232386': {
    text: '幸せが実感できる 共生のまち 長久手',
    source: 'https://www.city.nagakute.lg.jp/material/files/group/2/6soukeigaiyouban.pdf',
  },
  // 東郷町
  '233021': {
    text: '人・まち・みどり ずっと暮らしたい とうごう',
    source: 'https://www.town.aichi-togo.lg.jp/material/files/group/3/dai6zisoukei_gaiyouban.pdf',
  },
  // 豊山町
  '233421': {
    text: '一人ひとりが輝く 暮らし豊かなアーバンビレッジ',
    source: 'https://www.town.toyoyama.lg.jp/_res/projects/default_project/_page_/001/001/133/koukikihonkeikaku_06.pdf',
  },
  // 大治町
  '234249': {
    text: 'つなげよう、広げよう 心かようまち おおはる',
    source: 'https://www.town.oharu.aichi.jp/secure/2889/2_第５次大治町総合計画（基本構想）.pdf',
  },
  // 蟹江町
  '234257': {
    text: 'だけじゃない らしさあふれる 粋な蟹江',
    source: 'https://www.town.kanie.aichi.jp/soshiki/2/dai5jisougoukeikaku-kouki.html',
  },
  // 飛島村
  '234273': {
    text: '災害に強い・活気・魅力・人づくりの村 とびしま',
    source: 'https://www.vill.tobishima.aichi.jp/_res/projects/default_project/_page_/001/002/252/5_2_soukei_honpen_kaitei.pdf',
  },
  // 阿久比町
  '234419': {
    text: '輝く子どもたちを みどりが包むまち・あぐい',
    source: 'https://www.town.agui.lg.jp/cmsfiles/contents/0000005/5497/03_kihonkoso.pdf',
  },
  // 東浦町
  '234427': {
    text: 'つくる つながる ささえあう 幸せと絆を実感できるまち 東浦',
    source: 'https://www.town.aichi-higashiura.lg.jp/material/files/group/2/gaiyoubann.pdf',
  },
  // 南知多町
  '234451': {
    text: '絆・選ばれる理由があるまち',
    source: 'https://www.town.minamichita.lg.jp/_res/projects/default_project/_page_/001/003/212/tyukikeikaku.pdf',
  },
  // 美浜町
  '234460': {
    text: '笑顔つながる 健康ひろがる 輝くまち みはま',
    source: 'https://www.town.aichi-mihama.lg.jp/material/files/group/11/soukei6_kihonkousou.pdf',
  },
  // 武豊町
  '234478': {
    text: '心つなぎ みんなでつくる スマイルタウン',
    source: 'https://www.town.taketoyo.lg.jp/_res/projects/default_project/_page_/001/006/195/dai6zisougoukeikaku-gaiyou-a3.pdf',
  },
  // 幸田町
  '235016': {
    text: 'もっと輝く幸田を、みんなで♪ 未来につなぐ活力ある緑住文化都市',
    source: 'https://www.town.kota.lg.jp/uploaded/attachment/18389.pdf',
  },
  // 設楽町
  '235610': {
    text: 'まちに活気・まちに愛着・まちに自信',
    source: 'https://www.town.shitara.lg.jp/uploaded/attachment/3090.pdf',
  },
  // 東栄町
  '235628': {
    text: '山のめぐみをうけ ともに築く彩りの里',
    source: 'https://www.town.toei.aichi.jp/1101.htm',
  },
  // 豊根村
  '235636': {
    text: '豊かに根ざす村',
    source: 'https://www.vill.toyone.aichi.jp/material/files/group/2/vijon2027kouki.pdf',
  },
  // 三重県
  '240001': {
    text: '強じんで多様な魅力あふれる「美し国」の実現',
    source: 'https://www.pref.mie.lg.jp/common/content/001049623.pdf',
  },
  // 津市
  '242012': {
    text: '笑顔があふれ 幸せに暮らせる県都 津市',
    source: 'https://www.info.city.tsu.mie.jp/_res/projects/default_project/_page_/001/005/623/gaiyouban.pdf',
  },
  // 四日市市
  '242021': {
    text: 'ゼロからイチを生み出すちから イチから未来を 四日市',
    source: 'https://www.city.yokkaichi.lg.jp/www/contents/1583304827603/simple/202003joujun_tokusyu.pdf',
  },
  // 伊勢市
  '242039': {
    text: 'つながりが誇りと安らぎを育む 魅力創造都市 伊勢',
    source: 'https://www.city.ise.mie.jp/_res/projects/default_project/_page_/001/003/503/sougoukeikaku_sassi.pdf',
  },
  // 松阪市
  '242047': {
    text: 'ここに住んで良かった…みんな大好き 松阪市',
    source: 'https://www.city.matsusaka.mie.jp/uploaded/attachment/91844.pdf',
  },
  // 鈴鹿市
  '242071': {
    text: 'ひとがつながり ＤＸで未来を拓く #最高に住みやすいまち鈴鹿',
    source: 'https://www.city.suzuka.lg.jp/_res/projects/default_project/_page_/001/012/788/2031_04.pdf',
  },
  // 名張市
  '242080': {
    text: '変化をおこし 活力あふれ みんなでつくる 大好きなまち なばり',
    source: 'https://www.city.nabari.lg.jp/s009/110/040/222/0262/sougoukeikaku_nabarisinjidai_.pdf',
  },
  // 尾鷲市
  '242098': {
    text: '住みたいまち 住み続けたいまち おわせ',
    source: 'https://www.city.owase.lg.jp/0000023770.html',
  },
  // 亀山市
  '242101': {
    text: '人とまちの輝きが未来を創る 緑の健都 かめやま',
    source: 'https://www.city.kameyama.mie.jp/docs/2025041000152/file_contents/dai3zi_kihonkousou.pdf',
  },
  // 鳥羽市
  '242110': {
    text: '誰もがキラめく鳥羽 海の恵みがつなぐ鳥羽',
    source: 'https://www.city.toba.mie.jp/material/files/group/2/kihonnkousou.pdf',
  },
  // 熊野市
  '242128': {
    text: '豊かな自然と歴史の中で人がかがやく、活力と潤いのあるまち・熊野',
    source: 'https://www.city.kumano.lg.jp/assets/images/content/content_20230621_173839.pdf',
  },
  // いなべ市
  '242144': {
    text: '「好き」が、あふれる。『私のまち いなべ』',
    source: 'https://www.city.inabe.mie.jp/_res/projects/default_project/_page_/001/015/709/soukei_zenpen.pdf',
  },
  // 志摩市
  '242152': {
    text: '誰もが住みたくなる、笑顔あふれる「しあわせ」のまち',
    source: 'https://www.city.shima.mie.jp/material/files/group/16/tsunagaru_plan_r2.pdf',
  },
  // 伊賀市
  '242161': {
    text: 'すべての ひとが輝く 地域が輝く',
    source: 'https://www.city.iga.lg.jp/cmsfiles/contents/0000012/12123/2_kousou.pdf',
  },
  // 木曽岬町
  '243035': {
    text: 'やるね！木曽岬',
    source: 'https://www.town.kisosaki.lg.jp/cmsfiles/contents/0000002/2668/02_kousou.pdf',
  },
  // 菰野町
  '243418': {
    text: '明るい未来に向けて、私たち一人ひとりが主役',
    source: 'https://www2.town.komono.mie.jp/soshiki/1/1151.html',
  },
  // 朝日町
  '243434': {
    text: 'みんなで創る あかるい未来 ささえ合い ひとみ輝く 朝日町',
    source: 'https://www2.town.asahi.mie.jp/www/contents/1001000000216/index.html',
  },
  // 川越町
  '243442': {
    text: 'つながる笑顔 ず〜〜〜っと暮らしたい町 かわごえ',
    source: 'https://www.town.kawagoe.mie.jp/_res/projects/default_project/_page_/001/003/692/7jikouki/4.21kanseiban/koukikihonnkeikakugaiyoubann.pdf',
  },
  // 明和町
  '244422': {
    text: '住みたい 住み続けたい 豊かなこころを育む 歴史・文化のまち 明和',
    source: 'https://www.town.meiwa.mie.jp/gyosei_joho/seisaku_keikaku/sogokeikaku/1909.html',
  },
  // 大台町
  '244431': {
    text: 'ユネスコエコパークの自然の恵みを未来へつなぐまち・大台町',
    source: 'https://www.odaitown.jp/soshiki/yakuba/2/3/1/6/3129.html',
  },
  // 玉城町
  '244619': {
    text: 'だれもが安心して、元気に暮らせるまち ふるさと玉城',
    source: 'https://kizuna.town.tamaki.mie.jp/chosei/gyokaku/shisaku/documents/6ji_soukeikoukigaiyou.pdf',
  },
  // 度会町
  '244708': {
    text: 'みらい わたらい わかち愛',
    source: 'https://www.town.watarai.lg.jp/cmsfiles/contents/0000002/2232/sokei7.pdf',
  },
  // 大紀町
  '244716': {
    text: '光と水と緑が輝き 笑顔をつくるまち たいき',
    source: 'https://www.town.taiki.mie.jp/gyoseijoho/seisaku_keikaku/sogokeikaku/1293.html',
  },
  // 南伊勢町
  '244724': {
    text: '「私たちの元気」で 輝きつづけるまち',
    source: 'https://www.town.minamiise.lg.jp/material/files/group/21/sougoukeikaku_ver4_kou01.pdf',
  },
  // 紀北町
  '245437': {
    text: 'みんなが元気！紀北町',
    source: 'https://www.town.mie-kihoku.lg.jp/wp-content/uploads/2022/06/R040627.pdf',
  },
  // 御浜町
  '245615': {
    text: '一人ひとりが、 幸せを実感し、「みはま」らしく輝くまち',
    source: 'https://www.town.mihama.mie.jp/material/files/group/3/04_kouki_keikaku.pdf',
  },
  // 紀宝町
  '245623': {
    text: '海・山・川の恵みに抱かれ、ともに輝き創造するまち',
    source: 'https://www.town.kiho.lg.jp/government/plan/second_comprehenshive_plan/',
  },
  // 滋賀県
  '250007': {
    text: '変わる滋賀 続く幸せ',
    source: 'https://www.pref.shiga.lg.jp/ca00/8588.html',
  },
  // 大津市
  '252018': {
    text: 'ひと、自然、歴史の縁で織りなす 住み続けたいまち“大津再生”',
    source: 'https://www.city.otsu.lg.jp/material/files/group/53/daisankijikokeikaku_shiryohen.pdf',
  },
  // 彦根市
  '252026': {
    text: '歴史と文化を紡ぎ、未来を創造する、市民一人ひとりが輝くまち彦根',
    source: 'https://www.city.hikone.lg.jp/material/files/group/47/20220325_sogokeikaku_kihonkoso.pdf',
  },
  // 長浜市
  '252034': {
    text: 'みんなで未来をつむぐまち',
    source: 'https://www.city.nagahama.lg.jp/0000015668.html',
  },
  // 近江八幡市
  '252042': {
    text: '人がつながり 未来をつむぐ 「ふるさと近江八幡」',
    source: 'https://www.city.omihachiman.lg.jp/gyosei/kakushu/2/14712.html',
  },
  // 草津市
  '252069': {
    text: 'ひと・まち・ときをつなぐ 絆をつむぐ ふるさと 健幸創造都市 草津',
    source: 'https://www.city.kusatsu.shiga.jp/shisei/keikaku/sogokeikaku/rokujisoukei/kihonkeikaku1/sogokeikaku.files/001-2.pdf',
  },
  // 守山市
  '252077': {
    text: '私の『想い』がかなうまち',
    source: 'https://www.city.moriyama.lg.jp/shiseijouhou/sougoukeikaku/1013977.html',
  },
  // 栗東市
  '252085': {
    text: 'いつまでも住み続けたくなる安心な元気都市栗東',
    source: 'https://www.city.ritto.lg.jp/shisei/sesaku/15183.html',
  },
  // 甲賀市
  '252093': {
    text: 'あい甲賀 いつもの暮らしに“しあわせ”を感じるまち',
    source: 'https://www.city.koka.lg.jp/secure/40416/%E7%AC%AC%EF%BC%92%E6%AC%A1%E7%94%B2%E8%B3%80%E5%B8%82%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB%EF%BC%88%E5%9F%BA%E6%9C%AC%E6%A7%8B%E6%83%B3%EF%BC%89.pdf',
  },
  // 野洲市
  '252107': {
    text: '多様な人々と多彩な自然が調和した、 個性輝くにじいろのまち',
    source: 'https://www.city.yasu.lg.jp/material/files/group/3/soukei1.pdf',
  },
  // 高島市
  '252123': {
    text: '水と緑 人のいきかう 高島市',
    source: 'https://www.city.takashima.lg.jp/material/files/group/11/soukei2_kihonkoso.pdf',
  },
  // 東近江市
  '252131': {
    text: 'うるおいとにぎわいのまち 東近江市',
    source: 'https://www.city.higashiomi.shiga.jp/_res/projects/default_project/_page_/001/011/083/gaiyoban.pdf',
  },
  // 米原市
  '252140': {
    text: 'ともにつながり ともに創る 住みよさ実感 米原市',
    source: 'https://www.city.maibara.lg.jp/material/files/group/2/2soukei_2bu.pdf',
  },
  // 日野町
  '253839': {
    text: '時代の変化に対応し だれもが輝き ともに創るまち“日野”',
    source: 'https://www.town.shiga-hino.lg.jp/0000001791.html',
  },
  // 竜王町
  '253847': {
    text: '若者も暮らしたい 希望かなえる 輝竜の郷',
    source: 'https://www.town.ryuoh.shiga.jp/machi/machi_plan/keikaku6/keikaku6.html',
  },
  // 愛荘町
  '254258': {
    text: '愛着と誇り。人とまちが共に輝く みらい創生のまち。',
    source: 'https://www.town.aisho.shiga.jp/material/files/group/1/hiooieeerrrw.pdf',
  },
  // 豊郷町
  '254410': {
    text: '一生青春',
    source: 'https://www.town.toyosato.shiga.jp/cmsfiles/contents/0000001/1775/gaiyoubann.pdf',
  },
  // 甲良町
  '254428': {
    text: 'せせらぎのように美しく、一人ひとりが輝くまち',
    source: 'https://www.kouratown.jp/cyonososhiki/kikakukanrika/kikakucyoseikakari/sogokeikaku/2653.html',
  },
  // 多賀町
  '254436': {
    text: '輝く人、自然、歴史・文化で織りなす 多賀の未来',
    source: 'https://www.town.taga.lg.jp/choseijoho/seisaku_keikaku/4/1360.html',
  },
  // 京都府
  '260002': {
    text: '一人ひとりの夢や希望が全ての地域で実現できる京都府',
    source: 'https://www.pref.kyoto.jp/shinsougoukeikaku/documents/01syouraikoso.pdf',
  },
  // 舞鶴市
  '262021': {
    text: '未来に希望がもてる活力あるまち・舞鶴',
    source: 'https://www.city.maizuru.kyoto.jp/shisei/0000011407.html',
  },
  // 綾部市
  '262030': {
    text: '一人ひとりの幸せをみんなで紡いで実現できるまち・・・綾部',
    source: 'https://www.city.ayabe.lg.jp/0000000041.html',
  },
  // 宇治市
  '262048': {
    text: '一人ひとりが輝き 伝統と新たな息吹を紡ぐまち・宇治',
    source: 'https://www.city.uji.kyoto.jp/soshiki/57/51097.html',
  },
  // 宮津市
  '262056': {
    text: '共に創る みんなが活躍する 豊かなまち‟みやづ”',
    source: 'https://www.city.miyazu.kyoto.jp/soshiki/3/29143.html',
  },
  // 亀岡市
  '262064': {
    text: '人と時代に選ばれる リーディングシティ亀岡',
    source: 'https://www.city.kameoka.kyoto.jp/uploaded/attachment/9873.pdf',
  },
  // 城陽市
  '262072': {
    text: '歴史と未来をつなぎ、人をはぐくむ緑のまち・城陽',
    source: 'https://www.city.joyo.kyoto.jp/0000007357.html',
  },
  // 長岡京市
  '262099': {
    text: '住みたい 住みつづけたい 悠久の都 長岡京',
    source: 'https://www.city.nagaokakyo.lg.jp/cmsfiles/contents/0000005/5648/kousou.pdf',
  },
  // 京田辺市
  '262111': {
    text: '緑豊かで健康な文化田園都市',
    source: 'https://www.city.kyotanabe.lg.jp/0000012399.html',
  },
  // 南丹市
  '262137': {
    text: '森・里・街・ひとがきらめく ふるさと 南丹市',
    source: 'https://www.city.nantan.kyoto.jp/www/gove/135/001/000/index_38891.html',
  },
  // 木津川市
  '262145': {
    text: '子どもの笑顔が未来に続く 幸せ実感都市 木津川',
    source: 'https://www.city.kizugawa.lg.jp/cmsfiles/contents/0000000/645/20190326-091143.pdf',
  },
  // 久御山町
  '263222': {
    text: 'あたたかい絆 広がる笑顔 未来の光が輝らすまち久御山',
    source: 'https://www.town.kumiyama.lg.jp/0000005942.html',
  },
  // 井手町
  '263435': {
    text: '安心・安全で豊かな自然と利便性が共存する新しいまち',
    source: 'https://www.town.ide.kyoto.jp/choseijoho/sesaku_keikaku/keikaku/1393987134385.html',
  },
  // 宇治田原町
  '263443': {
    text: 'もっと ずっと 宇治田原',
    source: 'https://www.town.ujitawara.kyoto.jp/gyoseijoho/shisaku_keikaku/gyoseijohonikansurushisaku_keikaku/3948.html',
  },
  // 和束町
  '263656': {
    text: '和の郷 知の郷 茶源郷 和束',
    source: 'https://www.town.wazuka.lg.jp/material/files/group/2/soukei-kihonkousou31-42.pdf',
  },
  // 精華町
  '263664': {
    text: '人がつながり夢を叶える 学研都市精華町',
    source: 'https://www.town.seika.kyoto.jp/material/files/group/1/soukei6_14_26.pdf',
  },
  // 京丹波町
  '264075': {
    text: '日本のふるさと。 自給自足的循環社会●京丹波',
    source: 'https://www.town.kyotamba.kyoto.jp/material/files/group/2/sogokeikau.pdf',
  },
  // 伊根町
  '264636': {
    text: 'みんなで創る ええまち',
    source: 'https://www.town.ine.kyoto.jp/material/files/group/3/02_6th_sougoukeikau_kihonkousou.pdf',
  },
  // 与謝野町
  '264652': {
    text: '人・自然・伝統 与謝野で織りなす 新たな未来',
    source: 'https://www.town.yosano.lg.jp/assets/koukikeikaku_kihonkousou.pdf',
  },
  // 堺市
  '271403': {
    text: '未来を創るイノベーティブ都市',
    source: 'https://www.city.sakai.lg.jp/shisei/gyosei/shishin/shisei/kihonkeikaku/kihonnkeikaku2030.files/kihonnkeikaku2030_gaiyou.pdf',
  },
  // 岸和田市
  '272027': {
    text: '個性きらめき 魅力あふれる ホッとなまち 岸和田',
    source: 'https://www.city.kishiwada.lg.jp/uploaded/attachment/126319.pdf',
  },
  // 豊中市
  '272035': {
    text: 'みらい創造都市 とよなか',
    source: 'https://www.city.toyonaka.osaka.jp/joho/keikaku/soukei4/20180302153956790.files/soukei7-39.pdf',
  },
  // 池田市
  '272043': {
    text: '笑顔あふれる豊かな暮らしを未来につなぐ みんなが大好きなまち',
    source: 'https://www.city.ikeda.osaka.jp/shisei_info/keikaku/keikaku/16316.html',
  },
  // 貝塚市
  '272086': {
    text: 'ともに創る 新しいまち貝塚',
    source: 'https://www.city.kaizuka.lg.jp/material/files/group/58/dai6ji_honpen_kihonkousou.pdf',
  },
  // 守口市
  '272094': {
    text: 'いつまでも住み続けたいまち 守口',
    source: 'https://www.city.moriguchi.osaka.jp/material/files/group/13/6jisoukeikouki_1-2.pdf',
  },
  // 枚方市
  '272108': {
    text: '持続的に発展し、 一人ひとりが輝くまち 枚方',
    source: 'https://www.city.hirakata.osaka.jp/cmsfiles/contents/0000007/7699/194324_1045111_misc.pdf',
  },
  // 八尾市
  '272124': {
    text: 'つながり、かがやき、しあわせつづく、成長都市 八尾',
    source: 'https://www.city.yao.osaka.jp/shisei/seisaku_keikaku_zaisei/1009538/1009540/1009581.html',
  },
  // 泉佐野市
  '272132': {
    text: '世界に羽ばたく国際都市 泉佐野',
    source: 'https://www.city.izumisano.lg.jp/material/files/group/33/sougoukeikakukouki.pdf',
  },
  // 富田林市
  '272141': {
    text: 'ひとがきらめく! 自然がきらめく! 歴史がきらめく! みんなでつくる 笑顔あふれるまち 富田林',
    source: 'https://www.city.tondabayashi.lg.jp/uploaded/attachment/52119.pdf',
  },
  // 寝屋川市
  '272159': {
    text: '新たな価値を創り、 選ばれるまち 寝屋川',
    source: 'https://www.city.neyagawa.osaka.jp/material/files/group/19/soukei6_kihonkousou.pdf',
  },
  // 河内長野市
  '272167': {
    text: 'ふだんを生きる、じぶんが活きる。 知るほど暮らすほど「好き。」が深まる千年都市。',
    source: 'https://www.city.kawachinagano.lg.jp/uploaded/attachment/44518.pdf',
  },
  // 松原市
  '272175': {
    text: 'みんなでつくる 未来へつなげるまち まつばら',
    source: 'https://www.city.matsubara.lg.jp/fs/1/8/9/8/7/2/_/keikakugaiyou.pdf',
  },
  // 大東市
  '272183': {
    text: '安全・安心の土台の上に、希望・喜びが実感できるまち',
    source: 'https://www.city.daito.lg.jp/uploaded/attachment/42696.pdf',
  },
  // 和泉市
  '272191': {
    text: '住めば住むほど好きになる ちょうどいいまち 和泉',
    source: 'https://www.city.osaka-izumi.lg.jp/material/files/group/11/6th_comprehensive_plan.pdf',
  },
  // 柏原市
  '272213': {
    text: '選ばれるまち柏原',
    source: 'http://www.city.kashiwara.osaka.jp/docs/2021101200036/file_contents/03_5thsoukei.pdf',
  },
  // 羽曳野市
  '272221': {
    text: '魅力が息づき 未来を築くまち はびきの',
    source: 'https://www.city.habikino.lg.jp/soshiki/shichou/seisakusuishin/sogokihonkeikaku/7jisoukei/17567.html',
  },
  // 門真市
  '272230': {
    text: '人情味あふれる！笑いのたえないまち 門真',
    source: 'https://www.city.kadoma.osaka.jp/material/files/group/3/6soukei-kaitei_1.pdf',
  },
  // 高石市
  '272256': {
    text: '人間都市・高石',
    source: 'https://www.city.takaishi.lg.jp/material/files/group/30/04kihonnkousou.pdf',
  },
  // 藤井寺市
  '272264': {
    text: '笑顔と活気に満ちた快適なまち ふじいでら',
    source: 'https://www.city.fujiidera.lg.jp/material/files/group/23/dai6jisougoukeikaku_kihonkousou.pdf',
  },
  // 東大阪市
  '272272': {
    text: 'つくる・つながる・ひびきあう －感動創造都市 東大阪－',
    source: 'https://www.city.higashiosaka.lg.jp/cmsfiles/contents/0000028/28226/honpen.pdf',
  },
  // 泉南市
  '272281': {
    text: 'ちょっとええやん なかなかええやん',
    source: 'https://www.city.sennan.lg.jp/material/files/group/4/kihonnkousou.pdf',
  },
  // 四條畷市
  '272299': {
    text: '自然と歴史をいつくしみ やすらぎ ぬくもり にぎわいをそだてよう みんなの夢をつくるまち 四條畷',
    source: 'https://www.city.shijonawate.lg.jp/uploaded/attachment/36810.pdf',
  },
  // 交野市
  '272302': {
    text: '懐かしさと新しさが交わる みんなのこころが和むまち かたの',
    source: 'https://www.city.katano.osaka.jp/docs/2021112200018/file_contents/kihonkousou_0822.pdf',
  },
  // 大阪狭山市
  '272311': {
    text: '水・ひと・まちが輝き みんなの笑顔を未来へつなぐまち',
    source: 'https://www.city.osakasayama.osaka.jp/machizukuri_shisei/seisaku_keikaku/7/4654.html',
  },
  // 阪南市
  '272329': {
    text: '共創による新しい地域価値が創造され、 誰もが輝ける舞台都市・阪南',
    source: 'https://www.city.hannan.lg.jp/material/files/group/43/sougoukeikaku_gaiyou_202204.pdf',
  },
  // 島本町
  '273015': {
    text: '自然と調和した個性と活力のある人間尊重のまち',
    source: 'https://www.town.shimamoto.lg.jp/uploaded/attachment/3643.pdf',
  },
  // 豊能町
  '273210': {
    text: '自然に抱かれた 多様性・創造性で未来が輝くまち とよの',
    source: 'https://www.town.toyono.osaka.jp/data/doc/1648700718_doc_228_0.pdf',
  },
  // 忠岡町
  '273414': {
    text: 'つながる つどう 人を育む 日本一小さなまち ただおか',
    source: 'https://www.town.tadaoka.osaka.jp/material/files/group/2/6soukeigaiyou.pdf',
  },
  // 熊取町
  '273619': {
    text: '住みたい 住んでよかった ともにつくる 〝やすらぎ〟と〝ほほえみ〟のまち',
    source: 'https://www.town.kumatori.lg.jp/material/files/group/2/dai4jisougoukeikaku_gaiyouban.pdf',
  },
  // 田尻町
  '273627': {
    text: '未来へ広がる空と海、笑顔が集うコンパクトシティ・たじり',
    source: 'https://www.town.tajiri.osaka.jp/material/files/group/5/dai5jikihonkousou.pdf',
  },
  // 岬町
  '273660': {
    text: 'みんなでつくる 恵み豊かな温もりのまち“みさき”',
    source: 'https://www.town.misaki.osaka.jp/material/files/group/7/soukeikihonkousouR803.pdf',
  },
  // 千早赤阪村
  '273830': {
    text: '元気なあいさつで みんなで創る 『唯一』と であえる 金剛山のむら',
    source: 'https://www.vill.chihayaakasaka.osaka.jp/material/files/group/1/2022022502.pdf',
  },
  // 兵庫県
  '280003': {
    text: '誰もが希望を持って生きられる 一人ひとりの可能性が広がる『躍動する兵庫』',
    source: 'https://web.pref.hyogo.lg.jp/kk07/vision/documents/sasshi_a4_0.pdf',
  },
  // 姫路市
  '282014': {
    text: 'ともに生き ともに輝く にぎわい交流拠点都市 姫路',
    source: 'https://www.city.himeji.lg.jp/shisei/0000015166.html',
  },
  // 尼崎市
  '282022': {
    text: 'ひと咲き まち咲き あまがさき',
    source: 'https://www.city.amagasaki.hyogo.jp/shisei/si_kangae/si_keikaku/1023312/1033935.html',
  },
  // 明石市
  '282031': {
    text: 'SDGs未来安心都市・明石',
    source: 'https://www.city.akashi.lg.jp/seisaku/seisaku_shitsu/shise/gyose/kekaku/sogokekaku/index-6sdgs.html',
  },
  // 西宮市
  '282049': {
    text: '未来を拓く 文教住宅都市・西宮 憩い、学び、つながりのある美しいまち',
    source: 'https://www.nishi.or.jp/shisei/sogokeikaku/sogokeikaku/dai5jisogokeikaku/dai5jisougoukeikaku.html',
  },
  // 洲本市
  '282057': {
    text: '豊かな自然とやさしさあふれる暮らし共創都市・洲本',
    source: 'https://www.city.sumoto.lg.jp/soshiki/7/22453.html',
  },
  // 芦屋市
  '282065': {
    text: '人がつながり 誰もが輝く 笑顔あふれる住宅都市',
    source: 'https://www.city.ashiya.lg.jp/gyousei/sougoukeikaku5ji/documents/sougoukeikakuhonnpenn.pdf',
  },
  // 伊丹市
  '282073': {
    text: '人の絆 まちの輝き 未来へつなぐ 伊丹',
    source: 'https://www.city.itami.lg.jp/SOSIKI/SOGOSEISAKU/SEISAKU/ITAMI_SISEI_HOSIN/38206.html',
  },
  // 相生市
  '282081': {
    text: 'いのち輝き 絆ひろがる あいのまち',
    source: 'https://www.city.aioi.lg.jp/uploaded/attachment/16265.pdf',
  },
  // 豊岡市
  '282090': {
    text: '小さな世界都市–Local ＆ Global City–',
    source: 'https://www.city.toyooka.lg.jp/shisei/shinoshokai/1023950/1023951/index.html',
  },
  // 加古川市
  '282103': {
    text: '夢と希望を描き 幸せを実感できるまち 加古川',
    source: 'https://www.city.kakogawa.lg.jp/soshikikarasagasu/kikakubu/kikakubukohoka/kakogawashinoseisakuzaisei/r3sougoukeikaku/30626.html',
  },
  // 赤穂市
  '282120': {
    text: '自然と歴史に育まれ 笑顔と希望あふれる 活力のあるまち',
    source: 'https://www.city.ako.lg.jp/shise/shisaku/sogokekaku/documents/2030sougoukeikaku_senryaku.pdf',
  },
  // 西脇市
  '282138': {
    text: 'つながり はぐくみ 未来織りなす 彩り豊かなまち にしわき',
    source: 'https://www.city.nishiwaki.lg.jp/kakukanogoannai/shichoukoushitsu/senryaku/sougou_keikaku/29121.html',
  },
  // 宝塚市
  '282146': {
    text: 'わたしの舞台はたからづか',
    source: 'https://www.city.takarazuka.hyogo.jp/_res/projects/default_project/_page_/001/001/329/hyoushihazimenimokuzi.pdf',
  },
  // 三木市
  '282154': {
    text: '誇りを持って暮らせるまち三木',
    source: 'https://www.city.miki.lg.jp/site/sou-kei/',
  },
  // 高砂市
  '282162': {
    text: '暮らしイキイキ 未来ワクワク 笑顔と思いやり育むまち 高砂',
    source: 'https://www.city.takasago.lg.jp/material/files/group/2/20210326-180719.pdf',
  },
  // 川西市
  '282171': {
    text: '心地よさ 息づくまち 川西',
    source: 'https://www.city.kawanishi.hyogo.jp/_res/projects/default_project/_page_/001/014/405/dai6jikawanishisougoukeikaku2.pdf',
  },
  // 小野市
  '282189': {
    text: '愛着と誇りを育み 未来に雄飛するまち －エクセレントシティ－ 小野',
    source: 'https://www.city.ono.hyogo.jp/soshikikarasagasu/sogoseisakubu_kikakuseisakugroup/gyomuannai/6/9036.html',
  },
  // 三田市
  '282197': {
    text: '「ひと」×「まち」×「さと」が織りなす未来都市 三田',
    source: 'https://www.city.sanda.lg.jp/shisei_joho/seisaku_keikaku/1/sogokeikaku/13362.html',
  },
  // 加西市
  '282201': {
    text: '大空に 夢がふくらむ 「未来の田舎」かさい',
    source: 'https://www.city.kasai.hyogo.jp/uploaded/attachment/33305.pdf',
  },
  // 丹波篠山市
  '282219': {
    text: '「丹波篠山」だからこそ実現できるあなたの夢・安心・未来',
    source: 'https://www.city.tambasasayama.lg.jp/gyoseijoho/gyoseikeikaku/sogo/27963.html',
  },
  // 養父市
  '282227': {
    text: '豊かで持続可能なスマートヴィレッジの共創',
    source: 'https://www.city.yabu.hyogo.jp/material/files/group/4/keikakugaiyou.pdf',
  },
  // 丹波市
  '282235': {
    text: 'まなび ときめく 丹（まごころ）の里',
    source: 'https://www.city.tamba.lg.jp/gyosei/sesakukekaku/sogokekaku/dai3ji-keikaku/10382.html',
  },
  // 南あわじ市
  '282243': {
    text: 'だから住みたい 南あわじ',
    source: 'https://www.city.minamiawaji.hyogo.jp/site/sougoukeikaku/dai2jisougoukeikaku.html',
  },
  // 朝来市
  '282251': {
    text: '人と人がつながり幸せが循環するまち',
    source: 'https://www.city.asago.hyogo.jp/soshiki/3/23089.html',
  },
  // 淡路市
  '282260': {
    text: 'いつかきっと帰りたくなる街づくり',
    source: 'https://www.city.awaji.lg.jp/uploaded/attachment/31988.pdf',
  },
  // 宍粟市
  '282278': {
    text: '人と自然が輝き みんなで創る 夢のまち',
    source: 'https://www.city.shiso.lg.jp/material/files/group/69/dai2jisougoukeikakukoukihonpen1.pdf',
  },
  // 加東市
  '282286': {
    text: '山よし！技よし！文化よし！夢がきらめく☆元気なまち 加東',
    source: 'https://www.city.kato.lg.jp/gyoseijoho/seisaku_keikaku/shuyokeikaku/12833.html',
  },
  // たつの市
  '282294': {
    text: 'みんなで創る 快適実感都市「たつの」',
    source: 'https://www.city.tatsuno.lg.jp/gyosei/seisaku-keikaku/12/4973.html',
  },
  // 猪名川町
  '283011': {
    text: '“つながり” と “挑戦” 幸せと笑顔あふれるまち 猪名川',
    source: 'https://www.town.inagawa.lg.jp/gyoseijoho/seisaku_keikaku/1/2/8313.html',
  },
  // 稲美町
  '283819': {
    text: 'ともにつくる未来へつなぐ稲美町',
    source: 'https://www.town.hyogo-inami.lg.jp/cmsfiles/contents/0000005/5572/kihonkousu.pdf',
  },
  // 播磨町
  '283827': {
    text: 'いいとこいっぱい！ 笑顔いっぱい！ みんなでつくる ふるさと はりま',
    source: 'https://www.town.harima.lg.jp/kikaku/chosejoho/shisaku/sogo/dai5.html',
  },
  // 市川町
  '284424': {
    text: 'しごとも くらしも ここにあるまち 市川町',
    source: 'https://www.town.ichikawa.lg.jp/div/kikaku/pdf/6th_sougoukeikaku_gaiyou.pdf',
  },
  // 福崎町
  '284432': {
    text: '活力にあふれ 風格のある 住みよいまち',
    source: 'https://www.town.fukusaki.hyogo.jp/cmsfiles/contents/0000005/5290/gaiyouban.pdf',
  },
  // 神河町
  '284467': {
    text: 'ハートがふれあう住民自治のまち',
    source: 'https://www.town.kamikawa.hyogo.jp/0000000011.html',
  },
  // 太子町
  '284645': {
    text: '和のまち 太子',
    source: 'https://www.town.hyogo-taishi.lg.jp/material/files/group/2/dai6jisoukeir2.pdf',
  },
  // 上郡町
  '284815': {
    text: '人と自然が調和し、すべての世代が安心して暮らせるまち',
    source: 'https://www.town.kamigori.hyogo.jp/material/files/group/5/sougoukeikakugaiyouban.pdf',
  },
  // 佐用町
  '285013': {
    text: '絆できらめく ひと・まち・自然 未来へつなぐ 共生の郷',
    source: 'https://www.town.sayo.lg.jp/cms-sypher/open_imgs/info/0000027271.pdf',
  },
  // 香美町
  '285854': {
    text: 'みんながいきいき、笑顔あふれるまち 香美町',
    source: 'https://www.town.mikata-kami.lg.jp/soshiki/kikaku/22/1/489.html',
  },
  // 新温泉町
  '285862': {
    text: '海・山・温泉 人が輝く 夢と温もりの郷',
    source: 'https://www.town.shinonsen.hyogo.jp/page/?mode=detail&page_id=ab0c12d403530edb806f96b3a5ce4f2c',
  },
  // 奈良市
  '292010': {
    text: '「わたし」からはじめる「わたしたち」のまち 奈良',
    source: 'https://www.city.nara.lg.jp/site/soukei5',
  },
  // 大和高田市
  '292028': {
    text: '笑顔の花咲くまち大和高田',
    source: 'https://www.city.yamatotakada.nara.jp/shisei/seisaku_keikaku/2986.html',
  },
  // 大和郡山市
  '292036': {
    text: '希望と誇りをつなぎ、新たな価値を生み出す元気城下町',
    source: 'https://www.city.yamatokoriyama.lg.jp/material/files/group/2/5jisoukei_3kisousenn-kihonnkousou.pdf',
  },
  // 天理市
  '292044': {
    text: '大和青垣に囲まれた歴史と文化かおる共生都市・天理',
    source: 'https://www.city.tenri.nara.jp/kakuka/shichoukoushitsu/sougouseisakuka/sougou_keikaku/dairokujisougoukeikaku/1587521383052.html',
  },
  // 橿原市
  '292052': {
    text: 'はじまりから未来へ、つながりきらめくまち かしはら',
    source: 'https://www.city.kashihara.nara.jp/material/files/group/7/6065759465909e57566cc6b5.pdf',
  },
  // 桜井市
  '292061': {
    text: 'はじまりの地から未来へ 歴史と自然がいきづく万葉のふるさと 桜井',
    source: 'https://www.city.sakurai.lg.jp/shisei/project/sougoukeikaku/7797.html',
  },
  // 五條市
  '292079': {
    text: '「五條」ひと・みちが交わり、新たな価値が生まれるまち',
    source: 'https://www.city.gojo.lg.jp/soshiki/kikaku/5_1/gojoshivision/8757.html',
  },
  // 御所市
  '292087': {
    text: '行きたい、住みたい、語りたい。',
    source: 'https://www.city.gose.nara.jp/cmsfiles/contents/0000003/3064/plan_syosai.pdf',
  },
  // 生駒市
  '292095': {
    text: '自分らしく輝けるステージ・生駒',
    source: 'https://www.city.ikoma.lg.jp/cmsfiles/contents/0000034/34754/kihonkeikaku_2.pdf',
  },
  // 香芝市
  '292109': {
    text: '笑顔をもっと 元気をずっと',
    source: 'https://www.city.kashiba.lg.jp/soshiki/4/6432.html',
  },
  // 葛城市
  '292117': {
    text: '歴史を重ね、未来を育む 時代を超えて愛される住みよい共存の都市 葛城',
    source: 'https://www.city.katsuragi.nara.jp/material/files/group/3/20170308-115653.pdf',
  },
  // 宇陀市
  '292125': {
    text: 'みんなが生きがいをもって暮らせる魅力ある健幸なまち宇陀市',
    source: 'https://www.city.uda.lg.jp/kikaku/shisei/plan/kihonkousou-zenki.html',
  },
  // 山添村
  '293229': {
    text: '元気で、夢や生き甲斐を持て、安心して暮らせる村づくり',
    source: 'https://www.vill.yamazoe.nara.jp/life/wp-content/uploads/2026/05/%E2%91%A1%E3%80%90%E6%9C%AC%E6%96%87%E3%80%91%E3%82%84%E3%81%BE%E3%81%9E%E3%81%88%E6%9C%AA%E6%9D%A5%E5%89%B5%E7%94%9F%E8%A8%88%E7%94%BB%E7%AC%AC5%E6%AC%A1%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB_%E7%AC%AC2%E9%83%A8-%E5%9F%BA%E6%9C%AC%E6%A7%8B%E6%83%B3-P26-31.pdf',
  },
  // 平群町
  '293423': {
    text: '人が輝き、未来が輝く、夢あふれるまち へぐり',
    source: 'https://www.town.heguri.nara.jp/uploaded/attachment/7837.pdf',
  },
  // 斑鳩町
  '293440': {
    text: '「和」で紡ぎ 未来へ歩む 私たちの斑鳩',
    source: 'https://www.town.ikaruga.nara.jp/0000003254.html',
  },
  // 安堵町
  '293458': {
    text: '小さくてもキラリ光る 活力あふれるまち あんど',
    source: 'https://www.town.ando.nara.jp/0000003231.html',
  },
  // 川西町
  '293610': {
    text: '安心 すくすく 豊かな心を育む かわにし',
    source: 'https://www.town.nara-kawanishi.lg.jp/0000007426.html',
  },
  // 三宅町
  '293628': {
    text: '慈愛の風薫り、未来に光射す きらめきのまち、みやけ',
    source: 'https://www.town.miyake.lg.jp/uploaded/attachment/1813.pdf',
  },
  // 田原本町
  '293636': {
    text: 'わたしが関わり、みんなで育む 「ちょうどいい幸福田園都市・田原本」',
    source: 'https://www.town.tawaramoto.nara.jp/material/files/group/41/kihonnkousou_kanseiban.pdf',
  },
  // 曽爾村
  '293857': {
    text: '希望と安心を実感できる 楽しく賑やかで美しい村',
    source: 'https://www.vill.soni.nara.jp/div/kikaku/pdf/sougoukeikaku/sougoukeikakuzenbun.pdf',
  },
  // 御杖村
  '293865': {
    text: '『みっつの杖』で創る 縁結びのふるさと',
    source: 'https://www.vill.mitsue.nara.jp/kurashi/gyosei/seisaku/3004.html',
  },
  // 高取町
  '294012': {
    text: '健やかに住み続けたくなるまち高取町',
    source: 'https://www.town.takatori.nara.jp/cmsfiles/contents/0000002/2569/sougousenryaku.pdf',
  },
  // 上牧町
  '294241': {
    text: 'ほほ笑みあふれる和のまちづくり',
    source: 'https://www.town.kanmaki.nara.jp/material/files/group/3/soukei2022-2.pdf',
  },
  // 広陵町
  '294268': {
    text: 'be Happy 未来につながるまち 広陵',
    source: 'https://www.town.koryo.nara.jp/0000007913.html',
  },
  // 河合町
  '294276': {
    text: 'みんなが輝く活力あふれる河合町',
    source: 'https://www.town.kawai.nara.jp/material/files/group/27/kannseibanngaiyoubann.pdf',
  },
  // 吉野町
  '294411': {
    text: '「ひと」がつながり 「ひと」が輝き 「ひと」が潤う 感動生まれる 吉野町',
    source: 'https://www.town.yoshino.nara.jp/material/files/group/2/dai5jikoukikeikaku.pdf',
  },
  // 大淀町
  '294420': {
    text: '来たい、住みたい、住み続けたいまち 大淀町',
    source: 'https://www.town.oyodo.lg.jp/0000000853.html',
  },
  // 黒滝村
  '294446': {
    text: '動かそうよ黒滝 村民が動けば村が動く 村民主導の村づくり',
    source: 'https://www.vill.kurotaki.nara.jp/cms/wp-content/uploads/2022/04/576b6f702d92d621d730f99c2644c2d8.pdf',
  },
  // 野迫川村
  '294471': {
    text: '天空の國 野迫川 夢を持ち、夢が語れる村',
    source: 'https://www.vill.nosegawa.nara.jp/material/files/group/2/smileplan_2020_2gaiyou.pdf',
  },
  // 十津川村
  '294497': {
    text: '心身再生の郷',
    source: 'https://www.vill.totsukawa.lg.jp/administration/gyousei/pdf/plan/soumu06.pdf',
  },
  // 下北山村
  '294501': {
    text: '風土文化を受け継ぎながら、みんな幸せに住み続けていけるきなりの郷',
    source: 'https://www.vill.shimokitayama.nara.jp/about/about6.html',
  },
  // 上北山村
  '294519': {
    text: '水と緑とともに生きる郷 上北山',
    source: 'https://www.vill.kamikitayama.nara.jp/material/files/group/2/154_4.pdf',
  },
  // 川上村
  '294527': {
    text: 'いつまでも みんなで 誇りのもてる 水源地の村づくり',
    source: 'https://www.vill.kawakami.nara.jp/life/docs/2017020600200/file_contents/file_2026291101053_1.pdf',
  },
  // 東吉野村
  '294535': {
    text: 'まちから むらから 人が集う 木と水のふるさと',
    source: 'http://www.vill.higashiyoshino.nara.jp/life/wp-content/uploads/sites/2/2021/03/gaiyou_kihonkousou.pdf',
  },
  // 和歌山市
  '302015': {
    text: 'きらり 輝く 元気和歌山市',
    source: 'https://www.city.wakayama.wakayama.jp/shisei/1009206/1002808.html',
  },
  // 海南市
  '302023': {
    text: '元気 ふれあい 安心のまち 海南',
    source: 'https://www.city.kainan.lg.jp/material/files/group/5/sougoukeikakugaiyoubann.pdf',
  },
  // 橋本市
  '302031': {
    text: '人輝き あたたかさ湧きでる みんなで創造する元気なまち 橋本',
    source: 'https://www.city.hashimoto.lg.jp/guide/sogoseisakubu/seisaku_kikaku/tyoukikeikaku/dai2jichoukeikouki/tyoukisouogukeikakukoukisakutei.html',
  },
  // 有田市
  '302040': {
    text: '人が輝き まちが色づく魅了都市 ありだ',
    source: 'https://www.city.arida.lg.jp/_res/projects/default_project/_page_/001/005/171/dai5jichoukeikouki.pdf',
  },
  // 御坊市
  '302058': {
    text: '人と自然が調和し、笑顔と活力あふれる御坊',
    source: 'https://www.city.gobo.lg.jp/material/files/group/2/09680252.pdf',
  },
  // 田辺市
  '302066': {
    text: '人と地域が輝き、未来へつながるまち田辺',
    source: 'https://www.city.tanabe.lg.jp/machizukuri/gyoseiunei/7/kikakukeikaku/15/1/4110.html',
  },
  // 新宮市
  '302074': {
    text: '人とまちが輝き、『未来』へつなぐまち 新宮市',
    source: 'https://www.city.shingu.lg.jp/div/kikaku/pdf/sougoukeikaku/2kouki-02.pdf',
  },
  // 紀の川市
  '302082': {
    text: '人が行き交い 自然の恵みあふれる 住みよいまち',
    source: 'https://www.city.kinokawa.lg.jp/004/files/02_choukei_kihonkousou.pdf',
  },
  // 岩出市
  '302091': {
    text: '活力あふれるまち ふれあいのまち',
    source: 'https://www.city.iwade.lg.jp/uploaded/attachment/4668.pdf',
  },
  // 紀美野町
  '303046': {
    text: '空・山・川のふれあいのある 美しいふるさと',
    source: 'https://www.town.kimino.wakayama.jp/sagasu/kikakukanzaika/kikakukanzaika_plan/longplan/2th_latterstage.html',
  },
  // かつらぎ町
  '303411': {
    text: 'みんなが住みやすく 笑顔と活気あふれる かつらぎ町',
    source: 'https://www.town.katsuragi.wakayama.jp/050/050/020/20180918172837.html',
  },
  // 九度山町
  '303437': {
    text: '「知恵と対話」で守り創造する自然と歴史・文化のわがふるさと紀州九度山',
    source: 'https://www.town.kudoyama.lg.jp/kikaku/sougoukeikaku/files/k_koukikeikaku_0.pdf',
  },
  // 高野町
  '303445': {
    text: '歴史と文化を守り 交流が育む明るい未来心のふるさと 高野町',
    source: 'https://www.town.koya.wakayama.jp/town/keikaku/9768.html',
  },
  // 湯浅町
  '303615': {
    text: '歴史と人の温もりで支え合うまち 湯浅',
    source: 'https://www.town.yuasa.wakayama.jp/uploaded/attachment/5290.pdf',
  },
  // 有田川町
  '303666': {
    text: '〜川が結び、川が育む、森とまち〜 人が集い、想いを紡ぎ、新しい流れをつくるまち',
    source: 'https://www.town.aridagawa.lg.jp/material/files/group/11/tyoukeikoukikeikaku.pdf',
  },
  // 美浜町
  '303810': {
    text: '海と緑に彩られた 強く優しく美しいまち 美浜町',
    source: 'http://www.town.mihama.wakayama.jp/docs/2014011800762/files/6gaiyou.pdf',
  },
  // 日高町
  '303828': {
    text: '笑顔で健康に暮らせるまち 海と緑に包まれた快適空間・ひだか',
    source: 'http://www.town.wakayama-hidaka.lg.jp/docs/2026021000018/files/tyoukei_kouki.pdf',
  },
  // 印南町
  '303909': {
    text: '住民とともに築く、希望あふれる郷',
    source: 'https://www.town.wakayama-inami.lg.jp/0000000564.html',
  },
  // みなべ町
  '303917': {
    text: '海・山・川の恵みの中で人が輝く快適なまち',
    source: 'https://www.town.minabe.lg.jp/tyousei/02/02/files/chokei_2.pdf',
  },
  // 日高川町
  '303925': {
    text: '地域の個性で創る 元気創造空間 日高川町',
    source: 'https://www.town.hidakagawa.lg.jp/tyousei/keikaku/files/tyoukeigaiyou_hidakagawa.pdf',
  },
  // 白浜町
  '304018': {
    text: '輝きとやすらぎと交流のまち 白浜',
    source: 'https://www.town.shirahama.wakayama.jp/material/files/group/3/chokei2.pdf',
  },
  // 上富田町
  '304042': {
    text: '花咲く明日につながる口熊野 かみとんだ',
    source: 'https://www.town.kamitonda.lg.jp/material/files/group/12/gaiyouban02.pdf',
  },
  // 那智勝浦町
  '304212': {
    text: '歴史・文化と自然が奏でる世界に開かれた町',
    source: 'https://www.town.nachikatsuura.wakayama.jp/info/538',
  },
  // 古座川町
  '304247': {
    text: '清流“古座川” と共生するまち',
    source: 'https://www.town.kozagawa.lg.jp/machidukuri/index.html',
  },
  // 北山村
  '304271': {
    text: '守り育て、発展する北山村',
    source: 'https://www.vill.kitayama.wakayama.jp/about/plan/sougousenryaku.html',
  },
  // 串本町
  '304280': {
    text: '最南端から最先端へ 感動に出会えるまち 串本',
    source: 'https://www.town.kushimoto.wakayama.jp/gyosei/sougou-keikaku/files/3_chouki-sogo-keikaku.pdf',
  },
  // 鳥取県
  '310000': {
    text: '未来への挑戦～持続可能な地域の発展をめざして～',
    source: 'https://www.pref.tottori.lg.jp/secure/1226569/2020vision.pdf',
  },
  // 鳥取市
  '312011': {
    text: '一人ひとりが自分の力を発揮でき、支え合いながら ともに豊かに暮らせる鳥取市',
    source: 'https://www.city.tottori.lg.jp/site/keikakusenryaku/34054.html',
  },
  // 米子市
  '312029': {
    text: '住んで楽しいまち よなご',
    source: 'https://www.city.yonago.lg.jp/secure/57942/dainizibizyon.pdf',
  },
  // 倉吉市
  '312037': {
    text: '元気なまち、くらしよし、未来へ！',
    source: 'https://www.city.kurayoshi.lg.jp/secure/1825/di-12ci-cang-ji-shi-zong-he-ji-hua-gai-yao-ban-a4ban.pdf',
  },
  // 境港市
  '312045': {
    text: '環日本海オアシス都市',
    source: 'https://www.city.sakaiminato.lg.jp/upload/user/00108391-AbEQD1.pdf',
  },
  // 岩美町
  '313025': {
    text: 'みんなが笑顔で 住み続けたくなるまち 岩美町',
    source: 'https://www.iwami.gr.jp/1064.htm',
  },
  // 若桜町
  '313254': {
    text: '豊かな自然と歴史の中で 人々が絆を強め、経済が潤うまち',
    source: 'https://www.town.wakasa.tottori.jp/material/files/group/5/sougoukeikaku.pdf',
  },
  // 智頭町
  '313289': {
    text: '一人ひとりの人生に寄り添えるまちへ',
    source: 'https://www1.town.chizu.tottori.jp/user/filer_public/ba/dd/badd4310-67d2-4f9d-a903-548d53307667/zhi-tou-ting-zong-he-ji-hua-ji-ben-gou-xiang-hou-qi-ji-hua-_0916.pdf',
  },
  // 八頭町
  '313297': {
    text: '未来をつなぐ 八頭の力 みんなで創る活力あるまち',
    source: 'https://www.town.yazu.tottori.jp/uploaded/attachment/7821.pdf',
  },
  // 三朝町
  '313645': {
    text: '笑顔と元気があふれ 輝く町',
    source: 'https://www.town.misasa.tottori.jp/315/319/1387/1408/1410/24915.html',
  },
  // 湯梨浜町
  '313700': {
    text: '住みやすく 魅力と活気あふれる 愛のまち',
    source: 'https://www.yurihama.jp/uploaded/attachment/15678.pdf',
  },
  // 琴浦町
  '313718': {
    text: 'ひとが輝く、豊かな自然と食のまち琴浦',
    source: 'https://www.town.kotoura.tottori.jp/docs/2022092600041/',
  },
  // 北栄町
  '313726': {
    text: '人と自然が共生し 確かな豊かさを実感するまち',
    source: 'https://www.e-hokuei.net/soshiki/3/1160.html',
  },
  // 日吉津村
  '313840': {
    text: 'みんなで創る元気な村 住み続けたい日吉津村',
    source: 'https://www.hiezu.jp/wp-content/uploads/2026/03/di-7ci-zong-he-ji-hua-ji-ben-gou-xiang-ji-ben-ji-hua.pdf',
  },
  // 大山町
  '313866': {
    text: 'わくわく楽しい未来につながるまち',
    source: 'https://www.daisen.jp/10/19/n836/v106/',
  },
  // 南部町
  '313891': {
    text: '人と自然が響き合い ともに創る なんぶ暮らし',
    source: 'https://www.town.nanbu.tottori.jp/user/filer_public/66/fd/66fd95ba-707e-44ee-8f67-97758dd2251a/di-2ci-zong-he-ji-hua.pdf',
  },
  // 伯耆町
  '313904': {
    text: '森と光が織りなすうるおいのまち',
    source: 'https://www.houki-town.jp/user/filer_public/8d/b8/8db84355-2c48-4f13-93c4-fad95e20dc44/iimachinojiang-lai-xiang-tomachidukurinoji-ben-fang-zhen.pdf',
  },
  // 日南町
  '314013': {
    text: '創造的過疎のまちへの挑戦',
    source: 'https://www.town.nichinan.lg.jp/material/files/group/18/dairokujinichinanchousougoukeikakukoukikeikaku.pdf',
  },
  // 島根県
  '320005': {
    text: '人口減少に打ち勝ち、笑顔で暮らせる島根',
    source: 'https://www.pref.shimane.lg.jp/admin/seisaku/keikaku/shimanesousei/',
  },
  // 松江市
  '322016': {
    text: '夢を実現できるまち 誇れるまち 松江',
    source: 'https://www.city.matsue.lg.jp/material/files/group/2/kihonkousou.pdf',
  },
  // 浜田市
  '322024': {
    text: '住みたい 住んでよかった 魅力いっぱい 元気な浜田',
    source: 'https://www.city.hamada.shimane.jp/www/contents/1455684299511/index.html',
  },
  // 出雲市
  '322032': {
    text: '『出雲力』で 夢☆未来へつなげ 誰もが笑顔になれるまち',
    source: 'https://www.city.izumo.shimane.jp/www/contents/1663064503294/files/02.pdf',
  },
  // 益田市
  '322041': {
    text: 'ひとが育ち 輝くまち 益田',
    source: 'https://www.city.masuda.lg.jp/shiseijoho/shinokeikaku_torikumi/sogoshinkokeikaku/5620.html',
  },
  // 大田市
  '322059': {
    text: '子どもたちの笑顔があふれ、みんなが夢を抱けるまち“おおだ”',
    source: 'https://www.city.oda.lg.jp/files/original/20250925200100564aee40e4e.pdf',
  },
  // 安来市
  '322067': {
    text: 'ワザを磨き、安らぎをつむぎ、シンカするまち',
    source: 'https://www.city.yasugi.shimane.jp/shisei/keikaku/sankaku/sougoukeikaku3.html',
  },
  // 江津市
  '322075': {
    text: '小さくともキラリと光るまち ごうつ',
    source: 'https://www.city.gotsu.lg.jp/soshiki/2/16011.html',
  },
  // 雲南市
  '322091': {
    text: 'みんなが幸せに暮らせるまち えすこな 雲南市',
    source: 'https://www.city.unnan.shimane.jp/unnan/shiseijouhou/jouhoukoukai/sougoukeikaku/sougou01.html',
  },
  // 飯南町
  '323861': {
    text: '小さな田舎からの『生命地域』宣言',
    source: 'https://www.iinan.jp/uploaded/attachment/6291.pdf',
  },
  // 川本町
  '324418': {
    text: 'たすけあい・支えあう中で、自分らしく暮らし続けられるまち',
    source: 'https://www.town.shimane-kawamoto.lg.jp/gyosei/town_administration/various_plans/machizukurisuishinka/8157',
  },
  // 美郷町
  '324485': {
    text: '人が集い、未来が育つ美郷',
    source: 'https://gov.town.shimane-misato.lg.jp/files/original/20260727143641556009aa277.pdf',
  },
  // 邑南町
  '324493': {
    text: '地域とつながり、挑戦を育む町',
    source: 'https://www.town.ohnan.lg.jp/uploaded/attachment/5684.pdf',
  },
  // 津和野町
  '325015': {
    text: 'ひと（人）とひと（人）の絆で結ぶ 津和野ブランドによる協働のまちづくり',
    source: 'https://www.town.tsuwano.lg.jp/www/contents/1390982743485/simple/kouki02.pdf',
  },
  // 吉賀町
  '325058': {
    text: '自然の恵みに育まれ、人と共に生きる自立発展のまち',
    source: 'https://www.town.yoshika.lg.jp/about/cyousei/kakushukeikaku.data/dainijiyoshikatownmatidukurikeikaku.pdf',
  },
  // 西ノ島町
  '325261': {
    text: 'わたしがつくる みんなの「わがとこ」',
    source: 'https://www.town.nishinoshima.shimane.jp/files/original/202508121646019806580eb2c.pdf',
  },
  // 知夫村
  '325279': {
    text: '活力ある住みよい島・知夫村',
    source: 'http://www.vill.chibu.lg.jp/files/original/202108201340193643423.pdf',
  },
  // 隠岐の島町
  '325287': {
    text: 'つながらぁや つながぁや 一万年の隠岐の島',
    source: 'https://www.town.okinoshima.shimane.jp/chosei/gyosei_unei/seisaku-keikaku/10/5626.html',
  },
  // 岡山県
  '330001': {
    text: 'すべての県民が明るい笑顔で暮らす「生き活き岡山」',
    source: 'https://www.pref.okayama.jp/uploaded/life/966996_9300136_misc.pdf',
  },
  // 岡山市
  '331007': {
    text: '“わくわくする”桃太郎のまち岡山 つながり 輝き 幸せ実感',
    source: 'https://www.city.okayama.jp/shisei/0000079070.html',
  },
  // 倉敷市
  '332020': {
    text: '豊かな自然と紡がれた歴史・文化を次代へ繋ぎ 人と人との絆と慈しみの心で地域を結ぶまち倉敷',
    source: 'https://www.city.kurashiki.okayama.jp/_res/projects/default_project/_page_/001/002/083/2shou.pdf',
  },
  // 玉野市
  '332046': {
    text: '誰もが行ってみたい、住み続けたいまち',
    source: 'https://www.city.tamano.lg.jp/uploaded/attachment/21945.pdf',
  },
  // 笠岡市
  '332054': {
    text: '「対話」と「協調」と「連携」で築く 夢と笑顔が広がるまちづくり',
    source: 'https://www.city.kasaoka.okayama.jp/uploaded/attachment/57274.pdf',
  },
  // 井原市
  '332071': {
    text: '輝くひと 未来創造都市 いばら',
    source: 'https://www.city.ibara.okayama.jp/uploaded/attachment/1258.pdf',
  },
  // 総社市
  '332089': {
    text: '挑戦 岡山の新都心 総社',
    source: 'https://www.city.soja.okayama.jp/soshiki/2/13941.html',
  },
  // 高梁市
  '332097': {
    text: '健幸都市たかはし',
    source: 'https://www.city.takahashi.lg.jp/soshiki/2/sougokeikaku.html',
  },
  // 新見市
  '332101': {
    text: '人と地域が輝き 未来につながる 源流共生のまち・にいみ',
    source: 'https://www.city.niimi.okayama.jp/media_images/files/01_jyoron_kihonkoso.pdf',
  },
  // 備前市
  '332119': {
    text: '豊かな“自然と文化”、魅力あふれる“まち”、活気ある“ひと”それが備前',
    source: 'https://www.city.bizen.okayama.jp/uploaded/attachment/28695.pdf',
  },
  // 瀬戸内市
  '332127': {
    text: '人と自然が織りなす しあわせ実感都市 瀬戸内',
    source: 'https://www.city.setouchi.lg.jp/uploaded/attachment/111479.pdf',
  },
  // 赤磐市
  '332135': {
    text: '共に未来を描く 白桃発祥のまち あかいわ',
    source: 'https://www.city.akaiwa.lg.jp/material/files/group/5/daisanjigaiyouban.pdf',
  },
  // 真庭市
  '332143': {
    text: '真庭ライフスタイル（多彩な真庭の豊かな生活）の実現',
    source: 'https://www.city.maniwa.lg.jp/uploaded/attachment/36415.pdf',
  },
  // 浅口市
  '332160': {
    text: 'キラリと光る未来そうぞうワクワク都市',
    source: 'https://www.city.asakuchi.lg.jp/uploaded/attachment/4731.pdf',
  },
  // 和気町
  '333468': {
    text: '人と地域が輝く 晴れの国の 和気あいあいのまち',
    source: 'https://www.town.wake.lg.jp/soshiki/machikeiei/gyomu/10/2/82.html',
  },
  // 早島町
  '334235': {
    text: '安全・安心に暮らせ 豊かさと幸せが実感できるまち',
    source: 'https://www.town.hayashima.lg.jp/material/files/group/5/95767274.pdf',
  },
  // 里庄町
  '334456': {
    text: '子どもの元気な声が響き みんなの笑顔があふれるまち',
    source: 'https://www.town.satosho.okayama.jp/soshiki/3/5909.html',
  },
  // 新庄村
  '335860': {
    text: '自然豊かなこの地で、心豊かな人材を育むとともに、 地域産業を発展させ、皆が安心して笑顔で暮らせる美しい村',
    source: 'http://www.vill.shinjo.okayama.jp/assets/files/dai2kisinnkoukeikaku-sougousennryaku.pdf',
  },
  // 鏡野町
  '336068': {
    text: '誰もが 安心してくらせる 笑顔あふれるまち',
    source: 'https://www.town.kagamino.lg.jp/uploaded/attachment/16045.pdf',
  },
  // 勝央町
  '336220': {
    text: '心豊かに安心して暮らせる自然と文化のまち❝元気な勝央❞',
    source: 'https://www.town.shoo.lg.jp/soshiki/1/1061.html',
  },
  // 西粟倉村
  '336432': {
    text: '生きるを楽しむ 百年の森林に育まれたむら',
    source: 'https://www.vill.nishiawakura.okayama.jp/wp/wp-content/uploads/2017/03/caded4013f1cac55c34289d6636dd868.pdf',
  },
  // 久米南町
  '336637': {
    text: 'たくさんの 笑顔と元気 久米南町',
    source: 'https://www.town.kumenan.lg.jp/administration/planning/sinkou_keikaku/documents/shinko_keikaku_gaiyo.pdf',
  },
  // 美咲町
  '336661': {
    text: 'ひと 輝くまち みさき',
    source: 'https://www.town.okayama-misaki.lg.jp/material/files/group/5/20260330.pdf',
  },
  // 吉備中央町
  '336815': {
    text: '２２世紀の 理想郷(ふるさと) 吉備中央町',
    source: 'https://www.town.kibichuo.lg.jp/soshiki/4/8352.html',
  },
  // 広島県
  '340006': {
    text: '将来にわたって、「広島に生まれ、育ち、住み、働いて良かった」と心から思える広島県の実現',
    source: 'https://www.pref.hiroshima.lg.jp/soshiki/230/hiroshimavisionkaitei.html',
  },
  // 広島市
  '341002': {
    text: '国際平和文化都市',
    source: 'https://www.city.hiroshima.lg.jp/_res/projects/default_project/_page_/001/003/327/117623.pdf',
  },
  // 呉市
  '342025': {
    text: '誰もが住み続けたい，行ってみたい，人を惹きつけるまち「くれ」',
    source: 'https://www.city.kure.lg.jp/uploaded/attachment/58330.pdf',
  },
  // 竹原市
  '342033': {
    text: '元気と笑顔が織り成す 暮らし誇らし、竹原市。',
    source: 'https://www.city.takehara.lg.jp/gyoseijoho/seisaku_keikaku/sogokeikaku/3613.html',
  },
  // 三原市
  '342041': {
    text: 'すごいぞ三原！！',
    source: 'https://www.city.mihara.hiroshima.jp/uploaded/attachment/147848.pdf',
  },
  // 尾道市
  '342050': {
    text: '元気あふれ 人がつながり 安心して暮らせる ～誇れるまち『尾道』～',
    source: 'https://www.city.onomichi.hiroshima.jp/uploaded/life/93556_263984_misc.pdf',
  },
  // 府中市
  '342084': {
    text: 'しあわせ実感！ “力強さ”と“やさしさ”のある未来を創造するまち',
    source: 'https://www.city.fuchu.hiroshima.jp/material/files/group/29/04miraikousou.pdf',
  },
  // 三次市
  '342092': {
    text: '人と想いがつながり、未来につなぐまち',
    source: 'https://www.city.miyoshi.hiroshima.jp/soshiki/5/24025.html',
  },
  // 庄原市
  '342106': {
    text: '安心な暮らしが充実し、庄原に関わる人の未来がつながっていくまち',
    source: 'https://www.city.shobara.hiroshima.jp/main/2026/07/0e37623164a741147cdddc0b81a94d80.pdf',
  },
  // 東広島市
  '342122': {
    text: '未来に挑戦する自然豊かな国際学術研究都市',
    source: 'https://www.city.higashihiroshima.lg.jp/shisei/seisaku/2/43507.html',
  },
  // 廿日市市
  '342131': {
    text: '安心に包まれ ワクワクが広がる 未来への挑戦を楽しむまち つなぎ つながり ともに歩む',
    source: 'https://www.city.hatsukaichi.hiroshima.jp/uploaded/attachment/91344.pdf',
  },
  // 安芸高田市
  '342149': {
    text: '百万一心、未来へつなぐ安芸高田市',
    source: 'https://www.akitakata.jp/akitakata-media/filer_public/8f/cc/8fcc4998-f26e-4893-8730-a265f4eed1d7/4kousou.pdf',
  },
  // 府中町
  '343021': {
    text: 'みんなの『暮らしたい』がかなうまち',
    source: 'https://www.town.fuchu.hiroshima.jp/uploaded/attachment/32057.pdf',
  },
  // 海田町
  '343048': {
    text: 'ひと・まち・みらいをつなぐ 暮らしやすさが実感できるまち かいた',
    source: 'https://www.town.kaita.lg.jp/soshiki/2/125016.html',
  },
  // 坂町
  '343099': {
    text: '自然に恵まれた健康で文化的な住みよいまち',
    source: 'https://www.town.saka.lg.jp/wp-content/uploads/2000/sites/03/files/cyousei_info/images/dai5ji_sougoukeikaku_gaiyoubann.pdf',
  },
  // 安芸太田町
  '343684': {
    text: '太田川とともに、暮らし、学び、未来に向けて一人一人が活躍するまち',
    source: 'https://www.akiota.jp/uploaded/attachment/8315.pdf',
  },
  // 北広島町
  '343692': {
    text: '新たな感動・活力を創る 北広島',
    source: 'https://www.town.kitahiroshima.lg.jp/soshiki/4/1221.html',
  },
  // 大崎上島町
  '344311': {
    text: '海景色の映えるまち',
    source: 'https://www.town.osakikamijima.hiroshima.jp/material/files/group/20/tyoukeigaiyou.pdf',
  },
  // 世羅町
  '344621': {
    text: 'つなげる未来 人があつまる ふるさと世羅',
    source: 'https://www.town.sera.hiroshima.jp/uploaded/attachment/12111.pdf',
  },
  // 神石高原町
  '345458': {
    text: '人と自然が輝く高原のまち',
    source: 'https://www.jinsekigun.jp/user/filer_public/05/92/059294c2-81ba-4369-a785-1b091abb3356/shen-shi-gao-yuan-ting-di-3ci-chang-qi-zong-he-ji-hua-gai-yao-ban.pdf',
  },
  // 山口県
  '350001': {
    text: '安心で希望と活力に満ちた山口県',
    source: 'https://www.pref.yamaguchi.lg.jp/uploaded/attachment/137358.pdf',
  },
  // 下関市
  '352012': {
    text: '可能性を築くまち',
    source: 'https://www.city.shimonoseki.lg.jp/uploaded/life/162711_644428_misc.pdf',
  },
  // 宇部市
  '352021': {
    text: 'ひとが輝き 交流ひろがる わたしたちの宇部(まち)',
    source: 'https://www.city.ube.yamaguchi.jp/shisei/keikaku/1015261/1012517/1015733.html',
  },
  // 山口市
  '352039': {
    text: '豊かな暮らし 交流と創造のまち 山口',
    source: 'https://www.city.yamaguchi.lg.jp/uploaded/attachment/41099.pdf',
  },
  // 萩市
  '352047': {
    text: '暮らしの豊かさを実感できるまち',
    source: 'https://www.city.hagi.lg.jp/soshiki/12/h45715.html',
  },
  // 防府市
  '352063': {
    text: '明るく豊かで健やかな防府',
    source: 'https://www.city.hofu.yamaguchi.jp/uploaded/attachment/145801.pdf',
  },
  // 下松市
  '352071': {
    text: '都市と自然のバランスのとれた住みよさ日本一の星ふるまち',
    source: 'https://www.city.kudamatsu.lg.jp/kikaku/kikaku/kikaku/documents/sokeigaiyou.pdf',
  },
  // 岩国市
  '352080': {
    text: 'ともに歩み、ともに創り、ともに輝く、交流とにぎわいのまち岩国',
    source: 'https://www.city.iwakuni.lg.jp/uploaded/attachment/47068.pdf',
  },
  // 光市
  '352101': {
    text: 'ゆたかな社会～人が輝き やさしさつながる 幸せ創造都市 ひかり～',
    source: 'https://www.city.hikari.lg.jp/material/files/group/7/dai3jisougoukeikaku_gaiyou_a4.pdf',
  },
  // 長門市
  '352110': {
    text: 'ひとが輝き、やさしさがこだまするまち長門',
    source: 'https://www.city.nagato.yamaguchi.jp/uploaded/attachment/24585.pdf',
  },
  // 柳井市
  '352128': {
    text: '市民の力で支えあい、一人ひとりが主役の笑顔あふれるまち柳井',
    source: 'https://www.city-yanai.jp/uploaded/attachment/43495.pdf',
  },
  // 美祢市
  '352136': {
    text: '若者・女性・地域がかがやき こどもの笑い声が響く「誇れる郷土・秋吉台のまち」',
    source: 'https://www2.city.mine.lg.jp/material/files/group/62/0604sss01.pdf',
  },
  // 周南市
  '352152': {
    text: '未来を歩む 生命力 満ちるまち',
    source: 'https://www.city.shunan.lg.jp/uploaded/attachment/114363.pdf',
  },
  // 山陽小野田市
  '352161': {
    text: '活力と笑顔あふれるまち',
    source: 'https://www.city.sanyo-onoda.lg.jp/uploaded/attachment/74802.pdf',
  },
  // 周防大島町
  '353051': {
    text: '人と自然が響きあう 笑顔あふれる安心のまち 周防大島',
    source: 'https://www.town.suo-oshima.lg.jp/uploaded/attachment/23290.pdf',
  },
  // 和木町
  '353213': {
    text: '緑の風薫る文化のまち和木町',
    source: 'https://www.town.waki.lg.jp/uploaded/attachment/5237.pdf',
  },
  // 上関町
  '353418': {
    text: '花咲く海の町・上関',
    source: 'https://www.town.kaminoseki.lg.jp/wp-content/uploads/2025/04/6th_masterplan_overview.pdf',
  },
  // 田布施町
  '353434': {
    text: '笑顔と元気あふれる住みよいまち田布施',
    source: 'https://www.town.tabuse.lg.jp/soshiki/3/1648.html',
  },
  // 平生町
  '353442': {
    text: '自然豊かな活気あふれる 幸せのまち 平生',
    source: 'https://www.town.hirao.lg.jp/material/files/group/12/5th-sogokeikaku.pdf',
  },
  // 阿武町
  '355020': {
    text: '夢と笑顔あふれる「豊かで住みよい文化の町」',
    source: 'https://www.town.abu.lg.jp/wp/wp-content/uploads/2020/03/777b71e20ee965faea1c43f1670c4c24.pdf',
  },
  // 徳島県
  '360007': {
    text: '未来に引き継げる徳島',
    source: 'https://www.pref.tokushima.lg.jp/file/attachment/1062874.pdf',
  },
  // 徳島市
  '362018': {
    text: 'おどる街 つながる笑顔 水都とくしま',
    source: 'https://www.city.tokushima.tokushima.jp/shisei/machi_keikaku/sougo-plan/sougoukeikaku2025.files/gaiyou.pdf',
  },
  // 鳴門市
  '362026': {
    text: 'ひとが輝き 持続可能な未来をひらく あらたな なると',
    source: 'https://www.city.naruto.lg.jp/docs/2024042504331/file_contents/2024042504331__files_00515306_kihonkoso_.pdf',
  },
  // 小松島市
  '362034': {
    text: '未来へ輝く 希望と信頼のまち こまつしま',
    source: 'https://www.city.komatsushima.lg.jp/fs/4/9/4/9/7/7/_/gaiyou.pdf',
  },
  // 阿南市
  '362042': {
    text: '輝く個性を育む 自然と調和した産業都市 阿南',
    source: 'https://www.city.anan.tokushima.jp/docs/2025031700031/',
  },
  // 阿波市
  '362069': {
    text: 'みんなでつくる 未来に誇れる やすらぎのまち 阿波市',
    source: 'https://www.city.awa.lg.jp/docs/2025041500027/file_contents/2025041500027_docs_2025041500027_file_contents_keikakugaiyou.pdf',
  },
  // 美馬市
  '362077': {
    text: '美しく駆ける 活躍都市 美馬',
    source: 'https://www.city.mima.lg.jp/fs/2/7/3/4/3/7/_/web_________03-0_____.pdf',
  },
  // 三好市
  '362085': {
    text: '自然が生き活き、人が輝く交流の郷 三好市',
    source: 'https://www.miyoshi.i-tokushima.jp/fs/5/3/3/2/5/4/_/%E4%B8%89%E5%A5%BD%E5%B8%82%E5%BE%8C%E6%9C%9F%E5%9F%BA%E6%9C%AC%E8%A8%88%E7%94%BB_%E6%9C%AC%E4%BD%93.pdf',
  },
  // 勝浦町
  '363014': {
    text: '「住み続けたい」「帰ってきたい」「暮らしてみたい」 ～誰もが幸せを感じられるまち 阿波かつうら～',
    source: 'https://www.town.katsuura.lg.jp/docs/2021032900050/file_contents/keikaku_kouki.pdf',
  },
  // 石井町
  '363413': {
    text: '太陽と緑の環境都市 いしい',
    source: 'https://www.town.ishii.lg.jp/docs/2026033000013/',
  },
  // 美波町
  '363871': {
    text: '海・山・川の恵みを活かし、知恵と心でつくるまち',
    source: 'https://www.town.minami.lg.jp/docs/3291278.html',
  },
  // 藍住町
  '364037': {
    text: '「あい」とともに、住み続けられるまち 藍住',
    source: 'https://www.town.aizumi.lg.jp/docs/2026042300012/file_contents/6th_PLAN_gaiyo_web.pdf',
  },
  // 上板町
  '364053': {
    text: 'まちに藍・ひとに愛・助け合いのまち 上板',
    source: 'https://www.townkamiita.jp/docs/2017032400027/file_contents/sougoukeikaku.pdf',
  },
  // つるぎ町
  '364681': {
    text: '終の棲家を実感できるまち',
    source: 'https://www.town.tokushima-tsurugi.lg.jp/fs/6/2/8/7/7/3/_/01%20%E2%97%8F%E7%B7%8F%E5%90%88%E6%8C%AF%E8%88%88%E8%A8%88%E7%94%BB%20%E8%A1%A8%E7%B4%99%E3%81%8B%E3%82%89%E7%AC%AC3%E7%AB%A0%E3%81%BE%E3%81%A7.pdf',
  },
  // 東みよし町
  '364894': {
    text: 'ちょうどええ ほなけん住んどる',
    source: 'https://www.town.higashimiyoshi.lg.jp/fs/4/2/2/2/2/4/_/sougoukeikaku_gaiyouban_higashimiyoshi.pdf',
  },
  // 香川県
  '370002': {
    text: '人生100年時代のフロンティア県・香川',
    source: 'https://www.pref.kagawa.lg.jp/seisaku/sogo/sogokeikakuminaoshi/keikakuminaoshi.html',
  },
  // 高松市
  '372013': {
    text: '人がつどい 未来に躍動する 世界都市・高松',
    source: 'https://www.city.takamatsu.kagawa.jp/kurashi/shinotorikumi/keikaku/sogo/kikaku/sogo/machidukuri7.html',
  },
  // 丸亀市
  '372021': {
    text: '丸亀は、 ひとをイキイキさせるまち',
    source: 'https://www.city.marugame.lg.jp/uploaded/attachment/26088.pdf',
  },
  // 坂出市
  '372030': {
    text: '市民が輝き続けるまち さかいで',
    source: 'https://www.city.sakaide.lg.jp/soshiki/seisaku/kousou01.html',
  },
  // 善通寺市
  '372048': {
    text: 'どこよりも住んでみたい・住みつづけたいまち',
    source: 'https://www.city.zentsuji.kagawa.jp/uploaded/attachment/11866.pdf',
  },
  // 観音寺市
  '372056': {
    text: 'みんなで奏でる“にぎわい やすらぎ ときめき”の都市',
    source: 'https://www.city.kanonji.kagawa.jp/uploaded/attachment/28655.pdf',
  },
  // 東かがわ市
  '372072': {
    text: 'つながる未来を ともに創るまち 東かがわ',
    source: 'https://www.higashikagawa.jp/material/files/group/4/R6gaiyou.pdf',
  },
  // 三豊市
  '372081': {
    text: 'One MITOYO',
    source: 'https://www.city.mitoyo.lg.jp/material/files/group/10/kokigaiyou.pdf',
  },
  // 土庄町
  '373222': {
    text: '人と自然が輝く みんなで創るアイランドタウン とのしょう',
    source: 'https://www.town.tonosho.kagawa.jp/material/files/group/2/gaiyoban.pdf',
  },
  // 三木町
  '373419': {
    text: '若者が帰ってくるふるさとを創る',
    source: 'https://www.town.miki.lg.jp/download/?t=LD&id=8647&fid=56261',
  },
  // 直島町
  '373648': {
    text: '「ひと」が煌めき 世界に輝く 直島町',
    source: 'https://www.town.naoshima.lg.jp/torikumi/item/0fd4e9aa61587b00d3ae40eeb59ea1ff9b4d3b60.pdf',
  },
  // 宇多津町
  '373869': {
    text: '人生120年 賑わいと思いやりが紡ぐ 日本で一番住みやすい町 うたづ',
    source: 'https://www.town.utazu.lg.jp/uploaded/attachment/1900.pdf',
  },
  // 琴平町
  '374032': {
    text: '小さくても、みんなが笑顔で、幸せを感じるまち',
    source: 'https://www.town.kotohira.kagawa.jp/soshiki/2/6292.html',
  },
  // 多度津町
  '374041': {
    text: '主役は町民 歴史を未来へつなぐまち たどつ',
    source: 'https://www.town.tadotsu.kagawa.jp/material/files/group/4/sougoukeikaku_kihonkousou.pdf',
  },
  // まんのう町
  '374067': {
    text: '元気まんまん まんのう町～水と緑がひとを育み支えあうまち',
    source: 'https://www.town.manno.lg.jp/uploaded/attachment/2739.pdf',
  },
  // 愛媛県
  '380008': {
    text: '愛のくに 愛顔（えがお）あふれる愛媛県',
    source: 'https://www.pref.ehime.jp/page/4588.html',
  },
  // 松山市
  '382019': {
    text: '人、まち、仕事がつながる交流拠点『SETOUCHIまつやま』',
    source: 'https://www.city.matsuyama.ehime.jp/shisei/keikaku/sogokeikaku/7jisogokeikaku.html',
  },
  // 今治市
  '382027': {
    text: '瀬戸内しまなみから世界へ 夢が行き交うまち IMABARI',
    source: 'https://www.city.imabari.ehime.jp/simingamannaka/sougoukeikaku3/03.pdf?1',
  },
  // 宇和島市
  '382035': {
    text: '継承・共育・発信のまち',
    source: 'https://www.city.uwajima.ehime.jp/info/sougoukeikaku-koukikihonkeikakusakutei.html',
  },
  // 八幡浜市
  '382043': {
    text: 'あおの輝き オレンジの温もり みどりの息吹 世界と響きあう交流拠点都市',
    source: 'https://www.city.yawatahama.ehime.jp/doc/2026032700037/file_contents/file_2026327517350_3.pdf',
  },
  // 新居浜市
  '382051': {
    text: '人が輝く あかがねのまち にいはま',
    source: 'https://www.city.niihama.lg.jp/uploaded/attachment/78449.pdf',
  },
  // 西条市
  '382060': {
    text: '人がつどい、まちが輝く、快適環境実感都市',
    source: 'https://www.city.saijo.ehime.jp/uploaded/attachment/76086.pdf',
  },
  // 大洲市
  '382078': {
    text: 'きらめくおおず',
    source: 'https://www.city.ozu.ehime.jp/soshiki/kikakujoho/1148.html',
  },
  // 四国中央市
  '382132': {
    text: '四国のまんなか 人がまんなか',
    source: 'https://www.city.shikokuchuo.ehime.jp/soshiki/3/34231.html',
  },
  // 上島町
  '383562': {
    text: '島を活かし 人が輝く 夢の島',
    source: 'https://www.town.kamijima.lg.jp/uploaded/life/18858_110419_misc.pdf',
  },
  // 松前町
  '384011': {
    text: '生きる喜び あふれる まち まさき',
    source: 'https://www.town.masaki.ehime.jp/uploaded/life/31315_98833_misc.pdf',
  },
  // 砥部町
  '384020': {
    text: '文化とこころがふれあうまち',
    source: 'https://www.town.tobe.ehime.jp/gyoseijoho/keikaku_hoshin_shingikainado/8/2115.html',
  },
  // 内子町
  '384224': {
    text: '町並み、村並み、山並みが美しい持続的に発展するまち',
    source: 'https://www.town.uchiko.ehime.jp/uploaded/attachment/109145.pdf',
  },
  // 伊方町
  '384429': {
    text: '長く 永く 幸せ感じる 伊方町',
    source: 'https://www.town.ikata.ehime.jp/uploaded/attachment/16930.pdf',
  },
  // 愛南町
  '385069': {
    text: 'ともに彩（いろどり）を育（はぐく）むまち いろこい あいなん',
    source: 'https://www.town.ainan.ehime.jp/kurashi/chosei/seisaku/sogokeikaku/machidukuri2024.html',
  },
  // 高知市
  '392014': {
    text: '森・里・海と人の環 自由と創造の共生都市 高知',
    source: 'https://www.city.kochi.kochi.jp/uploaded/life/149246_519147_misc.pdf',
  },
  // 南国市
  '392049': {
    text: '「みどり」輝き 「まち」も輝く 笑顔あふれる 南国市',
    source: 'https://www.city.nankoku.lg.jp/download/?t=LD&id=9956&fid=106831',
  },
  // 須崎市
  '392065': {
    text: '未来へひろがる“元気創造”と“協働”のまち',
    source: 'https://www.city.susaki.lg.jp/download/?t=LD&id=5518&fid=36245',
  },
  // 宿毛市
  '392081': {
    text: '人が輝き 自然と生きる 共感・共創のまち“宿毛”',
    source: 'https://www.city.sukumo.kochi.jp/fs/7/4/4/4/3/_/sukumoshi_shinkoukeikakuR6.pdf',
  },
  // 土佐清水市
  '392090': {
    text: 'みんなでつくる愛と自然に満ちた 活力あるまち',
    source: 'https://www.city.tosashimizu.kochi.jp/fs/6/1/7/4/1/7/_/Shinko_Keikaku_Gaiyo.pdf',
  },
  // 四万十市
  '392103': {
    text: '伝統が息づき、人がつながり、未来をともに築くまち四万十市',
    source: 'https://www.city.shimanto.lg.jp/uploaded/attachment/14631.pdf',
  },
  // 香南市
  '392111': {
    text: '水・緑・風が輝く 豊かな暮らしと産業で 飛躍するまち“香南市”',
    source: 'https://www.city.kochi-konan.lg.jp/material/files/group/4/kouki_kihonkeikaku.pdf',
  },
  // 香美市
  '392120': {
    text: '美しく豊かな自然に育まれ、共に支えあう 進化する自然共生文化都市・香美市',
    source: 'https://www.city.kami.lg.jp/uploaded/attachment/14263.pdf',
  },
  // 奈半利町
  '393029': {
    text: '人が生き生き輝き、美しく魅力あふれるまち なはり',
    source: 'https://www.town.nahari.kochi.jp/download/?t=LD&id=1150&fid=388',
  },
  // 安田町
  '393045': {
    text: '共に生き 未来につなぐ 安田町',
    source: 'https://www.town.yasuda.kochi.jp/download/?t=LD&id=1868&fid=5074',
  },
  // 馬路村
  '393061': {
    text: 'ひと笑い、やま潤い、むら賑わう、未来につなぐ馬路村',
    source: 'https://vill.umaji.lg.jp/wp/wp-content/uploads/2022/04/016a8f9940d1de574b2c52ff01be7ccf.pdf',
  },
  // 日高村
  '394106': {
    text: '安全・安心で笑顔と希望あふれる村',
    source: 'https://www.vill.hidaka.kochi.jp/kurashi/files/20219913528.pdf',
  },
  // 大月町
  '394246': {
    text: '住みたい 住める 住んでよかった 未来へ繋ぐまちづくり',
    source: 'https://www.town.otsuki.kochi.jp/download/?t=LD&id=1783&fid=19984',
  },
  // 福岡県
  '400009': {
    text: '誰もが安心して、たくさんの笑顔で暮らせる福岡県',
    source: 'https://www.pref.fukuoka.lg.jp/uploaded/life/632711_61262695_misc.pdf',
  },
  // 北九州市
  '401005': {
    text: 'つながりと情熱と技術で、「一歩先の価値観」を体現する グローバル挑戦都市・北九州市',
    source: 'https://www.city.kitakyushu.lg.jp/files/001079823.pdf',
  },
  // 大牟田市
  '402028': {
    text: '元気あふれる 安心快適な未来価値創造都市 おおむた',
    source: 'https://www.city.omuta.lg.jp/kiji00319266/index.html',
  },
  // 久留米市
  '402036': {
    text: '優しさ 豊かさ 輝き あふれるまち',
    source: 'https://www.city.kurume.fukuoka.jp/1100keikaku/2045keikaku/3010sougou/files/02_miradezakihonkousou.pdf',
  },
  // 飯塚市
  '402052': {
    text: '人が輝き まちが飛躍する 住みたいまち 住み続けたいまち',
    source: 'https://www.city.iizuka.lg.jp/uploaded/attachment/13077.pdf',
  },
  // 田川市
  '402061': {
    text: 'あなたのちょうどいいがきっと見つかる',
    source: 'https://www.joho.tagawa.fukuoka.jp/kiji00312072/index.html',
  },
  // 柳川市
  '402079': {
    text: '人と水が紡ぐ活力あふれる共創のまち柳川',
    source: 'https://www.city.yanagawa.fukuoka.jp/shisei/uneikeikaku/sogokeikaku/12481.html',
  },
  // 八女市
  '402109': {
    text: 'ふるさとの恵みと誇りを未来につなぐ 安心と成長のまち 八女',
    source: 'https://www.city.yame.fukuoka.jp/material/files/group/33/5sougoukeikaku.pdf',
  },
  // 筑後市
  '402117': {
    text: '恵みの多い自然、ゆかしい歴史と文化のうえに人の和を織りなして、住みよいふるさと、活気に満ちたまち ちくご',
    source: 'https://www.city.chikugo.lg.jp/var/rev0/0059/3812/kousou.pdf',
  },
  // 豊前市
  '402141': {
    text: '自然と歴史文化の息づく“旬”感都市 豊前',
    source: 'https://www.city.buzen.lg.jp/sisei/sisaku/documents/buzen-honpen_kihonkoso.pdf',
  },
  // 中間市
  '402150': {
    text: '夢がかなうまち なかま',
    source: 'https://www.city.nakama.lg.jp/uploaded/attachment/11445.pdf',
  },
  // 小郡市
  '402168': {
    text: '人がつながり 市民が躍動する温かみのある都市 おごおり',
    source: 'https://www.city.ogori.fukuoka.jp/download_file/view/32756/3685',
  },
  // 筑紫野市
  '402176': {
    text: 'ひとが輝き 自然が息づく 住み続けたい幸福実感都市',
    source: 'https://www.city.chikushino.fukuoka.jp/soshiki/3/33418.html',
  },
  // 春日市
  '402184': {
    text: '住みよさ実感都市 かすが',
    source: 'https://www.city.kasuga.fukuoka.jp/_res/projects/default_project/_page_/001/008/161/6jikasugasisougoukeikakugaiyou.pdf',
  },
  // 大野城市
  '402192': {
    text: '未来をひらく にぎわいとやすらぎの コミュニティ都市',
    source: 'https://www.city.onojo.fukuoka.jp/kiji00373/index.html',
  },
  // 福津市
  '402249': {
    text: '人も自然も未来につながるまち、福津。',
    source: 'https://www.city.fukutsu.lg.jp/material/files/group/41/kihonkoso_202506.pdf',
  },
  // うきは市
  '402257': {
    text: 'こどもをまんなかに すべての市民が幸せになれるまち',
    source: 'https://www.city.ukiha.fukuoka.jp/kiji0038666/3_8666_13920_up_gv3ho5hm.pdf',
  },
  // 宮若市
  '402265': {
    text: 'ひと・みどり・産業が輝く ふるさと宮若',
    source: 'https://www.city.miyawaka.lg.jp/kiji003446871/3_446871_2697_up_0nrp2auk.pdf',
  },
  // 嘉麻市
  '402273': {
    text: 'いきたい 住みたい つながりたい 遠賀川源流のまち',
    source: 'https://www.city.kama.lg.jp/uploaded/attachment/15891.pdf',
  },
  // 朝倉市
  '402281': {
    text: '人、自然、歴史が織りなす 水ひかる 朝倉',
    source: 'https://www.city.asakura.lg.jp/soshiki/6/2986.html',
  },
  // みやま市
  '402290': {
    text: '人と自然が共に育み、つながり、成長し続けるまち',
    source: 'https://www.city.miyama.lg.jp/s006/shisei/220/020/1770533.pdf',
  },
  // 糸島市
  '402303': {
    text: '人とまちの魅力が輝く 豊かさ実感都市 いとしま',
    source: 'https://www.city.itoshima.lg.jp/s005/010/010/010/060/020/20201216170401.html',
  },
  // 那珂川市
  '402311': {
    text: '笑顔で暮らせる自然都市なかがわ',
    source: 'https://www.city.nakagawa.lg.jp/soshiki/47/sougoukeikaku2021.html',
  },
  // 宇美町
  '403415': {
    text: '「このまちが、いい。」 わたしたちの誇り 宇美',
    source: 'https://www.town.umi.lg.jp/soshiki/61/38701.html',
  },
  // 志免町
  '403431': {
    text: 'みんなで未来をつくるまち',
    source: 'https://www.town.shime.lg.jp/soshiki/2/6sougoukeikaku-2sougousenryaku-sakutei.html',
  },
  // 新宮町
  '403458': {
    text: '人がいきいき 未来をつむぐ 挑戦するまち しんぐう',
    source: 'https://www.town.shingu.fukuoka.jp/material/files/group/12/20210331-211327.pdf',
  },
  // 久山町
  '403482': {
    text: 'だれもが生き生きと暮らせる「健康田園都市」の実現',
    source: 'https://www.town.hisayama.fukuoka.jp/gyosei/gyosei_joho/seisaku_keikaku/sogokeikaku/2788.html',
  },
  // 芦屋町
  '403814': {
    text: '人を育み 未来につなぐ あしやまち',
    source: 'https://www.town.ashiya.lg.jp/site/sogoshinkokeikaku/18000.html',
  },
  // 水巻町
  '403822': {
    text: '水巻いいね',
    source: 'https://www.town.mizumaki.lg.jp/s036/gyosei/080/120/20200104121000.html',
  },
  // 岡垣町
  '403831': {
    text: '自然と共生する しあわせ実感都市 岡垣',
    source: 'https://www.town.okagaki.lg.jp/s001/20210408184402.html',
  },
  // 遠賀町
  '403849': {
    text: 'まちがつながり ひとがつながる 未来へつなぐ遠賀町',
    source: 'https://www.town.onga.lg.jp/uploaded/attachment/4874.pdf',
  },
  // 小竹町
  '404012': {
    text: '住みたい！育てたい！訪ねたい！あなたが主役 幸せ実感 小竹町',
    source: 'https://town.kotake.lg.jp/common/UploadFileOutput.ashx?c_id=3&id=1170&sub_id=6&flid=6016',
  },
  // 鞍手町
  '404021': {
    text: 'ひとが輝き 笑顔あふれる ふれあいのまち くらて',
    source: 'https://www.town.kurate.lg.jp/syoukai/keikaku/sougoukeikaku/documents/sougoukeikaku6-kihonnkousou.pdf',
  },
  // 桂川町
  '404217': {
    text: '自然と文化が息づく笑顔あふれるまち“けいせん”',
    source: 'https://www.town.keisen.fukuoka.jp/pdf/sougou/6sougou_10.pdf',
  },
  // 筑前町
  '404471': {
    text: '緑あふれる 豊かで便利な とかいなか',
    source: 'https://www.town.chikuzen.fukuoka.jp/S021/020/010/010/20251020120317.html',
  },
  // 大刀洗町
  '405035': {
    text: 'わたしたちが創る 誇れるよかまち たちあらい',
    source: 'https://www.town.tachiarai.fukuoka.jp/kiji0036/3_6_2_大刀洗町総合計画＿本編.pdf',
  },
  // 広川町
  '405442': {
    text: '世代を超えて住み心地の良い、温もりと笑顔あふれるまち',
    source: 'https://www.town.hirokawa.fukuoka.jp/chosei/keikaku/2/5525.html',
  },
  // 香春町
  '406015': {
    text: '愛しかないっちゃ♥かわらまち',
    source: 'https://www.town.kawara.fukuoka.jp/s008/info/020/123/5sougoukeikaku.pdf',
  },
  // 添田町
  '406023': {
    text: 'いつまでも健康で住み続けられる・住みたくなるまち',
    source: 'https://www.town.soeda.fukuoka.jp/uploaded/attachment/1655.pdf',
  },
  // 糸田町
  '406040': {
    text: 'みんな明るく 元気 大好き 糸田町',
    source: 'https://www.town.itoda.lg.jp/files/SpcDocumentDetail_6a4ca482-9cbc-45f0-b6a6-4a91997ea3a5_file.pdf',
  },
  // 川崎町
  '406058': {
    text: 'ReBorn ! 川崎町 人を育み、町を創る。10年先も住み続けたい町へ',
    source: 'https://www.town-kawasaki.com/wp-content/uploads/2020/04/0_0318_基本構想_0-1.pdf',
  },
  // 苅田町
  '406210': {
    text: '「一人ひとり」が輝く、「もっと」快適 住みやすいまち 苅田',
    source: 'https://www.town.kanda.lg.jp/page/2199.html',
  },
  // みやこ町
  '406252': {
    text: '輝くふるさと みやこ町',
    source: 'https://www.town.miyako.lg.jp/koushitsu/seisaku/sougou/sougoukeikaku.html',
  },
  // 上毛町
  '406465': {
    text: 'みんなが輝くまち上毛',
    source: 'https://www.town.koge.lg.jp/material/files/group/27/sougou.pdf',
  },
  // 築上町
  '406473': {
    text: '“自然と歴史・文化を育む”心と体の健康を求めた「豊かな生活の場」づくり',
    source: 'https://www.town.chikujo.fukuoka.jp/s056/020/040/050/200/010/020/020/sougoukeikaku2.html',
  },
  // 佐賀市
  '412015': {
    text: '佐賀らしさでみんなが上を向くまち',
    source: 'https://www.city.saga.lg.jp/material/files/group/12/miraikyosoplan20252028.pdf',
  },
  // 唐津市
  '412023': {
    text: '魅力ある自然・歴史・文化にあふれた 住みたい 訪れたい 選ばれるまち 唐津',
    source: 'https://www.city.karatsu.lg.jp/page/32507.html',
  },
  // 鳥栖市
  '412031': {
    text: '住みたいまち、活躍できるまち、選ばれるまち 鳥栖',
    source: 'https://www.city.tosu.lg.jp/soshiki/6/2885.html',
  },
  // 多久市
  '412040': {
    text: '緑園に輝くまち 多久',
    source: 'https://www.city.taku.lg.jp/soshiki/14/35953.html',
  },
  // 伊万里市
  '412058': {
    text: '人がいきいきと活躍する幸せ実感のまち 伊万里',
    source: 'https://www.city.imari.saga.jp/item/20899.htm',
  },
  // 鹿島市
  '412074': {
    text: 'つながる笑顔のまち かしま',
    source: 'https://www.city.saga-kashima.lg.jp/site_files/file/seisakuchousei/%E3%80%90%E7%B6%99%E3%80%91%E7%AC%AC%E5%85%AB%E6%AC%A1%E9%B9%BF%E5%B3%B6%E5%B8%82%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB%E6%9B%B8%EF%BC%88R8%EF%BD%9E12%E5%B9%B4%E5%BA%A6%EF%BC%89.pdf',
  },
  // 小城市
  '412082': {
    text: '一人ひとりがつながり支えあい 笑顔で活躍できる 快適なまち 小城市',
    source: 'https://www.city.ogi.lg.jp/site_files/file/2026/202603/p1jktvisdfutv15mrtos127g1qk24.pdf',
  },
  // 神埼市
  '412104': {
    text: '幸せつなごう かんざき',
    source: 'https://www.city.kanzaki.saga.jp/site_files/file/2023/202303/p1gs6j5s6b18ea10coa0n100s1rjj5.pdf',
  },
  // 基山町
  '413411': {
    text: 'シン・アイが大きい基山町',
    source: 'https://www.town.kiyama.lg.jp/kiji0036390/index.html',
  },
  // みやき町
  '413461': {
    text: '未来に躍動する「共感」「協働」のまち',
    source: 'https://www.town.miyaki.lg.jp/chosei/torikumi/_2905/_4476.html',
  },
  // 白石町
  '414255': {
    text: '人と大地がうるおい輝く豊穣のまち',
    source: 'https://www.town.shiroishi.lg.jp/chousei_machi/seisaku/_8434.html',
  },
  // 太良町
  '414417': {
    text: '未来を引きよせるチカラ 太良町',
    source: 'https://www.town.tara.lg.jp/var/rev0/0012/3625/20204159361.pdf',
  },
  // 長崎県
  '420000': {
    text: 'ながさきの誇りと希望を力に、みんなで夢あふれる未来をひらく',
    source: 'https://www.pref.nagasaki.jp/bunrui/kenseijoho/seisaku-keikaku/sogokeikaku/sougou_plan_2030/',
  },
  // 佐世保市
  '422029': {
    text: '海風 薫り 世界へはばたく “キラっ都”SASEBO',
    source: 'https://www.city.sasebo.lg.jp/documents/26892/01_hyoushi-kousou_1.pdf',
  },
  // 島原市
  '422037': {
    text: '未来へつなぐ島原らしさ 暮らし続けたい、訪れてみたい、魅力あふれるまち',
    source: 'https://www.city.shimabara.lg.jp/common/UploadFileOutput.ashx?c_id=3&id=6746&sub_id=1&flid=34291',
  },
  // 諫早市
  '422045': {
    text: '来てよし、住んでよし、育ててよし！ 輝く諫早 夢かなうまち',
    source: 'https://www.city.isahaya.nagasaki.jp/uploaded/attachment/26403.pdf',
  },
  // 平戸市
  '422070': {
    text: '夢あふれる未来のまち 平戸',
    source: 'https://www.city.hirado.nagasaki.jp/kurashi/gyosei/sogo/files/03.pdf',
  },
  // 対馬市
  '422096': {
    text: '心豊かに暮らし続けられる共創・自立・循環の宝島 対馬',
    source: 'https://www.city.tsushima.nagasaki.jp/material/files/group/6/3gaiyouban.pdf',
  },
  // 西海市
  '422126': {
    text: '活躍のまちさいかい',
    source: 'https://www.city.saikai.nagasaki.jp/shisei/shinoseisaku/6/3/8367.html',
  },
  // 雲仙市
  '422134': {
    text: '”つながり”で創る 賑わいと豊かさを実感できるまち',
    source: 'https://www.city.unzen.nagasaki.jp/kiji0035042/index.html',
  },
  // 南島原市
  '422142': {
    text: 'これからも 住み続けたい 住んでみたいまち みなみしまばら',
    source: 'https://www.city.minamishimabara.lg.jp/kiji0031721/index.html',
  },
  // 長与町
  '423076': {
    text: '人・緑・未来 つなぎ はぐくむ ながよ',
    source: 'https://webtown.nagayo.jp/kiji0035879/index.html',
  },
  // 時津町
  '423084': {
    text: '生活都市とぎつ',
    source: 'https://www.town.togitsu.nagasaki.jp/gyoseijoho/hoshin_keikaku_jigyo/sogokeikaku/5768.html',
  },
  // 川棚町
  '423220': {
    text: '自然を愛し くらし輝くまち',
    source: 'https://www.kawatana.jp/item/d4076cf9b4cee7fea834a3e62d3062b4.pdf',
  },
  // 小値賀町
  '423831': {
    text: '一人ひとりが輝き 小さな幸せに満ちたまち',
    source: 'https://www.town.ojika.lg.jp/gyosei_joho/6/453.html',
  },
  // 佐々町
  '423912': {
    text: '暮らしいちばん！住むなら さざ',
    source: 'https://www.sazacho-nagasaki.jp/kiji0033534/index.html',
  },
  // 熊本県
  '430005': {
    text: '県民みんなが安心して笑顔になり、持続的で活力あふれる熊本の未来を共に創る',
    source: 'https://www.pref.kumamoto.jp/uploaded/attachment/275911.pdf',
  },
  // 熊本市
  '431001': {
    text: '上質な生活都市',
    source: 'https://www.city.kumamoto.jp/kiji00361129/3_61129_424227_up_0nqkgco2.pdf',
  },
  // 八代市
  '432024': {
    text: '子どもたちが誇れるまち 八代',
    source: 'https://www.city.yatsushiro.lg.jp/kiji00325994/3_25994_152991_up_7doy7jxo.pdf',
  },
  // 人吉市
  '432032': {
    text: '未来協創都市ひとよし',
    source: 'https://www.city.hitoyoshi.lg.jp/resource.php?e=cb32995fd3d2ce60ec6788d9c7e6e95b6f219af12a2ed3156ef4a773cb4f0fcb93ff3d4ea41f7103346d966c2faabff3',
  },
  // 荒尾市
  '432041': {
    text: 'しあわせを共に創り、笑顔あふれるあらお',
    source: 'https://www.city.arao.lg.jp/fs/2/5/9/5/6/7/_/_7_____________.pdf',
  },
  // 水俣市
  '432059': {
    text: 'みんなが幸せを感じ 笑顔あふれる元気なまち 水俣',
    source: 'https://www.city.minamata.lg.jp/kiji003113/index.html',
  },
  // 山鹿市
  '432083': {
    text: 'ずっと 住みたい 健幸都市 やまが',
    source: 'https://www.city.yamaga.kumamoto.jp/kiji0032866/index.html',
  },
  // 菊池市
  '432105': {
    text: '人と自然が調和し 希望と活力に満ちた『癒しの里』きくち',
    source: 'https://www.city.kikuchi.lg.jp/article/view/1067/2322.html',
  },
  // 宇土市
  '432113': {
    text: '復興から発展へ 未来へ“輝くふるさと”宇土',
    source: 'https://www.city.uto.lg.jp/d?q=0af8778d2e844db7527b338aa3649b39.pdf',
  },
  // 宇城市
  '432130': {
    text: 'ここがいい。 ともに過ごすまち 宇城',
    source: 'https://www.city.uki.kumamoto.jp/resource.php?e=92978c2b629e0566751ed415ddb4484021d04de737eb9793d2a7f995dac4c1f0d885e3c499a23ee4ea18ec55d2bcff5f',
  },
  // 阿蘇市
  '432148': {
    text: '大自然とともに ワクワクする未来へ',
    source: 'https://www.city.aso.kumamoto.jp/municipal/various_plan/comprehensive_plan/',
  },
  // 天草市
  '432156': {
    text: 'ともにつながり 幸せ実感 宝の島“天草”',
    source: 'https://www.city.amakusa.kumamoto.jp/kiji00313974/index.html',
  },
  // 合志市
  '432164': {
    text: '人と地域が輝く未来へ',
    source: 'https://www.city.koshi.lg.jp/kiji00323305/index.html',
  },
  // 美里町
  '433489': {
    text: '小さくてもキラリと光る私たちのまち',
    source: 'https://www.town.kumamoto-misato.lg.jp/material/files/group/12/sinnkoukeikakuitibukaisei.pdf',
  },
  // 玉東町
  '433641': {
    text: '一人ひとりが手をとりあい、未来に向かって挑戦するまち',
    source: 'https://www.town.gyokuto.kumamoto.jp/kiji003398/index.html',
  },
  // 南関町
  '433675': {
    text: '新しい空間と暮らしの中で、あらゆる挑戦を支える町なんかん',
    source: 'https://www.town.nankan.lg.jp/fs/1/7/2/2/_/___________7__________.pdf',
  },
  // 長洲町
  '433683': {
    text: '魅力と活力あふれ 夢ふくらむ 未来輝くまち',
    source: 'https://www.town.nagasu.lg.jp/soshiki/machizukuri/keikaku/177328965416435/',
  },
  // 和水町
  '433691': {
    text: '温もりをつなぎ 誇りを育む わたしたちの和水町',
    source: 'https://www.town.nagomi.lg.jp/chousei/keikaku/machikeikaku/1783944751298623/',
  },
  // 大津町
  '434035': {
    text: '今も未来もみんなが幸せであり続けられるまち 大津',
    source: 'https://www.town.ozu.kumamoto.jp/uploaded/attachment/18351.pdf',
  },
  // 菊陽町
  '434043': {
    text: 'ともに 輝き 成長しつづけるまち 菊陽',
    source: 'https://www.town.kikuyo.lg.jp/kiji0034816/index.html',
  },
  // 西原村
  '434329': {
    text: 'ひとが育み ひとと輝く 誇りあるふるさと 西原村',
    source: 'https://www.vill.nishihara.kumamoto.jp/kiji0031403/index.html',
  },
  // 南阿蘇村
  '434337': {
    text: 'ともに育み、ともに歩む、わたしたちのむら 南阿蘇',
    source: 'https://www.vill.minamiaso.lg.jp/kiji003661/3_661_11503_up_a5zyi3ig.pdf',
  },
  // 御船町
  '434418': {
    text: 'みんながわくわくする御船町',
    source: 'https://www.town.mifune.kumamoto.jp/page8090.html',
  },
  // 益城町
  '434434': {
    text: '住みたいまち・住み続けたいまち・次世代に継承したいまち',
    source: 'https://www.town.mashiki.lg.jp/kiji0035910/index.html',
  },
  // 山都町
  '434477': {
    text: '「山の都」の魅力を生かし、みんなで築く誰もが住みたいまち',
    source: 'https://www.town.kumamoto-yamato.lg.jp/kiji00310570/index.html',
  },
  // 芦北町
  '434825': {
    text: '個性輝き活力と魅力にあふれた、安全・安心を実感できる町',
    source: 'https://www.town.ashikita.lg.jp/resource.php?e=5bb28d2ae3028064c0fd881f990db2f28859f8f6cdbdbce4eb72a8435b4687033045ea989b37843c3f8f6c30262e4fe6',
  },
  // 津奈木町
  '434841': {
    text: '人と自然、アートがつなぐ 希望をもって住めるまち',
    source: 'https://www.town.tsunagi.lg.jp/common/UploadFileOutput.ashx?c_id=3&id=4033&sub_id=1&flid=12634',
  },
  // 錦町
  '435015': {
    text: '人の和を大切にし 老いても安心して暮らせる町 若人に夢と希望が持てる町',
    source: 'https://www.town.kumamoto-nishiki.lg.jp/kiji003292/3_292_5_kihonkousou.pdf',
  },
  // 湯前町
  '435066': {
    text: 'マイホームタウン ゆのまえ',
    source: 'https://www.town.yunomae.lg.jp/kiji0033317/3_3317_up_nrzeotd7.pdf',
  },
  // 水上村
  '435074': {
    text: '人と自然が輝く夢のあるみずかみ',
    source: 'https://www.vill.mizukami.lg.jp/kiji0031043/3_1043_up_hirut4or.pdf',
  },
  // 五木村
  '435112': {
    text: 'ひかり輝く五木村',
    source: 'https://www.vill.itsuki.lg.jp/kiji0031784/3_1784_2338_up_lniu1s48.pdf',
  },
  // 山江村
  '435121': {
    text: 'ひと×資源×暮らし つながる 活力・魅力生まれる山江村',
    source: 'https://www.vill.yamae.lg.jp/kiji0031121/3_1121_3607_up_iz0vmkjs.pdf',
  },
  // 球磨村
  '435139': {
    text: '豊かな自然とともに生き みんながつながる球磨村',
    source: 'https://www.kumamura.com/kiji0031366/index.html',
  },
  // あさぎり町
  '435147': {
    text: '人が集い 支えあう 未来へつなぐ「あさぎり町」',
    source: 'https://www.town.asagiri.lg.jp/kiji0034016/3_4016_4_dl_q_512317_filelib_034fba2d54cac5314a450047ca1fdc3c.pdf',
  },
  // 苓北町
  '435317': {
    text: '豊かな自然と暮らしを 未来へとつなげるまち 苓北',
    source: 'https://reihoku-kumamoto.jp/kiji0031612/index.html',
  },
  // 大分市
  '442011': {
    text: '誰もが”幸せ“を実感できるまちOITA',
    source: 'https://www.city.oita.oita.jp/o010/sogokeikaku2025.html',
  },
  // 日田市
  '442046': {
    text: 'ともにつくる一人ひとりが主役の ひた',
    source: 'https://www.city.hita.oita.jp/soshiki/1/2720.html',
  },
  // 佐伯市
  '442054': {
    text: '地域が輝く「佐伯がいちばん」の人・まちづくり',
    source: 'https://www.city.saiki.oita.jp/kiji00310223/3_10223_40589_up_4iyeuo71.pdf',
  },
  // 臼杵市
  '442062': {
    text: '次世代へ誇れるまち臼杵',
    source: 'https://www.city.usuki.oita.jp/docs/2024042500043/',
  },
  // 津久見市
  '442071': {
    text: '「地域の力」がつどい未来を創るまち、津久見',
    source: 'https://www.city.tsukumi.oita.jp/soshiki/10/32192.html',
  },
  // 竹田市
  '442089': {
    text: 'ひとが輝き 未来へつなぐ いのち溢れるまち『竹田』',
    source: 'https://www.city.taketa.oita.jp/material/files/group/3/sogokeikaku_2nd_2.pdf',
  },
  // 豊後大野市
  '442127': {
    text: '七色に輝け 豊後大野！',
    source: 'https://www.bungo-ohno.jp/docs/2026032500040/file_contents/file_2026417585956_1.pdf',
  },
  // 国東市
  '442143': {
    text: '未来へ、そして宇宙につながる悠久の里 国東',
    source: 'https://www.city.kunisaki.oita.jp/soshiki/kikaku/sougoukeikaku3.html',
  },
  // 姫島村
  '443221': {
    text: '海を活かした健康で活力あふれる村づくり',
    source: 'https://www.himeshima.jp/pdf/sougou_keikaku_r4-r13.pdf',
  },
  // 日出町
  '443417': {
    text: '住民幸福度 100％ 日本一誇れるまち ひじ',
    source: 'https://www.town.hiji.lg.jp/material/files/group/4/6th-hijitown-sougoukeikaku-1.pdf',
  },
  // 九重町
  '444618': {
    text: '未来へつなごう！豊かなこころと癒しの自然',
    source: 'https://www.town.kokonoe.oita.jp/docs/2022042000020/',
  },
  // 玖珠町
  '444626': {
    text: '次代を担う子どもとともに 未来をつくるまち',
    source: 'https://www.town.kusu.oita.jp/choseijoho/machinoseisaku/9/3267.html',
  },
  // 宮崎県
  '450006': {
    text: '安心と希望の未来への展望',
    source: 'https://www.pref.miyazaki.lg.jp/documents/110563/73959_20260623173040-1.pdf',
  },
  // 宮崎市
  '452017': {
    text: '挑戦し、成長する 開かれたまち',
    source: 'https://www.city.miyazaki.miyazaki.jp/fs/8/3/8/9/1/5/_/838915.pdf',
  },
  // 都城市
  '452025': {
    text: '人がつながり 笑顔あふれる 南九州のリーディングシティ',
    source: 'https://www.city.miyakonojo.miyazaki.jp/uploaded/attachment/45410.pdf',
  },
  // 延岡市
  '452033': {
    text: '多様性と挑戦が希望を生むハブシティ',
    source: 'https://www.city.nobeoka.miyazaki.jp/soshiki/1/13200.html',
  },
  // 日南市
  '452041': {
    text: '住みたい 住み続けたいまち',
    source: 'https://www.city.nichinan.lg.jp/material/files/group/3/jyuten2025.pdf',
  },
  // 串間市
  '452076': {
    text: '豊かな自然と共存し、みんなで創り育てる多様性と持続性のまち くしま',
    source: 'https://www.city.kushima.lg.jp/main/info/upload/%E7%AC%AC%E5%85%AD%E6%AC%A1%E4%B8%B2%E9%96%93%E5%B8%82%E9%95%B7%E6%9C%9F%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB%EF%BC%88%E5%9F%BA%E6%9C%AC%E6%A7%8B%E6%83%B3%EF%BC%89.pdf',
  },
  // 西都市
  '452084': {
    text: '抜群に住みやすいまち・西都',
    source: 'https://www.city.saito.lg.jp/uploads/docs/shiseigyosei2/1793850554_389e3cc98a1c4599d0452e89cfb58dfd_2.pdf',
  },
  // えびの市
  '452092': {
    text: 'えがおが交わり続けるまち',
    source: 'https://www.city.ebino.lg.jp/gyosei_shisei/keikaku_seisaku/3901.html',
  },
  // 三股町
  '453412': {
    text: '自立と協働が織りなす 元気あふれるまち三股',
    source: 'https://www.town.mimata.lg.jp/upload/file/11kikaku/02kikaku/15_%E4%B8%89%E8%82%A1%E7%94%BA%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB%EF%BC%88%E5%BE%8C%E6%9C%9F%E8%A8%88%E7%94%BB%EF%BC%89/04_%E4%B8%89%E8%82%A1%E7%94%BA%E7%B7%8F%E5%90%88%E8%A8%88%E7%94%BB_%E5%9F%BA%E6%9C%AC%E6%A7%8B%E6%83%B3.pdf',
  },
  // 高原町
  '453617': {
    text: 'みんなでつなぐ「神武の里」 水とみどりと神話が輝く 健幸なまち',
    source: 'https://www.town.takaharu.lg.jp/uploaded/life/304290_13458981_misc.pdf',
  },
  // 国富町
  '453820': {
    text: '人がつながる 未来につながる 元気なまち 国富',
    source: 'http://www.town.kunitomi.miyazaki.jp/main/administration/47a030f4939fa936342a07dd196b5dfe.pdf',
  },
  // 新富町
  '454028': {
    text: '子や孫たちが帰って来たくなるまち',
    source: 'https://www.town.shintomi.lg.jp/material/files/group/3/kousou_shintomi.pdf',
  },
  // 西米良村
  '454036': {
    text: 'カリコボーズと1,000人が笑う村',
    source: 'https://www.vill.nishimera.lg.jp/village/wp-content/uploads/2021/04/b4174a46b1145a00e85817f707de6cf8.pdf',
  },
  // 木城町
  '454044': {
    text: 'Inclusive Town Kijo',
    source: 'https://www.town.kijo.lg.jp/material/files/group/4/gaiyouban_kijo_6.pdf',
  },
  // 川南町
  '454052': {
    text: '豊かさを活かし 共に未来を拓くまち かわみなみ',
    source: 'https://www.town.kawaminami.miyazaki.jp/soshiki/2/1198.html',
  },
  // 門川町
  '454214': {
    text: '日本一住みよい門川町',
    source: 'https://www.town.kadogawa.lg.jp/live/data/82ac0e8109091b0bef930f963224334c.pdf',
  },
  // 諸塚村
  '454290': {
    text: '森林業×未来×人×心 絆の価値創生の森・諸塚',
    source: 'https://www.vill.morotsuka.miyazaki.jp/material/files/group/3/1114.pdf',
  },
  // 椎葉村
  '454303': {
    text: 'かえりたい『郷』で生きていく。',
    source: 'https://www.vill.shiiba.miyazaki.jp/promote/post_7.php',
  },
  // 美郷町
  '454311': {
    text: '豊かで活力のある安全・安心な郷づくり',
    source: 'https://www.town.miyazaki-misato.lg.jp/kiji003764/3_764_2194_up_peo2jt6s.pdf',
  },
  // 高千穂町
  '454419': {
    text: '世界に誇る地域資源を活かし豊かでみんなが輝くまち 高千穂',
    source: 'https://www.town-takachiho.jp/material/files/group/17/sougoutyoukikeikaku.pdf',
  },
  // 日之影町
  '454427': {
    text: '未来への新たな光を灯すまち 日之影',
    source: 'https://www.town.hinokage.lg.jp/docs/2025040100013/file_contents/02_gaiyoubann.pdf',
  },
  // 五ヶ瀬町
  '454435': {
    text: '人と『ともに』 地域と『ともに』 自然と『ともに』',
    source: 'https://www.town.gokase.miyazaki.jp/material/files/group/3/koukikeikaku.pdf',
  },
  // 鹿児島県
  '460001': {
    text: '誰もが安心して暮らし，活躍できる鹿児島',
    source: 'https://www.pref.kagoshima.jp/ac01/kensei/keikaku/vision/documents/documents/64629_20220329204109-1.pdf',
  },
  // 鹿児島市
  '462012': {
    text: 'つながる人・まち 彩りあふれる躍動都市・かごしま',
    source: 'https://www.city.kagoshima.lg.jp/kikakuzaisei/kikaku/seisaku-k/documents/02_kihonkousou1.pdf',
  },
  // 鹿屋市
  '462039': {
    text: 'ひとが元気！まちが元気！「みんなで創る健康都市 かのや」',
    source: 'https://www.city.kanoya.lg.jp/suishin/shise/shisaku/keikaku3.html',
  },
  // 枕崎市
  '462047': {
    text: 'まちの誇り 自然の恵み 未来へつなぐ 幸せ共創都市',
    source: 'https://www.city.makurazaki.lg.jp/soshiki/kikaku/28897.html',
  },
  // 阿久根市
  '462063': {
    text: '帰ってきたくなる 行ってみたくなる 東シナ海の宝のまち あくね',
    source: 'https://www.city.akune.lg.jp/material/files/group/104/machidukurivision_3.pdf',
  },
  // 出水市
  '462080': {
    text: 'みんなでつくる活力都市 住みたいまち 出水市',
    source: 'https://www.city.kagoshima-izumi.lg.jp/page/page_10024.html',
  },
  // 指宿市
  '462101': {
    text: 'みんなが好きになる！将来が楽しみになるまち',
    source: 'https://www.city.ibusuki.lg.jp/main/uploads/kikaku/docs/%E7%AC%AC%EF%BC%91%E7%AB%A0_%E8%A8%88%E7%94%BB%E3%81%AE%E6%A6%82%E8%A6%81%EF%BC%8C%E7%AC%AC%EF%BC%92%E7%AB%A0_%E5%9F%BA%E6%9C%AC%E6%A7%8B%E6%83%B3.pdf',
  },
  // 西之表市
  '462136': {
    text: '人・自然・文化ー島の宝をいかすまち',
    source: 'https://www.city.nishinoomote.lg.jp/admin/soshiki/kikaku/kikakutyousei/shinkoukeikaku/8099.html',
  },
  // 垂水市
  '462144': {
    text: '豊かな食と自然を未来へつなぎ みんなでつくる 笑顔あふれるまち 垂水市',
    source: 'https://www.city.tarumizu.lg.jp/seisaku/shise/sesaku/sogokekaku/documents/gaiyouban.pdf',
  },
  // 薩摩川内市
  '462152': {
    text: '人が繋がり 人が輝く 安らぎと賑わいのまち 薩摩川内',
    source: 'https://www.city.satsumasendai.lg.jp/material/files/group/3/dai3zisougoukeikakugaiyouban.pdf',
  },
  // 曽於市
  '462179': {
    text: '豊かな大地と 人の絆が 未来につながるまち 曽於',
    source: 'https://www.city.soo.kagoshima.jp/jyuyounews/2026/2026-0327-1440-10.html',
  },
  // 霧島市
  '462187': {
    text: '人にやさしく 人をはぐくむ 一人ひとりが輝きにぎわう 多機能都市',
    source: 'https://www.city-kirishima.jp/kikaku/shise/kekaku/shise/documents/koukikihonnkeikaku-10-13.pdf',
  },
  // いちき串木野市
  '462195': {
    text: 'ひとが輝き 文化の薫る 世界に拓かれたまち',
    source: 'https://www.city.ichikikushikino.lg.jp/seisaku1/shise/kekaku/sogo/documents/koso2_1.pdf',
  },
  // 南さつま市
  '462209': {
    text: '住みたい 働きたい 訪れたい 誰もが主役になれる 南さつま',
    source: 'https://www.city.minamisatsuma.lg.jp/shisei/gyosei/e023937.html',
  },
  // 志布志市
  '462217': {
    text: '未来へ躍動する創造都市 志布志',
    source: 'https://www.city.shibushi.lg.jp/uploaded/attachment/7609.pdf',
  },
  // 奄美市
  '462225': {
    text: '自然・人・文化が紡ぐ しあわせの島',
    source: 'https://www.city.amami.lg.jp/kikaku/documents/miraikeikeikakuhonpen.pdf',
  },
  // 南九州市
  '462233': {
    text: '人と自然が共生する 活気あふれる 住みよいまち 南九州市',
    source: 'https://www.city.minamikyushu.lg.jp/gyoseijoho/seisaku_keikaku/1/4139.html',
  },
  // 伊佐市
  '462241': {
    text: '笑顔あふれ 一人ひとりが 幸せ感じるまち',
    source: 'https://www.city.isa.kagoshima.jp/wp-content/uploads/2023/04/37ce9e4890c24f5c5a9982a3c2ee7704.pdf',
  },
  // 姶良市
  '462250': {
    text: '可能性全開！ 夢と希望をはぐくむ まちづくり',
    source: 'https://www.city.aira.lg.jp/kikaku/documents/dai2jiairasisougoukeikakugaiyoubann.pdf',
  },
  // さつま町
  '463922': {
    text: 'あなたの夢にまっすぐ 新たな挑戦が未来をつくる',
    source: 'https://www.satsuma-net.jp/material/files/group/4/kihonkousou.pdf',
  },
  // 湧水町
  '464520': {
    text: '人と自然が織りなす芸術のまち 心豊かで伸びゆく美しいまち',
    source: 'https://www.town.yusui.kagoshima.jp/soshiki/28/2424.html',
  },
  // 大崎町
  '464686': {
    text: 'まち・ひと・しごと 世界の未来をつくる 循環のまち',
    source: 'https://www.town.kagoshima-osaki.lg.jp/ke_kikaku/machiannai/shisaku/kekaku/documents/honpen.pdf',
  },
  // 錦江町
  '464902': {
    text: 'すべての人が自分らしく幸せに',
    source: 'https://www.town.kinko.lg.jp/seisaku-h/chose/shisaku/sogo/keikaku.html',
  },
  // 中種子町
  '465011': {
    text: '“よいらーいき”でつなぐ 人の和と豊かな自然が織りなす“躍動なかたね”',
    source: 'https://town.nakatane.kagoshima.jp/kikaku/machinojoho/shisaku-kekaku/sogokekaku/6tyousin/documents/gaiyoubann.pdf',
  },
  // 屋久島町
  '465054': {
    text: '悠久の流れの中で、自然と共に生きる知恵と多様な集落の文化がとけあい、人々の営みが循環・持続していくまち',
    source: 'https://www.town.yakushima.kagoshima.jp/gyosei/machinokeikaku_jigyo/12/1817.html',
  },
  // 大和村
  '465232': {
    text: '小さくとも光り輝き続ける村',
    source: 'https://www.vill.yamato.lg.jp/kikaku/sonse/shisaku-kekaku/sougoushinkoukeikaku/documents/dai6jisougoushinkoukeikaku.pdf',
  },
  // 宇検村
  '465241': {
    text: '奄美の自然・歴史・文化がきらめく 焼内湾を包む結いのこころでつながるむら うけん',
    source: 'https://www.uken.net/kouhoutoukei/muranogaiyo/johokokai/sogokekaku/documents/06sougousinkou.pdf',
  },
  // 瀬戸内町
  '465259': {
    text: 'ひとが輝く 夢と希望に満ちた 魅力あるシマ',
    source: 'http://www.town.setouchi.lg.jp/kikaku/documents/dai5ji-chokishinkokeikaku_koukikihonkeikaku.pdf',
  },
  // 龍郷町
  '465275': {
    text: '歴史と文化で創る 活力と幸せが実感できるまちづくり',
    source: 'https://www.town.tatsugo.lg.jp/spss/chose/machinoshokai/documents/dairokuzisinkoukeikakugaiyou.pdf',
  },
  // 喜界町
  '465291': {
    text: '子や孫の世代が住んでよかったと思える元気な島',
    source: 'https://www.town.kikai.lg.jp/sosei/machi/shisaku-kekaku/documents/dai6jisougousinkoukeikakuhpkouhyou.pdf',
  },
  // 徳之島町
  '465305': {
    text: 'We\'re OPEN ～みらい輝く、とくのしま町～',
    source: 'https://www.tokunoshima-town.org/kikakuka/chose/shisaku/sogo/documents/6th_tokunoshima_town_master_plan.pdf',
  },
  // 天城町
  '465313': {
    text: 'ユイの心で命つむぐまち あまぎ',
    source: 'https://www.town.amagi.lg.jp/fs/2/9/3/9/6/_/_6___________AMAGI-VISION_________.pdf',
  },
  // 伊仙町
  '465321': {
    text: '自然とともに育む、誰もが輝けるまち伊仙町',
    source: 'https://www.town.isen.kagoshima.jp/documents/627/sougoukeikaku.pdf',
  },
  // 和泊町
  '465330': {
    text: '人と未来を 笑顔でつなぐ、心豊かな和の町、和泊町。',
    source: 'https://www.town.wadomari.lg.jp/documents/284/6jisougoukeikaku.pdf',
  },
  // 知名町
  '465348': {
    text: '21の暮らしを大切に、21の未来を創る子や孫が誇れるまちづくり',
    source: 'https://www.town.china.lg.jp/chosei/gyosei-unei/1/1/2244.html',
  },
  // 与論町
  '465356': {
    text: '想いどぅ島ぬ力',
    source: 'https://www.yoron.jp/kiji00325/3_25_3_5_86_1_up_87B4L3RS第６次与論町総合振興計画.pdf',
  },
  // 沖縄県
  '470007': {
    text: '時代を切り拓き、世界と交流し、ともに支え合う平和で豊かな「美ら島」おきなわ',
    source: 'https://www.pref.okinawa.lg.jp/_res/projects/default_project/_page_/001/014/250/shin_okinawa21seikivision-kihonnkeikaku.pdf',
  },
  // 那覇市
  '472018': {
    text: 'なはで暮らし、働き、育てよう！笑顔広がる元気なまちNAHA みんなでつなごう市民力',
    source: 'https://www.city.naha.okinawa.jp/admin/plans/1004118/1004120.html',
  },
  // 石垣市
  '472077': {
    text: '誰もが自分らしく幸せに暮らせる 持続可能な交流都市 いしがき',
    source: 'https://www.city.ishigaki.okinawa.jp/material/files/group/9/kihonkousou.pdf',
  },
  // 浦添市
  '472085': {
    text: 'てだこの都市（まち）・浦添',
    source: 'https://www.city.urasoe.lg.jp/doc/2026040300038/file_contents/file_202643515813_3.pdf',
  },
  // 名護市
  '472093': {
    text: 'つなぎ、創る・しなやかな未来',
    source: 'https://www.city.nago.okinawa.jp/machidukuri/2026022500012/file_contents/dai2bu.pdf',
  },
  // 糸満市
  '472107': {
    text: 'つながりを深めチャレンジするまち糸満市',
    source: 'https://www.city.itoman.lg.jp/uploaded/life/37408_78922_misc.pdf',
  },
  // 豊見城市
  '472123': {
    text: 'Welcomeな思いで ハートがつながり みんなで彩るまち とみぐすく',
    source: 'https://www.city.tomigusuku.lg.jp/gyoseijoho/seisaku_keikaku/2/9956.html',
  },
  // うるま市
  '472131': {
    text: '愛してます 住みよいまち うるま',
    source: 'https://www.city.uruma.lg.jp/1002001000/contents/2124.html',
  },
  // 宮古島市
  '472140': {
    text: '心かよう夢と希望に満ちた島 宮古（みゃ〜く）',
    source: 'https://www.city.miyakojima.lg.jp/gyosei/kihonkeikaku/2022-1208-0927-12.html',
  },
  // 南城市
  '472158': {
    text: '海と緑と光あふれる南城市',
    source: 'https://www.city.nanjo.okinawa.jp/userfiles/files/dainijinannjyousisougoukeikakukaiteibann_1.pdf',
  },
  // 国頭村
  '473014': {
    text: '森と水とやすらぎの里“くにがみ”',
    source: 'https://www.vill.kunigami.okinawa.jp/kunigami-village/wp-content/uploads/2022/04/e847c7494a98b4f20b31eb1f50fcb9ec.pdf',
  },
  // 今帰仁村
  '473065': {
    text: 'ゆがふむら今帰仁',
    source: 'https://www.nakijin.jp/material/files/group/1/daigozi_nakijinsougoukeikaku.pdf',
  },
  // 恩納村
  '473111': {
    text: '恩の青 豊かな緑 輝く人々 未来へつなごう恩納村',
    source: 'https://www.vill.onna.okinawa.jp/userfiles/files/kikaku/kikakukakari/sougoukeikaku_2kihonkousou.pdf',
  },
  // 宜野座村
  '473138': {
    text: '水と緑と太陽の里・宜野座村',
    source: 'https://www.vill.ginoza.okinawa.jp/material/files/group/3/20260618_01.pdf',
  },
  // 金武町
  '473146': {
    text: 'つながる輪 夢を支える 金武のまち',
    source: 'https://www.town.kin.okinawa.jp/material/files/group/3/6thsougoukeikakugaiyouban.pdf',
  },
  // 嘉手納町
  '473251': {
    text: 'ひと、みらい輝く交流のまち かでな',
    source: 'https://www.town.kadena.okinawa.jp/kadena/5.html',
  },
  // 北谷町
  '473260': {
    text: 'ニライの都市（まち）',
    source: 'https://www.chatan.jp/choseijoho/machi_keikaku/sogokeikaku/chousei.html',
  },
  // 北中城村
  '473278': {
    text: '絆をつむぎ躍動する田園文化村',
    source: 'https://www.vill.kitanakagusuku.lg.jp/material/files/group/6/soukeigaiyouban.pdf',
  },
  // 中城村
  '473286': {
    text: '中城が好き',
    source: 'https://www.vill.nakagusuku.okinawa.jp/sonsei/transformation/1787874100/gojisougou/kihon/',
  },
  // 西原町
  '473294': {
    text: '文教のまち西原',
    source: 'https://www.town.nishihara.okinawa.jp/soshiki/3/2256.html',
  },
  // 与那原町
  '473481': {
    text: 'みんなで創ろう 活気あふれる 美らまち与那原',
    source: 'https://www.town.yonabaru.okinawa.jp/uploaded/attachment/3533.pdf',
  },
  // 南風原町
  '473502': {
    text: 'ともにつくる黄金南風の平和郷',
    source: 'https://www.town.haebaru.lg.jp/soshiki/5/12712.html',
  },
  // 渡嘉敷村
  '473537': {
    text: 'だれもが、生きがいと幸せを実感し、こころ穏やかにすごせる碧島 渡嘉敷村',
    source: 'https://www.vill.tokashiki.okinawa.jp/material/files/group/2/dai5zisougoukeikaku.pdf',
  },
  // 座間味村
  '473545': {
    text: '豊かな自然と地域資源を愛し、人が住み・集う座間味村',
    source: 'https://www.vill.zamami.okinawa.jp/sonsei/plan/sougou_keikaku/',
  },
  // 粟国村
  '473553': {
    text: '大洋の中に豊かなくらしと文化を築く 粟国',
    source: 'https://www.vill.aguni.okinawa.jp/material/files/group/1/20220426_dai4sougoukeikaku.pdf',
  },
  // 南大東村
  '473570': {
    text: '人と自然が未来を拓く フロンティアアイランド',
    source: 'http://www.vill.minamidaito.okinawa.jp/uploaded/attachment/142.pdf',
  },
  // 伊平屋村
  '473596': {
    text: '輝く里山・里海 笑顔あふれる島人',
    source: 'https://www.vill.iheya.okinawa.jp/uploaded/attachment/606.pdf',
  },
  // 伊是名村
  '473600': {
    text: '自然と歴史、人が輝く ときわのしま・いぜな',
    source: 'https://vill.izena.okinawa.jp/userfiles/files/sougoukeikaku.pdf',
  },
  // 久米島町
  '473618': {
    text: '夢つむぐ島',
    source: 'https://www.town.kumejima.okinawa.jp/docs/2026042300029/',
  },
  // 八重瀬町
  '473626': {
    text: '大地の活力と うまんちゅの魂が創り出す 自然共生の清らまち',
    source: 'https://www.town.yaese.lg.jp/docs/2019051500016/file_contents/sougoukeikaku.pdf',
  },
  // 多良間村
  '473758': {
    text: '持続可能で 幸せあふれる ふしゃぬふ文化の島 たらま',
    source: 'https://www.vill.tarama.okinawa.jp/common/uploads/3da0edcd684b6d026d1616b8da9b3d12.pdf',
  },
  // 竹富町
  '473812': {
    text: '島々の誇りと個性がきらめき、大自然と文化と暮らしが響きあう町',
    source: 'https://www.town.taketomi.lg.jp/userfiles/files/topics/seisakusuishin/d5zkihonkousou.pdf',
  },
  // 与那国町
  '473821': {
    text: '笑顔で健やかに住み続けられる自然・暮らし・歴史文化が調和する島',
    source: 'https://www.town.yonaguni.okinawa.jp/docs/2024041100022/file_contents/5yonagunisogoukeikakuforweb-2shyo.pdf',
  },
}
