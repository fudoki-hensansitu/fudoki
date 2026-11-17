// ホームのうちのまちの札。緑の札で予算と1人あたりの額を順に数え上げ、札の下端の差し出し口から分野ごとの1人あたりのレシートを刷り出す。
// 札そのものをレジに見立て、立体は使わない（平らな描き方に揃える）。
// 1人あたりは予算を人口で割った額（払った税金の額ではない）。分野の行の和が合計に合うよう、大きい端数から1円ずつ足して丸める
import * as React from 'react'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { reiwa, yearName } from '../jurisdiction/types'
import type { YearView } from '../jurisdiction/app/data'
import { OTHER_FRAME } from '../jurisdiction/domains'
import { FieldIcon } from './parts'
import { COUNT_MS, PRINT_MS, READ_MS, SCROLL_MS } from './motion'
import './receipt.css'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** delay の後に 0 から to まで数え上げる。reduced-motion では最初から to。
 * to が変わったら（年度の切り替え）描く前に 0 へ戻し、前の年度の額を新しい年度の見出しで見せない */
function useCountUp(to: number, delay = 0) {
  const [n, setN] = React.useState(() => (reduced() ? to : 0))
  const [from, setFrom] = React.useState(to)
  if (from !== to) {
    setFrom(to)
    setN(reduced() ? to : 0)
  }
  React.useEffect(() => {
    if (reduced()) return setN(to)
    let raf = 0
    const t0 = performance.now() + delay
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / COUNT_MS))
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return n
}

const Yen = ({ n, className }: { n: number; className?: string }) => (
  <span className={`whitespace-nowrap tabular-nums ${className ?? ''}`}>
    {n.toLocaleString('ja-JP')}
    <small className="ml-0.5 text-[0.55em]">円</small>
  </span>
)

/** 分野ごとの1人あたり（円）。和が合計（total を人口で割って丸めた額）に合うよう、大きい端数から1円ずつ足す */
export function perHeadParts(fields: { yen: number }[], total: number, pop: number) {
  const sum = Math.round(total / pop)
  const raw = fields.map((f) => f.yen / pop)
  const parts = raw.map(Math.floor)
  const rest = sum - parts.reduce((a, b) => a + b, 0)
  raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, Math.max(0, rest))
    .forEach(([, i]) => parts[i]!++)
  return { sum, parts }
}

/** 演出の段。count: 札で数え上げる → print: 札の下端の差し出し口からレシートが出る */
type Phase = 'count' | 'print'
/** 予算を数え終えてから1人あたりを数える。2つを同時に動かすと目が追えない */
const COUNT_ALL_MS = COUNT_MS * 2
const PRINT_AT = COUNT_ALL_MS + READ_MS

/** 段を進める。数え上げ直す（key が変わる＝年度や額が変わる）たびに count へ戻し、数え終えて読む間をおいてから print にする。
 * 見せるものは常に一つにするため、数えている間は紙を出さない。reduced-motion では最初から print */
function usePhase(key: string) {
  const [phase, setPhase] = React.useState<Phase>(() => (reduced() ? 'print' : 'count'))
  const [from, setFrom] = React.useState(key)
  if (from !== key) {
    setFrom(key)
    setPhase(reduced() ? 'print' : 'count')
  }
  React.useEffect(() => {
    if (reduced()) return setPhase('print')
    const t = setTimeout(() => setPhase('print'), PRINT_AT)
    return () => clearTimeout(t)
  }, [key])
  return phase
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

/** 段に合わせて頁を送り、動かさなくても見えるようにする（カメラの代わり）。上へは戻さない。
 * count: 札の下端が画面の外なら、札の上端を越えない範囲で札が収まる位置へ。
 * print: 紙が伸びるのと同じ長さ・同じ緩急で、刷り終えたレシートの下端が画面の下端に来る位置まで送り、紙が出てくるのを追う。
 * 利用者が自分で送ったら（ホイール・タッチ・キー・ポインタ）、それ以降は動かさない。
 * scroll の event は数えない（レイアウトの補正でも起き、利用者の操作と区別できない） */
function useFollow(phase: Phase, card: React.RefObject<HTMLElement | null>, feed: React.RefObject<HTMLElement | null>) {
  const touched = React.useRef(false)
  const raf = React.useRef(0)
  React.useEffect(() => {
    const mark = () => {
      touched.current = true
      cancelAnimationFrame(raf.current)
    }
    const opts = { passive: true } as const
    const events = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const
    for (const e of events) window.addEventListener(e, mark, opts)
    return () => {
      for (const e of events) window.removeEventListener(e, mark)
      cancelAnimationFrame(raf.current)
    }
  }, [])
  React.useEffect(() => {
    if (touched.current || reduced()) return
    const vh = window.innerHeight
    const go = (to: number, ms: number, ease: (p: number) => number) => {
      const from = window.scrollY
      if (to <= from + 4) return
      cancelAnimationFrame(raf.current)
      const t0 = performance.now()
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / ms)
        window.scrollTo(0, from + (to - from) * ease(p))
        if (p < 1 && !touched.current) raf.current = requestAnimationFrame(step)
      }
      raf.current = requestAnimationFrame(step)
    }
    if (phase === 'count' && card.current) {
      const r = card.current.getBoundingClientRect()
      if (r.bottom > vh) go(window.scrollY + Math.min(r.top - 16, r.bottom - vh + 16), SCROLL_MS, easeInOut)
    }
    if (phase === 'print' && feed.current) {
      // 紙（receipt.css の rc-print）と同じ緩急で、レシートの最後（合計・バーコード）まで送る。紙は clip-path で伸ばすので、高さは最初から刷り終えた分ある
      const r = feed.current.getBoundingClientRect()
      go(window.scrollY + r.bottom - vh + 16, PRINT_MS, (p) => 1 - Math.pow(1 - p, 1.6))
    }
  }, [phase, card, feed])
}

