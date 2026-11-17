// ホームのうちのまちの札。札をレシートの機械に見立て、予算と1人あたりの額を数え上げ、差し出し口から分野ごとの1人あたりのレシートを出す。
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

/** 0 から to まで数え上げる。reduced-motion では最初から to */
function useCountUp(to: number) {
  const [n, setN] = React.useState(to)
  React.useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setN(to)
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / COUNT_MS)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    setN(0)
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

export function ReceiptMachine({ name, v, year, pop, base, detailHref, head }: { name: string; v: YearView; year: number; pop: number | null; base: string; detailHref: string; head: React.ReactNode }) {
  const settled = v.word === '決算'
  const what = `${yearName(year)}の${settled ? '決算' : '予算'}`
  const total = useCountUp(v.total)
  const per = useCountUp(pop ? Math.round(v.total / pop) : 0)
  const receipt = pop ? perHeadParts(v.fields, v.total, pop) : null
  return (
    <div>
      <section className="relative z-10 rounded-[24px] bg-brand p-5 pb-12 text-brand-foreground sm:p-7 sm:pb-12">
        {head}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <dl className="flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="text-sm opacity-80">{what}</dt>
              <dd className="mt-1 text-[30px] leading-none font-semibold sm:text-[40px]">
                <Yen n={total} />
              </dd>
            </div>
            {pop ? (
              <div>
                <dt className="text-sm opacity-80">1人あたりに直すと</dt>
                <dd className="mt-1 text-[30px] leading-none font-semibold sm:text-[40px]">
                  <Yen n={per} />
                </dd>
              </div>
            ) : null}
          </dl>
          <Link href={detailHref} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-fill px-3.5 py-2 text-[13px] font-medium text-brand-fill-foreground transition-colors hover:bg-brand-fill-hover">
            詳細を見る
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        {receipt ? <div className="rc-slot absolute inset-x-0 bottom-5" aria-hidden="true" /> : null}
      </section>
      {receipt ? (
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
