// まちの札（spending.fudoki.dev）。もとは風土記のホームにあったもの（#1024 で外した）。緑の札で予算と1人あたりの額を順に数え上げ、札の下端の差し出し口から分野ごとの1人あたりのレシートを刷り出す。
// 年度を替えて刷り直すときは、紙を切らずに続けて刷る。前の紙は新しい紙に押し出されて垂れ、下で奥へ折り返してレシートの裏を上へ戻る（キャタピラーのような1本の続いた紙）。
// 札そのものをレジに見立て、平らな描き方に揃える。押し出された前の紙だけを立体にする（ribbon3d.ts）。
// 1人あたりは予算を人口で割った額（払った税金の額ではない）。分野の行の和が合計に合うよう、大きい端数から1円ずつ足して丸める
import * as React from 'react'
import { encode } from 'uqr'
import { ArrowRightIcon, CaretDownIcon, CheckIcon, LinkIcon, XLogoIcon } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { titleClass } from '../components/title'
import { STANDARD, residentTax, type Household, type ResidentTax } from '../lib/tax'
import { FUDOKI_ORIGIN, SITE_ORIGIN, apportion, perHeadParts, reiwa, withUnits, yearName, type Field, type YearView } from '../lib/fudoki'
import { FieldIcon } from '../components/parts'
import { BEAT, COUNT_MS, FOLLOW_MS, PRINT_MS, READ_MS, SCROLL_MS } from './motion'
import './receipt.css'

/** 最新の値を持つ ref（effect の依存に入れずに最新の callback を呼ぶ） */
function useLatest<T>(value: T) {
  const ref = React.useRef(value)
  ref.current = value
  return ref
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** 札の要素を出す時刻を animation に渡す */
const beat = (delay: number): React.CSSProperties => ({ animationDelay: `${delay}ms` })

/** 札の金額の幅（em）。少し広めに、数字 0.68・カンマ 0.32・単位（兆億万、左右の余白込み）0.85・末尾の円 0.75 で見積もる */
const amountEm = (yen: number) => [...withUnits(yen)].reduce((w, ch) => w + (ch === ',' ? 0.32 : ch >= '0' && ch <= '9' ? 0.68 : 0.85), 0.75)

/** 右端の桁が転がる長さ（ms）。左の桁ほど長く、左端は COUNT_MS で着地する */
const ROLL_MIN = 700

/** 数え上げ（オドメーター）。桁ごとに 0〜9 の帯を縦に転がし、減速して自分の数字に着地させる。右の桁ほど早く着地し、左の桁ほど長く・多く転がる。
 * 動きは CSS の animation だけ（receipt.css の .rm-reel）。key（年度と額）を替えて描き直すと転がし直す。reduced-motion では最初から着地した額。
 * 読み上げには決まった額だけを渡す */
function Odometer({ to, delay = 0 }: { to: number; delay?: number }) {
  const final = withUnits(to)
  const n = final.replace(/\D/g, '').length
  let k = n
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="sr-only">{final}円</span>
      <span aria-hidden="true">
        {[...final].map((ch, i) => {
          if (ch === ',') return <span key={i}>{ch}</span>
          if (ch < '0' || ch > '9') return <small key={i} className="mx-1 text-[0.55em]">{ch}</small>
          // k は末尾から数えた桁の位置。r は右端 0 から左端 1
          k--
          const r = n > 1 ? k / (n - 1) : 1
          const steps = (1 + Math.round(r * 2)) * 10 + Number(ch)
          const style = { '--to': `${-steps}em`, animationDuration: `${Math.round(ROLL_MIN + (COUNT_MS - ROLL_MIN) * r)}ms`, animationDelay: `${delay}ms` } as React.CSSProperties
          return (
            <span key={i} className="rm-digit">
              <span className="invisible">{ch}</span>
              <span className="rm-reel" style={style}>
                {Array.from({ length: steps + 1 }, (_, j) => (
                  <span key={j}>{j % 10}</span>
                ))}
              </span>
            </span>
          )
        })}
        <small className="ml-1 text-[0.55em]">円</small>
      </span>
    </span>
  )
}

