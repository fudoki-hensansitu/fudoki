// 試作: 追っている事業。☆を付けた事業の当初予算・決算を年度ごとに並べる。増減に色は付けず、棒は事業の中の最大を基準に長さだけ揃える
import * as React from 'react'
import { ArrowRightIcon, StarIcon } from '@phosphor-icons/react'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from '../nav/link'
import { Emblem } from '../home/home'
import { jurisdictionPath } from '../jurisdiction/path'
import { reiwa } from '../jurisdiction/types'
import { Amt } from './parts'
import { useSaved, type Saved } from './saved'

type Year = { fiscal_year: number; budget_yen: number | null; settled_yen: number | null; kan_name: string | null; moku_name: string | null }
type Detail = { project: { first_year: number; first_year_kind: string; last_year: number | null; last_year_kind: string }; years: Year[] }

function Card({ s, onRemove }: { s: Saved; onRemove: () => void }) {
  const [d, setD] = React.useState<Detail | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    fetch(`/api/prototype/project/${s.projectId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Detail>) : Promise.reject(r)))
      .then(setD)
      .catch(() => setFailed(true))
  }, [s.projectId])
  const max = d ? Math.max(1, ...d.years.flatMap((y) => [y.budget_yen ?? 0, y.settled_yen ?? 0])) : 1
  const last = d?.years.at(-1)
  return (
    <section className="rounded-2xl border bg-background p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Emblem code={s.code} name={s.town} className="size-9 rounded-lg p-1" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{s.town}</p>
          <h2 className="text-[15px] leading-snug font-bold">{s.name}</h2>
          {last ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[last.kan_name, last.moku_name].filter(Boolean).join(' › ')}</p> : null}
        </div>
        <button type="button" onClick={onRemove} aria-label={`${s.name}を追うのをやめる`} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-secondary">
          <StarIcon weight="fill" className="size-5 text-primary" />
        </button>
      </div>
      {failed ? (
        <p className="mt-3 text-sm text-muted-foreground">今は読み込めません。</p>
      ) : !d ? (
        <Skeleton className="mt-4 h-24 rounded-xl" />
      ) : (
        <>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="w-16 pb-1 font-normal">年度</th>
                <th className="pb-1 font-normal">当初予算</th>
                <th className="pb-1 font-normal">決算</th>
              </tr>
            </thead>
            <tbody>
              {d.years.map((y) => (
                <tr key={y.fiscal_year} className="align-top">
                  <td className="py-1.5 text-muted-foreground">{reiwa(y.fiscal_year).replace('年度', '')}</td>
                  {[y.budget_yen, y.settled_yen].map((v, i) => (
                    <td key={i} className="py-1.5 pe-3">
                      <Amt yen={v} className="font-medium" />
                      <span className="mt-1 block h-1 rounded-full bg-secondary">
                        <span className="block h-full rounded-full bg-primary/70 transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${((v ?? 0) / max) * 100}%` }} />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {d.project.first_year_kind === 'confirmed' ? `${reiwa(d.project.first_year)}に始めた事業` : `${reiwa(d.project.first_year)}より前からある事業`}
            {d.project.last_year_kind === 'confirmed' && d.project.last_year ? `・${reiwa(d.project.last_year)}まで` : ''}
          </p>
          <Link href={`${jurisdictionPath(s.code)}/${d.years.at(-1)!.fiscal_year}/projects`} className="mt-2 inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
            {s.town}の事業を見る <ArrowRightIcon className="size-3.5" />
          </Link>
        </>
      )}
    </section>
  )
}

export function SavedProjects() {
  const { ready, list, toggle } = useSaved()
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-28 sm:px-8 sm:pt-12">
      <header className="mb-6">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em]">追っている事業</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">☆を付けた事業の金額を、年度ごとに並べます。新しい年度が入ったら、ここに増えます。</p>
      </header>
      {!ready ? null : list.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((s) => (
            <Card key={s.projectId} s={s} onRemove={() => toggle(s)} />
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed p-8 text-center">
          <StarIcon className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 font-medium">まだ追っている事業はありません</p>
          <p className="mt-1 text-sm text-muted-foreground">「事業をさがす」で見つけた事業の☆を押すと、ここに入ります。</p>
          <Link href="/prototype/search?q=給食" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            事業をさがす <ArrowRightIcon className="size-3.5" />
          </Link>
        </section>
      )}
    </main>
  )
}
