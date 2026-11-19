// 神戸市の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）
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
        "value": "10,275億円",
        "note": "R7年度に使ったお金（当初予算 10,059億円）"
      },
      "answer": "R7年度の一般会計では、当初予算 **10,059億円** に対して、決算で使ったのは **10,275億円** でした。年度の途中の補正予算で予算が増え、当初予算より 216億円 多く使っています。\n\n使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。",
      "source": "R7年度 当初予算書・決算書（一般会計）",
      "follow": [
        "どの事業で予算が余った？"
      ]
    },
    {
      "id": "grow",
      "q": "ここ数年で、いちばん増えた事業は？",
      "big": {
        "value": "+98.7億円",
        "note": "障害福祉サービス等（R6年度 → R8年度）"
      },
      "answer": "R6年度とR8年度の当初予算を比べると、いちばん増えたのは [障害福祉サービス等](/hyogo/kobe/projects/c6e0db711c40eba4f2f513643d5cd7117adddaac3a68c3aec9b2f3b6b3e14de7) で、427億円 から **526億円** になりました。増えた額の大きい順に3つです。\n\n- [障害福祉サービス等](/hyogo/kobe/projects/c6e0db711c40eba4f2f513643d5cd7117adddaac3a68c3aec9b2f3b6b3e14de7) 427億円 → 526億円（+98.7億円）\n- [公園再整備などの実施設計・調査等](/hyogo/kobe/projects/e854a0645bdc45099d2cf32ed2a552c65cef877dccd239bd35ee98501a01643e) 1.1億円 → 37.8億円（+36.8億円）\n- [文化施設の再整備等](/hyogo/kobe/projects/dd768127c8faa8688efd33973a92077e5263d889551e30969e6eb239918dea62) 51.5億円 → 85.1億円（+33.6億円）\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。",
      "source": "R6年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "new",
        "障害福祉サービス等はなぜ増えた？"
      ]
    },
    {
      "id": "new",
      "q": "新しく始まった事業は？",
      "big": {
        "value": "87件",
        "note": "新しく予算書に載った事業"
      },
      "answer": "R8年度の予算書には、前の年度に無かった事業が**87件**載りました。金額の大きい順に6つです。\n\n- [職員手当等](/hyogo/kobe/projects/caa4c25a97bf1452889320ec6a66a204919ddf37fb4b014292136720e48c1a58) 74億円\n- [給料](/hyogo/kobe/projects/7fc23ad400ae282f7d91c0b5a41866ec0e3ec2d31c5e26c2823c334d11fc26a4) 64億円\n- [ふるさと納税と企業連携の推進](/hyogo/kobe/projects/41bce8969bce5b88673b5ba32a6b45e3a2d975501f2309b9a6211a15c2f6bf8b) 35.2億円\n- [学習用タブレット・ICT環境整備等](/hyogo/kobe/projects/9cf2f884da42e5004831c4cfb17f92898dcb5c2755c2c6a68ea46d3ad9d4ef04) 33.9億円\n- [東クリーンセンター基幹的設備改良工事](/hyogo/kobe/projects/a55c383484872a53d2c6eb165379b85e9cd3fa6e3fa30ea204f3f6f4edf6ae23) 30.9億円\n- [橋梁整備等(駒栄橋等)](/hyogo/kobe/projects/2b1be89afefcc860319c55889a0ab9267074b5762d5403a7da5ad25a62a28cdc) 28億円\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。",
      "source": "R7年度・R8年度 当初予算書（一般会計）",
      "follow": [
        "grow",
        "職員手当等では何をする？"
      ]
    },
    {
      "id": "senkyo",
      "field": "gyosei",
      "q": "選挙に、いくら？",
      "big": {
        "value": "5.8億円",
        "note": "市民1人あたり 約390円"
      },
      "answer": "R8年度の当初予算の選挙費は **5.8億円** です。市民1人あたりにすると**約390円**です。選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。\n\n主な中身は次のとおりです。\n\n- [ポスター掲示場経費](/hyogo/kobe/projects/3dfb24ae10c3b52c5f4cc4a774b9bc390838610b9c3cd9ff3a39f4803a7bb008) 1.6億円\n- [投票のご案内経費](/hyogo/kobe/projects/d236a844a8762bea6bff5c109931636bd104c2f1726247c1fc57b611ad3cb0eb) 9,244万円\n- [事務費](/hyogo/kobe/projects/f68721ec5bcd5439b59b71c6e11dd686ddd5975c6f974d3e6dfda9c3d147a8c9) 4,573万円\n- [投票所経費](/hyogo/kobe/projects/6fed3b74af45e1ba9c2a1462702412f65aa8e0ce22db9894f7b7cbc2c70bc08c) 1,788万円\n- [不在者・期日前投票経費](/hyogo/kobe/projects/ad3a2d2756bb720f6022d0926b7c39ff8edd9b6cd041e8e156dd22cf64259413) 1,445万円",
      "source": "R8年度 当初予算書（一般会計・選挙費）",
      "follow": [
        "yosan",
        "投票率はどのくらい？"
      ]
    },
    {
      "id": "yosan",
      "q": "予算って、誰がどうやって決めるの？",
      "answer": "市の予算は、**市長が案をつくり、市議会が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも市議会の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと市議会が認定します。神戸市のR8年度の一般会計の当初予算は 9,778億円 です。",
      "source": "地方自治法の定めと、神戸市のR8年度 当初予算書",
      "follow": [
        "left",
        "市議会ではどんな議論があった？"
      ]
    }
  ]
}
