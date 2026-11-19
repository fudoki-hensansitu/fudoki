// 世田谷区の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
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
        "value": "3,890億円",
        "note": "R6年度に使ったお金（当初予算 3,716億円）"
      },
      "answer": "R6年度の一般会計では、当初予算 **3,716億円** に対して、決算で使ったのは **3,890億円** でした。年度の途中の補正予算で予算が増え、当初予算より 174億円 多く使っています。\n\n使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。",
      "source": "R6年度 当初予算書・決算書（一般会計）",
      "follow": [
        "どの事業で予算が余った？"
      ]
    },
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+164億円",
        "note": "児童措置事業費（R5年度 → R8年度）"
      },
      "answer": "R5年度とR8年度の当初予算を比べると、いちばん増えたのは [児童措置事業費](/tokyo/setagaya/projects/e69e8648b19894ed2b7c92c203cf3fcd4302ba5e7577a843ed0ac1ab12d37d2e) で、535億円 から **699億円** になりました。増えた額の大きい順に3つです。\n\n- [児童措置事業費](/tokyo/setagaya/projects/e69e8648b19894ed2b7c92c203cf3fcd4302ba5e7577a843ed0ac1ab12d37d2e) 535億円 → 699億円（+164億円）\n- [総務関係事務従事職員の人件費](/tokyo/setagaya/projects/45cc07f7b5b6313256d20383699550fd634da30da449749e2300e5c39ab0712e) 170億円 → 252億円（+82.2億円）\n- [児童福祉事務運営費](/tokyo/setagaya/projects/4018788d85f0873ab8cb2f122dde6ed8b55936c493157a3d76f3d1506c71fc2d) 91.1億円 → 161億円（+69.6億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R5年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "児童措置事業費はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "7つ",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**7つ**載りました。金額の大きい順に6つです。\n\n- [学校給食管理費](/tokyo/setagaya/projects/32e7d94c5a56e91663b8a9e150285ac15ed447c52cc6670ab2c1cc719269760a) 92.6億円\n- [移動教室及び夏・冬季施設行事費](/tokyo/setagaya/projects/eddf120f5d9ef1fab6b900dadf5aad377416ea7e8cf8c80552ca6281866c2b0b) 1.4億円\n- [児童福祉事務運営費(2)](/tokyo/setagaya/projects/50e55ec00b40994c686f2b5250af84089df4aa85f48e9dee8d6bf4e364ef900b) 1.2億円\n- [移動教室及び夏・冬季施設行事費](/tokyo/setagaya/projects/7efb61d900998e567c4fe30b154bb262401c4423b2682af2871e105892835885) 1億円\n- [林間学園施設維持管理費](/tokyo/setagaya/projects/c63b7272fd8bf84ae4efa66e1960b8c4efd04f27c46b402ee31202feb4e0083b) 9,751万円\n- [区立認定こども園整備費](/tokyo/setagaya/projects/7b19374960cac3f9c203dcc0b1f837bcbbf60a093a578b55e29be4ed316d118a) 2,289万円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "学校給食管理費では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "5,726万円",
        "note": "区民1人あたり 約60円"
      },
      "answer": "R8年度の当初予算の選挙費は **5,726万円** です。区民1人あたりにすると**約60円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [地方選挙執行経費](/tokyo/setagaya/projects/d72da2cc2012e0d89dd987c2285d8987ac4af933108a43a4cfb60f0aa109652f) 3,962万円\n- [選挙管理委員会委員報酬](/tokyo/setagaya/projects/645c1a44d390c0db2f2bda9276ce44cd43982dac06fe638b5a8a7967b753813d) 1,216万円\n- [明るい選挙常時啓発費](/tokyo/setagaya/projects/13b511c518ea541df962a9bc3d7bd141f0eaea79558eaeec6f48a133c54f759a) 386万円\n- [選挙管理委員会事務運営費](/tokyo/setagaya/projects/67647106191c88293d9c32e8c5a7aa1a5b5ff97212af379816acbde243e08bef) 162万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "区の予算は、**区長が案をつくり、区議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも区議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと区議会が認定します。世田谷区のR8年度の一般会計の当初予算は 4,314億円 です。",
      "source": "地方自治法の定めと、世田谷区のR8年度 当初予算書",
      "follow": [
        "left",
        "区議会ではどんな議論があった？"
      ]
    }
  ]
}
