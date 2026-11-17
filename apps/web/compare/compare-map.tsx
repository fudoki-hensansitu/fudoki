// まち比べ。東京都のまちを、風土記が用意した問いの答えでタイル地図に塗る。一覧（/compare）は問いごとの小さな地図のカード、
// カードを押すと問いの頁（/compare/<問い>）で大きな地図と、選んだまちの札（その問いの値・まちの頁へのボタン）を出す。
// 色は緑一色の濃淡で、値の並びを5つに分けて塗る（値の偏りが大きく、等間隔だと島しょだけが濃くなるため）。良し悪しの言葉は付けない
import * as React from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Button } from '@/components/ui/button'
import { QUESTIONS, questionOf, type Question } from './questions'
import { reiwa } from '../jurisdiction/types'
import type { CompareMap, MapTown } from '../server/compare-map'
import { Title, titleVariants } from '@/components/ui/title'
import { Card, CardTitle } from '@/components/ui/card'

const STEPS = 5
// 濃淡の段ごとの地（DESIGN.md の --shade-1〜5）と、その上の文字の色。未収録は斜線（--shade-none）にして 0 と分ける
const fillOf = (step: number) => (step < 0 ? 'var(--shade-none)' : `var(--shade-${step + 1})`)
const inkOf = (step: number) => (step >= 3 ? 'var(--primary-foreground)' : undefined)

