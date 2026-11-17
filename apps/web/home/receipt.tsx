// ホームのうちのまちの札。緑の札で予算と1人あたりの額を順に数え上げ、札の下端の差し出し口から分野ごとの1人あたりのレシートを刷り出す。
// 年度を替えて刷り直すときは、紙を切らずに続けて刷る。前の紙は新しい紙に押し出されて垂れ、下で奥へ折り返してレシートの裏を上へ戻る（キャタピラーのような1本の続いた紙）。
// 札そのものをレジに見立て、平らな描き方に揃える。押し出された前の紙だけを立体にする（ribbon3d.ts）。
// 1人あたりは予算を人口で割った額（払った税金の額ではない）。分野の行の和が合計に合うよう、大きい端数から1円ずつ足して丸める
import * as React from 'react'
import { encode } from 'uqr'
import { CheckIcon, LinkIcon, XLogoIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { cn } from '@/lib/utils'
import { titleVariants } from '@/components/ui/title'
import { reiwa, yearName } from '../jurisdiction/types'
import type { YearView } from '../jurisdiction/app/data'
import { OTHER_FRAME } from '../jurisdiction/domains'
import { FieldIcon } from './parts'
import { perHeadParts } from './per-head'
import { COUNT_MS, PRINT_MS, READ_MS, SCROLL_MS } from './motion'
import './receipt.css'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** delay の後の数え上げ。下の桁から1桁ずつ回して止め、次の桁へ繰り上がる（動くのはいつも1桁だけ）。返すのは、止まった下の桁の数と、回っている桁の今の数字。
 * reduced-motion では最初から止まった形。to が変わったら（年度の切り替え）描く前に最初へ戻し、前の年度の額を新しい年度の見出しで見せない */
function useCountUp(to: number, delay = 0) {
  const digits = String(Math.max(0, to)).length
  const done = { settled: digits, spin: -1 }
  const [state, setState] = React.useState(() => (reduced() ? done : { settled: 0, spin: 0 }))
  const [from, setFrom] = React.useState(to)
  if (from !== to) {
    setFrom(to)
    setState(reduced() ? done : { settled: 0, spin: 0 })
  }
  React.useEffect(() => {
    if (reduced()) return setState(done)
    let raf = 0
    const t0 = performance.now() + delay
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / COUNT_MS))
      const at = p * digits
      const settled = Math.min(digits, Math.floor(at))
      // 回っている桁は 0 から2周して、止まる数字に落ち着く
      const spin = settled < digits ? Math.floor((at - settled) * 20) % 10 : -1
      setState((s) => (s.settled === settled && s.spin === spin ? s : { settled, spin }))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return { to, ...state }
}

/** 数え上げの途中の金額。まだ回っていない上の桁は場所だけ取って隠す（数字が横へずれないように） */
function Counting({ c }: { c: ReturnType<typeof useCountUp> }) {
  const text = c.to.toLocaleString('ja-JP')
  let k = -1
  const chars = [...text].reverse().map((ch, i) => {
    if (ch < '0' || ch > '9') return { ch, at: k + 0.5, i }
    k++
    return { ch: k === c.settled && c.spin >= 0 ? String(c.spin) : ch, at: k, i }
  })
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="sr-only">{text}円</span>
      <span aria-hidden="true">
        {chars.reverse().map(({ ch, at, i }) => (
          <span key={i} className={at > c.settled ? 'invisible' : undefined}>
            {ch}
          </span>
        ))}
        <small className="ml-1 text-[0.55em]">円</small>
      </span>
    </span>
  )
}

/** 相対の url を、いま開いている origin に付けて外から開ける形にする */
const absolute = (url: string) => (typeof location === 'undefined' ? url : new URL(url, location.origin).href)

/** シェアで添えるリンク。受け取った人がホームで自分のまちを選ぶように、ホームだけにする（2026-11-17 yuito） */
const HOME_URL = 'https://fudoki.dev/'
/** X に添える文言（2026-11-17 yuito） */
const SHARE_TEXT = '私のお金はどこへ行った？ | 風土記'

