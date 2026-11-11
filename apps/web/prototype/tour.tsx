// 試作: 住んでいるまちを選んだあとに1回だけ出すツアー（marketingskills の onboarding skill の Guided Tours: 3〜5歩・いつでも閉じられる・2回目からは出さない。Do, don't show）。
// 流れは yuito の決めた順: まちの頁を開く（ホーム）→ 事業 → 予算 → 年度の切り替え → 文字を選んでアシスタント（まちの頁）。頁をまたぐので、どこまで進んだかを localStorage に置く。
// 画面を暗くして [data-tour="…"] の部分を1か所ずつ光らせ、その横に吹き出しで説明を重ねる。光らせた所は、押す・選ぶの歩だけ触れる
import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import './onboarding.css'

export type TourStep = {
  /** data-tour の名前。「a|b」は a が無ければ b */
  target: string
  title: string
  body: string
  /** click: 光らせた所を押して進む（action も出す）。select: 光らせた所の文字を選んだら終わる */
  mode?: 'click' | 'select'
  action?: { label: string; run: () => void }
}

const KEY = 'fudoki:proto-tour'
type Phase = 'home' | 'page' | 'done'

const write = (p: Phase) => {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    // 保存できなければ、この頁だけで進む
  }
}

/** ツアーのどこにいるか。phase の頁で on になる。まちを選んだときに start()、頁を移るときに to('page')、終わったら done() で二度と出さない */
export function useTour(phase: Phase) {
  const [on, setOn] = React.useState(false)
  React.useEffect(() => {
    try {
      setOn(localStorage.getItem(KEY) === phase)
    } catch {
      setOn(false)
    }
  }, [phase])
  const start = React.useCallback(() => (write('home'), setOn(phase === 'home')), [phase])
  const to = React.useCallback((p: Phase) => (write(p), setOn(p === phase)), [phase])
  const done = React.useCallback(() => (write('done'), setOn(false)), [])
  return { on, start, to, done }
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

type Box = { top: number; left: number; width: number; height: number }
const PAD = 8
const GAP = 12
const SHADE = 'rgb(0 0 0 / .55)'

/** steps を順に光らせる。offset・total は頁をまたいだ通し番号（例: ホームで 1、まちの頁で 2〜5） */
export function Tour({ steps, onDone, offset = 0, total }: { steps: TourStep[]; onDone: () => void; offset?: number; total?: number }) {
  // 対象が描かれるのを待ってから、見える対象のある歩だけを残す（データを読み込む頁があるので、少しのあいだ待つ）
  const [live, setLive] = React.useState<TourStep[] | null>(null)
  const [i, setI] = React.useState(0)
  const [box, setBox] = React.useState<Box | null>(null)
  const [tip, setTip] = React.useState<{ top: number; left: number; width: number } | null>(null)
  const card = React.useRef<HTMLDivElement>(null)
  const targets = steps.map((s) => s.target).join()

  React.useEffect(() => {
    let n = 0
    const t = setInterval(() => {
      n++
      const found = steps.filter((s) => find(s.target))
      if (found.length === steps.length || n > 25) {
        clearInterval(t)
        setLive(found)
      }
    }, 300)
    return () => clearInterval(t)
    // 親が描き直すたびに配列は作り直されるので、対象の並びが変わったときだけ数え直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets])

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
    const h = card.current?.offsetHeight ?? 180
    // 下に入るなら下、入らなければ上、どちらも入らなければ画面の下端に置く。横は対象に揃え、画面からはみ出さない
    const below = b.top + b.height + GAP
    const above = b.top - GAP - h
    const top = below + h <= vh - 12 ? below : above >= 12 ? above : vh - h - 12
    const left = Math.min(Math.max(12, b.left), vw - w - 12)
    setTip({ top, left, width: w })
  }, [step])

  React.useEffect(() => {
    if (!step) return
    const el = find(step.target)
    if (!el) return
    const r = el.getBoundingClientRect()
    // 画面の外なら送ってから測る。固定の部品（スマホの下の帯は下へ送ると隠れる）は頭へ戻す
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (getComputedStyle(el.closest('nav') ?? el).position === 'fixed') window.scrollTo({ top: 0, behavior })
    else if (r.top < 64 || r.bottom > window.innerHeight - 200) el.scrollIntoView({ block: r.height > window.innerHeight * 0.5 ? 'start' : 'center', behavior })
    measure()
    let raf = 0
    const tick = () => (cancelAnimationFrame(raf), (raf = requestAnimationFrame(measure)))
    window.addEventListener('scroll', tick, true)
    window.addEventListener('resize', tick)
    const settle = setTimeout(measure, 450)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      window.removeEventListener('scroll', tick, true)
      window.removeEventListener('resize', tick)
    }
  }, [step, measure])

  // 文字を選ぶ歩: 光らせた所で文字が選ばれたら、選択が落ち着くのを待って閉じる（聞く欄は頁の側が開く）
  React.useEffect(() => {
    if (step?.mode !== 'select') return
    let t = 0
    const onSel = () => {
      clearTimeout(t)
      const sel = document.getSelection()
      const el = find(step.target)
      if (sel && !sel.isCollapsed && el?.contains(sel.anchorNode)) t = window.setTimeout(onDone, 500)
    }
    document.addEventListener('selectionchange', onSel)
    return () => (clearTimeout(t), document.removeEventListener('selectionchange', onSel))
  }, [step, onDone])

  // 押す歩: 光らせた所（リンク）を押したら、移る先はリンクに任せて、ツアーの進みだけ action と揃える
  React.useEffect(() => {
    if (step?.mode !== 'click') return
    const el = find(step.target)
    const onClick = (e: MouseEvent) => {
      if (!step.action) return
      // 移るのは action に任せ、リンクの移動と二重にしない
      e.preventDefault()
      step.action.run()
    }
    el?.addEventListener('click', onClick)
    return () => el?.removeEventListener('click', onClick)
  }, [step])

  React.useEffect(() => {
    if (live && !live.length) onDone()
  }, [live, onDone])

  React.useEffect(() => {
    card.current?.focus({ preventScroll: true })
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
  const all = total ?? offset + live.length
  const open = step.mode === 'click' || step.mode === 'select'
  // 光らせた所の外を4枚で塞ぐ。押す・選ぶの歩は穴の中だけ触れる
  const { top, left, width, height } = box
  const block = 'absolute pointer-events-auto'
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className={block} style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }} />
      <div className={block} style={{ top: top + height, left: 0, right: 0, bottom: 0 }} />
      <div className={block} style={{ top, left: 0, width: Math.max(0, left), height }} />
      <div className={block} style={{ top, left: left + width, right: 0, height }} />
      {open ? null : <div className={block} style={box} />}
      <div aria-hidden="true" className="tour-hole absolute rounded-[20px] transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none" style={{ ...box, boxShadow: `0 0 0 9999px ${SHADE}` }} />
      <div
        ref={card}
        tabIndex={-1}
        key={i}
        className="tour-tip pointer-events-auto absolute rounded-2xl bg-background p-4 text-foreground shadow-xl outline-none sm:p-5"
        style={tip ? { top: tip.top, left: tip.left, width: tip.width } : { visibility: 'hidden' }}
      >
        <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="flex gap-1">
            {Array.from({ length: all }, (_, k) => (
              <span key={k} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out', k <= offset + i ? 'w-4 bg-primary' : 'w-1.5 bg-border')} />
            ))}
          </span>
          <span className="tabular-nums">
            {offset + i + 1} / {all}
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
            onClick={() => (step.action ? step.action.run() : last ? onDone() : setI(i + 1))}
            className="rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none"
          >
            {step.action?.label ?? (last ? '終える' : '次へ')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** まちの頁（本番の自治体の頁）の側のツアー。試作のホームから「まちの頁を開く」で来たときだけ出す */
export function PageTour({ name }: { name: string }) {
  const { on, done } = useTour('page')
  if (!on) return null
  return (
    <Tour
      offset={1}
      onDone={done}
      steps={[
        { target: 'project', title: '事業', body: `${name}がお金を使っている事業です。押すと、事業の中身・予算・年ごとの動きが開きます。` },
        { target: 'budget', title: '予算', body: 'この年度の一般会計の総額と、住民1人あたりの額です。「予算」「決算」のタブで、分野や款・項・目ごとの内訳を見られます。' },
        { target: 'year', title: '年度の切り替え', body: '年度を変えると、その年の予算・決算・事業に切り替わります。' },
        { target: 'select|project', title: '文字を選んでアシスタントに聞く', body: '気になる文字を選ぶと、その文を添えてアシスタントに質問できます。ここの文字を選んでみてください。', mode: 'select' },
      ]}
    />
  )
}
