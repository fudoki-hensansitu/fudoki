// 試作: 始めた・やめた事業。全部のまちを横断して並べる。まちは自治体コードの順。まちの中だけ金額の大きい順に並べる
import * as React from 'react'
import { ArrowRightIcon, MegaphoneIcon } from '@phosphor-icons/react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem } from '../home/home'
import { NewIcon, StopIcon } from '../jurisdiction/fresh-icons'
import { reiwa } from '../jurisdiction/types'
import { Amt } from './parts'
import type { Item, Props } from '../pages/prototype/fresh.server'

type View = 'started' | 'ended' | 'announced'

function List({ items }: { items: Item[] }) {
  return (
    <ul className="divide-y">
      {items.map((h, i) => (
        <li key={i} className="flex items-baseline gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-snug">{h.name}</span>
            {h.where ? <span className="block truncate text-[11px] text-muted-foreground">{h.where}</span> : null}
          </span>
          <Amt yen={h.yen} className="text-sm font-medium" />
        </li>
      ))}
    </ul>
  )
}

export function Fresh({ year, years, towns, failed }: Props) {
  const [view, setView] = React.useState<View>('started')
  const count = (v: View) => towns.reduce((s, t) => s + (v === 'started' ? t.startedCount : v === 'ended' ? t.endedCount : t.announced.length), 0)
  const shown = towns.filter((t) => (view === 'started' ? t.startedCount : view === 'ended' ? t.endedCount : t.announced.length) > 0)
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-28 sm:px-8 sm:pt-12">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em]">始めた・やめた事業</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">まちをまたいで、その年度に始めた事業と、前の年度でやめた事業を並べます。</p>
        </div>
        <div className="flex gap-1 rounded-full bg-secondary p-1" role="group" aria-label="年度">
          {years.map((y) => (
            <Link key={y} href={`/prototype/fresh?year=${y}`} aria-current={y === year ? 'page' : undefined} className={cn('rounded-full px-3 py-1 text-[13px] transition-colors', y === year ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {reiwa(y).replace('年度', '')}
            </Link>
          ))}
        </div>
      </header>
      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList variant="line" className="mb-4">
          <TabsTrigger value="started">
            <NewIcon className="size-4" />
            {reiwa(year)}に始めた（{count('started')}）
          </TabsTrigger>
          <TabsTrigger value="ended">
            <StopIcon className="size-4" />
            {reiwa(year - 1)}でやめた（{count('ended')}）
          </TabsTrigger>
          <TabsTrigger value="announced">
            <MegaphoneIcon className="size-4" />
            予算案で新しくと発表（{count('announced')}）
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {failed ? <p className="text-sm text-muted-foreground">今は読み込めません。少し時間をおいて開き直してください。</p> : null}
      {!failed && !shown.length ? <p className="text-sm text-muted-foreground">この年度の分は、まだ収録していません。</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((t) => {
          const n = view === 'started' ? t.startedCount : view === 'ended' ? t.endedCount : t.announced.length
          return (
            <section key={t.code} className="flex flex-col rounded-2xl border bg-background p-4">
              <div className="mb-2 flex items-center gap-2">
                <Emblem code={t.code} name={t.name} className="size-8 rounded-lg p-1" />
                <span className="flex-1 font-bold">{t.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{n}件</span>
              </div>
              <div className="flex-1">
                <List items={view === 'started' ? t.started : view === 'ended' ? t.ended : t.announced} />
              </div>
              <Link href={`${t.path}/${view === 'ended' ? year - 1 : year}/projects`} className="mt-2 inline-flex items-center gap-1 self-start text-[13px] text-primary hover:underline">
                {t.name}の事業を見る <ArrowRightIcon className="size-3.5" />
              </Link>
            </section>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">始めた・やめたは、前後の年度の予算書を突き合わせた風土記の判断です。名前が変わった事業は、やめて始めたように見えることがあります。</p>
    </main>
  )
}
