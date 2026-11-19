// 神津島村の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
import type { QuestionFeed } from '../types'

export const feed: QuestionFeed = {
  "order": [
    "senkyo",
    "yosan"
  ],
  "questions": [
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "807万円",
        "note": "村民1人あたり 約4,720円"
      },
      "answer": "R4年度の当初予算の選挙費は **807万円** です。村民1人あたりにすると**約4,720円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [村長選挙費](/tokyo/kozushima/projects/7ed8ae8aae14d445d8f69532f70c85304225e290cb293f6d245f339ac4d7a8d5) 465万円\n- [参議院議員選挙費](/tokyo/kozushima/projects/7a9797c572e3cbb9049c6e7f0e344013b30bbc0799cc40d488d0f9d93670d680) 328万円\n- [選挙管理委員会費](/tokyo/kozushima/projects/d42410e975b346a3bd36bb18642ddcdba8c9097d73d6fae56da0db5c597b0236) 12万円\n- [明るい選挙推進費](/tokyo/kozushima/projects/156ab0f3e1431174a29d9bdca9a1e91a8ccefefb9bada90d920220a9d2fbdbff) 2万円",
      "source": "R4年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "村の予算は、**村長が案をつくり、村議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも村議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと村議会が認定します。神津島村のR4年度の一般会計の当初予算は 30.3億円 です。",
      "source": "地方自治法の定めと、神津島村のR4年度 当初予算書",
      "follow": [
        "村議会ではどんな議論があった？"
      ]
    }
  ]
}