type Scale = { step: (v: number | null) => number; pos: (v: number) => number; min: number; max: number; median: number }
/** 問いの値の並びを5つに分ける */
function scaleOf(towns: MapTown[], slug: string): Scale | null {
  const vals = towns.map((t) => t.values[slug]).filter((v): v is number => v != null).sort((a, b) => a - b)
  if (!vals.length) return null
  const cuts = Array.from({ length: STEPS - 1 }, (_, i) => vals[Math.floor(((i + 1) * vals.length) / STEPS)]!)
  const step = (v: number | null) => (v == null ? -1 : cuts.filter((c) => v >= c).length)
  const edges = [vals[0]!, ...cuts, vals.at(-1)!]
  // 帯の上での位置（0〜1）。入っている段の中で、その段の下端と上端のあいだのどこかを足す
  const pos = (v: number) => {
    const i = step(v)
    const lo = edges[i]!
    const hi = edges[i + 1]!
    return (i + (hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5)) / STEPS
  }
  return { step, pos, min: vals[0]!, max: vals.at(-1)!, median: vals.length % 2 ? vals[(vals.length - 1) / 2]! : (vals[vals.length / 2 - 1]! + vals[vals.length / 2]!) / 2 }
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
const popText = (n: number | null) => (!n ? '' : n >= 1e4 ? `人口 ${(n / 1e4).toFixed(1)}万人` : `人口 ${n.toLocaleString('ja-JP')}人`)

/** タイル地図。large は名前を書いて押せる地図、そうでなければ一覧のカードの小さな地図（押せない） */
function TileMap({ map, q, scale, selected, onPick, large }: { map: CompareMap; q: Question; scale: Scale | null; selected?: string | null; onPick?: (code: string) => void; large?: boolean }) {
  return (
    <div className={cn('grid', large ? 'gap-1 sm:gap-1' : 'gap-1')} style={{ gridTemplateColumns: `repeat(${map.cols}, minmax(0, 1fr))` }}>
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
          <button key={t.code} type="button" onClick={() => onPick?.(t.code)} aria-label={`${t.name} ${plain(v, q)}`} aria-pressed={selected === t.code} className={cn(tile, 'cursor-pointer outline-offset-1 hover:outline-1 hover:outline-muted-foreground active:scale-95')} style={style}>
            {/* 狭い幅ではタイルが小さく名前が読めないので塗りだけにし、名前は札で出す */}
            {/* 長い名前は2行に折り返し、それでも入らなければ … で切る */}
            <span className="hidden max-w-full px-1 text-center text-xs leading-tight font-medium sm:line-clamp-2">{shortName(t.name)}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 凡例。濃淡の帯の両端に最小・最多のまちを置き（押すとそのまちを選ぶ）、選んでいるまちが帯のどこにいるかを縦の線で示す。
 * 帯はスライダーで、押したまま左右に動かすと線が指に付いてきて、いちばん近い値のまちを選ぶ。離すと線はそのまちの位置に収まる */
function Legend({ map, q, scale, selected, onPick }: { map: CompareMap; q: Question; scale: Scale | null; selected?: string | null; onPick?: (code: string) => void }) {
  const { top, bottom } = extremes(map.towns, q.slug)
  const sel = map.towns.find((t) => t.code === selected)
  const v = sel?.values[q.slug]
  const [drag, setDrag] = React.useState<number | null>(null)
  const band = React.useRef<HTMLSpanElement>(null)
  // 値のあるまちを小さい順に、帯の上の位置と並べる
  const ranked = React.useMemo(
    () => (scale ? map.towns.filter((t) => t.values[q.slug] != null).map((t) => ({ t, at: scale.pos(t.values[q.slug]!) })).sort((x, y) => x.at - y.at) : []),
    [map, q.slug, scale],
  )
  const at = drag ?? (scale && v != null ? scale.pos(v) : null)
  const follow = (clientX: number) => {
    const r = band.current?.getBoundingClientRect()
    if (!r || !ranked.length) return
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    setDrag(x)
    const near = ranked.reduce((a, b) => (Math.abs(b.at - x) < Math.abs(a.at - x) ? b : a))
    if (near.t.code !== selected) onPick?.(near.t.code)
  }
  const index = ranked.findIndex((r) => r.t.code === selected)
  const onKey = (e: React.KeyboardEvent) => {
    const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? index + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ranked.length - 1 : null
    if (to == null) return
    e.preventDefault()
    const r = ranked[Math.min(ranked.length - 1, Math.max(0, to))]
    if (r) onPick?.(r.t.code)
  }
  const end = (t: MapTown | undefined, label: string) =>
    t ? (
      <button type="button" onClick={() => onPick?.(t.code)} className="flex items-baseline gap-2 rounded-sm text-left transition-colors hover:text-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{t.name}</span>
        <Num v={t.values[q.slug] ?? null} q={q} />
      </button>
    ) : null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      {scale ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {end(bottom, '最小')}
          <span
            role="slider"
            tabIndex={0}
            aria-label={`${q.short}でまちを選ぶ`}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, ranked.length - 1)}
            aria-valuenow={Math.max(0, index)}
            aria-valuetext={sel ? `${sel.name} ${plain(v ?? null, q)}` : undefined}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              follow(e.clientX)
            }}
            onPointerMove={(e) => drag != null && follow(e.clientX)}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            className="cursor-ew-resize touch-none rounded-sm py-2 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span ref={band} className="relative flex gap-1">
              {at != null ? (
                <span
                  aria-hidden="true"
                  className={cn('absolute -top-1.5 -bottom-1.5 w-1 -translate-x-1/2 rounded-full bg-foreground motion-reduce:transition-none', drag == null && 'transition-[left] duration-300 ease-out')}
                  style={{ left: `${at * 100}%` }}
                />
              ) : null}
              {Array.from({ length: STEPS }, (_, i) => <span key={i} className="h-2.5 w-10 rounded-[2px] sm:w-12" style={{ background: fillOf(i) }} />)}
            </span>
          </span>
          {end(top, '最多')}
        </div>
      ) : null}
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-3.5 rounded-[2px]" style={{ background: fillOf(-1) }} />
        未収録
      </span>
    </div>
  )
}

const failedText = <p className="text-sm text-muted-foreground">今は読み込めません。少し時間をおいてやり直してください。</p>

/** 何年度の決算の値かを、数字を載せている面に書く（頁の値はすべて同じ年度） */
function YearNote({ year }: { year: number | null }) {
  if (year == null) return null
  return <p className="mt-1 text-sm text-muted-foreground">値は{reiwa(year)}の決算です。</p>
}

/** いちばん大きいまちと小さいまち */
function extremes(towns: MapTown[], slug: string) {
  const has = towns.filter((t) => t.values[slug] != null).sort((a, b) => b.values[slug]! - a.values[slug]!)
  return { top: has[0], bottom: has.at(-1) }
}

