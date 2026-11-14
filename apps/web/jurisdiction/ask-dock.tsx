// 自治体の頁の AI に聞く入力欄（右下に畳める）。頁の文を選ぶとその文を質問の文脈に入れる
import * as React from 'react'
import { createPortal } from 'react-dom'
import { ArrowSquareOutIcon, ArrowUpIcon, NotePencilIcon, QuotesIcon, RobotIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { StartForm } from '../chat/start-form'
import type { StoredSession } from '../chat/store'
import { QUOTE_PREFIX } from '../chat/history'
import { Hint } from '@/components/hint'
import { reiwa } from './types'
import { myTownContext } from '../home/towns'
/** AI に聞く入力欄。最初は開いておき、読み進めるか Escape で右下のボタンに畳む。押すか「/」、頁の文を選んで文脈が入ったときに開く。
 * 送ると頁を移らずに会話を開く。広い画面では右の side panel（頁は読み続けられる）、スマホでは下からの drawer。閉じても会話は残り、右下のボタンで戻れる */
const DOCK_CLOSE_AFTER = 80
/** 選んだ文として AI に渡す長さの上限 */
const QUOTE_MAX = 600
/** 選択が最後に動いてから、これだけ待って聞く欄を開く */
const QUOTE_OPEN_DELAY = 350
/** drawer の取っ手をこれだけ下へ引いたら閉じる */
const DRAWER_DRAG_CLOSE = 80
/** これより広い画面では右の side panel にする（Tailwind の md）。幅は SIDE_WIDTH */
const WIDE_QUERY = '(min-width: 768px)'
const SIDE_WIDTH = 440

const Conversation = React.lazy(() => import('../chat/conversation').then((m) => ({ default: m.Conversation })))

/** 画面の文字として AI に渡す長さの上限（頁・年度・節・選んだ文と合わせて MAX_CONTEXT に収める） */
const SCREEN_TEXT_MAX = 1200
/** 画面の文字に入れない要素。サイトのナビ・読み上げから外したものを除く（聞く欄・会話は呼ぶ側で除く） */
const SCREEN_SKIP = 'nav, script, style, noscript, template, [aria-hidden="true"], [hidden], [inert]'

/** 画面の表示範囲に見えている文字を、頁の順に読む。宣言なしで、いま見ている画面を AI に伝える */
const screenText = (exclude: (Node | null)[]) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      if (!parent || !node.textContent?.trim()) return NodeFilter.FILTER_REJECT
      if (parent.closest(SCREEN_SKIP) || exclude.some((el) => el?.contains(node))) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const range = document.createRange()
  const lines: string[] = []
  let length = 0
  for (let node = walker.nextNode(); node && length < SCREEN_TEXT_MAX; node = walker.nextNode()) {
    range.selectNodeContents(node)
    const r = range.getBoundingClientRect()
    if (!(r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) continue
    const style = getComputedStyle(node.parentElement!)
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue
    const text = node.textContent!.replace(/\s+/g, ' ').trim()
    if (text === lines.at(-1)) continue
    lines.push(text)
    length += text.length + 1
  }
  return lines.join(' ').slice(0, SCREEN_TEXT_MAX)
}

/** 一定より下までスクロールしたら左下（質問のボタンと同じ高さ）に出す、頁の先頭へ戻るボタン */
const BACK_TO_TOP_AFTER = 800
function BackToTop({ hidden }: { hidden: boolean }) {
  const [shown, setShown] = React.useState(false)
  React.useEffect(() => {
    const onScroll = () => setShown(window.scrollY > BACK_TO_TOP_AFTER)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const off = hidden || !shown
  return (
    <Hint label="上に戻る">
      <button
        type="button"
        aria-label="上に戻る"
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
        tabIndex={off ? -1 : 0}
        aria-hidden={off}
        className={`fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-20 grid size-11 place-items-center rounded-full border bg-background text-muted-foreground shadow-md transition-[opacity,transform] duration-200 hover:border-primary hover:text-foreground max-md:bottom-[calc(16px+var(--bottom-nav))] md:left-[calc(var(--nav-w)+16px)] motion-reduce:transition-none ${off ? 'pointer-events-none translate-y-4 opacity-0' : ''}`}
      >
        <ArrowUpIcon className="size-4" aria-hidden="true" />
      </button>
    </Hint>
  )
}


export function AskDock({ name, code, sitekey, year, section, detail, page }: {
  name: string
  /** 見ている頁の説明。無ければ「name の頁」（比べる頁のように、自治体の頁でないときに渡す） */
  page?: string
  /** 6桁の自治体コード。AI が収録の自治体を確かめ直さずに調べられるよう、文脈に入れる */
  code: string
  sitekey: string
  year: number
  section?: string
  /** 詳細に開いている事業・評価シートなど（送るときに読む） */
  detail?: () => string
}) {
  const [open, setOpen] = React.useState(true)
  const [chat, setChat] = React.useState<{ id: string; session: StoredSession }>()
  const [drawer, setDrawer] = React.useState(false)
  const [quote, setQuote] = React.useState('')
  const dock = React.useRef<HTMLDivElement>(null)
  const sheet = React.useRef<HTMLDivElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const anchor = React.useRef(0)
  /** 指やマウスを押している間 true。選択を広げている途中で聞く欄を開かない */
  const held = React.useRef(false)
  /** 文脈で聞く欄を開く予約を取り消す。開く前に Escape で畳んだら、後から開き直さない */
  const cancelReveal = React.useRef(() => {})
  /** 入力欄に focus した時刻。スマホでは focus で頁が動くので、その直後のスクロールでは閉じない */
  const focusedAt = React.useRef(0)
  const show = React.useCallback(() => {
    if (chat) return setDrawer(true)
    anchor.current = window.scrollY
    setOpen(true)
    requestAnimationFrame(() => dock.current?.querySelector<HTMLElement>('textarea, input')?.focus())
  }, [chat])
  React.useEffect(() => {
    if (!open || chat) return
    // 頁でもカードの中でも、スクロールしたら閉じる（上へ戻しても閉じる）。入力欄に書きかけの文があるときだけ残す
    const close = () => {
      const field = dock.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input')
      if (field?.value.trim()) return
      if (field && document.activeElement === field) field.blur()
      setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (Date.now() - focusedAt.current < 800) { anchor.current = window.scrollY; return }
      const target = e.target
      if (target === document || target === document.documentElement) {
        if (Math.abs(window.scrollY - anchor.current) > DOCK_CLOSE_AFTER) close()
      } else if (target instanceof Node && !dock.current?.contains(target)) close()
    }
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [open, chat])

  // 頁の文を選んだら、その文を質問の文脈に入れる。入力欄を押して選択が外れても残し、頁の別の所を押したら外す
  React.useEffect(() => {
    const onSelect = () => {
      const sel = document.getSelection()
      const node = sel?.anchorNode
      const inside = (n: Node | null | undefined) => !!n && (dock.current?.contains(n) || sheet.current?.contains(n))
      if (inside(node)) return
      const text = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, ' ').trim() : ''
      setQuote(text.slice(0, QUOTE_MAX))
    }
    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [])

  // 文脈が入ったら、聞く欄を開いて chip を見せる。選択を広げている途中で開くと手元が隠れるので、選択が落ち着いてから開く。
  // 入力欄へ focus は移さない（移すと頁の選択が外れる）。狭い画面の drawer は頁を覆うので、会話中は開かない
  React.useEffect(() => {
    if (!quote) return
    const reveal = () => {
      if (chat) {
        if (matchMedia(WIDE_QUERY).matches) setDrawer(true)
        return
      }
      anchor.current = window.scrollY
      setOpen(true)
    }
    // マウスで選択を広げている間は待ち、離したときに開く
    const onUp = () => reveal()
    const timer = setTimeout(() => {
      if (held.current) window.addEventListener('pointerup', onUp, { once: true })
      else reveal()
    }, QUOTE_OPEN_DELAY)
    const cancel = () => {
      clearTimeout(timer)
      window.removeEventListener('pointerup', onUp)
    }
    cancelReveal.current = cancel
    return cancel
  }, [quote, chat])

  const describe = () => {
    const screen = screenText([dock.current, sheet.current])
    return [
      `${page ?? `${name}の頁`}（${location.pathname}）を見ている`,
      `自治体コード: ${code}`,
      `年度: ${reiwa(year)}（${year}年度）`,
      myTownContext(),
      section ? `いま読んでいる節: ${section}` : '',
      detail?.() ?? '',
      quote ? `${QUOTE_PREFIX}「${quote}」` : '',
      // 長さの上限（MAX_CONTEXT）で切られるときは、画面の文字の末尾から落ちるよう最後に置く
      screen ? `画面に見えている文字: ${screen}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // Escape で畳む（入力中でも閉じ、書きかけの文は残す）。drawer が開いていれば drawer を閉じる
  const close = React.useCallback(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    cancelReveal.current()
    if (drawer) setDrawer(false)
    else setOpen(false)
  }, [drawer])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelReveal.current()
      if (e.key === 'Escape' && (drawer || open)) {
        // 表とグラフの全体表示（popover）は、その Escape で先に閉じる
        if (document.querySelector(':popover-open')) return
        close()
        return
      }
      const t = e.target as HTMLElement | null
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      show()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, open, drawer, close])

  // 拡張機能（Vimium など）は入力欄の Escape を先に受け取り、focus を外すだけで頁へ渡さない。
  // キーも押さず指も触れずに入力欄から focus が抜けたら、Escape と見なして1回で畳む
  const lastInput = React.useRef(0)
  React.useEffect(() => {
    const mark = () => (lastInput.current = performance.now())
    const press = () => {
      mark()
      held.current = true
    }
    const release = () => (held.current = false)
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
    window.addEventListener('keydown', mark, true)
    return () => {
      window.removeEventListener('pointerdown', press, true)
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
      window.removeEventListener('keydown', mark, true)
    }
  }, [])
  const onDockBlur = (e: React.FocusEvent) => {
    if (e.relatedTarget || !matchMedia('(pointer: fine)').matches) return
    if (performance.now() - lastInput.current < 50) return
    requestAnimationFrame(() => {
      if (document.hasFocus() && document.visibilityState === 'visible' && !dock.current?.contains(document.activeElement)) setOpen(false)
    })
  }

  // スマホの drawer を開いている間は、下の頁を動かさない。広い画面の side panel では頁を左へ寄せ、読み続けられるようにする
  React.useEffect(() => {
    if (!drawer) return
    const body = document.body.style
    const saved = { overflow: body.overflow, marginRight: body.marginRight }
    const apply = () => {
      const wide = matchMedia(WIDE_QUERY).matches
      body.overflow = wide ? saved.overflow : 'hidden'
      body.marginRight = wide ? `${SIDE_WIDTH}px` : saved.marginRight
      // 固定の小さなヘッダーも panel の左で終える
      document.documentElement.style.setProperty('--side-panel', wide ? `${SIDE_WIDTH}px` : '0px')
    }
    apply()
    const media = matchMedia(WIDE_QUERY)
    media.addEventListener('change', apply)
    return () => {
      media.removeEventListener('change', apply)
      body.overflow = saved.overflow
      body.marginRight = saved.marginRight
      document.documentElement.style.removeProperty('--side-panel')
    }
  }, [drawer])

  // ×・背景・取っ手で閉じたら、文脈で開く予約も取り消す（Escape は close() で取り消す）
  const hideDrawer = () => {
    cancelReveal.current()
    setDrawer(false)
  }

  // 取っ手を下へ引いて閉じる
  const drag = React.useRef<{ y: number; dy: number }>(undefined)
  const [dragY, setDragY] = React.useState(0)
  const onHandleDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    drag.current.dy = Math.max(0, e.clientY - drag.current.y)
    setDragY(drag.current.dy)
  }
  const onHandleUp = () => {
    if (drag.current && drag.current.dy > DRAWER_DRAG_CLOSE) hideDrawer()
    drag.current = undefined
    setDragY(0)
  }

  const start = (id: string, session: StoredSession) => {
    setChat({ id, session })
    setDrawer(true)
    setOpen(false)
    setQuote('')
  }
  const restart = () => {
    setChat(undefined)
    setDrawer(false)
    anchor.current = window.scrollY
    setOpen(true)
    requestAnimationFrame(() => dock.current?.querySelector<HTMLElement>('textarea, input')?.focus())
  }

  const header = chat ? (
    <div
      className="flex touch-none cursor-grab flex-col items-center px-4 pb-2 pt-2 active:cursor-grabbing md:cursor-auto md:touch-auto md:pt-3"
      onPointerDown={onHandleDown}
      onPointerMove={onHandleMove}
      onPointerUp={onHandleUp}
      onPointerCancel={onHandleUp}
    >
      <span aria-hidden="true" className="mb-2 h-1.5 w-10 rounded-full bg-border md:hidden" />
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><RobotIcon className="size-4 text-primary" aria-hidden="true" />{name}について</span>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Hint label="会話を別の頁で開く"><Link href={`/s/${chat.id}`} aria-label="会話を別の頁で開く" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><ArrowSquareOutIcon className="size-4" /></Link></Hint>
          <Hint label="新しい会話"><button type="button" onClick={restart} aria-label="新しい会話" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><NotePencilIcon className="size-4" /></button></Hint>
          <Hint label="閉じる（Esc）"><button type="button" onClick={hideDrawer} aria-label="閉じる" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><XIcon className="size-4" /></button></Hint>
        </div>
      </div>
    </div>
  ) : null

  const chip = quote ? (
    <div className="mb-2 flex min-w-0 max-w-full items-center gap-2 self-start rounded-full border bg-background py-1 pl-3 pr-1 text-[12.5px] text-muted-foreground shadow-sm">
      <QuotesIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate"><span className="sr-only">選んだ文: </span>{quote}</span>
      <button type="button" onClick={() => setQuote('')} aria-label="選んだ文を外す" className="shrink-0 rounded-full p-1 hover:bg-secondary hover:text-foreground"><XIcon className="size-3" /></button>
    </div>
  ) : null

  const docked = open && !chat
  return (
    <>
      <BackToTop hidden={docked || drawer} />
      <div ref={dock} onBlur={onDockBlur} onFocus={() => { focusedAt.current = Date.now(); anchor.current = window.scrollY }} className={`fixed inset-x-0 bottom-0 z-20 max-md:bottom-(--bottom-nav) md:left-(--nav-w) md:right-(--side-panel,0px) bg-gradient-to-t from-background from-60% to-transparent px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 transition-[opacity,transform] duration-200 motion-reduce:transition-none ${docked ? '' : 'pointer-events-none translate-y-4 opacity-0'}`} inert={!docked}>
        <div className="mx-auto max-w-[720px]">
          <StartForm
            sitekey={sitekey}
            placeholder={`${name}について質問`}
            context={describe}
            onStart={start}
            before={chip}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={show}
        aria-keyshortcuts="/"
        className={`fixed bottom-[max(16px,env(safe-area-inset-bottom))] max-md:bottom-[calc(16px+var(--bottom-nav))] right-4 z-20 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2.5 text-sm shadow-md transition-[opacity,transform] duration-200 hover:border-primary motion-reduce:transition-none ${docked || drawer ? 'pointer-events-none translate-y-4 opacity-0' : ''}`}
        tabIndex={docked || drawer ? -1 : 0}
        aria-hidden={docked || drawer}
      >
        <RobotIcon className="size-4 text-primary" aria-hidden="true" />
        {chat ? '会話に戻る' : `${name}について質問`}
      </button>
      {/* 会話のシートは body へ出す。頁の @container が重なりの文脈を作り、スマホの下のナビより後ろに回ってしまうため */}
      {chat ? createPortal(
        <>
          {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
          <div aria-hidden="true" onClick={hideDrawer} className={`fixed inset-0 z-30 bg-foreground/20 md:hidden transition-opacity duration-300 motion-reduce:transition-none ${drawer ? '' : 'pointer-events-none opacity-0'}`} />
          <div
            ref={sheet}
            role="dialog"
            aria-label={`${name}についての会話`}
            inert={!drawer}
            style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
            className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[88dvh] max-w-4xl flex-col overflow-hidden rounded-t-[24px] border border-b-0 bg-background shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none md:inset-x-auto md:right-0 md:top-0 md:h-auto md:w-[440px] md:max-w-none md:rounded-none md:border-y-0 md:border-r-0 md:shadow-xl ${drawer ? '' : 'translate-y-[calc(100%+48px)] md:translate-x-[calc(100%+48px)] md:translate-y-0'}`}
          >
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <React.Suspense fallback={<p className="p-6 text-sm text-muted-foreground">会話を開いています…</p>}>
                <Conversation key={chat.id} id={chat.id} stored={chat.session} header={header} scroller={scroller} context={describe} beforeComposer={chip} onSend={() => setQuote('')} />
              </React.Suspense>
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </>
  )
}
