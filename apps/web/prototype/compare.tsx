// 試作: 比べる。2〜4 のまちを同じ年度の決算で、分野ごとに並べる。順位や良し悪しの色は付けず、各行の中で一番大きい額を基準に棒の長さだけを揃える。
// 比べ方の注意（年度・会計・人口の数え方）は表の上、数字の隣に置く
import * as React from 'react'
import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem, Picker } from '../home/home'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../jurisdiction/domains'
import { formatPeople, reiwa } from '../jurisdiction/types'
import { FieldIcon, yenParts } from './parts'
import type { Props } from '../pages/prototype/compare.server'

const MAX = 4
type Mode = 'total' | 'head'

function Value({ yen, mode }: { yen: number | null; mode: Mode }) {
  if (yen == null) return <span className="text-muted-foreground">—</span>
  if (mode === 'head') {
    const [n, u] = yen >= 1e4 ? [(yen / 1e4).toFixed(1), '万円'] : [Math.round(yen).toLocaleString('ja-JP'), '円']
    return (
      <span className="tabular-nums">
        {n}
        <small className="ml-px text-[0.65em] text-muted-foreground">{u}</small>
      </span>
    )
  }
  const [n, u] = yenParts(yen)
  return (
    <span className="tabular-nums">
      {n}
      <small className="ml-px text-[0.65em] text-muted-foreground">{u}</small>
    </span>
  )
}

export function Compare({ towns, year, entries, suggestions, missing }: Props) {
  const { visit } = useRouter()
  const [mode, setMode] = React.useState<Mode>('head')
  const codes = towns.map((t) => t.code)
  const href = (next: string[]) => `/prototype/compare?codes=${next.join(',')}`
  const canAdd = codes.length < MAX
  const value = (t: Props['towns'][number], yen: number | undefined) => (yen == null ? null : mode === 'head' ? (t.people ? yen / t.people : null) : yen)
  const rows = [...DOMAIN_FRAMES.filter((f) => f.id !== 'boei'), OTHER_FRAME].filter((f) => towns.some((t) => t.fields[f.id]))
  const hasPeople = towns.every((t) => t.people)
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-28 sm:px-8 sm:pt-12">
      <header className="mb-6">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em]">比べる</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">同じ年度の決算を、分野ごとに並べます。</p>
      </header>

      {/* 比べるまち */}
      <section aria-label="比べるまち" className="flex flex-wrap items-center gap-2">
        {towns.map((t) => (
          <span key={t.code} className="inline-flex items-center gap-2 rounded-full border bg-background py-1 ps-1 pe-1.5 text-sm">
            <Emblem code={t.code} name={t.name} className="size-7 rounded-full border-0 p-1" />
            <Link href={t.path} className="font-medium hover:text-primary">
              {t.name}
            </Link>
            {towns.length > 1 ? (
              <Link href={href(codes.filter((c) => c !== t.code))} aria-label={`${t.name}を外す`} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
                <XIcon className="size-3.5" />
              </Link>
            ) : null}
          </span>
        ))}
        {canAdd ? (
          <div className="w-full max-w-60 [&_[data-slot=input-group]]:h-9 [&_[data-slot=input-group]]:shadow-none [&_[data-slot=input-group]]:border">
            <Picker entries={entries.filter((e) => !codes.includes(e.code))} placeholder="まちを足す" onPick={(e) => visit(href([...codes, e.code]))} />
          </div>
        ) : null}
      </section>
      {canAdd && suggestions.length ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          となりのまち
          {suggestions.slice(0, 6).map((s) => (
            <Link key={s.code} href={href([...codes, s.code])} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
              <PlusIcon className="size-3" />
              {s.name}
            </Link>
          ))}
        </p>
      ) : null}
      {missing.length ? <p className="mt-3 text-[13px] text-muted-foreground">決算を収録していないまちは外しました。</p> : null}

      {year && towns.length ? (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {reiwa(year)} 決算・一般会計。
              {mode === 'head' ? <>1人あたりは住民基本台帳の人口で割った額で、昼に通勤・通学で来る人は数えていません。</> : <>人口の違いを考えない総額です。</>}
            </p>
            <ToggleGroup value={[mode]} onValueChange={(v) => v[0] && setMode(v[0] as Mode)} variant="outline" size="sm">
              <ToggleGroupItem value="head" disabled={!hasPeople}>
                1人あたり
              </ToggleGroupItem>
              <ToggleGroupItem value="total">総額</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-44 px-4 py-3 font-medium">分野</th>
                  {towns.map((t) => (
                    <th key={t.code} className="px-4 py-3 font-medium">
                      <span className="block text-sm text-foreground">{t.name}</span>
                      {t.people ? <span className="tabular-nums">{formatPeople(t.people)}</span> : null}
                    </th>
                  ))}
                </tr>
                <tr className="border-b bg-card">
                  <th className="px-4 py-3 text-left font-bold">全体</th>
                  {towns.map((t) => (
                    <td key={t.code} className="px-4 py-3 text-base font-bold text-primary">
                      <Value yen={value(t, t.total)} mode={mode} />
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const vals = towns.map((t) => value(t, t.fields[f.id]))
                  const max = Math.max(...vals.map((v) => v ?? 0))
                  return (
                    <tr key={f.id} className="border-b last:border-0">
                      <th className="px-4 py-3 text-left font-normal">
                        <span className="flex items-center gap-2">
                          <FieldIcon id={f.id} className="size-5 text-muted-foreground" />
                          {f.name}
                        </span>
                      </th>
                      {towns.map((t, i) => (
                        <td key={t.code} className="px-4 py-3 align-top">
                          <Value yen={vals[i] ?? null} mode={mode} />
                          <span className="mt-1.5 block h-1 rounded-full bg-secondary">
                            <span className={cn('block h-full rounded-full bg-primary/70 transition-[width] duration-500 motion-reduce:transition-none')} style={{ width: `${max ? ((vals[i] ?? 0) / max) * 100 : 0}%` }} />
                          </span>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">分野は国際的な分け方（COFOG）の大分類。分けられない支出は「その他」に入れています。</p>
        </section>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">同じ年度の決算がそろうまちがありません。</p>
      )}
    </main>
  )
}
