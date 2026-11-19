// 栃木市の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
import type { QuestionFeed } from '../types'

export const feed: QuestionFeed = {
  "order": [
    "grow",
    "new",
    "senkyo",
    "yosan"
  ],
  "questions": [
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+29.6億円",
        "note": "栃木文化会館施設整備事業費（R6年度 → R8年度）"
      },
      "answer": "R6年度とR8年度の当初予算を比べると、いちばん増えたのは [栃木文化会館施設整備事業費](/tochigi/tochigi/projects/82dab045d69728fd41f5f097d1bcc1559158f8860156f628fc773cf15c576b03) で、2,906万円 から **29.9億円** になりました。増えた額の大きい順に3つです。\n\n- [栃木文化会館施設整備事業費](/tochigi/tochigi/projects/82dab045d69728fd41f5f097d1bcc1559158f8860156f628fc773cf15c576b03) 2,906万円 → 29.9億円（+29.6億円）\n- [(仮称)栃木東地域学校給食センター整備事業費](/tochigi/tochigi/projects/cf1b20df5e08357f554acb0f2feec323583cc8564191d16c7b9254827effffe3) 1,346万円 → 12.1億円（+11.9億円）\n- [中小企業向け資金融資預託金](/tochigi/tochigi/projects/d843a63d01515a596c3e89d6a78f858b1114abaad524863ba8b5f85b8d441369) 16.7億円 → 28.3億円（+11.6億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R6年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "栃木文化会館施設整備事業費はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "75件",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**75件**載りました。金額の大きい順に6つです。\n\n- [会計年度任用職員人件費(人事課)](/tochigi/tochigi/projects/624fee7d1f0bb886e7b964bc0738e714611d7a845a4357e2320b819e5b44018c) 1.2億円\n- [防災重点農業用ため池整備事業費](/tochigi/tochigi/projects/d90961066844b1af1fbee4c8491f2e4c4c0e61f76f98530d9f7ad59fc5b5129a) 9,331万円\n- [栃木北中学校スクールバス運行事業費](/tochigi/tochigi/projects/12652051a65959d35af84598a00c8f1f7d79fb0b7be7e8852351def3f1e27e3c) 8,738万円\n- [中学校屋内運動場空調設備管理費](/tochigi/tochigi/projects/7be889dbf9004b53dca0ecdf267049623cb9d6de8cb7dfcfe6b483a918128c65) 7,218万円\n- [市道1066号線道路改良事業費(藤岡富吉1区)](/tochigi/tochigi/projects/24ce9cc5f063829f2f626e8b3c9044063644beb0be7ee37cf2227c9013c7987f) 4,200万円\n- [地球温暖化対策基金積立金](/tochigi/tochigi/projects/6dfc3ccad080d7fb1afb716e9e9591c84873974369f8527d55031355f4c7f634) 3,935万円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "会計年度任用職員人件費(人事課)では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "2.1億円",
        "note": "市民1人あたり 約1,360円"
      },
      "answer": "R8年度の当初予算の選挙費は **2.1億円** です。市民1人あたりにすると**約1,360円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [市長及び市議会議員選挙費](/tochigi/tochigi/projects/a2208bc0d4f3860cb7c86b1685ea4187c99480bfa3f40272a1aba4160f7b4a14) 1.5億円\n- [職員人件費3人](/tochigi/tochigi/projects/fbbfe74b4199a70f2010a3847f0d1ca91cfa104a80a54626cf86037f445b8c57) 3,018万円\n- [県議会議員選挙費](/tochigi/tochigi/projects/bc8289c04842211d87ed2bd6ac40a6b78229d373df105f449c50e4888238f81a) 2,132万円\n- [選挙管理委員会運営費](/tochigi/tochigi/projects/0a9606ce69f5bfd1c6f38dd6d39592b33f37369c99dd852095b086ccced834ec) 804万円\n- [選挙啓発費](/tochigi/tochigi/projects/968d57d346ade299d4af8df9de39fb390932c6d84da19142ca69bd55bf364c3f) 25万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "市の予算は、**市長が案をつくり、市議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも市議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと市議会が認定します。栃木市のR8年度の一般会計の当初予算は 770億円 です。",
      "source": "地方自治法の定めと、栃木市のR8年度 当初予算書",
      "follow": [
        "市議会ではどんな議論があった？"
      ]
    }
  ]
}