/** 相対の url を、いま開いている origin に付けて外から開ける形にする */
const absolute = (url: string) => (typeof location === 'undefined' ? url : new URL(url, location.origin).href)

/** シェアで添えるリンク。このまちのこの年度のレシートの頁（spending.fudoki.dev）。OG 画像もそのまちのその年度の札とレシートになる */
const shareUrl = (path: string, year: number) => `${SITE_ORIGIN}${path}?${new URLSearchParams({ year: String(year) })}`
/** X に添える文言（2026-11-17 yuito） */
const SHARE_TEXT = '私のお金はどこへ行った？ | 風土記'

/** スマホなど、共有シートで画像をアプリへ渡せるときだけ true（PC では X の投稿画面を開く） */
const canShareImage = () => {
  if (typeof navigator === 'undefined' || !navigator.canShare || !matchMedia('(pointer: coarse)').matches) return false
  return navigator.canShare({ files: [new File([''], 'receipt.png', { type: 'image/png' })] })
}

/** シェアのボタン。X に投稿するボタンと、リンクをコピーするボタンを、アイコンだけで並べる。
 * 共有シートで画像を渡せる端末（スマホ）では、X のボタンで共有シート（Web Share API）を開き、レシートの画像・文言・リンクを渡す（2026-11-18 yuito）。
 * 共有は押した直後に呼ばないと断られるので、画像は紙を刷り終えたあとに先に作っておく。作れていないときと PC では X の投稿画面を開く */
