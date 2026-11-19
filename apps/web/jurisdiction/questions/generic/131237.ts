// 江戸川区の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
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
        "value": "3,335億円",
        "note": "R6年度に使ったお金（当初予算 3,263億円）"
      },
      "answer": "R6年度の一般会計では、当初予算 **3,263億円** に対して、決算で使ったのは **3,335億円** でした。年度の途中の補正予算で予算が増え、当初予算より 71.2億円 多く使っています。\n\n使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。",
      "source": "R6年度 当初予算書・決算書（一般会計）",
      "follow": [
        "どの事業で予算が余った？"
      ]
    },
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+102億円",
        "note": "市街地開発経費（R5年度 → R8年度）"
      },
      "answer": "R5年度とR8年度の当初予算を比べると、いちばん増えたのは [市街地開発経費](/tokyo/edogawa/projects/3ad41ca4e162f90c012eadd76df3a68dea19fd90a74586c4e7fdbe02f2ae8576) で、48.1億円 から **150億円** になりました。増えた額の大きい順に3つです。\n\n- [市街地開発経費](/tokyo/edogawa/projects/3ad41ca4e162f90c012eadd76df3a68dea19fd90a74586c4e7fdbe02f2ae8576) 48.1億円 → 150億円（+102億円）\n- [児童手当等支給経費](/tokyo/edogawa/projects/9f4ee2670eb785f52ddc03ea6ea5bbd45603402029a4b6ff44a28d90494ea45e) 145億円 → 191億円（+46.7億円）\n- [私立保育園等事業経費](/tokyo/edogawa/projects/5206b4a2a85ce9d155c592579c341eaf2c415ce05bc619c80fa886c67058e2ed) 199億円 → 243億円（+43.4億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R5年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "市街地開発経費はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "83件",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**83件**載りました。金額の大きい順に6つです。\n\n- [後期高齢者医療特別会計繰出金](/tokyo/edogawa/projects/96935c84bc68c8de1560af758102efa0cd75250c72c7b28a326ed408117b1286) 92.7億円\n- [職員の給与費等](/tokyo/edogawa/projects/32eca795d787921e09ef909f89d48c5e4009d22e699f1216276509a05dcc3e14) 78.6億円\n- [国民健康保険事業特別会計繰出金](/tokyo/edogawa/projects/692abc4daa433b8f0c38bdd20609c09f892b1ec7932c7d09e6d47c00ec322787) 53.9億円\n- [職員の給与費等](/tokyo/edogawa/projects/bee3f2c191f8c68a2aaafe735814bb41758621a133187825417b552f49c34fa1) 20.5億円\n- [職員の給与費等](/tokyo/edogawa/projects/bf2b4dddffa558a2824d8d8e56340babef2e1ccd4d2fbbaae979588217b00dd0) 18.8億円\n- [職員の給与費等](/tokyo/edogawa/projects/5b344d5180889069bae50e8b5e95cc7d533682efd93a4a90c678c72d0e3a3bab) 14.9億円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "後期高齢者医療特別会計繰出金では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "1.6億円",
        "note": "区民1人あたり 約230円"
      },
      "answer": "R8年度の当初予算の選挙費は **1.6億円** です。区民1人あたりにすると**約230円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [職員の給与費等](/tokyo/edogawa/projects/db097af46c244ad9483586a84313717a9d11c5e7f7b4eb46f65486bcc812e2c7) 1億円\n- [各種選挙執行経費](/tokyo/edogawa/projects/26a27e0cb9f39a7e1fb636e89a044addf9e3e671c4326b4d06f0ca4d57823d65) 3,238万円\n- [選挙管理委員会運営経費](/tokyo/edogawa/projects/8f79b113f8b2f72ce73b267d3af187f7b9cebd1d370e041426ee5f88c6b1191d) 1,322万円\n- [選挙管理委員会事務経費](/tokyo/edogawa/projects/bb38ff89da2658a4babdfcb363d2d65310260197ccefdd41119d9c04d5ca3f84) 1,078万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "区の予算は、**区長が案をつくり、区議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも区議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと区議会が認定します。江戸川区のR8年度の一般会計の当初予算は 3,635億円 です。",
      "source": "地方自治法の定めと、江戸川区のR8年度 当初予算書",
      "follow": [
        "left",
        "区議会ではどんな議論があった？"
      ]
    }
  ]
}
