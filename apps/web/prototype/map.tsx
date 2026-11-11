// 試作: 地図で選ぶ。まちを押すとそのまちの頁へ。塗るのは収録の有無とうちのまちだけ（金額の濃淡は順位に読まれるので使わない）
import * as React from 'react'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem } from '../home/home'
import { useMyTown } from './towns'
import type { Props, Shape } from '../pages/prototype/map.server'

export function TownMap({ width, height, shapes, islands, others }: Props) {
  const { visit } = useRouter()
  const { town } = useMyTown()
  const [hover, setHover] = React.useState<Shape | null>(null)
  const shown = hover ?? shapes.find((s) => s.code === town?.code) ?? null
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-28 sm:px-8 sm:pt-12">
      <header className="mb-4">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em]">地図で選ぶ</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">まちを押すと、そのまちのお金の使い道へ進みます。</p>
      </header>

      <div className="mb-3 flex min-h-12 items-center gap-3 rounded-2xl border bg-background px-4 py-2">
        {shown ? (
          <>
            <Emblem code={shown.code} name={shown.name} className="size-8 rounded-lg p-1" />
            <span className="font-bold">{shown.name}</span>
            {shown.code === town?.code ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">うちのまち</span> : null}
            <span className="ms-auto text-[13px] text-muted-foreground">{shown.path ? '押すと開きます' : 'まだ収録していません'}</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">地図の上でまちを指すと、名前が出ます。</span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card p-2 sm:p-4">
        <svg viewBox={`-4 -4 ${width + 8} ${height + 8}`} className="block h-auto w-full" role="img" aria-label="東京都のまちの地図">
          {shapes.map((s) => {
            const mine = s.code === town?.code
            const on = hover?.code === s.code
            return (
              <path
                key={s.code}
                d={s.d}
                role={s.path ? 'link' : undefined}
                aria-label={s.name}
                tabIndex={s.path ? 0 : -1}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s)}
                onBlur={() => setHover(null)}
                onClick={() => s.path && visit(s.path)}
                onKeyDown={(e) => e.key === 'Enter' && s.path && visit(s.path)}
                className={cn(
                  'stroke-background stroke-[1.2] transition-[fill] duration-150 ease-out outline-none',
                  s.path ? 'cursor-pointer' : 'cursor-default',
                  mine ? 'fill-primary' : on && s.path ? 'fill-primary/45' : s.path ? 'fill-primary/15' : 'fill-muted',
                )}
              />
            )
          })}
        </svg>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-primary" />
            うちのまち
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-primary/15" />
            収録しているまち
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-muted" />
            まだ収録していないまち
          </span>
        </p>
      </div>

      {[
        { title: '島しょのまち', list: islands },
        { title: 'そのほか', list: others },
      ].map((g) =>
        g.list.length ? (
          <section key={g.title} className="mt-6">
            <h2 className="mb-2 text-sm font-bold">{g.title}</h2>
            <div className="flex flex-wrap gap-2">
              {g.list.map((e) => (
                <Link key={e.code} href={e.path} className="inline-flex items-center gap-2 rounded-full border bg-background py-1 ps-1 pe-3 text-sm transition-colors hover:bg-card">
                  <Emblem code={e.code} name={e.name} className="size-6 rounded-full border-0 p-0.5" />
                  {e.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null,
      )}
      <Link href="/prototype/compare" className="mt-6 inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
        となりのまちと比べる <ArrowRightIcon className="size-3.5" />
      </Link>
    </main>
  )
}