/** シェアのボタン。X に投稿するボタンと、ホームのリンクをコピーするボタンを、アイコンだけで並べる */
function Share() {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  React.useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    if (!(await navigator.clipboard.writeText(HOME_URL).then(() => true, () => false))) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }
  const round = 'inline-flex size-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-card'
  return (
    <div className="flex items-center gap-2">
      <a href={`https://x.com/intent/post?${new URLSearchParams({ text: SHARE_TEXT, url: HOME_URL })}`} target="_blank" rel="noopener noreferrer" aria-label="Xでシェア" className={round}>
        <XLogoIcon className="size-5" />
      </a>
      <button type="button" onClick={() => void copy()} aria-label={copied ? 'リンクをコピーしました' : 'リンクをコピー'} className={round}>
        {copied ? <CheckIcon className="size-5" /> : <LinkIcon className="size-5" />}
      </button>
    </div>
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
    <small className="ml-1 text-[0.55em]">円</small>
  </span>
)

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
      // 紙は高さを 0 から伸ばすので、刷り終えた高さは中身の高さ（paperHeight）から求める
      const f = feed.current
      const latest = f.querySelector<HTMLElement>('[data-latest]')
      if (latest) go(window.scrollY + f.getBoundingClientRect().top + paperHeight(latest) + FEED_PAD - vh + 16, PRINT_MS, PRINT_EASE)
    }
  }, [phase, printing, card, feed])
}

/** 紙送りの緩急（出だしと終わりだけ緩め、ほぼ一定の速さで送る）。頁送りも同じにする */
const PRINT_EASE_CSS = 'cubic-bezier(0.3, 0.1, 0.45, 1)'
const PRINT_EASE = (p: number) => 1 - Math.pow(1 - p, 1.6)
/** .rc-feed の下の余白（receipt.css） */
const FEED_PAD = 28

/** 一枚の紙の入れ物（Strip）に入った紙の、刷り終えたときの高さ。入れ物は伸びている途中でも、中の紙はいつも全部の高さを持つ */
const paperHeight = (strip: HTMLElement) => (strip.firstElementChild as HTMLElement | null)?.offsetHeight ?? strip.scrollHeight

/** 一枚の紙。grow: 差し出し口から高さ 0 から伸びて出る（紙の末端から見え、頭のまちの名前が最後に出る）。still: 動かさない。reduced-motion では動かさずに終わりの姿にする */
function Strip({ mode, joined, children }: { mode: 'grow' | 'still'; joined: boolean; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || mode === 'still' || reduced()) return
    const a = el.animate([{ height: '0px' }, { height: `${paperHeight(el)}px` }], { duration: PRINT_MS, easing: PRINT_EASE_CSS })
    return () => a.cancel()
  }, [mode])
  return (
    <div ref={ref} data-latest className={`rc-strip${joined ? ' rc-joined' : ''}`}>
      {children}
    </div>
  )
}

/** 押し出された紙を描く立体の、紙の左右の余白（折り返して戻る紙は横に少しずれる） */
const RIBBON_MARGIN = 48
/** 新しい紙の末端から、前の紙が折り返す所までの高さ */
const RIBBON_GAP = 40
/** 紙の境のミシン目の色（紙の上なので明暗で変えない） */
// oxlint-disable-next-line design/color-literal -- canvas に描く絵の色で、receipt.css の .rc-ribbon-dom::before と同じ値にする
const PERFORATION = 'rgba(0, 0, 0, 0.3)'
/** 刷った紙の絵（ribbon3d.ts に貼る）。刷り終えたときに写しておき、押し出されたら使う */
const pictures = new Map<number, HTMLCanvasElement>()
/** 立体が使えない（WebGL が無い・絵を写せない）と分かったら、以後は前の紙を残さない */
let ribbonOff = false

/** 紙を写す（差し出し口の影は .rc-print の上端に別に付けるので、紙には描かない） */
const picture = async (el: HTMLElement) => (await import('./snap')).paperCanvas(el, { shade: false })

/** 紙の境の切れ目（ミシン目）を、紙の絵の上端に描いたもの。前の紙は次の紙の下端に続くので、上端が二枚の境になる */
const perforations = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()
function perforated(texture: HTMLCanvasElement, height: number) {
  let c = perforations.get(texture)
  if (c) return c
  c = document.createElement('canvas')
  c.width = texture.width
  c.height = texture.height
  const g = c.getContext('2d')!
  g.drawImage(texture, 0, 0)
  const k = texture.height / height
  g.scale(k, k)
  g.fillStyle = PERFORATION
  const w = texture.width / k
  for (let x = 3; x < w - 3; x += 7) g.fillRect(x, 0, 4, 1.5)
  perforations.set(texture, c)
  return c
}

