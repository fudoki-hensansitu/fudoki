// ホームのうちのまちの札。緑の札で予算と1人あたりの額を順に数え上げ、札の下端の差し出し口から分野ごとの1人あたりのレシートを刷り出す。
// 年度を替えて刷り直すときは、前の紙を差し出し口で切り離して丸まりながら落とし、落ち終えてから数え直して新しい紙を刷る。
// 札そのものをレジに見立て、平らな描き方に揃える。切り離して落とす紙だけを立体にする（fall3d.ts）。
// 1人あたりは予算を人口で割った額（払った税金の額ではない）。分野の行の和が合計に合うよう、大きい端数から1円ずつ足して丸める
import * as React from 'react'
import { encode } from 'uqr'
import { ArrowRightIcon, ShareNetworkIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { reiwa, yearName } from '../jurisdiction/types'
import type { YearView } from '../jurisdiction/app/data'
import { OTHER_FRAME } from '../jurisdiction/domains'
import { FieldIcon } from './parts'
import { perHeadParts } from './per-head'
import { COUNT_MS, FALL_MS, PRINT_MS, READ_MS, SCROLL_MS } from './motion'
import './receipt.css'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** delay の後に 0 から to まで数え上げる。reduced-motion では最初から to。
 * to が変わったら（年度の切り替え）描く前に 0 へ戻し、前の年度の額を新しい年度の見出しで見せない */
function useCountUp(to: number, delay: number, hold: boolean) {
  const [n, setN] = React.useState(() => (reduced() ? to : 0))
  const [from, setFrom] = React.useState(to)
  if (from !== to) {
    setFrom(to)
    setN(reduced() ? to : 0)
  }
  React.useEffect(() => {
    if (reduced()) return setN(to)
    if (hold) return
    let raf = 0
    const t0 = performance.now() + delay
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / COUNT_MS))
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, hold])
  return n
}

/** 相対の url を、いま開いている origin に付けて外から開ける形にする */
const absolute = (url: string) => (typeof location === 'undefined' ? url : new URL(url, location.origin).href)

/** シェアで添えるリンク。受け取った人がホームで自分のまちを選ぶように、ホームだけにする（2026-11-17 yuito） */
const HOME_URL = 'https://fudoki.dev/'

/** このレシートを画像にして渡す。画面の紙をそのまま写し（snap.ts、紙の上のボタンは写さない）、
 * 画像を渡せる共有の画面（スマホ）があればそれで、無ければ画像を保存する。押してから写すと共有の画面を開ける時間を過ぎることがあるので、押し始めに写し始める */
function Share({ title, file }: { title: string; file: string }) {
  const ref = React.useRef<HTMLButtonElement>(null)
  const shot = React.useRef<Promise<Blob | null> | null>(null)
  const [done, setDone] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  React.useEffect(() => () => clearTimeout(timer.current), [])
  const take = () => {
    const paper = ref.current?.closest<HTMLElement>('.rc-paper')
    if (!paper) return Promise.resolve(null)
    shot.current ??= import('./snap')
      .then(({ paperCanvas }) => paperCanvas(paper, { scale: 3, skip: true }))
      .then((c) => new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png')))
      .catch(() => null)
    return shot.current
  }
  const onClick = async () => {
    const blob = await take()
    shot.current = null
    if (!blob) return
    const png = new File([blob], file, { type: 'image/png' })
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [png] })) {
      return navigator.share({ files: [png], title, text: `${title}\n${HOME_URL}` }).catch(() => {})
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(png)
    a.download = file
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    setDone(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setDone(false), 2000)
  }
  return (
    <button
      ref={ref}
      type="button"
      data-snap="skip"
      onPointerDown={() => void take()}
      onClick={() => void onClick()}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-card"
    >
      <ShareNetworkIcon className="size-4" />
      {done ? '保存しました' : 'シェア'}
    </button>
  )
}

