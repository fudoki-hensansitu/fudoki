// まち比べ。東京都のまちを、風土記が用意した問いの答えでタイル地図に塗る。一覧（/compare）は問いごとの小さな地図のカード、
// カードを押すと問いの頁（/compare/<問い>）で大きな地図と、選んだまちの札（全部の問いの値・まちの頁へのリンク）を出す。
// 色は緑一色の濃淡で、値の並びを5つに分けて塗る（値の偏りが大きく、等間隔だと島しょだけが濃くなるため）。良し悪しの言葉は付けない
import * as React from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { useMyTown } from '../home/towns'
import { reiwa } from '../jurisdiction/types'
import { QUESTIONS, questionOf, type Question } from './questions'
import type { CompareMap, MapTown } from '../server/compare-map'

const STEPS = 5
// 濃淡の段ごとの地（DESIGN.md の --shade-1〜5）と、その上の文字の色。未収録は斜線（--shade-none）にして 0 と分ける
const fillOf = (step: number) => (step < 0 ? 'var(--shade-none)' : `var(--shade-${step + 1})`)
const inkOf = (step: number) => (step >= 3 ? 'var(--primary-foreground)' : undefined)

type Scale = { step: (v: number | null) => number; min: number; max: number; median: number }
/** 問いの値の並びを5つに分ける */
function scaleOf(towns: MapTown[], slug: string): Scale | null {
  const vals = towns.map((t) => t.values[slug]).filter((v): v is number => v != null).sort((a, b) => a - b)
  if (!vals.length) return null
  const cuts = Array.from({ length: STEPS - 1 }, (_, i) => vals[Math.floor(((i + 1) * vals.length) / STEPS)]!)
  return { step: (v) => (v == null ? -1 : cuts.filter((c) => v >= c).length), min: vals[0]!, max: vals.at(-1)!, median: vals[Math.floor(vals.length / 2)]! }
}

/** 値を数字と単位に分ける。円は1万円からは万円、100万円からは小数を落とす */
function parts(v: number, q: Question): [string, string] {
  if (q.unit === 'percent') return [v.toFixed(1), '%']
  if (Math.abs(v) >= 1e4) return [(v / 1e4).toLocaleString('ja-JP', { maximumFractionDigits: Math.abs(v) >= 1e6 ? 0 : 1 }), '万円']
  return [Math.round(v).toLocaleString('ja-JP'), '円']
}
function Num({ v, q, className }: { v: number | null; q: Question; className?: string }) {
  if (v == null) return <span className={cn(className, 'text-muted-foreground')}>未収録</span>
  const [n, u] = parts(v, q)
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {n}
      <small className="ml-px text-[max(0.6em,11px)]">{u}</small>
    </span>
  )
}
const plain = (v: number | null, q: Question) => (v == null ? '未収録' : parts(v, q).join(''))
const shortName = (name: string) => name.replace(/(区|市|町|村)$/, '')
const popText = (n: number | null) => (n ? `人口 ${(n / 1e4).toFixed(1)}万人` : '')

