// 住んでいるまちを選んだあとのオンボーディング（marketingskills の onboarding skill の Guided Tours: いつでも閉じられる・閉じても続きから再開できる。Do, don't show）。
// 流れ: まちの頁を開く（ホーム）→ 分野を押す → 分野の頁で事業を押す → 事業の名前を選ぶ → アシスタントに質問 → 答えが返ったら終わり。どの歩も本人の操作で進む（自動では進めない）。
// 頁をまたぐので、どの歩にいるか（at）と、進めている・止めた・終えたを localStorage に置く。止めた歩はホームの「はじめにやること」の「オンボ開始」から続ける。
// 画面は暗くせず、操作する所（[data-tour="…"]）を緑の枠で囲んで指のアイコンで示し、その上か下に吹き出しを置く
import * as React from 'react'
import { createPortal } from 'react-dom'
import { HandPointingIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import './onboarding.css'

/** 歩の並び。at はこの添字 */
export const STEPS = ['open', 'fields', 'field', 'detail', 'ask', 'answer'] as const
export type StepKey = (typeof STEPS)[number]
export const TOTAL = STEPS.length
export const stepAt = (k: StepKey) => STEPS.indexOf(k)

export type TourSaved = { at: number; state: 'on' | 'paused' | 'done' }
const KEY = 'fudoki:tour'
const EVENT = 'fudoki:tour'

/** 前の版の保存（'home'・'page'・'done' の文字）も読む */
const parse = (raw: string | null): TourSaved | null => {
  if (raw == null) return null
  if (raw === 'home') return { at: 0, state: 'on' }
  if (raw === 'page') return { at: 1, state: 'on' }
  if (raw === 'done') return { at: TOTAL, state: 'done' }
  try {
    const s = JSON.parse(raw) as TourSaved
    return typeof s?.at === 'number' && ['on', 'paused', 'done'].includes(s.state) ? s : null
  } catch {
    return null
  }
}
const read = () => {
  try {
    return parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
const write = (s: TourSaved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // 保存できなければ、この頁だけで進む
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: s }))
}

/** 前にはじめての流れを通った（オンボーディングの保存がある）か。ホームのリセットのあとは、はじめての流れを出さずにまちだけ選び直す */
export const onboarded = () => read() !== null

/** オンボーディングの進み。go(at) でその歩から進め、pause() で止め（続きから再開できる）、finish() で終える。同じ頁の別の部品にも知らせる */
export function useTour() {
  const [saved, setSaved] = React.useState<TourSaved | null>(null)
  React.useEffect(() => {
    const sync = (e?: Event) => setSaved(e instanceof CustomEvent ? (e.detail as TourSaved) : read())
    sync()
    const onStorage = () => sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  // 保存できない環境でも、止めたときにこの頁で進んだ歩を残す
  const last = React.useRef(0)
  if (saved) last.current = saved.at
  const go = React.useCallback((at: number) => write({ at, state: 'on' }), [])
  const pause = React.useCallback(() => write({ at: Math.min(read()?.at ?? last.current, TOTAL - 1), state: 'paused' }), [])
  const finish = React.useCallback(() => write({ at: TOTAL, state: 'done' }), [])
  return { saved, go, pause, finish }
}

export type Spot = {
  /** data-tour の名前。「a|b」は a が無ければ b。無ければ枠と指を出さずに吹き出しだけを出す */
  target?: string
  /** 対象の中の最初のボタン・リンクを指す（分野や事業の一覧の1行目） */
  first?: boolean
  /** 吹き出しにふさがせない範囲の data-tour。無ければ指した所（聞く欄の例を指すとき、入力欄と選んだ文も見えるようにする） */
  around?: string
  title: string
  body: React.ReactNode
  /** 指の動き。tap は押す所で軽く押し、select は文字の上を左から右へなぞる */
  gesture?: 'tap' | 'select'
  /** 指した所を押したときに歩を進める（リンクの移動は止めない） */
  onPress?: () => void
}

const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
/** 見えている対象。サイドバーと下の帯のように同じ名前が2つあるときは、見えている方 */
const find = (target: string, first?: boolean) => {
  for (const name of target.split('|')) {
    const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find(visible)
    if (!el) continue
    if (!first) return el
    const hit = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].find(visible)
    if (hit) return hit
  }
  return null
}
/** 画面に固定した部品の中か（送っても動かないので、送らない） */
const pinned = (el: HTMLElement | null) => {
  for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true
  return false
}

type Box = { top: number; left: number; width: number; height: number }
const PAD = 6
const GAP = 14
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

/** 何歩目か。点と「3 / 6」 */
function Dots({ at }: { at: number }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <span className="flex gap-1">
        {STEPS.map((k, i) => (
          <span key={k} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none', i <= at ? 'w-4 bg-primary' : 'w-1.5 bg-border')} />
        ))}
      </span>
      <span className="tabular-nums">
        {at + 1} / {TOTAL}
      </span>
    </div>
  )
}

