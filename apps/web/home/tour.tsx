// 住んでいるまちを選んだあとのオンボーディング（marketingskills の onboarding skill の Guided Tours: いつでも閉じられる・閉じても続きから再開できる。Do, don't show）。
// 流れ: まちの頁を開く（ホーム）→ 分野の説明 → 分野の頁 → 事業のタブ → 事業を選ぶ → 文を選んでアシスタントに質問 → 答えが返ったら終わり。
// 頁をまたぐので、どの歩にいるか（at）と、進めている・止めた・終えたを localStorage に置く。止めた歩はホームの「はじめにやること」の「オンボ開始」から続ける。
// 画面を暗くして [data-tour="…"] の部分を1か所だけ光らせ、その横に吹き出しを重ねる。吹き出しには文字だけでなく、操作の様子を動きで見せる絵（tour-visuals.tsx）を載せる
import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import './onboarding.css'

/** 歩の並び。at はこの添字 */
export const STEPS = ['open', 'fields', 'field', 'projects', 'detail', 'ask', 'answer'] as const
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
  /** data-tour の名前。「a|b」は a が無ければ b。無ければ光らせずに吹き出しだけを出す */
  target?: string
  title: string
  body: React.ReactNode
  /** 操作の様子を動きで見せる絵（tour-visuals.tsx）。実際のまちの名前・金額で描く */
  visual?: React.ReactNode
  /** 吹き出しの主のボタン。無ければ「次へ」も出さない（光らせた所の操作で進む） */
  action?: { label: string; run: () => void }
  /** 光らせた所を触れるようにする（押す・選ぶ・書くで進む歩） */
  open?: boolean
  /** 光らせた所を押したら action と同じにする（リンクの移動は action に任せる） */
  click?: boolean
  /** 光らせる高さを画面のこの割合までにする（長い一覧の頭だけを光らせる） */
  maxH?: number
}

const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
/** 見えている対象。サイドバーと下の帯のように同じ名前が2つあるときは、見えている方 */
const find = (target: string) => {
  for (const name of target.split('|')) {
    const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find(visible)
    if (el) return el
  }
  return null
}
/** 画面に固定した部品の中か（送っても動かないので、送らない） */
const pinned = (el: HTMLElement | null) => {
  for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true
  return false
}

type Box = { top: number; left: number; width: number; height: number }
const PAD = 8
const GAP = 12
// oxlint-disable-next-line design/color-literal -- 既存のずれ。直すか例外にするか決めるまで
const SHADE = 'rgb(0 0 0 / .55)'
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

/** 何歩目か。点と「3 / 7」 */
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

/** 吹き出しの中身。光らせる吹き出しと、頁の中に置く吹き出し（InlineSpot）が使う */
function SpotBody({ spot, at, onSkip, onBack }: { spot: Spot; at: number; onSkip: () => void; onBack?: () => void }) {
  return (
    <>
      {spot.visual ?? null}
      <div className={cn('mb-2', spot.visual && 'mt-3.5')}>
        <Dots at={at} />
      </div>
      <h2 id="tour-title" className="text-[16px] font-medium">
        {spot.title}
      </h2>
      {/* 狭い札では文節で折ると行末が大きく空くので、この札だけ文字の単位で折る */}
      <div className="mt-1 text-[14px] leading-relaxed text-muted-foreground [text-wrap:wrap] [word-break:normal]">{spot.body}</div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={onSkip} className="shrink-0 whitespace-nowrap text-[13px] text-muted-foreground hover:text-foreground">
          スキップ
        </button>
        <span className="flex-1" />
        {onBack ? (
          <button type="button" onClick={onBack} className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[13px] hover:bg-secondary">
            もどる
          </button>
        ) : null}
        {spot.action ? (
          <button
            type="button"
            onClick={spot.action.run}
            className="rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none"
          >
            {spot.action.label}
          </button>
        ) : null}
      </div>
    </>
  )
}

/**
 * 1歩ぶんの吹き出し。target を光らせ、その下か上に吹き出しを置く。target が出てくるまで少し待ち（自治体の頁はデータが冷えていると15秒ほどかかる）、出なければ光らせずに出す。
 * at は通しの何歩目か。onSkip で止める（続きから再開できる）
 */
