// ホームのうちのまちの札。緑の札で予算と1人あたりの額を順に数え上げ、札がレジの画面になって、その下にレジの本体（three.js、形は Blender の model）が現れ、
// 差し出し口から分野ごとの1人あたりのレシートを刷り出す。
// 1人あたりは予算を人口で割った額（払った税金の額ではない）。分野の行の和が合計に合うよう、大きい端数から1円ずつ足して丸める
import * as React from 'react'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { reiwa, yearName } from '../jurisdiction/types'
import type { YearView } from '../jurisdiction/app/data'
import { OTHER_FRAME } from '../jurisdiction/domains'
import { FieldIcon } from './parts'
import type { Printer } from './machine3d'
import { COUNT_MS, MORPH_MS, PRINT_MS, READ_MS, SCROLL_MS, SETTLE_MS } from './motion'
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

/** 演出の段。count: 札で数え上げる → appear: 札がレジの画面になり本体が現れる → print: 差し出し口からレシートが出る */
type Phase = 'count' | 'appear' | 'print'
/** 予算を数え終えてから1人あたりを数える。2つを同時に動かすと目が追えない */
const COUNT_ALL_MS = COUNT_MS * 2
const APPEAR_AT = COUNT_ALL_MS + READ_MS
const PRINT_AT = APPEAR_AT + MORPH_MS + SETTLE_MS

/** 段を進める。reduced-motion では最初から print */
function usePhase() {
  const [phase, setPhase] = React.useState<Phase>(() => (reduced() ? 'print' : 'count'))
  React.useEffect(() => {
    if (reduced()) return setPhase('print')
    const t1 = setTimeout(() => setPhase('appear'), APPEAR_AT)
    const t2 = setTimeout(() => setPhase('print'), PRINT_AT)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])
  return phase
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

/** 段に合わせて頁を送り、動かさなくても見えるようにする（カメラの代わり）。上へは戻さない。
 * count: 札の下端が画面の外なら札が収まる位置へ。appear: 本体が画面の下半分に入る位置へ。
 * print: 紙が伸びるのと同じ長さ・同じ緩急で、本体が画面の上に残る位置まで送り、紙が出てくるのを追う。
 * 利用者が自分で送ったら（ホイール・タッチ・キー・ポインタ）、それ以降は動かさない。
 * scroll の event は数えない（レイアウトの補正でも起き、利用者の操作と区別できない） */
function useFollow(phase: Phase, card: React.RefObject<HTMLElement | null>, stage: React.RefObject<HTMLElement | null>) {
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
    if (phase === 'appear' && stage.current) {
      const r = stage.current.getBoundingClientRect()
      if (r.bottom > vh * 0.7) go(window.scrollY + r.bottom - vh * 0.7, SCROLL_MS, easeInOut)
    }
    if (phase === 'print' && stage.current) {
      // 紙（receipt.css の rc-print）と同じ緩急で、差し出し口が画面の上から 3 割の位置に来るまで送る
      const r = stage.current.getBoundingClientRect()
      go(window.scrollY + r.bottom - vh * 0.3, PRINT_MS, (p) => 1 - Math.pow(1 - p, 1.6))
    }
  }, [phase, card, stage])
}

export function ReceiptMachine({ name, v, year, pop, base, detailHref, head }: { name: string; v: YearView; year: number; pop: number | null; base: string; detailHref: string; head: React.ReactNode }) {
  const settled = v.word === '決算'
  const what = `${yearName(year)}の${settled ? '決算' : '予算'}`
  const total = useCountUp(v.total)
  const per = useCountUp(pop ? Math.round(v.total / pop) : 0, COUNT_MS)
  const receipt = pop ? perHeadParts(v.fields, v.total, pop) : null
  const printable = !!receipt
  const card = React.useRef<HTMLElement>(null)
  const stage = React.useRef<HTMLDivElement>(null)
  const phase = usePhase()
  useFollow(phase, card, stage)
  const [gl, setGl] = React.useState<Printer | null>(null)
  // レジの本体を three.js で描く（読み込みは数え上げの間に済ませる）。描けないときは CSS の差し出し口だけ
  React.useEffect(() => {
    let m: Printer | null = null
    let alive = true
    // サーバーの bundle に three.js を入れない（import.meta.env.SSR はビルド時に定数になり、この import ごと消える）
    if (import.meta.env.SSR || !printable) return
    void import('./machine3d').then(async ({ mountPrinter }) => {
      if (!alive || !stage.current) return
      const mounted = await mountPrinter(stage.current, () => {
        // コンテキストを失ったら canvas を外し、CSS の差し出し口へ戻す
        m?.stop()
        m = null
        setGl(null)
      })
      if (!alive) return mounted?.stop()
      m = mounted
      setGl(m)
    }).catch(() => {})
    return () => {
      alive = false
      m?.stop()
    }
  }, [printable])
  // 段に合わせて本体を動かす。three.js の読み込みが段より遅れたときと reduced-motion では、動かさずにその段の姿にする
  const shown = React.useRef<{ m: Printer | null; phase: Phase; year: number }>({ m: null, phase: 'count', year })
  React.useEffect(() => {
    if (!gl) return
    const was = shown.current
    const fresh = was.m !== gl
    const instant = fresh || reduced()
    if (phase !== 'count' && (fresh || was.phase === 'count')) gl.appear(instant)
    if (phase === 'print' && (fresh || was.phase !== 'print' || was.year !== year)) gl.print(instant)
    shown.current = { m: gl, phase, year }
  }, [gl, phase, year])
  return (
    <div className="rm" data-phase={phase} data-gl={gl ? true : undefined}>
      <section ref={card} className="rm-card p-5 text-brand-foreground sm:p-7">
        {head}
        {/* 予算と1人あたりを同じ大きさでいちばん大きく出す */}
        <dl className="mt-5 grid gap-4 sm:mt-6 sm:gap-5">
          <div>
            <dt className="text-[15px] opacity-80">{what}</dt>
            <dd className="mt-1.5 text-[clamp(28px,8vw,60px)] leading-none font-semibold">
              <Yen n={total} />
            </dd>
          </div>
          {pop ? (
            <div className="rm-divider pt-4 sm:pt-5">
              <dt className="text-[15px] opacity-80">1人あたりに直すと</dt>
              <dd className="mt-1.5 text-[clamp(28px,8vw,60px)] leading-none font-semibold">
                <Yen n={per} />
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 flex justify-end">
          <Link href={detailHref} className="rm-key inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium">
            詳細を見る
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </section>
      {/* レジの本体の置き場。高さは支柱の上端から差し出し口までで、three.js が決める。描けないときは CSS の差し出し口 */}
      {receipt ? (
        <div ref={stage} className="rm-stage relative" aria-hidden="true">
          <div className="rm-slot" />
        </div>
      ) : null}
      {receipt && phase === 'print' ? (
        <div className="rc-feed">
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
            <p className="mt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
              {v.total.toLocaleString('ja-JP')}円 ÷ {pop!.toLocaleString('ja-JP')}人
              <br />
              払った税金の額ではありません
            </p>
            <div className="rc-bar" aria-hidden="true" />
          </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
