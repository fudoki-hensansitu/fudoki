// 全頁に共通するもの。HTML の応答に CSP（server/csp.ts）を付け、<head> に Void の head では書けないものを足す:
// 既定（ライト）の theme-color（選んだテーマへの差し替えは <head> の THEME_SCRIPT）と、読み直しの移動でも View Transition でつなぐ opt-in（style）。
// テーマ・サイドバーの開閉はブラウザで当て（nav/theme.ts・nav/nav-state.ts）、cookie を読まない。どの人にも同じ HTML を返し、CDN（Void の ISR）に置く
import { defineMiddleware } from 'void'
import { pageCsp } from '../server/csp'
import { DEFAULT_THEME, themeColorMeta } from '../nav/theme'

/**
 * 頁を読み直す移動（他のサイトから来たとき・再読み込み）も View Transition でつなぐ opt-in。<head> に直接書く。
 * 外部の CSS に置くと移動のたびに再検証で届くのが遅れ、Chrome が新しい頁を見せる時点で opt-in を見つけられず transition を飛ばしていた（2026-11-06 に本番で確認）
 */
const PAGE_TRANSITION_STYLE = '<style>@media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }</style>'

export default defineMiddleware(async (c, next) => {
  await next()
  if (!c.res.headers.get('Content-Type')?.startsWith('text/html')) return
  // View の器（routes/view-frame.ts）のように自分の policy を持つ応答はそのままにする
  if (!c.res.headers.has('Content-Security-Policy')) c.res.headers.set('Content-Security-Policy', await pageCsp())
  c.res = new HTMLRewriter().on('head', { element: (e) => void e.append(`${themeColorMeta(DEFAULT_THEME)}\n${PAGE_TRANSITION_STYLE}`, { html: true }) }).transform(c.res)
})