export function SpotTour({ spot, at, onSkip, onBack }: { spot: Spot; at: number; onSkip: () => void; onBack?: () => void }) {
  const [el, setEl] = React.useState<HTMLElement | null | undefined>(undefined)
  const [box, setBox] = React.useState<Box | null>(null)
  const [tip, setTip] = React.useState<{ top: number; left: number; width: number } | null>(null)
  const card = React.useRef<HTMLDivElement>(null)
  const { target, maxH } = spot

  React.useEffect(() => {
    setEl(undefined)
    setBox(null)
    if (!target) return setEl(null)
    let n = 0
    const t = setInterval(() => {
      n++
      const found = find(target)
      if (found || n > 70) {
        clearInterval(t)
        setEl(found)
      }
    }, 150)
    return () => clearInterval(t)
  }, [target])

  const measure = React.useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.min(360, vw - 24)
    const h = card.current?.offsetHeight ?? 280
    // 対象が見つからなければ、画面の下の真ん中に吹き出しだけを置く
    const live = el && el.isConnected ? el : target ? find(target) : null
    if (!live) {
      setBox(null)
      setTip({ top: Math.max(12, vh - h - 96), left: (vw - w) / 2, width: w })
      return
    }
    const r = live.getBoundingClientRect()
    const height = maxH ? Math.min(r.height, vh * maxH) : r.height
    const b = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: height + PAD * 2 }
    setBox(b)
    // 下に入るなら下、入らなければ上、どちらも入らなければ画面の下端に置く。横は対象に揃え、画面からはみ出さない
    const below = b.top + b.height + GAP
    const above = b.top - GAP - h
    const top = below + h <= vh - 12 ? below : above >= 12 ? above : vh - h - 12
    const left = Math.min(Math.max(12, b.left), vw - w - 12)
    setTip({ top, left, width: w })
  }, [el, target, maxH])

  React.useEffect(() => {
    if (el === undefined) return
    if (el && !pinned(el)) {
      const r = el.getBoundingClientRect()
      const tall = r.height > window.innerHeight * (maxH ?? 0.5)
      if (r.top < 64 || r.bottom > window.innerHeight - 200) el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: smooth() })
    }
    measure()
    let raf = 0
    const tick = () => (cancelAnimationFrame(raf), (raf = requestAnimationFrame(measure)))
    window.addEventListener('scroll', tick, true)
    window.addEventListener('resize', tick)
    // 送り終わり・中身が動いたあとにも測り直す
    const settle = [setTimeout(measure, 450), setTimeout(measure, 1200)]
    const ro = el ? new ResizeObserver(tick) : null
    if (el) ro?.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      settle.forEach(clearTimeout)
      ro?.disconnect()
      window.removeEventListener('scroll', tick, true)
      window.removeEventListener('resize', tick)
    }
  }, [el, measure, maxH])

  // 押す歩: 光らせた所（リンク）を押したら、移る先はリンクに任せず action にそろえる
  React.useEffect(() => {
    if (!spot.click || !el || !spot.action) return
    const run = spot.action.run
    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      run()
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [el, spot.click, spot.action])

  const shown = !!tip
  React.useEffect(() => {
    if (shown && !spot.open) card.current?.focus({ preventScroll: true })
  }, [shown, spot.open, spot.title])

  // aria-modal なので、フォーカスはカードと光らせた所（触れる歩）の中にとどめる
  React.useEffect(() => {
    if (!shown) return
    const onFocus = (e: FocusEvent) => {
      const t = e.target as Node | null
      if (!t || card.current?.contains(t)) return
      if ((spot.open || spot.click) && el?.contains(t)) return
      // 外の iframe（Turnstile など）には触らない
      if (t instanceof HTMLIFrameElement) return
      card.current?.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [shown, spot.open, spot.click, el])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSkip])

  if (el === undefined || !tip) {
    // 測るために一度だけ見えない吹き出しを描く
    return el === undefined
      ? null
      : createPortal(
          <div ref={card} className="fixed top-0 left-0 w-[360px] max-w-[calc(100vw-24px)] p-5" style={{ visibility: 'hidden' }}>
            <SpotBody spot={spot} at={at} onSkip={onSkip} onBack={onBack} />
          </div>,
          document.body,
        )
  }
  const block = 'absolute pointer-events-auto'
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box ? (
        <>
          {/* 光らせた所の外を4枚で塞ぐ。触れる歩は穴の中だけ触れる */}
          <div className={block} style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
          <div className={block} style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
          <div className={block} style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} />
          <div className={block} style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
          {spot.open || spot.click ? null : <div className={block} style={box} />}
          <div aria-hidden="true" className="tour-hole absolute rounded-[20px] transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none" style={{ ...box, boxShadow: `0 0 0 9999px ${SHADE}` }} />
        </>
      ) : (
        <div aria-hidden="true" className="tour-hole pointer-events-auto absolute inset-0" style={{ background: SHADE }} />
      )}
      <div
        ref={card}
        tabIndex={-1}
        key={spot.title}
        className="tour-tip pointer-events-auto absolute rounded-2xl bg-background p-4 text-foreground shadow-xl outline-none sm:p-5"
        style={{ top: tip.top, left: tip.left, width: tip.width }}
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
