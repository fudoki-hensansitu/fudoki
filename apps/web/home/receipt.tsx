// ホームのうちのまちの札。札を立体のレシートの機械（天板・前面・表示窓・差し出し口）に見立て、予算と1人あたりの額を数え上げ、差し出し口から分野ごとの1人あたりのレシートを出す。
// 1人あたりは予算を人口で割った額（払った税金の額ではない）。分野の行の和が合計に合うよう、大きい端数から1円ずつ足して丸める
import * as React from 'react'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { reiwa, yearName } from '../jurisdiction/types'
import type { YearView } from '../jurisdiction/app/data'
import { OTHER_FRAME } from '../jurisdiction/domains'
import { FieldIcon } from './parts'
import './receipt.css'

/** 数え上げの長さ */
const COUNT_MS = 1200

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** 0 から to まで数え上げる。reduced-motion では最初から to。
 * to が変わったら（年度の切り替え）描く前に 0 へ戻し、前の年度の額を新しい年度の見出しで見せない */
function useCountUp(to: number) {
  const [n, setN] = React.useState(() => (reduced() ? to : 0))
  const [from, setFrom] = React.useState(to)
  if (from !== to) {
    setFrom(to)
    setN(reduced() ? to : 0)
  }
  React.useEffect(() => {
    if (reduced()) return setN(to)
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / COUNT_MS)
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

/** 演出の段。flat: 平らな札で数え上げる → solid: 札が立体の機械になる → print: 差し出し口からレシートが出る */
type Phase = 'flat' | 'solid' | 'print'
/** 数え上げを読み終える間（数え上げの後に置く） */
const READ_MS = 500
/** 立体になってからレシートが出るまで */
const SOLID_MS = 650

/** 段を進める。reduced-motion では最初から print */
function usePhase() {
  const [phase, setPhase] = React.useState<Phase>(() => (reduced() ? 'print' : 'flat'))
  React.useEffect(() => {
    if (reduced()) return setPhase('print')
    const t1 = setTimeout(() => setPhase('solid'), COUNT_MS + READ_MS)
    const t2 = setTimeout(() => setPhase('print'), COUNT_MS + READ_MS + SOLID_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])
  return phase
}

/** 段に合わせて頁を送り、動かさなくても見えるようにする。最初は札（数字）の下端が画面の外にあるときだけ札が収まる位置へ、
 * レシートが出るときは差し出し口が画面の真ん中より下にあるときだけ真ん中へ（上へは戻さない）。
 * 利用者が自分で送ったら（ホイール・タッチ・キー・スクロールバーの操作）、それ以降は動かさない。
 * scroll の event は数えない（天板が伸びたときのスクロールの anchor の補正でも起き、利用者の操作と区別できない） */
function useFollow(phase: Phase, machine: React.RefObject<HTMLElement | null>, slot: React.RefObject<HTMLElement | null>) {
  const touched = React.useRef(false)
  React.useEffect(() => {
    const mark = () => (touched.current = true)
    const opts = { passive: true } as const
    const events = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const
    for (const e of events) window.addEventListener(e, mark, opts)
    return () => {
      for (const e of events) window.removeEventListener(e, mark)
    }
  }, [])
  React.useEffect(() => {
    if (touched.current || reduced()) return
    const vh = window.innerHeight
    const go = (y: number) => y > window.scrollY + 4 && window.scrollTo({ top: y, behavior: 'smooth' })
    if (phase === 'flat' && machine.current) {
      // 札の下端が画面の外なら、札の上端まで送る（札が画面より高ければ上端を合わせる）
      const r = machine.current.getBoundingClientRect()
      if (r.bottom > vh) go(window.scrollY + Math.min(r.top - 16, r.bottom - vh + 16))
    }
    if (phase === 'print' && slot.current) go(window.scrollY + slot.current.getBoundingClientRect().top - vh * 0.5)
  }, [phase, machine, slot])
}

export function ReceiptMachine({ name, v, year, pop, base, detailHref, head }: { name: string; v: YearView; year: number; pop: number | null; base: string; detailHref: string; head: React.ReactNode }) {
  const settled = v.word === '決算'
  const what = `${yearName(year)}の${settled ? '決算' : '予算'}`
  const total = useCountUp(v.total)
  const per = useCountUp(pop ? Math.round(v.total / pop) : 0)
  const receipt = pop ? perHeadParts(v.fields, v.total, pop) : null
  const machine = React.useRef<HTMLDivElement>(null)
  const front = React.useRef<HTMLElement>(null)
  const slot = React.useRef<HTMLDivElement>(null)
  const phase = usePhase()
  useFollow(phase, machine, slot)
  const [gl, setGl] = React.useState(false)
  // 本体を three.js で描く（読み込みは数え上げの間に済ませ、立体になる段で見せる）。描けないときは CSS の本体
  React.useEffect(() => {
    let stop: (() => void) | null = null
    let alive = true
    // サーバーの bundle に three.js を入れない（import.meta.env.SSR はビルド時に定数になり、この import ごと消える）
    if (import.meta.env.SSR) return
    void import('./machine3d').then(({ mountMachine }) => {
      if (!alive || !machine.current || !front.current) return
      stop = mountMachine(machine.current, front.current, () => {
        // コンテキストを失ったら canvas を外し、CSS の本体へ戻す
        stop?.()
        stop = null
        setGl(false)
      })
      setGl(!!stop)
    }).catch(() => {})
    return () => {
      alive = false
      stop?.()
    }
  }, [])
  return (
    <div ref={machine} className="rm relative" data-phase={phase} data-gl={gl || undefined}>
      {/* 天板。手前の辺を軸に奥へ倒し、奥ほど狭く見せる（立体の段で出す。three.js で描けたら隠す） */}
      <div className="rm-top" aria-hidden="true" />
      <section ref={front} className="rm-body relative z-10 p-5 pb-14 text-brand-foreground sm:p-7 sm:pb-16">
        {head}
        {/* 表示窓。予算と1人あたりをいちばん大きく出す */}
        <dl className="rm-display mt-5 grid gap-4 px-5 py-5 sm:mt-6 sm:gap-5 sm:px-7 sm:py-6">
          <div>
            <dt className="text-[15px] opacity-80">{what}</dt>
            <dd className="mt-1.5 text-[clamp(28px,8vw,60px)] leading-none font-semibold">
              <Yen n={total} />
            </dd>
          </div>
          {pop ? (
            <div className="rm-divider pt-4 sm:pt-5">
              <dt className="text-[15px] opacity-80">1人あたりに直すと</dt>
              <dd className="mt-1.5 text-[clamp(44px,13vw,84px)] leading-none font-semibold">
                <Yen n={per} />
              </dd>
              <p className="mt-2 text-[13px] opacity-80">
                {settled ? '決算' : '予算'}の額を、人口 {pop.toLocaleString('ja-JP')}人で割った額です
              </p>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 flex justify-end">
          <Link href={detailHref} className="rm-key inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium">
            詳細を見る
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        {receipt ? <div ref={slot} className="rm-slot absolute inset-x-0 bottom-[22px]" aria-hidden="true" /> : null}
      </section>
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