/** url の QR コード（紙の上なので、明暗で変えない色で描く）。相対の url はいま開いている origin に付けて読めるようにする */
function Qr({ url }: { url: string }) {
  const href = absolute(url)
  const { data, size } = React.useMemo(() => encode(href, { border: 0 }), [href])
  const d = data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join('')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="rc-qr" role="img" aria-label="まちの頁を開く QR コード" shapeRendering="crispEdges">
      <path d={d} fill="currentColor" />
    </svg>
  )
}

const Yen = ({ n, className }: { n: number; className?: string }) => (
  <span className={`whitespace-nowrap tabular-nums ${className ?? ''}`}>
    {n.toLocaleString('ja-JP')}
    <small className="ml-0.5 text-[0.55em]">円</small>
  </span>
)

/** 演出の段。count: 札で数え上げる → print: 札の下端の差し出し口からレシートが出る */
type Phase = 'count' | 'print'
/** 予算を数え終えてから1人あたりを数える。2つを同時に動かすと目が追えない */
const COUNT_ALL_MS = COUNT_MS * 2
const PRINT_AT = COUNT_ALL_MS + READ_MS

/** 段を進める。数え上げ直す（key が変わる＝年度や額が変わる）たびに count へ戻し、数え終えて読む間をおいてから print にする。
 * 見せるものは常に一つにするため、数えている間は紙を出さない。reduced-motion では最初から print */
function usePhase(key: string, hold: boolean) {
  const [phase, setPhase] = React.useState<Phase>(() => (reduced() ? 'print' : 'count'))
  const [from, setFrom] = React.useState(key)
  if (from !== key) {
    setFrom(key)
    setPhase(reduced() ? 'print' : 'count')
  }
  React.useEffect(() => {
    if (reduced()) return setPhase('print')
    if (hold) return
    const t = setTimeout(() => setPhase('print'), PRINT_AT)
    return () => clearTimeout(t)
  }, [key, hold])
  return phase
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

/** 段に合わせて頁を送り、動かさなくても見えるようにする（カメラの代わり）。上へは戻さない。
 * count: 札の下端が画面の外なら、札の上端を越えない範囲で札が収まる位置へ。
 * print（printing が新しく刷る紙の key になったとき）: 紙が伸びるのと同じ長さ・同じ緩急で、刷り終えたレシートの下端が画面の下端に来る位置まで送り、紙が出てくるのを追う。
 * 利用者が自分で送ったら（ホイール・タッチ・キー・ポインタ）、それ以降は動かさない。
 * scroll の event は数えない（レイアウトの補正でも起き、利用者の操作と区別できない） */
function useFollow(phase: Phase, printing: string | null, card: React.RefObject<HTMLElement | null>, feed: React.RefObject<HTMLElement | null>) {
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
    if (phase === 'count' && !printing && card.current) {
      const r = card.current.getBoundingClientRect()
      if (r.bottom > vh) go(window.scrollY + Math.min(r.top - 16, r.bottom - vh + 16), SCROLL_MS, easeInOut)
    }
    if (printing && feed.current) {
      // 紙と同じ長さ・緩急で、刷り終えたときのレシートの最後（合計・QR コード）まで送る。
      // 紙は高さを 0 から伸ばすので、刷り終えた高さは中身の高さ（scrollHeight）から求める
      const f = feed.current
      const latest = f.querySelector<HTMLElement>('[data-latest]')
      if (latest) go(window.scrollY + f.getBoundingClientRect().top + latest.scrollHeight + FEED_PAD - vh + 16, PRINT_MS, PRINT_EASE)
    }
  }, [phase, printing, card, feed])
}

/** 紙送りの緩急（出だしと終わりだけ緩め、ほぼ一定の速さで送る）。頁送りも同じにする */
const PRINT_EASE_CSS = 'cubic-bezier(0.3, 0.1, 0.45, 1)'
const PRINT_EASE = (p: number) => 1 - Math.pow(1 - p, 1.6)
/** .rc-feed の下の余白（receipt.css） */
const FEED_PAD = 28