/** 押し出された前の紙（新しい順）。今出ている紙の下端に続く1本の紙として、真下へ垂れて下で奥へ折り返し、レシートの裏を上へ戻る立体（ribbon3d.ts）に描く。
 * 立体を描くまで（読み込み・絵を写す間）は、いちばん新しい一枚を DOM のまま同じ場所に出しておく。WebGL が使えない・絵を写せないときは、前の紙を残さない（以後も残さない） */
function Ribbon({ papers, onHeight, onFail, children }: { papers: Older[]; onHeight: (h: number) => void; onFail: () => void; children: React.ReactNode }) {
  const wrap = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  /** 立体に描き終えた、いちばん新しい紙の id（それまでは DOM のまま出す） */
  const [drawn, setDrawn] = React.useState<number | null>(null)
  const fail = React.useRef(onFail)
  fail.current = onFail
  const drawnRef = React.useRef<number | null>(null)
  const list = React.useRef(papers)
  list.current = papers
  const height = React.useRef(onHeight)
  height.current = onHeight
  /** 止まっている描き直しを起こす（紙が増えた・差し出し口の紙が伸びた・幅が変わったとき） */
  const kick = React.useRef(() => {})
  React.useEffect(() => kick.current(), [papers])
  React.useEffect(() => {
    // three.js はサーバーの bundle に入れない（effect はサーバーでは走らないが、分岐が無いと動的 import の chunk が入る）
    if (import.meta.env.SSR) return
    let alive = true
    let raf = 0
    let stage: ReturnType<typeof import('./ribbon3d').ribbon> = null
    let resize: ResizeObserver | null = null
    const taking = new Set<number>()
    void (async () => {
      try {
        const { ribbon, TURN_R } = await import('./ribbon3d')
        if (!alive || !canvas.current) return
        stage = ribbon(canvas.current, RIBBON_MARGIN)
        if (!stage) throw new Error('WebGL が使えません')
        const print = canvas.current.parentElement!.parentElement!
        let last = ''
        // 描き直すのは、紙の並び・差し出し口の紙の長さ・幅が変わったときだけ（kick で起こす）
        const frame = () => {
          raf = 0
          const top = list.current[0]
          // 絵の無い紙（刷り終える前に押し出された紙）は、DOM の写しから写す。写し終えるまで描かない
          if (top && !pictures.has(top.r.id)) {
            const el = wrap.current?.querySelector<HTMLElement>('.rc-paper')
            if (el && !taking.has(top.r.id)) {
              taking.add(top.r.id)
              void picture(el).then(
                (c) => pictures.set(top.r.id, c),
                () => {
                  ribbonOff = true
                  fail.current()
                },
              )
            }
            raf = requestAnimationFrame(frame)
            return
          }
          const sheets = list.current.flatMap((o) => {
            const texture = pictures.get(o.r.id)
            return texture ? [{ key: String(o.r.id), texture: perforated(texture, o.height), height: o.height }] : []
          })
          const strip = print.querySelector<HTMLElement>(':scope > [data-latest]')
          const attach = strip?.offsetHeight ?? 0
          const incoming = strip ? paperHeight(strip) : (top?.height ?? 0)
          // 折り返すのは、新しいレシートが刷り終えた末端より少し下
          const turn = Math.max(incoming, top?.height ?? 0) + RIBBON_GAP
          const width = print.clientWidth
          const h = Math.ceil(turn + TURN_R + 8)
          const key = [sheets.map((x) => x.key).join(','), attach, turn, width].join(':')
          if (key !== last) {
            last = key
            canvas.current!.style.height = `${h}px`
            height.current(h)
            stage!.draw(sheets, attach, turn, width, width + RIBBON_MARGIN * 2, h)
          }
          if (drawnRef.current !== (top?.r.id ?? null)) {
            drawnRef.current = top?.r.id ?? null
            setDrawn(drawnRef.current)
          }
        }
        kick.current = () => {
          if (alive && !raf) raf = requestAnimationFrame(frame)
        }
        resize = new ResizeObserver(() => kick.current())
        resize.observe(print)
        frame()
      } catch {
        ribbonOff = true
        if (alive) fail.current()
      }
    })()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      resize?.disconnect()
      stage?.dispose()
    }
  }, [])
  const top = papers[0]
  return (
    <div ref={wrap} className="rc-ribbon" aria-hidden="true" inert>
      <canvas ref={canvas} className="rc-ribbon-canvas" style={{ left: -RIBBON_MARGIN, width: `calc(100% + ${RIBBON_MARGIN * 2}px)` }} />
      {/* 立体を描くまでは、いちばん新しい一枚を DOM のまま差し出し口の下に出しておく */}
      {top && drawn !== top.r.id ? <div className="rc-ribbon-dom">{children}</div> : null}
    </div>
  )
}

