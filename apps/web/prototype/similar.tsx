// 試作: 似たまちを探す。人口と面積（どちらも桁で見る）が近いまちを並べ、比べるへつなぐ。良し悪しではなく近さの順
import * as React from 'react'
import { ArrowRightIcon, ArrowsLeftRightIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem } from '../home/home'
import { formatAsOf, formatPeople } from '../jurisdiction/types'
import { useMyTown } from './towns'
import type { Props, Town } from '../pages/prototype/similar.server'

const COUNT = 6
const dist = (a: Town, b: Town) => Math.hypot(Math.log10(a.people!) - Math.log10(b.people!), Math.log10(a.area!) - Math.log10(b.area!))
const density = (t: Town) => Math.round(t.people! / t.area!)

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">
        {value}
        <small className="ml-0.5 text-[0.6em] font-normal text-muted-foreground">{unit}</small>
      </p>
    </div>
  )
}

export function Similar({ code, towns }: Props) {
  const { ready, town } = useMyTown()
  const usable = towns.filter((t) => t.people && t.area)
  const base = usable.find((t) => t.code === code) ?? usable.find((t) => t.code === town?.code) ?? usable.find((t) => t.code === '131091') ?? usable[0]
  if (!ready || !base) return <main className="mx-auto w-full max-w-4xl px-4 pt-12" />
  const near = usable
    .filter((t) => t.code !== base.code)
    .map((t) => ({ t, d: dist(base, t) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, COUNT)
  const maxD = Math.max(...near.map((n) => n.d), 0.01)
  const compare = `/prototype/compare?codes=${[base.code, ...near.slice(0, 3).map((n) => n.t.code)].join(',')}`
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-28 sm:px-8 sm:pt-12">
      <header className="mb-5">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em]">似たまちを探す</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">人口と広さが近いまちを出します。比べる相手を選ぶときに使えます。</p>
      </header>

      <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-6">
        <div className="flex items-center gap-3">
          <Emblem code={base.code} name={base.name} className="size-11 rounded-xl p-1.5" />
          <div>
            <p className="text-xs opacity-80">{base.code === town?.code ? 'うちのまち' : 'このまち'}</p>
            <p className="text-xl font-bold">{base.name}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 [&_p]:text-brand-foreground [&_small]:text-brand-foreground/70">
          <Stat label="人口" value={(base.people! / 1e4).toFixed(1)} unit="万人" />
          <Stat label="面積" value={base.area!.toFixed(1)} unit="km²" />
          <Stat label="1km² あたり" value={density(base).toLocaleString('ja-JP')} unit="人" />
        </div>
      </section>

      <div className="mt-6 mb-3 flex items-end justify-between gap-3">
        <h2 className="text-[15px] font-bold">近いまち</h2>
        <Link href={compare} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[13px] text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97]">
          <ArrowsLeftRightIcon className="size-4" />
          近い3つと比べる
        </Link>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-background">
        {near.map(({ t, d }) => (
          <li key={t.code}>
            <Link href={`/prototype/similar?code=${t.code}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card">
              <Emblem code={t.code} name={t.name} className="size-9 rounded-lg p-1" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatPeople(t.people!)}・{t.area!.toFixed(1)}km²
                </span>
              </span>
              {/* 近さを点の数で。順位ではなく、どれくらい似ているかの目安 */}
              <span className="flex gap-0.5" aria-label="近さ">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={cn('size-1.5 rounded-full', i < Math.max(1, Math.round(5 * (1 - d / (maxD * 1.25)))) ? 'bg-primary' : 'bg-border')} />
                ))}
              </span>
              <ArrowRightIcon className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        人口は住民基本台帳（{base.asOf ? `${formatAsOf(base.asOf)}時点` : '最新'}）、面積は境界の地図から出した近似です。人口と面積をそれぞれ桁で見て、近い順に並べています。昼に通勤・通学で来る人は数えていません。
      </p>
    </main>
  )
}