export function CompareList({ map, failed }: { map: CompareMap; failed: boolean }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-28 sm:px-8 sm:pt-14">
      <header className="mb-5">
        <Title size="h1">まち比べ</Title>
        <p className="mt-1 text-sm text-muted-foreground">まちのお金を1人あたりの金額に直すと、いろいろな見方で比べられます。いまは{map.prefecture || '東京都'}のまちから、少しずつ広げています。</p>
        <YearNote year={map.year} />
      </header>
      {failed ? failedText : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          {QUESTIONS.map((q, i) => {
            const scale = scaleOf(map.towns, q.slug)
            const { top, bottom } = extremes(map.towns, q.slug)
            return (
              <Link
                key={q.slug}
                href={`/compare/${q.slug}`}
                className="group/link block animate-in rounded-xl fill-mode-both fade-in slide-in-from-bottom-1.5 duration-300 transition-transform active:scale-[0.985] motion-reduce:animate-none motion-reduce:transition-none"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <Card className="h-full gap-3 bg-background px-4 py-4 transition-colors group-hover/link:bg-card">
                <CardTitle className="min-h-[2.8em] leading-[1.4]">{q.title}</CardTitle>
                <TileMap map={map} q={q} scale={scale} />
                <p className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {top ? <span>最多 <b className="font-medium text-foreground">{top.name}</b> <Num v={top.values[q.slug]!} q={q} /></span> : null}
                  {bottom ? <span>最小 <b className="font-medium text-foreground">{bottom.name}</b> <Num v={bottom.values[q.slug]!} q={q} /></span> : null}
                </p>
                <p className="mt-auto text-xs leading-relaxed text-muted-foreground">※{q.caveat}</p>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

/** 選んでいるまち。URL の ?town があればそのまち、無ければその問いでいちばん大きいまち。選び直すと URL の ?town も書き換える。
 * picked は自分で選んだまち（ほかの問いへ移っても選んだまちを持ち越す） */
function useSelected(map: CompareMap, slug: string) {
  const [picked, setPicked] = React.useState<string | null>(null)
  React.useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('town')
    setPicked(fromUrl && map.towns.some((t) => t.code === fromUrl) ? fromUrl : null)
  }, [map, slug])
  const pick = (c: string) => {
    setPicked(c)
    const url = new URL(location.href)
    url.searchParams.set('town', c)
    history.replaceState(history.state, '', url)
  }
  return { code: picked ?? extremes(map.towns, slug).top?.code ?? null, picked, pick }
}

export function CompareQuestion({ slug, map, failed }: { slug: string; map: CompareMap; failed: boolean }) {
  const q = questionOf(slug)!
  const { code, picked, pick } = useSelected(map, slug)
  const scale = scaleOf(map.towns, q.slug)
  const t = map.towns.find((x) => x.code === code)
  const hrefOf = (s: string) => (picked ? `/compare/${s}?town=${picked}` : `/compare/${s}`)
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-28 sm:px-8 sm:pt-14">
      <Link href="/compare" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
        まち比べ
      </Link>
      <header className="mb-4">
        <Title size="h1">{q.title}</Title>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{q.note}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">※{q.caveat}</p>
        <YearNote year={map.year} />
      </header>
      {failed ? failedText : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <TileMap map={map} q={q} scale={scale} selected={code} onPick={pick} large />
            <Legend map={map} q={q} scale={scale} selected={code} onPick={pick} />
          </div>
          {t ? (
            <aside key={t.code} aria-live="polite" className="flex animate-in flex-col rounded-2xl border bg-background p-5 fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
              <Title size="h3" as="p" className="flex items-baseline gap-2">
                {t.name}
                <small className="text-xs font-normal text-muted-foreground">{popText(t.pop)}</small>
              </Title>
              <p className="mt-4 text-sm text-muted-foreground">{q.short}</p>
              <Num v={t.values[q.slug] ?? null} q={q} className={cn(titleVariants({ size: 'h1' }), 'leading-tight text-primary')} />
              {scale ? <p className="text-sm text-muted-foreground">都内の中央値 <Num v={scale.median} q={q} /></p> : null}
              <Button size="lg" nativeButton={false} render={<Link href={t.path} />} className="mt-6 h-11 w-full text-sm">
                {t.name}を開く
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </aside>
          ) : null}
        </div>
      )}
      <nav aria-label="ほかの問い" className="mt-10 border-t pt-6">
        <Title size="headline" as="h2" className="mb-3 text-muted-foreground">ほかの問い</Title>
        <div className="flex flex-wrap gap-2">
          {QUESTIONS.map((x) => (
            <Link
              key={x.slug}
              href={hrefOf(x.slug)}
              aria-current={x.slug === slug ? 'page' : undefined}
              className="inline-flex h-9 shrink-0 items-center rounded-full border bg-background px-4 text-sm font-medium transition-colors hover:bg-card aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              {x.short}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}