/** 押し出された前の紙と、押し出されたときの高さ */
type Older = { r: Printed; height: number }

let printedId = 0

/** 刷った一枚の紙（数え上げの key と、その年度のデータ） */
type Printed = { id: number; key: string; year: number; v: YearView }

export function ReceiptMachine({ name, v, year, pop, base, detailHref, head }: { name: string; v: YearView; year: number; pop: number | null; base: string; detailHref: string; head: React.ReactNode }) {
  const settled = v.word === '決算'
  const what = `${yearName(year)}の${settled ? '決算' : '予算'}`
  const counted = `${year}:${v.total}`
  const feed = React.useRef<HTMLDivElement>(null)
  /** 刷った紙（いま出ている一枚）と、押し出された前の紙（新しい順。折り返して裏を戻る） */
  const [printed, setPrinted] = React.useState<Printed | null>(null)
  const [older, setOlder] = React.useState<Older[]>([])
  const [ribbonH, setRibbonH] = React.useState(0)
  const [seen, setSeen] = React.useState(counted)
  if (seen !== counted) {
    // 数え直す（年度や額が変わる）ときは、出ている紙を切らずに残し、数え終えてから続けて刷る。前の紙は新しい紙に押し出される。
    // 新しい年度に紙を出せない（人口が無い）ときや reduced-motion では、前の紙を残さない
    setSeen(counted)
    const latest = feed.current?.querySelector<HTMLElement>('[data-latest]')
    const height = latest ? paperHeight(latest) : 0
    const keep = !!pop && printed && height > 0 && !reduced() && !ribbonOff
    // 前の紙は3枚まで（それより古い紙は差し出し口の奥へ戻って見えない）
    setOlder(keep ? [{ r: printed, height }, ...older].slice(0, 3) : [])
    setPrinted(null)
  }
  const total = useCountUp(v.total)
  const per = useCountUp(pop ? Math.round(v.total / pop) : 0, COUNT_MS)
  const receipt = pop ? perHeadParts(v.fields, v.total, pop) : null
  const card = React.useRef<HTMLElement>(null)
  const phase = usePhase(counted)
  React.useEffect(() => {
    if (phase === 'print' && pop && printed?.key !== counted) setPrinted({ id: ++printedId, key: counted, year, v })
  }, [phase, counted])
  /** いま刷っている紙の key（刷り終えるまで）。頁送りと紙の動きに使う */
  const printing = phase === 'print' && printed?.key === counted ? counted : null
  // 刷り終えたら、その紙の絵を写し、押し出す立体（three.js）を先に読んでおく。年度を替えた瞬間に読み込みを待たず続けて刷る
  React.useEffect(() => {
    if (import.meta.env.SSR || !printed || reduced()) return
    void import('./ribbon3d').catch(() => {})
    if (pictures.has(printed.id)) return
    const t = setTimeout(() => {
      const el = feed.current?.querySelector<HTMLElement>('[data-latest] .rc-paper')
      if (el) void picture(el).then((c) => pictures.set(printed.id, c), () => {})
    }, PRINT_MS + 100)
    return () => clearTimeout(t)
  }, [printed])
  // 札を外したら（まちを替える・頁を移る）写した絵を捨てる
  React.useEffect(() => () => pictures.clear(), [])
  // 見えなくなった紙の絵は捨てる
  React.useEffect(() => {
    const live = new Set([printed?.id, ...older.map((o) => o.r.id)])
    for (const id of pictures.keys()) if (!live.has(id)) pictures.delete(id)
  }, [printed, older])
  useFollow(phase, printing, card, feed)
  /** 一枚の紙の中身 */
  const paper = (r: Printed) => {
    const { parts, sum } = perHeadParts(r.v.fields, r.v.total, pop!)
    return (
    <div className="rc-paper">
      <p className="text-center text-base font-semibold tracking-[0.3em]">{name}</p>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        {reiwa(r.year)} {r.v.word === '決算' ? '決算' : '当初予算'}・1人あたり
      </p>
      <ul className="rc-rule mt-4 pt-2">
        {r.v.fields.map((f, i) => {
          const row = (
            <>
              <span className="flex items-baseline gap-2 text-sm">
                <FieldIcon id={f.id} className="size-[18px] shrink-0 self-center text-muted-foreground" />
                <span className="whitespace-nowrap">{f.name}</span>
                <span className="rc-lead" />
                <Yen n={parts[i]!} className="text-base" />
              </span>
              {f.examples ? <span className="mt-1 block pl-7 text-xs text-muted-foreground">{f.examples}</span> : null}
            </>
          )
          // その他は事業の絞り込みに無いので押せない
          return (
            <li key={f.id}>
              {f.id === OTHER_FRAME.id ? (
                <div className="px-2 py-2">{row}</div>
              ) : (
                <Link href={`${base}/projects?field=${f.id}`} className="block rounded-lg px-2 py-2 transition-colors hover:bg-card">
                  {row}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      <p className="rc-rule mt-2 flex items-center justify-between pt-3">
        <span className="text-sm">1人あたりの合計</span>
        <Yen n={sum} className={cn(titleVariants({ size: 'h1' }), 'text-primary')} />
      </p>
      {/* 読み取るとまちの頁を開く QR と、このレシートをシェアするボタン（X とリンクのコピー。リンクはホーム） */}
      <div className="mt-5 flex items-center justify-center gap-5">
        <Qr url={detailHref} />
        <Share />
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
            {/* oxlint-disable-next-line design/text-size, design/space-step -- うちのまちの札は画面幅に合わせて見出しと金額を伸ばす見せ場なので、段の外を許す（見出しの大きさは 2026-11-17 yuito） */}
            <dt className="text-[clamp(17px,4.6vw,22px)] opacity-80">{what}</dt>
            {/* oxlint-disable-next-line design/text-size, design/space-step -- うちのまちの札は画面幅に合わせて見出しと金額を伸ばす見せ場なので、段の外を許す（見出しの大きさは 2026-11-17 yuito） */}
            <dd className="mt-2 text-[clamp(28px,8vw,60px)] leading-none font-semibold">
              <Counting c={total} />
            </dd>
          </div>
          {pop ? (
            // 予算を数え終えてから出して数える（数え直すたびに出し直す）
            <div key={counted} className="rm-per rm-divider pt-4 sm:pt-5" style={{ animationDelay: `${COUNT_MS}ms` }}>
              {/* oxlint-disable-next-line design/text-size, design/space-step -- うちのまちの札は画面幅に合わせて見出しと金額を伸ばす見せ場なので、段の外を許す（見出しの大きさは 2026-11-17 yuito） */}
            <dt className="text-[clamp(17px,4.6vw,22px)] opacity-80">1人あたりに直すと</dt>
              {/* oxlint-disable-next-line design/text-size, design/space-step -- うちのまちの札は画面幅に合わせて見出しと金額を伸ばす見せ場なので、段の外を許す（見出しの大きさは 2026-11-17 yuito） */}
            <dd className="mt-2 text-[clamp(28px,8vw,60px)] leading-none font-semibold">
                <Counting c={per} />
              </dd>
            </div>
          ) : null}
        </dl>
        {/* 札の下端の差し出し口。紙はここから出る */}
        {receipt ? <div className="rm-slot" aria-hidden="true" /> : null}
      </section>
      {pop ? (
        <div ref={feed} className="rc-feed" style={older.length ? { minHeight: Math.max(ribbonH, older[0]!.height) } : undefined}>
          <div className="rc-print">
            {printed ? (
              <Strip key={printed.id} mode={printed.key === printing ? 'grow' : 'still'} joined={older.length > 0}>
                {paper(printed)}
              </Strip>
            ) : null}
            {/* 押し出された前の紙は、今の紙の下端に続いて垂れ、下で折り返してレシートの裏を上へ戻る */}
            {older.length ? (
              <Ribbon papers={older} onHeight={setRibbonH} onFail={() => setOlder([])}>
                {paper(older[0]!.r)}
              </Ribbon>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
