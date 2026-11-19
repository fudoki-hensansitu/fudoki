// 武蔵村山市の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
import type { QuestionFeed } from '../types'

export const feed: QuestionFeed = {
  "order": [
    "left",
    "grow",
    "new",
    "senkyo",
    "yosan"
  ],
  "questions": [
    {
      "id": "left",
      "q": "使い切れずに余ったお金はある？",
      "big": {
        "value": "364億円",
        "note": "R7年度に使ったお金（当初予算 351億円）"
      },
      "answer": "R7年度の一般会計では、当初予算 **351億円** に対して、決算で使ったのは **364億円** でした。年度の途中の補正予算で予算が増え、当初予算より 13.7億円 多く使っています。\n\n使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。",
      "source": "R7年度 当初予算書・決算書（一般会計）",
      "follow": [
        "どの事業で予算が余った？"
      ]
    },
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+4.5億円",
        "note": "自立支援給付経費（R5年度 → R8年度）"
      },
      "answer": "R5年度とR8年度の当初予算を比べると、いちばん増えたのは [自立支援給付経費](/tokyo/musashimurayama/projects/50f98bfbc5dcda2bc117f4ec974f93c1e162ecd8c4d62933a233d782b5ccc6fc) で、20.2億円 から **24.8億円** になりました。増えた額の大きい順に3つです。\n\n- [自立支援給付経費](/tokyo/musashimurayama/projects/50f98bfbc5dcda2bc117f4ec974f93c1e162ecd8c4d62933a233d782b5ccc6fc) 20.2億円 → 24.8億円（+4.5億円）\n- [児童手当支給経費](/tokyo/musashimurayama/projects/cc896d1a836c45c44e61ba1debff76eac7f7842fe444668229d7eac24c9a642c) 12億円 → 16.2億円（+4.2億円）\n- [立川都市計画道路3・4・17号桜街道線整備事業費](/tokyo/musashimurayama/projects/12ebf3281d5576f3b41d233fc1d6deaa456204e027297b7aafd51c8fe736a536) 9,760万円 → 5.1億円（+4.1億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R5年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "自立支援給付経費はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "30件",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**30件**載りました。金額の大きい順に6つです。\n\n- [包括的支援事業経費](/tokyo/musashimurayama/projects/91813f1263cff45e02e98f91efb765435e5fed09a252867800956866131e0345) 2.3億円\n- [施設整備事業費](/tokyo/musashimurayama/projects/fabacc30733644e169a170b1d98391c3ab3587fd8a928f69d36b4203bce19978) 4,536万円\n- [大南学園第四中学校施設整備事業費](/tokyo/musashimurayama/projects/93fe7ae9ec398a29984d23d8a73bc8db90abfe7cb2fe32dfe8463163ac48474e) 2,935万円\n- [主要市道第71号線整備事業費](/tokyo/musashimurayama/projects/4f047c742da8adbd74ef0a8ffe7683acc48f286d0a8840aaf61fb10d1aab922a) 2,573万円\n- [重層的支援体制整備事業経費](/tokyo/musashimurayama/projects/6f3a24c0d0fb8a066437af5e489e0ee27d9ffeac3fa8376927534b1f03d5919d) 2,559万円\n- [(仮称)公共施設個別施設計画等策定経費](/tokyo/musashimurayama/projects/f3ae8e61ca120db97ecc3a34ec1129d2e779e130a6a463d0e70620f353c3f5ab) 1,323万円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "包括的支援事業経費では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "3,690万円",
        "note": "市民1人あたり 約520円"
      },
      "answer": "R8年度の当初予算の選挙費は **3,690万円** です。市民1人あたりにすると**約520円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [職員人件費](/tokyo/musashimurayama/projects/98f2c6fa5db2ed26d7b2c8b1b526921ef4c2d6c45a5d744cd294f1f2daf8213e) 2,704万円\n- [選挙管理委員会事務局経費](/tokyo/musashimurayama/projects/4eb5a3514cc4612e9eb6aa8c4754e079194de1ed6c7cd0a722d5a55f22dc3dbc) 466万円\n- [選挙管理委員会運営経費](/tokyo/musashimurayama/projects/a717df07abdbc35f2af469c1e856eb1c649ae28fa3726d17e2de41fa6bea5e09) 282万円\n- [市議会議員選挙経費](/tokyo/musashimurayama/projects/d2b8483cf1e3be726d017d39b2ca699a58a5ff137d5ed346ac42a69ab89579c0) 206万円\n- [選挙啓発経費](/tokyo/musashimurayama/projects/8c3aea08d880fffe4ac03763c1c2b740193acfcb1a82ca2494a9f670a03d859f) 32万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "市の予算は、**市長が案をつくり、市議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも市議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと市議会が認定します。武蔵村山市のR8年度の一般会計の当初予算は 350億円 です。",
      "source": "地方自治法の定めと、武蔵村山市のR8年度 当初予算書",
      "follow": [
        "left",
        "市議会ではどんな議論があった？"
      ]
    }
  ]
}
