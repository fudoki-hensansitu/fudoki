// オンボーディングの吹き出しに載せる、操作の様子を動きで見せる絵。骨組みの絵にせず、実際のまちの名前・金額・事業名で描く。
// 押す所へ指が動いて押す・文字をなぞって選ぶ・質問を打つ、を4秒あまりで繰り返す。動きを減らす設定では、動かさずに終わりの様子だけを出す（onboarding.css の tv-*）
import * as React from 'react'
import { ArrowRightIcon, ArrowUpIcon, CursorTextIcon, HandPointingIcon, QuotesIcon, RobotIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Amt, FieldIcon } from './parts'

/** 絵の枠。読み上げには出さない（同じことを吹き出しの文で書く） */
function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('tv relative h-[120px] overflow-hidden rounded-xl bg-card select-none', className)}>
      {children}
    </div>
  )
}

/** 押す指。from から to へ動いて押す。位置は枠の左上からの px */
function Finger({ from, to }: { from: [number, number]; to: [number, number] }) {
  const style = { '--x0': `${from[0]}px`, '--y0': `${from[1]}px`, '--x1': `${to[0]}px`, '--y1': `${to[1]}px` } as React.CSSProperties
  return (
    <>
      <span className="tv-ripple absolute size-9 rounded-full border-2 border-primary" style={{ left: to[0] - 18, top: to[1] - 18 }} />
      <span className="tv-cursor absolute top-0 left-0 text-foreground drop-shadow-sm" style={style}>
        <HandPointingIcon weight="fill" className="size-7 -translate-x-[9px] text-foreground" />
      </span>
    </>
  )
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** まちの頁を開く: ホームの緑の札の「詳細を見る」を押す */
export function OpenVisual({ town, total }: { town: string; total: number }) {
  return (
    <Stage>
      <div className="absolute inset-x-4 top-4 bottom-4 rounded-xl bg-brand px-4 py-3 text-brand-foreground">
        <p className="text-[12px] font-medium">{town}</p>
        <Amt yen={total} className="mt-1 block text-[26px] leading-none font-semibold" />
        <span className="tv-press-fill absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-brand-fill px-2.5 py-1 text-[11px] text-brand-fill-foreground">
          詳細を見る
          <ArrowRightIcon className="size-3" />
        </span>
      </div>
      <Finger from={[60, 110]} to={[240, 86]} />
    </Stage>
  )
}

type FieldItem = { id: string; name: string; pct: number }
/** 分野: 分野の札が割合の棒とともに並び、1枚目を押す */
export function FieldsVisual({ items }: { items: FieldItem[] }) {
  const top = items.slice(0, 3)
  return (
    <Stage>
      <div className="absolute inset-x-3 top-3 grid grid-cols-3 gap-2">
        {top.map((f, i) => (
          <div key={f.id} className={cn('rounded-lg bg-background p-2 ring-1 ring-border', i === 0 && 'tv-press')}>
            <div className="flex items-center justify-between">
              <FieldIcon id={f.id} className="size-4 text-muted-foreground" />
              <span className="text-[13px] text-primary tabular-nums">
                {f.pct.toFixed(0)}
                <small className="text-[9px]">%</small>
              </span>
            </div>
            <p className="mt-1.5 truncate text-[11px] font-medium">{f.name}</p>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-secondary">
              <span className="tv-grow block h-full rounded-full bg-primary" style={{ width: `${Math.max(8, Math.min(100, f.pct * 2))}%`, animationDelay: `${i * 0.12}s` }} />
            </span>
          </div>
        ))}
      </div>
      <Finger from={[150, 118]} to={[54, 52]} />
    </Stage>
  )
}

/** 分野の頁: 分野の金額と、その分野の事業が上から並ぶ */
export function FieldVisual({ id, name, yen, projects }: { id: string; name: string; yen: number; projects: { name: string; yen: number | null }[] }) {
  return (
    <Stage>
      <div className="absolute inset-x-4 top-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-background text-muted-foreground">
          <FieldIcon id={id} className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{name}</span>
        <Amt yen={yen} className="text-[18px] font-medium text-primary" />
      </div>
      <ul className="absolute inset-x-4 top-12 divide-y rounded-lg bg-background px-2.5">
        {projects.slice(0, 3).map((p, i) => (
          <li key={i} className="tv-row flex items-baseline gap-2 py-1 text-[11px]" style={{ animationDelay: `${0.15 + i * 0.15}s` }}>
            <span className="w-3 text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <Amt yen={p.yen} />
          </li>
        ))}
      </ul>
    </Stage>
  )
}

/** 事業のタブ: 金額の多い順の一覧から、1行目を押すと詳細が右から開く */
export function ProjectsVisual({ items }: { items: { name: string; yen: number | null }[] }) {
  const top = items.slice(0, 3)
  return (
    <Stage>
      <ul className="absolute top-3 left-3 w-[62%] space-y-1">
        {top.map((p, i) => (
          <li key={i} className={cn('flex items-baseline gap-1.5 rounded-md bg-background px-2 py-1.5 text-[11px]', i === 0 && 'tv-press')}>
            <span className="text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <Amt yen={p.yen} className="text-[12px]" />
          </li>
        ))}
      </ul>
      {top[0] ? (
        <div className="tv-slide absolute top-3 right-3 bottom-3 w-[32%] rounded-lg bg-background p-2 shadow-md ring-1 ring-border">
          <p className="line-clamp-2 text-[10px] leading-snug font-medium">{top[0].name}</p>
          <Amt yen={top[0].yen} className="mt-1 block text-[15px] text-primary" />
        </div>
      ) : null}
      <Finger from={[150, 118]} to={[70, 22]} />
    </Stage>
  )
}

/** 文字を選ぶ: 事業名を I の形のカーソルでなぞって選ぶと、その文が「選んだ文」として質問の欄に付く */
export function SelectVisual({ path, name, yen }: { path?: string; name: string; yen: number | null }) {
  const mark = short(name, 13)
  return (
    <Stage>
      <div className="absolute inset-x-4 top-3">
        {path ? <p className="truncate text-[10px] text-muted-foreground">{path}</p> : null}
        <p className="mt-0.5 text-[15px] leading-snug font-medium">
          <span className="tv-mark relative whitespace-nowrap">
            {mark}
            <span className="tv-ibeam absolute top-1/2 -translate-y-1/2 text-foreground">
              <CursorTextIcon className="size-5 -translate-x-1/2" />
            </span>
          </span>
        </p>
        <Amt yen={yen} className="mt-0.5 block text-[13px] text-primary" />
      </div>
      <div className="tv-pop absolute inset-x-4 bottom-3 flex items-center gap-1.5 rounded-full border bg-background py-1 pr-1 pl-2.5 text-[11px] text-muted-foreground shadow-sm">
        <QuotesIcon className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{mark}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-primary-foreground">
          <RobotIcon className="size-3" />
          質問する
        </span>
      </div>
    </Stage>
  )
}

/** 質問する: 選んだ文が付いた欄に、質問を1文字ずつ打って送る */
export function AskVisual({ quote, question }: { quote: string; question: string }) {
  const n = [...question].length
  return (
    <Stage>
      <div className="absolute inset-x-4 top-4 flex max-w-full items-center gap-1.5 self-start rounded-full border bg-background py-0.5 pr-2 pl-2 text-[10px] text-muted-foreground" style={{ width: 'fit-content' }}>
        <QuotesIcon className="size-3 shrink-0 text-primary" />
        <span className="max-w-[200px] truncate">{short(quote, 16)}</span>
      </div>
      <div className="absolute inset-x-4 bottom-4 flex h-11 items-center gap-2 rounded-full border bg-background pr-1.5 pl-4 text-[13px]">
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="tv-type inline-block overflow-hidden align-bottom whitespace-nowrap" style={{ '--n': n, width: `${n}em`, animationTimingFunction: `steps(${n}, end)` } as React.CSSProperties}>
            {question}
          </span>
          <span className="tv-caret ml-px inline-block h-[1.1em] w-px bg-foreground align-middle" />
        </span>
        <span className="tv-send grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <ArrowUpIcon className="size-4" />
        </span>
      </div>
    </Stage>
  )
}

/** 答えを書いている印（3つの点が順に跳ねる） */
export function Typing() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="tv-dot size-1.5 rounded-full bg-primary" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  )
}

/** 終わりの印。丸を描いてから中に印を引く（1回だけ） */
export function DoneMark() {
  return (
    <span aria-hidden="true" className="relative grid size-10 shrink-0 place-items-center">
      <svg viewBox="0 0 40 40" className="size-10 text-primary">
        <circle className="tv-draw-ring" cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2.5" pathLength="1" />
        <path className="tv-draw-check" d="M13 20.5l4.5 4.5L27 15.5" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
      </svg>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="tv-spark absolute size-1 rounded-full" style={{ '--a': `${i * 60}deg`, background: 'var(--kincha)' } as React.CSSProperties} />
      ))}
    </span>
  )
}
