// サイドバーをサーバーで HTML にする。JavaScript が動く前から（検索エンジンにも）リンクが見え、島が描き直しても頁がずれない
import { renderToString } from 'react-dom/server'
import { SIDEBAR_COOKIE, SiteNav, type NavSection } from './site-nav'

const cache = new Map<string, string>()

/**
 * 頁の間の移動を View Transition でつなぐ opt-in。各頁の <head> に直接書く。
 * 外部の CSS（/_app/*.css）に置くと、移動のたびに再検証（max-age=0）で届くのが遅れ、Chrome が新しい頁を見せる時点で
 * opt-in を見つけられず transition を飛ばしていた（2026-11-06 に本番で確認）。動き自体（.site-main と ::view-transition-*）は各 CSS に置く
 */
export const PAGE_TRANSITION_STYLE = '<style>@media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; types: page; } }</style>'

/** 閉じたことがある利用者は cookie に false が残る。無ければ開いて出す */
export const navOpen = (cookie: string | undefined) => !new RegExp(`(?:^|;\\s*)${SIDEBAR_COOKIE}=false(?:;|$)`).test(cookie ?? '')

/** 頁の本文（main）を受け取り、サイドバーと並べた body の中身を返す */
export function withSiteNav(main: string, opts: { active?: NavSection; open: boolean }): string {
  const key = `${opts.active ?? ''}:${opts.open}`
  let nav = cache.get(key)
  if (nav === undefined) {
    nav = `<div id="site-nav" data-active="${opts.active ?? ''}">${renderToString(<SiteNav {...opts} />)}</div>`
    cache.set(key, nav)
  }
  return `<div class="site">${nav}<div class="site-main">${main}</div></div>\n<script type="module" src="/_app/nav.js"></script>`
}
