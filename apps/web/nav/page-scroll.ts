// 頁のスクロールの箱。ふだんは window だが、広い画面で会話を横に開いている間は本文（.site-main）が自分でスクロールし、
// 会話と横に並ぶ（styles: chat/theme.css の data-side-panel）。頁を送る・位置を読む・スクロールを聞く所はここを通す

const SIDE_PANEL = 'data-side-panel'

/** 本文が自分でスクロールしているときはその箱、window がスクロールしているときは null */
export const pageScroller = (): HTMLElement | null =>
  document.documentElement.hasAttribute(SIDE_PANEL) ? document.querySelector<HTMLElement>('.site-main') : null

export const pageScrollY = () => pageScroller()?.scrollTop ?? window.scrollY

export const scrollPageTo = (options: ScrollToOptions) => (pageScroller() ?? window).scrollTo(options)

export const scrollPageBy = (options: ScrollToOptions) => (pageScroller() ?? window).scrollBy(options)

/** 頁のスクロールを聞く。window と本文の箱のどちらが動いても呼び、表や会話など中の箱のスクロールでは呼ばない */
export function onPageScroll(listener: () => void) {
  const handle = (e: Event) => {
    const t = e.target
    if (t === document || (t instanceof Element && t.classList.contains('site-main'))) listener()
  }
  document.addEventListener('scroll', handle, { capture: true, passive: true })
  return () => document.removeEventListener('scroll', handle, { capture: true })
}

/** 本文を会話と横に並べる（width は会話の幅）。読んでいた位置はそのまま移す。0 で元の window のスクロールに戻す */
export function setSidePanel(width: number) {
  const root = document.documentElement
  const on = width > 0
  if (on === root.hasAttribute(SIDE_PANEL)) {
    if (on) root.style.setProperty('--side-panel', `${width}px`)
    return
  }
  const y = pageScrollY()
  if (on) {
    root.style.setProperty('--side-panel', `${width}px`)
    root.setAttribute(SIDE_PANEL, '')
    pageScroller()?.scrollTo({ top: y })
  } else {
    root.removeAttribute(SIDE_PANEL)
    root.style.removeProperty('--side-panel')
    window.scrollTo({ top: y })
  }
}
