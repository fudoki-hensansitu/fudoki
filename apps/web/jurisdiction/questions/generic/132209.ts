// 東大和市の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
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
        "value": "399億円",
        "note": "R7年度に使ったお金（当初予算 376億円）"
      },
      "answer": "R7年度の一般会計では、当初予算 **376億円** に対して、決算で使ったのは **399億円** でした。年度の途中の補正予算で予算が増え、当初予算より 23.3億円 多く使っています。\n\n使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。",
      "source": "R7年度 当初予算書・決算書（一般会計）",
      "follow": [
        "どの事業で予算が余った？"
      ]
    },
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+10億円",
        "note": "自立支援給付費等事業費（R5年度 → R8年度）"
      },
      "answer": "R5年度とR8年度の当初予算を比べると、いちばん増えたのは [自立支援給付費等事業費](/tokyo/higashiyamato/projects/a2be18fd318cd57903ec697aa94f5d661e2b1074295a33384b18fed427b32e8c) で、25.3億円 から **35.3億円** になりました。増えた額の大きい順に3つです。\n\n- [自立支援給付費等事業費](/tokyo/higashiyamato/projects/a2be18fd318cd57903ec697aa94f5d661e2b1074295a33384b18fed427b32e8c) 25.3億円 → 35.3億円（+10億円）\n- [保育園事業費](/tokyo/higashiyamato/projects/2c4b996a9986ed0d040681794413082407519246ca7fe0631bbb6475dcbce746) 30.1億円 → 38.2億円（+8.1億円）\n- [児童手当支給事業費](/tokyo/higashiyamato/projects/774477e2b3051c0b596b62bd4671fe26374b924b48a7ead260d351326fed3a1a) 12.1億円 → 18.3億円（+6.2億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R5年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "自立支援給付費等事業費はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "53件",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**53件**載りました。金額の大きい順に6つです。\n\n- [市内道路改良事業費](/tokyo/higashiyamato/projects/352156775183872d3f65925705cab6690598d825ef4fbd673e7c8232eeceff3f) 2.7億円\n- [乳児等通園支援事業費](/tokyo/higashiyamato/projects/a91fd91b4e4ecc51a7d5a168089411d3e879f02c400c1c2384a9e3fd816f00f3) 2.4億円\n- [生活保護費追加給付事業費](/tokyo/higashiyamato/projects/6337ffecd2c2278aea078dae8c688cff823264455718fbc76a3a28a27ad6558f) 2.4億円\n- [街路樹等管理費](/tokyo/higashiyamato/projects/b7f3477a645e5b6de72dd6b8070450933e7d93bee5592d35b86ed7319a342981) 1.1億円\n- [道路管理費](/tokyo/higashiyamato/projects/092572031f17ceea2c29a248cb934d9ccc37a47ebe9aef6d6888a4dc58d3b09c) 1億円\n- [私立幼稚園保護者に対する補助事業費](/tokyo/higashiyamato/projects/b72f241703360df2bd369c8a8b2e17bcf9f34f04b9ce6b2f05eeff4b8e2b4d17) 9,512万円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "市内道路改良事業費では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "5,481万円",
        "note": "市民1人あたり 約640円"
      },
      "answer": "R8年度の当初予算の選挙費は **5,481万円** です。市民1人あたりにすると**約640円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [職員人件費](/tokyo/higashiyamato/projects/9a1b365f3656039537507036ef6f4c0b79858c45b7a8bd290954292542d5aa5f) 4,060万円\n- [市議会議員及び市長選挙費](/tokyo/higashiyamato/projects/f9bb09618286c0729987d5b86b8f31580d653c6d4cda274f12debd20c68f8325) 889万円\n- [選挙管理委員会運営費](/tokyo/higashiyamato/projects/26454c1d5920301aacd82f8da0a6667ad169d53ddfb94b75639b4f8e9ff2fb10) 514万円\n- [選挙常時啓発事業費](/tokyo/higashiyamato/projects/7723c61406e5e4beb5d992b4a053ac20e401e94c3760f454ab6a91e02f0dc5b4) 19万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "市の予算は、**市長が案をつくり、市議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも市議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと市議会が認定します。東大和市のR8年度の一般会計の当初予算は 389億円 です。",
      "source": "地方自治法の定めと、東大和市のR8年度 当初予算書",
      "follow": [
        "left",
        "市議会ではどんな議論があった？"
      ]
    }
  ]
}
