// 小笠原村の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
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
        "value": "56.5億円",
        "note": "R5年度に使ったお金（当初予算 56.1億円）"
      },
      "answer": "R5年度の一般会計では、当初予算 **56.1億円** に対して、決算で使ったのは **56.5億円** でした。年度の途中の補正予算で予算が増え、当初予算より 4,585万円 多く使っています。\n\n使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。",
      "source": "R5年度 当初予算書・決算書（一般会計）",
      "follow": [
        "どの事業で予算が余った？"
      ]
    },
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+1.2億円",
        "note": "農業振興事業費（R5年度 → R8年度）"
      },
      "answer": "R5年度とR8年度の当初予算を比べると、いちばん増えたのは [農業振興事業費](/tokyo/ogasawara/projects/a6c9b15eafca745765bcb80564fce25e67bcdf2379352b5a8fad2e90ca1b4a87) で、2,098万円 から **1.4億円** になりました。増えた額の大きい順に3つです。\n\n- [農業振興事業費](/tokyo/ogasawara/projects/a6c9b15eafca745765bcb80564fce25e67bcdf2379352b5a8fad2e90ca1b4a87) 2,098万円 → 1.4億円（+1.2億円）\n- [塵芥処理事業費](/tokyo/ogasawara/projects/56b9ad1bed06124ffb446870be1decdde394817c7e71eff2e1cb2aac3d053c22) 2.9億円 → 3.9億円（+1.1億円）\n- [職員人件費](/tokyo/ogasawara/projects/c79cd13697a30e84615c999be9b194fa9afc42008797ef48a1d39a7d88688f4e) 5.3億円 → 6.3億円（+1億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R5年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "農業振興事業費はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "8つ",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**8つ**載りました。金額の大きい順に6つです。\n\n- [小笠原諸島振興開発事業費](/tokyo/ogasawara/projects/47c53c0815a688dd88e2412f1a01bdd2a84d0fb02f6d059ad4db00a34853fe75) 1.5億円\n- [診療所庁舎等管理費](/tokyo/ogasawara/projects/674ede0ea353d1fc26d9b10e2f96a17d2e7da1d82ef6c9b8f458fc59a8b88ea6) 5,800万円\n- [地球温暖化対策推進事業費](/tokyo/ogasawara/projects/6038c734d29f7d03f8615b0f1ecbd4b99f2106e1c45810b92b1a9d4a23f38c0b) 813万円\n- [村民交流促進事業費](/tokyo/ogasawara/projects/f5289438436325891322401813e8cd55b7da2e980fff20f5c83223296817a3ce) 740万円\n- [移住定住促進事業費](/tokyo/ogasawara/projects/26637a118aa8bc20b3c61f726a6ac6719213e7310d5a3a1fda721dd3f1a89bd5) 700万円\n- [減債基金積立金](/tokyo/ogasawara/projects/33ddbca7f6f33ce95c4e39cb9d1ca9be625678da36a046acc0bed057158b79f0) 575万円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "小笠原諸島振興開発事業費では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "14万円",
        "note": "村民1人あたり 約60円"
      },
      "answer": "R8年度の当初予算の選挙費は **14万円** です。村民1人あたりにすると**約60円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [委員報酬](/tokyo/ogasawara/projects/1a79aca9f28cfaaad8359a8f677e564571ba14a58d2c73031b0e168308c7c0aa) 8万円\n- [選挙管理委員会事務費](/tokyo/ogasawara/projects/fb168eed1bb4c0d65503830fe288ef22125ef6f474ba28a0450c0152457e0adf) 6万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "村の予算は、**村長が案をつくり、村議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも村議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと村議会が認定します。小笠原村のR8年度の一般会計の当初予算は 62.6億円 です。",
      "source": "地方自治法の定めと、小笠原村のR8年度 当初予算書",
      "follow": [
        "left",
        "村議会ではどんな議論があった？"
      ]
    }
  ]
}