/** タイル地図。large は名前を書いて押せる地図、そうでなければ一覧のカードの小さな地図（押せない） */
function TileMap({ map, q, scale, selected, onPick, large }: { map: CompareMap; q: Question; scale: Scale | null; selected?: string | null; onPick?: (code: string) => void; large?: boolean }) {
  return (
    <div className={cn('grid', large ? 'gap-0.5 sm:gap-[3px]' : 'gap-0.5')} style={{ gridTemplateColumns: `repeat(${map.cols}, minmax(0, 1fr))` }}>
      {map.towns.map((t) => {
        const v = t.values[q.slug] ?? null
        const step = scale ? scale.step(v) : -1
        const style: React.CSSProperties = {
          gridColumn: t.col + 1,
          gridRow: t.row + 1,
          background: fillOf(step),
          color: inkOf(step),
          // 問いを替えたとき、色が西から東へ波のように移る
          transitionDelay: `${t.col * 18}ms`,
        }
        const tile = cn(
          'aspect-square transition-[background-color,color] duration-300 ease-out motion-reduce:transition-none',
          large ? 'grid place-items-center rounded-[4px] sm:rounded-md' : 'rounded-[3px]',
          selected === t.code && 'z-10 outline-2 outline-offset-1 outline-foreground',
        )
        if (!large) return <span key={t.code} className={tile} style={style} />
        return (
          <button key={t.code} type="button" onClick={() => onPick?.(t.code)} aria-label={`${t.name} ${plain(v, q)}`} aria-pressed={selected === t.code} className={cn(tile, 'cursor-pointer active:scale-95 sm:hover:scale-110')} style={style}>
            <span className="max-w-full overflow-hidden text-center text-[9px] leading-none font-medium tracking-[-0.04em] break-keep sm:text-[11px] sm:tracking-normal">
              <span className="sm:hidden">{shortName(t.name).slice(0, 2)}</span>
              <span className="hidden sm:inline">{shortName(t.name)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Legend({ q, scale }: { q: Question; scale: Scale | null }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
      {scale ? (
        <span className="flex items-center gap-2">
          <span className="flex gap-0.5">
            {Array.from({ length: STEPS }, (_, i) => <span key={i} className="h-2.5 w-7 rounded-[2px]" style={{ background: fillOf(i) }} />)}
          </span>
          <Num v={scale.min} q={q} />〜<Num v={scale.max} q={q} />
        </span>
      ) : null}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px]" style={{ background: fillOf(-1) }} />
        未収録
      </span>
    </div>
  )
}

const sourceOf = (q: Question, year: number | null) => (q.source === 'finance' ? `総務省「市町村別決算状況調」${year ? reiwa(year) : ''}（普通会計）` : `風土記 ${year ? `${reiwa(year)} ` : ''}決算（一般会計）`)
const failedText = <p className="text-sm text-muted-foreground">今は読み込めません。少し時間をおいてやり直してください。</p>

/** いちばん大きいまちと小さいまち */
function extremes(towns: MapTown[], slug: string) {
  const has = towns.filter((t) => t.values[slug] != null).sort((a, b) => b.values[slug]! - a.values[slug]!)
  return { top: has[0], bottom: has.at(-1) }
}

export function CompareList({ map, failed }: { map: CompareMap; failed: boolean }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-28 sm:px-8 sm:pt-14">
      <header className="mb-5">
        <h1 className="text-[26px] leading-[1.35] font-semibold tracking-[0.02em]">まち比べ</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">まちのお金を1人あたりの金額に直すと、いろいろな見方で比べられます。いまは{map.prefecture || '東京都'}のまちから、少しずつ広げています。</p>
      </header>
      {failed ? failedText : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
          {QUESTIONS.map((q, i) => {
            const scale = scaleOf(map.towns, q.slug)
            const { top, bottom } = extremes(map.towns, q.slug)
            return (
              <Link
                key={q.slug}
                href={`/compare/${q.slug}`}
                className="flex animate-in flex-col gap-2.5 rounded-xl border bg-background p-3 fill-mode-both fade-in slide-in-from-bottom-1.5 duration-300 transition-colors hover:border-primary hover:bg-card active:scale-[0.985] motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <h2 className="min-h-[2.9em] text-[15px] leading-[1.45] font-medium">{q.title}</h2>
                <TileMap map={map} q={q} scale={scale} />
                <p className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {top ? <span>最多 <b className="font-medium text-foreground">{top.name}</b> <Num v={top.values[q.slug]!} q={q} /></span> : null}
                  {bottom ? <span>最小 <b className="font-medium text-foreground">{bottom.name}</b> <Num v={bottom.values[q.slug]!} q={q} /></span> : null}
                </p>
                <p className="mt-auto text-[11px] leading-relaxed text-muted-foreground">※{q.caveat}</p>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

const DEFAULT_TOWN = '131091'

/** 選んでいるまち。最初は URL の ?town、無ければ住んでいるまち（東京都のまちなら）、無ければ品川区。選び直すと URL の ?town も書き換える */
function useSelected(map: CompareMap) {
  const { town } = useMyTown()
  const has = React.useCallback((c?: string | null) => !!c && map.towns.some((t) => t.code === c), [map])
  const [code, setCode] = React.useState(DEFAULT_TOWN)
  const asked = React.useRef(false)
  React.useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('town')
    if (has(fromUrl)) {
      asked.current = true
      setCode(fromUrl!)
    }
  }, [has])
  React.useEffect(() => {
    if (!asked.current && has(town?.code)) setCode(town!.code)
  }, [town, has])
  const pick = (c: string) => {
    asked.current = true
    setCode(c)
    const url = new URL(location.href)
    url.searchParams.set('town', c)
    history.replaceState(history.state, '', url)
  }
  return [code, pick] as const
}

export function CompareQuestion({ slug, map, failed }: { slug: string; map: CompareMap; failed: boolean }) {
  const q = questionOf(slug)!
  const [code, pick] = useSelected(map)
  const scale = scaleOf(map.towns, q.slug)
  const t = map.towns.find((x) => x.code === code)
  const hrefOf = (s: string) => `/compare/${s}?town=${code}`
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-28 sm:px-8 sm:pt-14">
      <Link href="/compare" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
        まち比べ
      </Link>
      <header className="mb-4">
        <h1 className="text-[26px] leading-[1.35] font-semibold sm:text-[30px]">{q.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{q.note}</p>
      </header>
      {failed ? failedText : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <TileMap map={map} q={q} scale={scale} selected={code} onPick={pick} large />
            <Legend q={q} scale={scale} />
            <p className="mt-2.5 text-xs text-muted-foreground">出典: {sourceOf(q, map.year)}</p>
          </div>
          {t ? (
            <aside key={t.code} aria-live="polite" className="animate-in rounded-2xl border bg-background p-[18px] fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
              <p className="flex items-baseline gap-2 text-lg font-semibold">
                {t.name}
                <small className="text-xs font-normal text-muted-foreground">{popText(t.pop)}</small>
              </p>
              <Link href={t.path} className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline">
                {t.name}の頁を開く
                <ArrowRightIcon className="size-3.5" aria-hidden="true" />
              </Link>
              <p className="mt-3.5 text-[13px] text-muted-foreground">{q.short}</p>
              <Num v={t.values[q.slug] ?? null} q={q} className="text-[32px] leading-tight font-semibold text-primary" />
              {scale ? <p className="text-[13px] text-muted-foreground">都内の真ん中 <Num v={scale.median} q={q} /></p> : null}
              <ul className="mt-3.5 border-t">
                {QUESTIONS.filter((x) => x.slug !== slug).map((x) => (
                  <li key={x.slug}>
                    <Link href={hrefOf(x.slug)} className="group flex justify-between gap-2 border-b py-[7px] text-sm">
                      <span className="text-muted-foreground group-hover:text-primary">{x.short}</span>
                      <Num v={t.values[x.slug] ?? null} q={x} />
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      )}
      <nav aria-label="ほかの問い" className="mt-10 border-t pt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">ほかの問い</h2>
        <div className="flex flex-wrap gap-1.5">
          {QUESTIONS.map((x) => (
            <Link
              key={x.slug}
              href={hrefOf(x.slug)}
              aria-current={x.slug === slug ? 'page' : undefined}
              className="inline-flex h-[34px] shrink-0 items-center rounded-full border bg-background px-3.5 text-sm font-medium transition-colors hover:bg-card aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              {x.short}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}