export function ReceiptMachine({ name, v, year, pop, base, detailHref, head }: { name: string; v: YearView; year: number; pop: number | null; base: string; detailHref: string; head: React.ReactNode }) {
  const settled = v.word === '決算'
  const what = `${yearName(year)}の${settled ? '決算' : '予算'}`
  const total = useCountUp(v.total)
  const per = useCountUp(pop ? Math.round(v.total / pop) : 0, COUNT_MS)
  const receipt = pop ? perHeadParts(v.fields, v.total, pop) : null
  const card = React.useRef<HTMLElement>(null)
  const counted = `${year}:${v.total}`
  const phase = usePhase(counted)
  const feed = React.useRef<HTMLDivElement>(null)
  useFollow(phase, card, feed)
  return (
    <div className="rm" data-phase={phase}>
      <section ref={card} className={`rm-card p-5 text-brand-foreground sm:p-7 ${receipt ? 'pb-12 sm:pb-14' : ''}`}>
        {head}
        {/* 予算と1人あたりを同じ大きさでいちばん大きく出す。見出しも読める大きさにする */}
        <dl className="mt-5 grid gap-4 sm:mt-6 sm:gap-5">
          <div>
            <dt className="text-[clamp(17px,4.6vw,22px)] opacity-80">{what}</dt>
            <dd className="mt-1.5 text-[clamp(28px,8vw,60px)] leading-none font-semibold">
              <Yen n={total} />
            </dd>
          </div>
          {pop ? (
            // 予算を数え終えてから出して数える（数え直すたびに出し直す）
            <div key={counted} className="rm-per rm-divider pt-4 sm:pt-5">
              <dt className="text-[clamp(17px,4.6vw,22px)] opacity-80">1人あたりに直すと</dt>
              <dd className="mt-1.5 text-[clamp(28px,8vw,60px)] leading-none font-semibold">
                <Yen n={per} />
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 flex justify-end">
          <Link href={detailHref} className="inline-flex items-center gap-1.5 rounded-full bg-brand-fill px-3.5 py-2 text-[13px] font-medium text-brand-fill-foreground transition-colors hover:bg-brand-fill-hover">
            詳細を見る
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        {/* 札の下端の差し出し口。紙はここから出る */}
        {receipt ? <div className="rm-slot" aria-hidden="true" /> : null}
      </section>
      {receipt && phase === 'print' ? (
        <div ref={feed} className="rc-feed">
          {/* 年度を替えたら刷り直す */}
          <div key={year} className="rc-print rc-run">
          <div className="rc-paper">
            <p className="text-center text-[18px] font-semibold tracking-[0.3em]">{name}</p>
            <p className="mt-1 text-center text-[13px] text-muted-foreground">
              {reiwa(year)} {settled ? '決算' : '当初予算'}・1人あたり
            </p>
            <ul className="rc-rule mt-4 pt-2">
              {v.fields.map((f, i) => {
                const row = (
                  <>
                    <span className="flex items-baseline gap-2 text-[15px]">
                      <FieldIcon id={f.id} className="size-[18px] shrink-0 self-center text-muted-foreground" />
                      <span className="whitespace-nowrap">{f.name}</span>
                      <span className="rc-lead" />
                      <Yen n={receipt.parts[i]!} className="text-[16px]" />
                    </span>
                    {f.examples ? <span className="mt-0.5 block pl-[26px] text-[12px] text-muted-foreground">{f.examples}</span> : null}
                  </>
                )
                // その他は事業の絞り込みに無いので押せない
                return (
                  <li key={f.id}>
                    {f.id === OTHER_FRAME.id ? (
                      <div className="px-1.5 py-2">{row}</div>
                    ) : (
                      <Link href={`${base}/projects?field=${f.id}`} className="block rounded-lg px-1.5 py-2 transition-colors hover:bg-card">
                        {row}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="rc-rule mt-2 flex items-baseline justify-between pt-3">
              <span className="text-[15px]">合計</span>
              <Yen n={receipt.sum} className="text-[28px] font-semibold text-primary" />
            </p>
            <div className="rc-bar" aria-hidden="true" />
          </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