function Share({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const root = React.useRef<HTMLDivElement>(null)
  const image = React.useRef<File | null>(null)
  React.useEffect(() => () => clearTimeout(timer.current), [])
  React.useEffect(() => {
    if (!canShareImage()) return
    let alive = true
    const t = setTimeout(() => {
      // 押し出された前の紙の写し（.rc-ribbon の中）では作らない
      const el = root.current?.closest('.rc-ribbon') ? null : root.current?.closest<HTMLElement>('.rc-paper')
      if (!el) return
      void import('./snap')
        // ボタン（シェア）は写さず、QR の下で切る
        .then(({ paperCanvas }) => {
          const qr = el.querySelector('.rc-qr')
          const height = qr ? qr.getBoundingClientRect().bottom - el.getBoundingClientRect().top + 34 : undefined
          return paperCanvas(el, { scale: 2, shade: false, skip: '[data-snap-skip]', height })
        })
        .then((c) => new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png')))
        .then((b) => {
          if (alive && b) image.current = new File([b], 'fudoki-receipt.png', { type: 'image/png' })
        }, () => {})
    }, PRINT_MS + 200)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [])
  const copy = async () => {
    if (!(await navigator.clipboard.writeText(url).then(() => true, () => false))) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }
  const intent = `https://x.com/intent/post?${new URLSearchParams({ text: SHARE_TEXT, url })}`
  const post = (e: React.MouseEvent) => {
    const file = image.current
    if (!file || !navigator.canShare?.({ files: [file] })) return
    e.preventDefault()
    navigator.share({ files: [file], text: `${SHARE_TEXT} ${url}` }).catch((err: unknown) => {
      // 利用者が閉じたときは何もしない。共有に失敗したら X の投稿画面を開く
      if (!(err instanceof DOMException && err.name === 'AbortError')) window.open(intent, '_blank', 'noopener')
    })
  }
  const round = 'inline-flex size-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-card'
  return (
    <div ref={root} data-snap-skip className="flex items-center gap-2">
      <a href={intent} onClick={post} target="_blank" rel="noopener noreferrer" aria-label="Xでシェア" className={round}>
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
    <svg viewBox={`0 0 ${size} ${size}`} className="rc-qr" role="img" aria-label="このレシートを開く QR コード" shapeRendering="crispEdges">
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

/** 分野の目を、開いたときに出す数（残りは「ほか」にまとめる） */
const TOP_ITEMS = 5

/** レシートの分野の行。押すと、その分野の1人あたり（yen）を目（子育て応援費・障害者支援費など）の予算の比で割って開く。
 * 上位の目に入らない分（残りの目・目の無い項）は「ほか」にまとめ、開いた行の和は必ず分野の額に合う。続きは風土記の事業のタブ（分野で絞る）へ繋ぐ */
function FieldRow({ f, yen, base }: { f: Field; yen: number; /** 風土記でのそのまちのその年度の path（/tokyo/shinagawa/2025） */ base: string }) {
  const [open, setOpen] = React.useState(false)
  const shown = f.items.slice(0, TOP_ITEMS)
  const parts = apportion([...shown.map((m) => m.yen), Math.max(0, f.yen - shown.reduce((a, m) => a + m.yen, 0))], yen)
  const top = shown.map((m, i) => ({ id: m.id, name: m.name, yen: parts[i]! }))
  const rest = parts[shown.length]!
  const id = React.useId()
  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="block w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-card">
        <span className="flex items-baseline gap-2 text-sm">
          <FieldIcon id={f.id} className="size-[18px] shrink-0 self-center text-muted-foreground" />
          <span className="whitespace-nowrap">{f.name}</span>
          <span className="rc-lead" />
          <Yen n={yen} className="text-base" />
          <CaretDownIcon className={cn('size-3.5 shrink-0 self-center text-muted-foreground transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
        </span>
        {f.examples && !open ? <span className="mt-1 block pl-7 text-xs text-muted-foreground">{f.examples}</span> : null}
      </button>
      {open ? (
        <ul id={id} className="ob-swap mb-2 pr-[22px] pl-9">
          {top.map((m) => (
            <li key={m.id} className="flex items-baseline gap-2 py-1 text-xs">
              <span className="min-w-0">{m.name}</span>
              <span className="rc-lead" />
              <Yen n={m.yen} />
            </li>
          ))}
          {rest > 0 && top.length > 0 ? (
            <li className="flex items-baseline gap-2 py-1 text-xs text-muted-foreground">
              <span>ほか</span>
              <span className="rc-lead" />
              <Yen n={rest} />
            </li>
          ) : null}
          <li className="pt-1 text-xs">
            <a href={`${FUDOKI_ORIGIN}${base}/projects?field=${f.id}`} className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline">
              {f.name}の事業を風土記で見る
              <ArrowRightIcon className="size-3" aria-hidden="true" />
            </a>
          </li>
        </ul>
      ) : null}
    </li>
  )
}

/** 演出の段。count: 札で数え上げる → print: 札の下端の差し出し口からレシートが出る */
type Phase = 'count' | 'print'
/** 札の4つを出し終えて、読む間をおいてから紙を出す */
const PRINT_AT = BEAT.done + READ_MS

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
 * print（printing が新しく刷る紙の key になったとき）: 紙より長い FOLLOW_MS をかけ FOLLOW_EASE で紙を後から追い、刷り終えたレシートの下端が画面の下端の END_ROOM 上に来る位置まで送る。
 * 利用者が自分で送ったら（ホイール・タッチ・キー・ポインタ）、それ以降は動かさない。
 * scroll の event は数えない（レイアウトの補正でも起き、利用者の操作と区別できない） */
function useFollow(phase: Phase, printing: string | null, card: React.RefObject<HTMLElement | null>, feed: React.RefObject<HTMLElement | null>) {
  const touched = React.useRef(false)
  const raf = React.useRef(0)
  React.useEffect(() => {
    const mark = (e: Event) => {
      // 頁の中のボタン・リンク・欄（年度の切り替えなど）を押したのは、自分で頁を送ったことにしない。スクロールバーのドラッグ（target は html）では止める
      if (e.type === 'pointerdown' && e.target instanceof Element && e.target.closest('button, a, input, select, label')) return
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
      // 刷り終えたときのレシートの最後（合計・QR コード）まで送る。紙より長くかけて後から追い、出だしはゆっくりで差し出し口のあたりを見せる。
      // 末端の下に少し余白を残し、そこへ出てくる他のまちの節に気づけるようにする。
      // 紙は高さを 0 から伸ばすので、刷り終えた高さは中身の高さ（paperHeight）から求める
      const f = feed.current
      const latest = f.querySelector<HTMLElement>('[data-latest]')
      if (latest) go(window.scrollY + f.getBoundingClientRect().top + paperHeight(latest) + FEED_PAD - vh + END_ROOM, FOLLOW_MS, FOLLOW_EASE)
    }
  }, [phase, printing, card, feed])
}

/** 紙送りの緩急（出だしと終わりだけ緩め、ほぼ一定の速さで送る）。頁送りは別の FOLLOW_EASE で後から追う */
const PRINT_EASE_CSS = 'cubic-bezier(0.3, 0.1, 0.45, 1)'
/** 紙を追って送ったあと、レシートの末端の下に残す余白（px）。他のまちの節の見出しが覗く */
const END_ROOM = 160
/** 紙を追う頁送りの緩急。出だしと終わりをゆっくりにし、途中も急がない（sine。山でも平均の 1.6 倍ほど）。出だしは差し出し口のあたりを見せる（2026-11-18 yuito） */
const FOLLOW_EASE = (p: number) => (1 - Math.cos(Math.PI * p)) / 2
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

/** 数字だけを取り出す（全角・カンマ・円を許す） */
const digits = (text: string) => Number(text.normalize('NFKC').replace(/[^\d]/g, ''))

/** 小さな数の欄（家族の数・ボーナスの月数） */
function Count({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input type="number" min={0} max={12} inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(0, Math.min(12, digits(e.target.value))))} className="h-9 w-16 rounded-full bg-brand-fill px-3 text-center text-base text-brand-fill-foreground tabular-nums outline-none" />
    </label>
  )
}

/** 月給（額面）を入れる欄。住民税の通知額は覚えていないので、月給から見積もる（lib/tax.ts）。家族・年齢・ボーナスは標準を既定にし、変えたい人だけ開く。
 * 入れた額はこの画面の中だけで使い、保存も送信もしない（URL・シェア・QR にも載せない） */
function SalaryInput({ name, kind, on, onTax }: { name: string; kind: string; on: boolean; onTax: (tax: ResidentTax | null) => void }) {
  const [text, setText] = React.useState('')
  const [h, setH] = React.useState<Household>(STANDARD)
  const [none, setNone] = React.useState(false)
  const id = React.useId()
  const set = (patch: Partial<Household>) => setH((x) => ({ ...x, ...patch }))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const monthly = digits(text)
    if (!(monthly > 0 && monthly < 100_000_000)) return
    const tax = residentTax(monthly, h)
    const mine = kind === '都道府県' ? tax.pref : tax.city
    setNone(mine === 0)
    onTax(mine > 0 ? tax : null)
  }
  return (
    <form onSubmit={submit} className="rm-in rm-divider mt-4 pt-4 sm:mt-5 sm:pt-5" data-snap-skip>
      <label htmlFor={id} className="block text-sm opacity-80">
        月給（額面）を入れると、あなたが{name}に払う住民税の見積もりで刷り直します
      </label>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-full bg-brand-fill px-4 text-brand-fill-foreground">
          <input
            id={id}
            inputMode="numeric"
            autoComplete="off"
            value={text}
            placeholder="300,000"
            onChange={(e) => setText(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base tabular-nums outline-none placeholder:text-brand-fill-muted"
          />
          <span className="text-sm">円</span>
        </span>
        <button type="submit" className="h-12 shrink-0 rounded-full bg-brand-foreground px-5 text-sm font-medium text-brand transition-opacity hover:opacity-90">
          刷る
        </button>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer opacity-80">家族・年齢・ボーナスを変える</summary>
        <div className="mt-3 grid gap-3">
          <label className="flex items-center justify-between gap-3">
            <span>配偶者を扶養している</span>
            <input type="checkbox" checked={h.spouse} onChange={(e) => set({ spouse: e.target.checked })} className="size-5 accent-[var(--brand-fill)]" />
          </label>
          <Count label="扶養している家族（16歳以上）" value={h.dependents} onChange={(n) => set({ dependents: n })} />
          <Count label="16歳未満の子" value={h.children} onChange={(n) => set({ children: n })} />
          <label className="flex items-center justify-between gap-3">
            <span>40歳以上</span>
            <input type="checkbox" checked={h.over40} onChange={(e) => set({ over40: e.target.checked })} className="size-5 accent-[var(--brand-fill)]" />
          </label>
          <Count label="ボーナス（年に月給の何か月分）" value={h.bonusMonths} onChange={(n) => set({ bonusMonths: n })} />
        </div>
      </details>
      <p className="mt-3 text-xs opacity-80">
        {none ? 'この月給だと住民税はかかりません。' : null}
        会社員の目安で見積もります。入れた額は保存も送信もしません。
        {on ? (
          <button type="button" onClick={() => (setText(''), setNone(false), onTax(null))} className="ml-2 underline underline-offset-4">
            1人あたりに戻す
          </button>
        ) : null}
      </p>
    </form>
  )
}

/** 押し出された前の紙（新しい順）。今出ている紙の下端に続く1本の紙として、真下へ垂れて下で奥へ折り返し、レシートの裏を上へ戻る立体（ribbon3d.ts）に描く。
 * 立体を描くまで（読み込み・絵を写す間）は、いちばん新しい一枚を DOM のまま同じ場所に出しておく。WebGL が使えない・絵を写せないときは、前の紙を残さない（以後も残さない） */
function Ribbon({ papers, waiting, onHeight, onFail, children }: { papers: Older[]; waiting: boolean; onHeight: (h: number) => void; onFail: () => void; children: React.ReactNode }) {
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
      {/* 立体は札の裏にいるので、次の紙を刷り始めるまでは、差し出し口から札の下端までの頭だけを DOM のまま札の手前に出す（札の下端で見切れさせない） */}
      {top && drawn !== top.r.id ? <div className="rc-ribbon-dom">{children}</div> : top && waiting ? <div className="rc-ribbon-dom rc-ribbon-lip">{children}</div> : null}
    </div>
  )
}

/** 押し出された前の紙と、押し出されたときの高さ */
type Older = { r: Printed; height: number }

let printedId = 0

/** 刷った一枚の紙（数え上げの key と、その年度のデータ） */
/** base（分野の事業へのリンク）と pop（1人あたりで割る人口）は、その紙を刷ったときのもの。刷り直しても前の紙は前のまま */
/** mine は月給から見積もった住民税のうち、そのまちに払う分（円）。入れていなければ null で、1人あたりで刷る */
type Printed = { id: number; key: string; year: number; v: YearView; base: string; pop: number; mine: number | null }

export function ReceiptMachine({ path, name, kind, v, year, pop, base, head, onPrinted }: { onPrinted?: () => void; /** このサイトでのまちの path（シェアのリンク） */ path: string; name: string; /** 自治体の種類（都道府県・区・市・町村）。住民税のどの分（区市町村・都道府県）を出すかを決める */ kind: string; v: YearView; year: number; pop: number | null; base: string; head: React.ReactNode }) {
  const settled = v.word === '決算'
  const what = `${yearName(year)}の${settled ? '決算' : '予算'}`
  /** 月給から見積もった住民税と、そのうちこのまちに払う分。入れると、その額を予算の割合で分野に割って刷り直す */
  const [tax, setTax] = React.useState<ResidentTax | null>(null)
  const mine = tax ? (kind === '都道府県' ? tax.pref : tax.city) : null
  const counted = `${year}:${v.total}:${mine ?? ''}`
  const feed = React.useRef<HTMLDivElement>(null)
  /** 刷った紙（いま出ている一枚）と、押し出された前の紙（新しい順。折り返して裏を戻る） */
  const [printed, setPrinted] = React.useState<Printed | null>(null)
  const [older, setOlder] = React.useState<Older[]>([])
  const [ribbonH, setRibbonH] = React.useState(0)
  /** 住民税の欄は、最初の紙を刷ってから出す（数えている間は札の数字だけを見せる）。一度出したら刷り直す間も出したまま */
  const [askTax, setAskTax] = React.useState(false)
  if (printed && !askTax) setAskTax(true)
  const [seen, setSeen] = React.useState(counted)
  if (seen !== counted) {
    // 数え直す（年度や額が変わる）ときは、出ている紙を切らずに残し、数え終えてから続けて刷る。前の紙は新しい紙に押し出される。
    // 新しい年度に紙を出せない（人口が無い）ときや reduced-motion では、前の紙を残さない
    setSeen(counted)
    const latest = feed.current?.querySelector<HTMLElement>('[data-latest]')
    const height = latest ? paperHeight(latest) : 0
    const keep = !!pop && !reduced() && !ribbonOff
    // 前の紙は3枚まで（それより古い紙は差し出し口の奥へ戻って見えない）。数え終える前にまた替えたとき（まだ刷っていない）は、前の紙をそのまま残す
    setOlder(!keep ? [] : printed && height > 0 ? [{ r: printed, height }, ...older].slice(0, 3) : older)
    setPrinted(null)
  }
  const perTo = mine ?? (pop ? Math.round(v.total / pop) : 0)
  const receipt = pop ? perHeadParts(v.fields, v.total, pop) : null
  const card = React.useRef<HTMLElement>(null)
  const phase = usePhase(counted)
  React.useEffect(() => {
    if (phase === 'print' && pop && printed?.key !== counted) setPrinted({ id: ++printedId, key: counted, year, v, base, pop, mine })
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
  // 刷り終えたレシートの末端（合計・QR）まで頁が送られたら知らせる（人口が無く紙を刷らないまちは数え終えたら）。
  // 紙の動きが終わったかではなく、頁の送り具合で決める。ホームはそのあとにレシートの下へ他のまちの節を出す（2026-11-18 yuito）
  const done = useLatest(onPrinted)
  React.useEffect(() => {
    if (phase === 'print' && !pop) return void done.current?.()
    if (!printing) return
    // 紙は高さを 0 から伸ばすので、末端の位置は刷り終えたときの高さ（paperHeight）から求める
    const reached = () => {
      const latest = feed.current?.querySelector<HTMLElement>('[data-latest]')
      return !!latest && feed.current!.getBoundingClientRect().top + paperHeight(latest) + FEED_PAD <= window.innerHeight + 4
    }
    const check = () => {
      if (!reached()) return
      stop()
      done.current?.()
    }
    const stop = () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    const raf = requestAnimationFrame(check)
    return () => {
      cancelAnimationFrame(raf)
      stop()
    }
  }, [printing, phase, pop])
  /** 一枚の紙の中身 */
  const paper = (r: Printed) => {
    const { parts, sum } = r.mine ? { parts: apportion(r.v.fields.map((f) => f.yen), r.mine), sum: r.mine } : perHeadParts(r.v.fields, r.v.total, r.pop)
    return (
    <div className="rc-paper">
      <p className="text-center text-base font-semibold tracking-[0.3em]">{name}</p>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        {reiwa(r.year)} {r.v.word === '決算' ? '決算' : '当初予算'}・{r.mine ? 'あなたの住民税の分' : '1人あたり'}
      </p>
      <ul className="rc-rule mt-4 pt-2">
        {r.v.fields.map((f, i) => (
          <FieldRow key={f.id} f={f} yen={parts[i]!} base={r.base} />
        ))}
      </ul>
      <p className="rc-rule mt-2 flex items-center justify-between pt-3">
        <span className="text-sm">{r.mine ? 'あなたの住民税の分の合計' : '1人あたりの合計'}</span>
        <Yen n={sum} className={cn(titleClass('h1'), 'text-primary')} />
      </p>
      {/* 読み取るとこのレシートの頁を開く QR と、シェアするボタン（X とリンクのコピー） */}
      <div className="mt-5 flex items-center justify-center gap-5">
        <Qr url={shareUrl(path, r.year)} />
        <Share url={shareUrl(path, r.year)} />
      </div>
    </div>
    )
  }
  return (
    <div className="rm">
      <section ref={card} className={`rm-card p-5 text-brand-foreground sm:p-7 ${receipt ? 'pb-12 sm:pb-14' : ''}`}>
        {head}
        {/* 予算と1人あたりを同じ大きさでいちばん大きく出す。見出し → 金額 → 見出し → 金額の順に一つずつ出し、目をいつも一つに向ける（数えている間に他を薄くはしない）（motion.ts の BEAT、2026-11-18 yuito）。
            数え直すたびに key で描き直して頭から出し直す */}
        {/* 金額は札の幅に収まる大きさにする（円の端数まである決算は長い）。予算と1人あたりは同じ大きさに揃えるので、長い方で決める */}
        <dl key={counted} className="mt-5 grid gap-4 [container-type:inline-size] sm:mt-6 sm:gap-5" style={{ '--amount-em': Math.max(amountEm(v.total), pop ? amountEm(perTo) : 0) } as React.CSSProperties}>
          <div>
            {/* oxlint-disable-next-line design/text-size, design/space-step -- うちのまちの札は画面幅に合わせて見出しと金額を伸ばす見せ場なので、段の外を許す（見出しの大きさは 2026-11-17 yuito） */}
            <dt className="rm-in text-[clamp(17px,4.6vw,22px)] opacity-80" style={beat(BEAT.label1)}>{what}</dt>
            {/* oxlint-disable-next-line design/text-size, design/space-step -- うちのまちの札は画面幅に合わせて見出しと金額を伸ばす見せ場なので、段の外を許す（見出しの大きさは 2026-11-17 yuito） */}
            <dd className="rm-in mt-2 text-[min(clamp(28px,8vw,60px),100cqi/var(--amount-em))] leading-none font-semibold" style={beat(BEAT.amount1)}>
              <Odometer to={v.total} delay={BEAT.amount1} />
            </dd>
          </div>
          {pop ? (
            <div className="rm-in rm-divider pt-4 sm:pt-5" style={beat(BEAT.label2)}>
              {/* oxlint-disable-next-line design/text-size, design/space-step -- うちのまちの札は画面幅に合わせて見出しと金額を伸ばす見せ場なので、段の外を許す（見出しの大きさは 2026-11-17 yuito） */}
              <dt className="text-[clamp(17px,4.6vw,22px)] opacity-80">{mine ? `あなたの住民税のうち${name}の分` : '1人あたりに直すと'}</dt>
              {/* oxlint-disable-next-line design/text-size, design/space-step -- うちのまちの札は画面幅に合わせて見出しと金額を伸ばす見せ場なので、段の外を許す（見出しの大きさは 2026-11-17 yuito） */}
              <dd className="rm-in mt-2 text-[min(clamp(28px,8vw,60px),100cqi/var(--amount-em))] leading-none font-semibold" style={beat(BEAT.amount2)}>
                <Odometer to={perTo} delay={BEAT.amount2} />
              </dd>
            </div>
          ) : null}
        </dl>
        {pop && askTax ? <SalaryInput name={name} kind={kind} on={!!tax} onTax={setTax} /> : null}
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
              <Ribbon papers={older} waiting={!printed} onHeight={setRibbonH} onFail={() => setOlder([])}>
                {paper(older[0]!.r)}
              </Ribbon>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
