// 町田市の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
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
        "value": "2,029億円",
        "note": "R7年度に使ったお金（当初予算 1,685億円）"
      },
      "answer": "R7年度の一般会計では、当初予算 **1,685億円** に対して、決算で使ったのは **2,029億円** でした。年度の途中の補正予算で予算が増え、当初予算より 344億円 多く使っています。\n\n使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。",
      "source": "R7年度 当初予算書・決算書（一般会計）",
      "follow": [
        "どの事業で予算が余った？"
      ]
    },
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+62.8億円",
        "note": "小学校施設費（R5年度 → R8年度）"
      },
      "answer": "R5年度とR8年度の当初予算を比べると、いちばん増えたのは [小学校施設費](/tokyo/machida/projects/3e488fc978d3a99a4367f9f24d5c8d1e855f50298a562edcd224b6da50b196dc) で、7.1億円 から **69.9億円** になりました。増えた額の大きい順に3つです。\n\n- [小学校施設費](/tokyo/machida/projects/3e488fc978d3a99a4367f9f24d5c8d1e855f50298a562edcd224b6da50b196dc) 7.1億円 → 69.9億円（+62.8億円）\n- [障がい者サービス給付事業費](/tokyo/machida/projects/6247d3af9c6ea4edb0e0c4774909f167d4d7f27fd28c8e269dfa51d5efee46e4) 150億円 → 196億円（+46.6億円）\n- [児童手当費](/tokyo/machida/projects/1121c61c214ddfeb26bba619b3794ae2552f409cad42c163d0cd7cbced7dcf33) 58.1億円 → 86.5億円（+28.4億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R5年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "小学校施設費はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "123件",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**123件**載りました。金額の大きい順に6つです。\n\n- [会計年度任用職員人件費](/tokyo/machida/projects/7035eb51b3ecc55b07b546637cfe6b1ff44ac106e9ce410dc28aab18a3039bb1) 54.8億円\n- [みちづくり・まちづくりパートナー事業](/tokyo/machida/projects/b7e3fc684d437408ddb426b58957b2898ff08a0461074b89d2cfd7a7be8b5b90) 31.8億円\n- [職員人件費](/tokyo/machida/projects/a8cc20efdc07a4e3d16b3ee5cb712bc732edb07285e1efe4fb6927790f1e7980) 26億円\n- [職員人件費](/tokyo/machida/projects/e0ceb74c02eb616528e7c4657a3f005d2a52e4adddd984a69418b595af7514ee) 10.4億円\n- [職員人件費](/tokyo/machida/projects/87eeaab1d72a23244a4abc8d97f7351383134c35ab58a415d6c81bac33a4f952) 7億円\n- [職員人件費](/tokyo/machida/projects/1e63c6e8115d6ddbf94f1aa7c80990879aa6d2fed1f935ac99ba31a8b89e56c1) 5.7億円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "会計年度任用職員人件費では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "1.2億円",
        "note": "市民1人あたり 約280円"
      },
      "answer": "R8年度の当初予算の選挙費は **1.2億円** です。市民1人あたりにすると**約280円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [職員人件費](/tokyo/machida/projects/f2e4786ff18bc0dd6410bd844df1848e19325613450dd2d4f0e6128b440f523d) 1.1億円\n- [委員会費](/tokyo/machida/projects/296047c82ccd5a0146f240f540eaf8dabde9cff6d4cae1887bf4dc66e18a186b) 1,078万円\n- [選挙啓発費](/tokyo/machida/projects/dce28e2bea9b050081fdea068d09524aa49f9f7531dd19c19362963c71de2073) 148万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "市の予算は、**市長が案をつくり、市議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも市議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと市議会が認定します。町田市のR8年度の一般会計の当初予算は 2,077億円 です。",
      "source": "地方自治法の定めと、町田市のR8年度 当初予算書",
      "follow": [
        "left",
        "市議会ではどんな議論があった？"
      ]
    }
  ]
}
