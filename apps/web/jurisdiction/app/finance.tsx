// まとめタブの財政の状況（借金と貯金・事業に使えるお金・ほかの数字）。総務省「市町村別決算状況調」の普通会計（PageData.finance）から描く。
// 開いた年度までの最新の決算の年度を出し、推移はそこまでの5年。評価の言葉や色は付けず、項目の意味だけを書く
import * as React from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { reiwa, type LocalFinance } from '../types'
import { Amt, yenParts } from './amount'

const YEARS = 5
const r = (y: number) => `R${y - 2018}`
const okuText = (yen: number) => yenParts(yen).join('').replace(/円$/, '')
const pctText = (n: number) => `${n.toFixed(1)}%`

/** 時点の札（年度・資料・出典） */
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border bg-background px-2.5 text-xs text-muted-foreground">{children}</span>
}

function Head({ title, term, tag }: { title: string; term?: string; tag: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[17px] font-semibold">
        {title}
        {term ? <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">{term}</span> : null}
      </h2>
      {tag}
    </div>
  )
}

/** 5年の推移。増減に色を付けず、両端に年度と値を書く。横は % で置き、置いた枠の幅に伸ばしても線と点を歪めない（full は列の幅いっぱい） */
function Spark({ points, format, zero, full }: { points: { year: number; v: number }[]; format: (n: number) => string; zero?: boolean; full?: boolean }) {
  if (points.length < 2) return null
  const h = 44
  const pad = 6
  const vs = points.map((p) => p.v)
  const lo = zero ? Math.min(0, ...vs) : Math.min(...vs)
  const hi = Math.max(...vs)
  const x = (i: number) => `${((i * 100) / (points.length - 1)).toFixed(2)}%`
  const y = (n: number) => (hi === lo ? h / 2 : h - pad - ((n - lo) / (hi - lo)) * (h - pad * 2))
  const first = points[0]!
  const last = points.at(-1)!
  return (
    <figure className={`m-0 flex flex-col gap-0.5 ${full ? 'w-full' : 'w-[168px] self-start'}`}>
      <svg width="100%" height={h} aria-hidden="true" className="block overflow-visible">
        {points.slice(1).map((p, i) => (
          <line key={p.year} x1={x(i)} y1={y(points[i]!.v)} x2={x(i + 1)} y2={y(p.v)} stroke="var(--primary)" strokeWidth={1.75} strokeLinecap="round" />
        ))}
        {points.map((p, i) => {
          const end = i === points.length - 1
          return <circle key={p.year} cx={x(i)} cy={y(p.v)} r={end ? 3 : 1.75} fill={end ? 'var(--primary)' : 'var(--background)'} stroke="var(--primary)" strokeWidth={1.25} />
        })}
      </svg>
      <figcaption className="flex justify-between gap-2 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        <span>{r(first.year)} {format(first.v)}</span>
        <span>{r(last.year)} {format(last.v)}</span>
      </figcaption>
    </figure>
  )
}

const series = (rows: LocalFinance[], pick: (f: LocalFinance) => number | null) => rows.flatMap((f) => {
  const v = pick(f)
  return v == null ? [] : [{ year: f.year, v }]
})

/** 義務的経費（扶助費・人件費・公債費）の和。どれかが欠けた年度は null */
const dutyOf = (f: LocalFinance) => (f.socialAssistance == null || f.personnel == null || f.debtService == null ? null : f.socialAssistance + f.personnel + f.debtService)
const freeOf = (f: LocalFinance) => {
  const duty = dutyOf(f)
  return duty == null || f.expenditureTotal == null ? null : f.expenditureTotal - duty
}

function PerHead({ yen, people }: { yen: number; people: number | null }) {
  if (!people) return null
  return (
    <p className="text-[13px] text-muted-foreground">
      1人あたり <Amt yen={yen / people} />
    </p>
  )
}

function DebtSide({ label, term, yen, people, spark, children, say }: { label: string; term: string; yen: number; people: number | null; spark: React.ReactNode; children?: React.ReactNode; say: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-base font-medium">
        {label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{term}</span>
      </p>
      <Amt yen={yen} className="text-[28px] text-primary" />
      <div className="mb-1.5"><PerHead yen={yen} people={people} /></div>
      {spark}
      {children}
      <p className="mt-1.5 text-sm leading-[1.7] text-muted-foreground">{say}</p>
    </div>
  )
}

function DebtAndFunds({ at, rows, people }: { at: LocalFinance; rows: LocalFinance[]; people: number | null }) {
  if (at.localBondBalance == null || at.fundBalance == null) return null
  const kinds = [
    ['財政調整基金', at.fiscalAdjustmentFund],
    ['減債基金', at.debtReductionFund],
    ['その他特定目的基金', at.specifiedPurposeFund],
  ] as const
  return (
    <div className="grid gap-5 @xl:grid-cols-2 @xl:gap-0">
      <div className="@xl:pr-6">
        <DebtSide label="借金" term="地方債現在高" yen={at.localBondBalance} people={people} spark={<Spark points={series(rows, (f) => f.localBondBalance)} format={okuText} full />}
          say="地方債は、自治体が学校・道路・ごみ処理施設など長く使うものを建てるときに借りるお金です。何十年かけて返すので、その施設を使う世代みんなで負担します。地方債現在高は、年度末にまだ返していない残りの額です。" />
      </div>
      <div className="border-t pt-5 @xl:border-t-0 @xl:border-l @xl:pt-0 @xl:pl-6">
        <DebtSide label="貯金" term="基金" yen={at.fundBalance} people={people} spark={<Spark points={series(rows, (f) => f.fundBalance)} format={okuText} full />}
          say="基金は、自治体が目的を決めて積み立てているお金です。使い道を決めていない財政調整基金は、災害や税収が減った年に取り崩します。ほかに、借金の返済や施設の建て替えなどに充てる基金があります。">
          <ul className="mt-2 max-w-[360px] border-t">
            {kinds.map(([name, yen]) => (
              <li key={name} className="flex justify-between gap-3 border-b py-1.5 text-sm">
                <span>{name}</span>
                <Amt yen={yen} />
              </li>
            ))}
          </ul>
        </DebtSide>
      </div>
    </div>
  )
}

function Tile({ label, yen, sub, on }: { label: string; yen: number; sub?: string; on?: boolean }) {
  return (
    <div data-on={on || undefined} className="flex flex-col gap-0.5 rounded-xl border bg-background px-3 py-2.5 data-on:border-primary data-on:bg-accent">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <Amt yen={yen} className={on ? 'text-[28px] text-primary' : 'text-lg'} />
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  )
}

/** 毎年決まって出ていくお金の3つの塗り。分類を見分けるだけで良し悪しを表さないので、ブランドの緑を使わず生成りと灰の濃さで分ける */
const DUTY_FILLS = ['bg-muted-foreground', 'bg-paper', 'bg-border']

/** 歳出の内訳の帯。切れの間を空けて境を見せ、名前と割合は帯の下の凡例に書く（細い切れにも書けるように） */
function ShareBar({ total, parts }: { total: number; parts: { name: string; yen: number; fill: string }[] }) {
  const pct = (yen: number) => `${((yen / total) * 100).toFixed(1)}%`
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-7 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label={`歳出の内訳: ${parts.map((p) => `${p.name} ${pct(p.yen)}`).join('、')}`}>
        {parts.map((p) => (p.yen > 0 ? <span key={p.name} className={`min-w-0.5 ${p.fill}`} style={{ flex: p.yen }} /> : null))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm" aria-hidden="true">
        {parts.map((p, i) => (
          <li key={p.name} className="flex items-center gap-1.5">
            <span className={`size-3 shrink-0 rounded-sm ${p.fill}`} />
            <span className={i === 0 ? 'text-foreground' : 'text-muted-foreground'}>{p.name}</span>
            <span className={`tabular-nums ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`}>{pct(p.yen)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FreeMoney({ at, rows, people }: { at: LocalFinance; rows: LocalFinance[]; people: number | null }) {
  const duty = dutyOf(at)
  const free = freeOf(at)
  if (duty == null || free == null || at.expenditureTotal == null) return null
  const parts = [['扶助費', at.socialAssistance], ['人件費', at.personnel], ['公債費', at.debtService]] as const
  const op = (c: string) => <span className="grid place-items-center text-xl text-muted-foreground" aria-hidden="true">{c}</span>
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid items-stretch gap-2 @3xl:grid-cols-[1.2fr_24px_1fr_24px_1fr]">
        <Tile on label="事業に回るお金" yen={free} {...(people ? { sub: `1人あたり ${yenParts(free / people).join('')}` } : {})} />
        {op('=')}
        <Tile label="使ったお金（歳出）" yen={at.expenditureTotal} />
        {op('−')}
        <Tile label="毎年決まって出ていくお金" yen={duty} sub={parts.map(([n, y]) => `${n} ${okuText(y ?? 0)}`).join('・')} />
      </div>
      <ShareBar total={at.expenditureTotal} parts={[
        { name: '事業に回るお金', yen: free, fill: 'bg-primary' },
        ...parts.map(([name, yen], i) => ({ name, yen: yen ?? 0, fill: DUTY_FILLS[i]! })),
      ]} />
      <p className="text-sm leading-[1.7] text-muted-foreground">毎年決まって出ていくのは、法律で決まった給付（扶助費）、職員の給与（人件費）、借金の返済（公債費）の3つ（義務的経費）。残りが、学校や道路をつくる・直す、委託や補助金など、自治体が年ごとに決める事業に回ります。ただし国保などの会計への繰出金のように、この中にも毎年続くものがあります。</p>
    </div>
  )
}

const ratio = (n: number | null) => (n == null ? '－' : pctText(n))

function OtherNumbers({ at, rows }: { at: LocalFinance; rows: LocalFinance[] }) {
  const items: { key: string; name: string; term: string; answer: React.ReactNode; body: React.ReactNode }[] = []
  const row = (body: string, spark: React.ReactNode) => (
    <div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:gap-10">
      <p>{body}</p>
      {spark}
    </div>
  )
  const n = (text: string, unit?: string) => (
    <span className="tabular-nums">
      {text}
      {unit ? <small className="ml-px text-[0.6em]">{unit}</small> : null}
    </span>
  )
  if (at.currentBalanceRatio != null)
    items.push({ key: 'current', name: '経常収支比率', term: '毎年入るお金のうち、毎年決まって出ていくお金に回った割合', answer: n(at.currentBalanceRatio.toFixed(1), '%'),
      body: row('税金など毎年入るお金のうち、人件費・扶助費・公債費など毎年出ていくお金に回った割合。残りが、新しい事業や建設に回せる分です。', <Spark points={series(rows, (f) => f.currentBalanceRatio)} format={pctText} />) })
  if (at.fiscalCapabilityIndex != null)
    items.push({ key: 'capability', name: '財政力指数', term: '仕事に要るお金を、自分の税収などでどれだけ賄えるか', answer: n(at.fiscalCapabilityIndex.toFixed(2)),
      body: row('1 なら、標準的な仕事を自治体の税収などだけで賄えます。1 に足りない分は国の地方交付税で埋めます（直近3年の平均）。', <Spark points={series(rows, (f) => f.fiscalCapabilityIndex)} format={(v) => v.toFixed(2)} />) })
  if (at.realBalance != null)
    items.push({ key: 'balance', name: '実質収支', term: '1年の収入から支出と翌年度に回す分を引いた残り', answer: <Amt yen={at.realBalance} />,
      body: row(`入ったお金から使ったお金と翌年度に回す分を引いた残り。${at.realBalanceRatio != null ? `標準財政規模（自治体が標準的に見込める1年の収入）の ${at.realBalanceRatio.toFixed(1)}% です。` : ''}`, <Spark points={series(rows, (f) => f.realBalance)} format={okuText} zero />) })
  const kenzen = [
    ['実質赤字比率', at.realDeficitRatio, '一般会計などの赤字の大きさ'],
    ['連結実質赤字比率', at.consolidatedRealDeficitRatio, '国保・下水道なども合わせた赤字の大きさ'],
    ['実質公債費比率', at.realDebtServiceRatio, '毎年の借金の返済の重さ'],
    ['将来負担比率', at.futureBurdenRatio, '将来払うお金の重さ'],
  ] as const
  items.push({ key: 'kenzen', name: '健全化判断比率', term: '法律で毎年公表する、赤字や借金の重さの4つの比率', answer: at.realDebtServiceRatio != null ? <>実質公債費比率 {n(at.realDebtServiceRatio.toFixed(1), '%')}</> : null,
    body: (
      <>
        <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
          {kenzen.map(([name, v, means]) => (
            <div key={name} className="flex flex-col gap-0.5 rounded-xl border bg-background p-3">
              <span className="text-[22px] tabular-nums text-foreground">{ratio(v)}</span>
              <span className="text-[13px] font-medium text-foreground">{name}</span>
              <span className="text-xs leading-normal">{means}</span>
            </div>
          ))}
        </div>
        <p className="mt-2.5">「－」は、その比率が計算上ゼロ以下で数字が出ないこと（赤字が無い、将来払うお金よりそのための備えが多い）。法律（財政健全化法）で毎年公表する4つの数字です。</p>
      </>
    ) })
  return (
    <Accordion multiple className="border-t">
      {items.map((x) => (
        <AccordionItem key={x.key} value={x.key} className="border-b">
          <AccordionTrigger className="items-center gap-4 rounded-none px-2.5 py-4 hover:bg-card hover:no-underline">
            {/* 狭い画面は値を名前の下に置き、名前を押しつぶさない */}
            <span className="flex min-w-0 flex-1 flex-col gap-1 @xl:flex-row @xl:items-center @xl:gap-4">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-medium">{x.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{x.term}</span>
              </span>
              {x.answer ? <span className="shrink-0 text-xl font-normal text-primary @xl:text-right">{x.answer}</span> : null}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-2.5 pb-[18px] text-[15px] leading-[1.7] text-muted-foreground">{x.body}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

/** 開いた年度までの最新の決算の年度の、借金と貯金・事業に使えるお金・ほかの数字。決算状況調に載らない自治体（都道府県）は何も出さない */
export function FinanceSections({ finance, year, people }: { finance: LocalFinance[] | undefined; year: number; people: number | null }) {
  const upTo = (finance ?? []).filter((f) => f.year <= year)
  const at = upTo.at(-1)
  if (!at) return null
  const rows = upTo.slice(-YEARS)
  const tag = <Tag>{reiwa(at.year)} 決算 · 普通会計 · 総務省</Tag>
  const card = 'rounded-2xl bg-card p-5'
  return (
    <>
      <section>
        <Head title="借金と貯金" tag={tag} />
        <div className={card}><DebtAndFunds at={at} rows={rows} people={people} /></div>
      </section>
      <section>
        <Head title="事業に使えるお金" tag={tag} />
        <div className={card}><FreeMoney at={at} rows={rows} people={people} /></div>
      </section>
      <section>
        <Head title="ほかの数字をくわしく" tag={tag} />
        <OtherNumbers at={at} rows={rows} />
      </section>
    </>
  )
}
