// まちのレシートの頁。緑の札で予算と1人あたりを数え上げ、分野ごとの1人あたりのレシートを刷り出す（receipt/receipt.tsx）。
// 年度は loader が決めた一つだけを出し、札の上で切り替えない（2026-11-20 yuito「年度と詳細とか入れなくて良い」）。
// レシートの末端まで頁が送られたら、他のまちを探す節を出す
import * as React from 'react'
import { ReceiptMachine } from '../receipt/receipt'
import { Emblem } from '../components/parts'
import { Title } from '../components/title'
import { Footer, Intro } from '../components/intro'
import { TownSearch } from '../components/town-search'
import { yearView } from '../lib/fudoki'
import type { Props } from './[code].server'

export default function TownPage({ d, town }: Props) {
  const v = yearView(d)
  // 風土記の本体での、そのまちのその年度の path（分野の事業へのリンクに使う）
  const base = `${town.path}/${d.year}`
  const [printed, setPrinted] = React.useState(false)
  return (
    <>
      <Intro />
      {/* 刷り出すレシートの場所を、はじめから画面1.5枚ぶん取っておき、刷り終える前に頁の末尾が見えないようにする */}
      <div className="min-h-[150svh]">
        <ReceiptMachine
          key={town.code}
          onPrinted={() => setPrinted(true)}
          path={`/${town.code}`}
          name={town.name}
          kind={town.kind}
          v={v}
          year={d.year}
          pop={d.pop || null}
          base={base}
          head={
            <div className="flex items-center gap-4">
              <Emblem code={town.code} name={town.name} className="size-14 rounded-2xl border-0 p-2" />
              <div className="min-w-0 flex-1">
                <Title size="h1" as="h1">{town.name}</Title>
              </div>
            </div>
          }
        />
        {/* 人口が無くレシートを刷れないまちは、札の下にそう出す */}
        {!d.pop ? <p className="mt-4 text-sm text-muted-foreground">このまちは人口を収録していないので、1人あたりのレシートを出せません。</p> : null}
        {printed || !d.pop ? (
          <section className="ob-rise mt-16" aria-labelledby="other-towns">
            <Title size="h2" id="other-towns" className="mb-4">他のまちの使い道を見る</Title>
            <TownSearch placeholder="他のまちを探す" />
          </section>
        ) : null}
      </div>
      <Footer />
    </>
  )
}