/** 吹き出しの中身。次へ進むボタンは置かない（指した所を本人が操作して進む） */
function SpotBody({ spot, at, onSkip, onBack }: { spot: Spot; at: number; onSkip: () => void; onBack?: () => void }) {
  return (
    <>
      <div className="mb-2">
        <Dots at={at} />
      </div>
      <h2 id="tour-title" className="text-[16px] font-medium">
        {spot.title}
      </h2>
      {/* 狭い札では文節で折ると行末が大きく空くので、この札だけ文字の単位で折る */}
      <div className="mt-1 text-[14px] leading-relaxed text-muted-foreground [text-wrap:wrap] [word-break:normal]">{spot.body}</div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={onSkip} className="shrink-0 whitespace-nowrap text-[13px] text-muted-foreground hover:text-foreground">
          スキップ
        </button>
        <span className="flex-1" />
        {onBack ? (
          <button type="button" onClick={onBack} className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] hover:bg-secondary">
            もどる
          </button>
        ) : null}
      </div>
    </>
  )
}

/** 対象を探し、出てくるまで少し待つ（自治体の頁はデータが冷えていると15秒ほどかかる）。undefined は探している間、null は見つからなかった */
function useTarget(target: string | undefined, first?: boolean) {
  const [el, setEl] = React.useState<HTMLElement | null | undefined>(undefined)
  React.useEffect(() => {
    setEl(undefined)
    if (!target) return setEl(null)
    let n = 0
    const t = setInterval(() => {
      n++
      const found = find(target, first)
      if (found || n > 70) {
        clearInterval(t)
        setEl(found)
      }
    }, 150)
    return () => clearInterval(t)
  }, [target, first])
  return el
}

/** 対象の位置を追う。画面の外なら送って見せ、スクロール・大きさの変化のたびに測り直す */
function useBox(el: HTMLElement | null | undefined, target: string | undefined, first: boolean | undefined) {
  const [box, setBox] = React.useState<Box | null>(null)
  React.useEffect(() => {
    if (!el) return setBox(null)
    if (!pinned(el)) {
      const r = el.getBoundingClientRect()
      if (r.top < 64 || r.bottom > window.innerHeight - 220) el.scrollIntoView({ block: 'center', behavior: smooth() })
    }
    const measure = () => {
      // 頁が描き直されて対象が入れ替わったら、探し直す
      const live = el.isConnected ? el : target ? find(target, first) : null
      if (!live) return setBox(null)
      const r = live.getBoundingClientRect()
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    let raf = 0
    const tick = () => (cancelAnimationFrame(raf), (raf = requestAnimationFrame(measure)))
    window.addEventListener('scroll', tick, true)
    window.addEventListener('resize', tick)
    const settle = [setTimeout(measure, 450), setTimeout(measure, 1200)]
    const ro = new ResizeObserver(tick)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      settle.forEach(clearTimeout)
      ro.disconnect()
      window.removeEventListener('scroll', tick, true)
      window.removeEventListener('resize', tick)
    }
  }, [el, target, first])
  return box
}

/** 指した所の枠と指。頁は暗くせず、触るのも妨げない（枠と指は押しても下に通る） */
function Pointer({ box, gesture = 'tap' }: { box: Box; gesture?: 'tap' | 'select' }) {
  // 指先がアイコンの左上寄りにあるので、その分ずらす。行の真ん中は文字に重なるので、左から少し入った所を押す
  const x = gesture === 'select' ? box.left : box.left + Math.min(box.width / 2, 96)
  const y = gesture === 'select' ? box.top + box.height * 0.7 : box.top + box.height / 2
  return (
    <>
      <div aria-hidden="true" className="tour-ring pointer-events-none fixed rounded-[14px] border-2 border-primary" style={{ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2, boxShadow: '0 0 0 2px var(--background)' }} />
      {gesture === 'select' ? (
        <span aria-hidden="true" className="tour-sweep pointer-events-none fixed rounded-[4px] bg-primary" style={{ top: box.top, left: box.left, width: Math.min(box.width, 320), height: box.height }} />
      ) : (
        <span aria-hidden="true" className="tour-ripple pointer-events-none fixed size-10 rounded-full border-2 border-primary" style={{ top: y - 20, left: x - 20 }} />
      )}
      <span
        aria-hidden="true"
        className={cn('pointer-events-none fixed', gesture === 'select' ? 'tour-finger-select' : 'tour-finger')}
        style={{ top: y - 3, left: x - 11, '--w': `${Math.min(box.width, 320)}px` } as React.CSSProperties}
      >
        <HandPointingIcon weight="fill" className="size-8 text-foreground drop-shadow-md" />
      </span>
    </>
  )
}

