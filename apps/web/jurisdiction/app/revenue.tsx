// まとめタブの「何で賄う？」。一般会計の歳入（PageData.revenue）を、まちの税・国・〇から配られるお金と款の内訳で描く。
// 区分は風土記の判断（api の fiscal_revenue_category）。評価の言葉や色は付けず、項目の意味だけを書く
import * as React from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type { RevenueCategory, RevenueDoc } from '../types'
import { Amt } from './amount'
import { Tag } from './finance'

const r = (y: number) => `R${y - 2018}`

/** 開いた年度の、まとめと同じ資料（無ければもう一方）の歳入 */
function pick(revenue: RevenueDoc[], year: number, kind: RevenueDoc['kind']): RevenueDoc | undefined {
  const ofYear = revenue.filter((d) => d.year === year && d.total > 0)
  return ofYear.find((d) => d.kind === kind) ?? ofYear[0]
}

const sumOf = (doc: RevenueDoc, category: RevenueCategory) => doc.kan.reduce((s, k) => s + (k.category === category ? (k.yen ?? 0) : 0), 0)

function Highlight({ title, yen, total, note }: { title: string; yen: number; total: number; note: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <Amt yen={yen} className="text-[26px] leading-none font-semibold text-primary" />
        <span className="text-sm tabular-nums text-muted-foreground">{((yen / total) * 100).toFixed(1)}%</span>
      </p>
      <p className="mt-2 text-[13px] leading-[1.7] text-muted-foreground">{note}</p>
    </div>
  )
}

function KanRow({ name, yen, total, max, i }: { name: string; yen: number; total: number; max: number; i: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-2.5 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_4.5rem]">
      <span className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
        <span className="block truncate text-base font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground"><Amt yen={yen} /></span>
      </span>
      <span className="col-span-2 col-start-1 row-start-2 block h-1.5 overflow-hidden rounded-full bg-secondary sm:col-span-1 sm:col-start-auto sm:row-start-auto">
        <span className="app-grow block h-full rounded-full bg-primary" style={{ width: `${Math.max(1, (yen / max) * 100)}%`, animationDelay: `${i * 30}ms` }} />
      </span>
      <span className="col-start-2 row-start-1 text-right text-[17px] tabular-nums sm:col-start-auto sm:row-start-auto">
        {((yen / total) * 100).toFixed(1)}
        <small className="text-xs text-muted-foreground">%</small>
      </span>
    </div>
  )
}

/** 歳入の無い年度は節ごと出さない（まとめの一節なので「未収録」の札は出さない） */
export function RevenueSection({ revenue, year, kind, prefecture }: { revenue: RevenueDoc[] | undefined; year: number; kind: RevenueDoc['kind']; prefecture: string }) {
  const doc = pick(revenue ?? [], year, kind)
  if (!doc) return null
  const word = doc.kind === 'settlement' ? '決算' : '当初予算'
  // 国・〇の〇は都道府県の名前の末尾（都・道・府・県）
  const from = `国・${prefecture.slice(-1)}`
  const kan = doc.kan.filter((k): k is typeof k & { yen: number } => k.yen != null && k.yen > 0).sort((a, b) => b.yen - a.yen)
  const max = Math.max(...kan.map((k) => k.yen))
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">
          何で賄う？<span className="ml-1.5 text-[13px] font-normal text-muted-foreground">歳入</span>
          <Amt yen={doc.total} className="ml-2 font-medium text-primary" />
        </h2>
        <Tag>{r(doc.year)} {word}</Tag>
      </div>
      <p className="-mt-1 mb-3 text-[15px] leading-[1.7] text-muted-foreground">
        {doc.kind === 'settlement'
          ? '歳入は、自治体に1年間に入ったお金です。ここでは、基本の会計（一般会計）の決算を、入ったお金の種類（款）ごとに分けています。'
          : '歳入は、自治体に1年間に入る予定のお金です。ここでは、基本の会計（一般会計）の当初予算を、入るお金の種類（款）ごとに分けています。'}
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Highlight title="まちの税" yen={sumOf(doc, 'まちの税')} total={doc.total} note="住民や会社がこのまちに納める税（住民税・固定資産税など）です。" />
        <Highlight title={`${from}から配られるお金`} yen={sumOf(doc, '国・都道府県から配られるお金')} total={doc.total} note={`${from}が集めた税などから、使い道を決めずに配られるお金（交付税・交付金・譲与税）です。`} />
      </div>
      <div className="grid gap-x-8 @3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-(--rows)" style={{ '--rows': `repeat(${Math.ceil(kan.length / 2)}, auto)` } as React.CSSProperties}>
        {kan.map((k, i) => <KanRow key={k.name} name={k.name} yen={k.yen} total={doc.total} max={max} i={i} />)}
      </div>
      {doc.origin ? (
        <p className="mt-3 px-2.5 text-xs text-muted-foreground">
          出典:{' '}
          <a href={doc.origin.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
            {doc.origin.title}
            <ArrowSquareOutIcon className="size-3" aria-hidden="true" />
          </a>
        </p>
      ) : null}
    </section>
  )
}
