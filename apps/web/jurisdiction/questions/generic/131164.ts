// 豊島区の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
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
        "value": "1,497億円",
        "note": "R6年度に使ったお金（当初予算 1,529億円）"
      },
      "answer": "R6年度の一般会計では、当初予算 **1,529億円** に対して、決算で使ったのは **1,497億円** でした。当初予算より 32.4億円 少なく使っています。\n\n使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。",
      "source": "R6年度 当初予算書・決算書（一般会計）",
      "follow": [
        "どの事業で予算が余った？"
      ]
    },
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+39.3億円",
        "note": "南池袋二丁目C地区市街地再開発事業経費（R5年度 → R8年度）"
      },
      "answer": "R5年度とR8年度の当初予算を比べると、いちばん増えたのは [南池袋二丁目C地区市街地再開発事業経費](/tokyo/toshima/projects/048309915caeb6caf79d586ce6d46d07eb9e2989bfad7333c70833b19f13228b) で、25億円 から **64.3億円** になりました。増えた額の大きい順に3つです。\n\n- [南池袋二丁目C地区市街地再開発事業経費](/tokyo/toshima/projects/048309915caeb6caf79d586ce6d46d07eb9e2989bfad7333c70833b19f13228b) 25億円 → 64.3億円（+39.3億円）\n- [義務教育施設整備基金積立金](/tokyo/toshima/projects/c22d795785fac011f94bd0e7fc983bab7b7a2c70df2a09003a6abc7bab191d2e) 15.6億円 → 50.2億円（+34.5億円）\n- [公共施設再構築基金積立金](/tokyo/toshima/projects/d21b092efecc9f41a8e177573c2c0e868b6e0a2d2ac23f96932b0fe7ea294d29) 7.4億円 → 40億円（+32.6億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R5年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "南池袋二丁目C地区市街地再開発事業経費はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "171件",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**171件**載りました。金額の大きい順に6つです。\n\n- [池袋駅西口地区市街地再開発事業経費〔新規〕](/tokyo/toshima/projects/ba35e90c69aa73f2e0edebde7d5fb6a8dcf851501db534bae45ef79ef235b74f) 13.3億円\n- [不燃化推進事業経費](/tokyo/toshima/projects/cc49c10f92796b1de535a561fa967eac18a6ca68a47767f4c1a9f9b08f97f901) 11.7億円\n- [地域区民ひろば施設整備経費](/tokyo/toshima/projects/b129df3dd8b2f3a2d0ff2590489224abcc6c17a614e6a262cb4c25cfcc9ba9e6) 10億円\n- [自転車駐車場管理運営事業経費](/tokyo/toshima/projects/8c7684b4666e49a3d13890371940fbf848a0dd5e23d6a6fb2a8cdcd01cde1ec5) 5.2億円\n- [障害者福祉施設改修経費](/tokyo/toshima/projects/f922c31f20faa95b7efc5e3d8b6c20b8af33d45d351380379bd8c15d299648ae) 5.1億円\n- [地域包括支援センター運営事業経費](/tokyo/toshima/projects/71390d47b4290dd451c674f6f24372f12207c48be0d93a6372743772089fe4cd) 4.2億円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "池袋駅西口地区市街地再開発事業経費〔新規〕では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "1.1億円",
        "note": "区民1人あたり 約380円"
      },
      "answer": "R8年度の当初予算の選挙費は **1.1億円** です。区民1人あたりにすると**約380円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [職員関係経費[6人分]](/tokyo/toshima/projects/6966762200c48975abca40ac9ec5cbbccf6245936ee03572a7265a8e92ca17ca) 6,533万円\n- [一般事務経費](/tokyo/toshima/projects/d7949b054da3c00f605e402d281a29b472dc06da733bfa562158801152052e6b) 1,921万円\n- [区議会・区長選挙準備経費](/tokyo/toshima/projects/62a00a40c242c7b764fcbbaf33393c05b4469c03e9ad23ecc42bd8a679955634) 1,269万円\n- [選挙管理委員会費](/tokyo/toshima/projects/4d5291a890b7fcef3a291e18205b8df2dbc23d92ecad637ae2dc6729dd69eac5) 1,247万円\n- [選挙啓発経費](/tokyo/toshima/projects/07d27a75ec5b552a5722cf90bc8b7da8ca136c87ff0c429a295b68153ee4ddaa) 173万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "区の予算は、**区長が案をつくり、区議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも区議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと区議会が認定します。豊島区のR8年度の一般会計の当初予算は 1,690億円 です。",
      "source": "地方自治法の定めと、豊島区のR8年度 当初予算書",
      "follow": [
        "left",
        "区議会ではどんな議論があった？"
      ]
    }
  ]
}