/** 吹き出しを置く所。対象をふさがないよう、下に入れば下、入らなければ上、どちらも無理なら画面の下端 */
const place = (box: Box | null, h: number) => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(340, vw - 24)
  if (!box) return { top: Math.max(12, vh - h - 96), left: (vw - width) / 2, width }
  const below = box.top + box.height + PAD + GAP
  const above = box.top - PAD - GAP - h
  const top = below + h <= vh - 12 ? below : above >= 12 ? above : vh - h - 12
  const left = Math.min(Math.max(12, box.left), vw - width - 12)
  return { top, left, width }
}

/** 押す所を指で示すだけ（吹き出しは別の所に置く歩に使う） */
export function PointAt({ target, first, gesture }: Pick<Spot, 'target' | 'first' | 'gesture'>) {
  const el = useTarget(target, first)
  const box = useBox(el, target, first)
  return box ? createPortal(<div className="pointer-events-none fixed inset-0 z-[60]"><Pointer box={box} gesture={gesture} /></div>, document.body) : null
}

/**
 * 1歩ぶんの吹き出し。target を枠で囲んで指で示し、その下か上に吹き出しを置く。画面は暗くせず、ほかの所も触れる。
 * 進むのは指した所を本人が操作したとき。at は通しの何歩目か。onSkip で止める（続きから再開できる）
 */
export function SpotTour({ spot, at, onSkip, onBack }: { spot: Spot; at: number; onSkip: () => void; onBack?: () => void }) {
  const { target, first, onPress, around } = spot
  const el = useTarget(target, first)
  const box = useBox(el, target, first)
  const areaEl = useTarget(around)
  const area = useBox(areaEl, around, false)
  const card = React.useRef<HTMLDivElement>(null)
  const [h, setH] = React.useState(180)
  React.useLayoutEffect(() => {
    if (card.current) setH(card.current.offsetHeight)
  }, [spot.title, el])

  // 指した所を押したら歩を進める。リンクの移動はそのまま任せる
  React.useEffect(() => {
    if (!el || !onPress) return
    el.addEventListener('click', onPress)
    return () => el.removeEventListener('click', onPress)
  }, [el, onPress])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSkip])

  if (el === undefined) return null
  const tip = place(area ?? box, h)
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {box ? <Pointer box={box} gesture={spot.gesture} /> : null}
      <div
        ref={card}
        role="region"
        aria-labelledby="tour-title"
        key={spot.title}
        className="tour-tip pointer-events-auto absolute rounded-2xl border bg-background p-4 text-foreground shadow-xl"
        style={tip}
      >
        <SpotBody spot={spot} at={at} onSkip={onSkip} onBack={onBack} />
      </div>
    </div>,
    document.body,
  )
}

/** 頁の中に置く吹き出し（暗くしない）。事業の詳細のように、ダイアログの中で文字を選んでもらう歩に使う */
export function InlineSpot({ spot, at, onSkip, onBack }: { spot: Spot; at: number; onSkip: () => void; onBack?: () => void }) {
  return (
    <section aria-labelledby="tour-title" className="tour-tip mb-5 rounded-2xl border border-primary bg-background p-4 shadow-md sm:p-5">
      <SpotBody spot={spot} at={at} onSkip={onSkip} onBack={onBack} />
    </section>
  )
}

/** 画面の上に置く小さな札（暗くしない）。アシスタントが答えている間と、終わりの知らせに使う。会話の panel の左に収める */
export function FloatSpot({ children }: { children: React.ReactNode }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex justify-center md:right-[calc(var(--side-panel,0px)+12px)] md:left-[calc(var(--nav-w,0px)+12px)]">
      <div role="status" className="tour-tip pointer-events-auto w-full max-w-[380px] rounded-2xl border bg-background p-3.5 text-foreground shadow-xl sm:p-4">
        {children}
      </div>
    </div>,
    document.body,
  )
}