/** 一枚の紙。grow: 差し出し口から高さ 0 から伸びて出る（上から順に見える）。still: 動かさない。reduced-motion では動かさずに終わりの姿にする */
function Strip({ mode, children }: { mode: 'grow' | 'still'; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || mode === 'still' || reduced()) return
    const a = el.animate([{ height: '0px' }, { height: `${el.scrollHeight}px` }], { duration: PRINT_MS, easing: PRINT_EASE_CSS })
    return () => a.cancel()
  }, [mode])
  return (
    <div ref={ref} data-latest className="rc-strip">
      {children}
    </div>
  )
}

/** 床に積んだ紙を片付ける（落とす立体を読んだあとだけ入る）。札を外すときに呼ぶ */
let sweep: (() => void) | null = null

/** 切り離した前のレシート。差し出し口の下の同じ場所に置いたまま、紙を写した立体（fall3d.ts、初めて紙を刷った時点で先に読む）に差し替えて、
 * 丸まりながら床（画面の下端）へ落とす。落ちた紙は札を外すまで床に積んでおく。立体の最初の姿が出てから DOM の紙を隠す。WebGL が使えなければ、落とさずに消す */
function Falling({ onDone, children }: { onDone: () => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const done = React.useRef(onDone)
  done.current = onDone
  React.useEffect(() => {
    // three.js はサーバーの bundle に入れない（effect はサーバーでは走らないが、分岐が無いと動的 import の chunk が入る）
    if (import.meta.env.SSR) return
    let alive = true
    let fall: { play: () => Promise<void>; dispose: () => void } | null = null
    void (async () => {
      const el = ref.current?.querySelector<HTMLElement>('.rc-paper')
      try {
        if (!el) throw new Error('紙がありません')
        const { paperCanvas, fallPaper, clearFloor } = await import('./fall3d')
        sweep = clearFloor
        const texture = await paperCanvas(el)
        if (!alive) return
        fall = fallPaper(texture, el.getBoundingClientRect(), FALL_MS)
        if (!fall) throw new Error('WebGL が使えません')
        ref.current!.style.visibility = 'hidden'
        await fall.play()
      } catch {
        // 落とせないときは、そのまま消す
      }
      fall?.dispose()
      fall = null
      if (alive) done.current()
    })()
    return () => {
      alive = false
      fall?.dispose()
      fall = null
    }
  }, [])
  return (
    <div ref={ref} className="rc-falling" aria-hidden="true" inert>
      {children}
    </div>
  )
}

/** 刷った一枚の紙（数え上げの key と、その年度のデータ） */
type Printed = { key: string; year: number; v: YearView }

export function ReceiptMachine({ name, v, year, pop, base, detailHref, head }: { name: string; v: YearView; year: number; pop: number | null; base: string; detailHref: string; head: React.ReactNode }) {
  const settled = v.word === '決算'
  const what = `${yearName(year)}の${settled ? '決算' : '予算'}`
  const counted = `${year}:${v.total}`
  const feed = React.useRef<HTMLDivElement>(null)
  /** 刷った紙（いま出ている一枚）と、切り離して落としている前の紙 */
  const [printed, setPrinted] = React.useState<Printed | null>(null)
  const [falling, setFalling] = React.useState<{ r: Printed; height: number } | null>(null)
  const fell = React.useCallback(() => setFalling(null), [])
  const [seen, setSeen] = React.useState(counted)
  if (seen !== counted) {
    // 数え直す（年度や額が変わる）ときは、出ている紙を差し出し口で切り離して落とし、新しい紙は数え終えてから一から刷る
    setSeen(counted)
    const height = feed.current?.querySelector<HTMLElement>('[data-latest]')?.scrollHeight ?? 0
    // 新しい年度に紙を出せない（人口が無い）ときは落とさずに消す。落とす紙が描かれず、落ち終えた合図が来ないため
    const drop = !!pop && printed && height > 0 && !reduced()
    setFalling(drop ? { r: printed, height } : null)
    setPrinted(null)
  }
  // 前の紙を落としている間は数えない。落ち終えた（落とせずに消した）ときから数える（見せるものは常に一つ）
  const hold = falling != null
  const total = useCountUp(v.total, 0, hold)
  const per = useCountUp(pop ? Math.round(v.total / pop) : 0, COUNT_MS, hold)
  const receipt = pop ? perHeadParts(v.fields, v.total, pop) : null
  const card = React.useRef<HTMLElement>(null)
  const phase = usePhase(counted, hold)
  React.useEffect(() => {
    if (phase === 'print' && pop && printed?.key !== counted) setPrinted({ key: counted, year, v })
  }, [phase, counted])
  // 紙を刷ったら、切り離して落とす立体（three.js）を先に読んでおく。年度を替えた瞬間に読み込みを待たず落とし始め、数え上げと重ねない
  React.useEffect(() => {
    if (import.meta.env.SSR || !printed || reduced()) return
    void import('./fall3d').catch(() => {})
  }, [printed])
  // 札を外したら（まちを替えた・頁を移った）、床に積んだ紙も片付ける
  React.useEffect(() => () => sweep?.(), [])
  /** いま刷っている紙の key（刷り終えるまで）。頁送りと紙の動きに使う */
  const printing = phase === 'print' && printed?.key === counted ? counted : null
  useFollow(phase, printing, card, feed)
  /** 一枚の紙の中身 */
  const paper = (r: Printed) => {
    const { parts, sum } = perHeadParts(r.v.fields, r.v.total, pop!)
    return (
    <div className="rc-paper">
      <p className="text-center text-[18px] font-semibold tracking-[0.3em]">{name}</p>
      <p className="mt-1 text-center text-[13px] text-muted-foreground">
        {reiwa(r.year)} {r.v.word === '決算' ? '決算' : '当初予算'}・1人あたり
      </p>
      <ul className="rc-rule mt-4 pt-2">
        {r.v.fields.map((f, i) => {
          const row = (
            <>
              <span className="flex items-baseline gap-2 text-[15px]">
                <FieldIcon id={f.id} className="size-[18px] shrink-0 self-center text-muted-foreground" />
                <span className="whitespace-nowrap">{f.name}</span>
                <span className="rc-lead" />
                <Yen n={parts[i]!} className="text-[16px]" />
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
      <p className="rc-rule mt-2 flex items-center justify-between pt-3">
        <span className="text-[15px]">1人あたりの合計</span>
        <Yen n={sum} className="text-[28px] font-semibold text-primary" />
      </p>
      {/* 読み取るとまちの頁を開く QR と、このレシートを画像にして渡すボタン（添えるリンクはホーム） */}
      <div className="mt-5 flex items-center justify-center gap-5">
        <Qr url={detailHref} />
        <Share title={`${name}の1人あたりのレシート（${reiwa(r.year)}）｜風土記`} file={`fudoki-${name}-${r.year}.png`} />
      </div>
    </div>
    )
  }
  return (
    <div className="rm">
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
            <div key={counted} className="rm-per rm-divider pt-4 sm:pt-5" style={{ animationDelay: `${COUNT_MS}ms`, animationPlayState: hold ? 'paused' : undefined }}>
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
      {pop ? (
        <div ref={feed} className="rc-feed" style={falling && !printed ? { minHeight: falling.height } : undefined}>
          <div className="rc-print">
            {printed ? (
              <Strip key={printed.key} mode={printed.key === printing ? 'grow' : 'still'}>
                {paper(printed)}
              </Strip>
            ) : null}
            {/* 切り離した前の紙は、丸まりながら落ちて消える */}
            {falling ? (
              <Falling key={falling.r.key} onDone={fell}>
                {paper(falling.r)}
              </Falling>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
