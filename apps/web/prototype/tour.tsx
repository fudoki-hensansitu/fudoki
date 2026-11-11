// 試作: まちの画面に入った直後に1回だけ出すツアー（marketingskills の onboarding skill の Guided Tours: 3〜5歩・いつでも閉じられる・2回目からは出さない）。
// 画面を暗くして [data-tour="…"] の部分を1か所ずつ光らせ、その横に吹き出しで説明を重ねる。見えている対象の無い歩は飛ばす
import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import './onboarding.css'

export type TourStep = { target: string; title: string; body: string }

const KEY = 'fudoki:proto-tour'

/** まちを選んだときに呼ぶ。次に描くまちの画面でツアーが始まる */
export const queueTour = () => {
  try {
    localStorage.setItem(KEY, 'pending')
  } catch {
    // 保存できなければ出さない
  }
}

/** ツアーを出すかどうか。終わったら done() で閉じ、二度と出さない */
export function useTour() {
  const [on, setOn] = React.useState(false)
  React.useEffect(() => {
    try {
      setOn(localStorage.getItem(KEY) === 'pending')
    } catch {
      setOn(false)
    }
  }, [])
  const done = React.useCallback(() => {
    setOn(false)
    try {
      localStorage.setItem(KEY, 'done')
    } catch {
      // この頁では閉じる
    }
  }, [])
  return { on, done }
}

/** 見えている対象。サイドバーと下の帯のように同じ名前が2つあるときは、見えている方 */
const find = (name: string) => [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden') ?? null

type Box = { top: number; left: number; width: number; height: number }
const PAD = 8
const GAP = 12

export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  // 描いた時点で見える対象のある歩だけを残す
  const [live, setLive] = React.useState<TourStep[] | null>(null)
  const [i, setI] = React.useState(0)
  const [box, setBox] = React.useState<Box | null>(null)
  const [tip, setTip] = React.useState<{ top: number; left: number; width: number } | null>(null)
  const card = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    // まちの画面の部品が出揃ってから数える
    const t = setTimeout(() => setLive(steps.filter((s) => find(s.target))), 450)
    return () => clearTimeout(t)
    // 親が描き直すたびに配列は作り直されるので、対象の並びが変わったときだけ数え直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.map((s) => s.target).join()])

  const step = live?.[i]
  const measure = React.useCallback(() => {
    if (!step) return
    const el = find(step.target)
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
    setBox(b)
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.min(340, vw - 24)
    const h = card.current?.offsetHeight ?? 170
    // 下に入るなら下、入らなければ上。横は対象に揃え、画面からはみ出さない
    const below = b.top + b.height + GAP
    const top = below + h <= vh - 12 ? below : Math.max(12, b.top - GAP - h)
    const left = Math.min(Math.max(12, b.left), vw - w - 12)
    setTip({ top, left, width: w })
  }, [step])

  React.useEffect(() => {
    if (!step) return
    const el = find(step.target)
    if (!el) return
    const r = el.getBoundingClientRect()
    // 画面の外なら、真ん中に来るまで送ってから測る。固定の部品（スマホの下の帯は下へ送ると隠れる）は頭へ戻す
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (step.target === 'nav') window.scrollTo({ top: 0, behavior })
    else if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior })
    measure()
    let raf = 0
    const tick = () => (cancelAnimationFrame(raf), (raf = requestAnimationFrame(measure)))
    window.addEventListener('scroll', tick, true)
    window.addEventListener('resize', tick)
    const settle = setTimeout(measure, 400)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      window.removeEventListener('scroll', tick, true)
      window.removeEventListener('resize', tick)
    }
  }, [step, measure])

  React.useEffect(() => {
    if (live && !live.length) onDone()
  }, [live, onDone])

  React.useEffect(() => {
    card.current?.focus()
  }, [i, live])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDone])

  if (!live || !step || !box) return null
  const last = i === live.length - 1
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* 下の画面には触らせない。光らせる穴は大きな影でくり抜く */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      <div
        aria-hidden="true"
        className="tour-hole pointer-events-none absolute rounded-[20px] transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none"
        style={{ ...box, boxShadow: '0 0 0 9999px rgb(0 0 0 / .55)' }}
      />
      <div
        ref={card}
        tabIndex={-1}
        key={i}
        className="tour-tip absolute rounded-2xl bg-background p-4 text-foreground shadow-xl outline-none sm:p-5"
        style={tip ? { top: tip.top, left: tip.left, width: tip.width } : { visibility: 'hidden' }}
      >
        <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="flex gap-1">
            {live.map((_, k) => (
              <span key={k} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out', k <= i ? 'w-4 bg-primary' : 'w-1.5 bg-border')} />
            ))}
          </span>
          <span className="tabular-nums">
            {i + 1} / {live.length}
          </span>
        </div>
        <h2 id="tour-title" className="text-[16px] font-bold">
          {step.title}
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={onDone} className="text-[13px] text-muted-foreground hover:text-foreground">
            スキップ
          </button>
          <span className="flex-1" />
          {i > 0 ? (
            <button type="button" onClick={() => setI(i - 1)} className="rounded-full px-3 py-2 text-[13px] hover:bg-secondary">
              もどる
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (last ? onDone() : setI(i + 1))}
            className="rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none"
          >
            {last ? '見はじめる' : '次へ'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
