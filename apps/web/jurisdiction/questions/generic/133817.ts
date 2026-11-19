// 三宅村の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
import type { QuestionFeed } from '../types'

export const feed: QuestionFeed = {
  "order": [
    "yosan"
  ],
  "questions": [
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "村の予算は、**村長が案をつくり、村議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも村議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと村議会が認定します。",
      "source": "地方自治法の定め",
      "follow": [
        "村議会ではどんな議論があった？"
      ]
    }
  ]
}
