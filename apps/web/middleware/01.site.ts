// 全頁に共通するもの。サイドバーの開閉（cookie）を layout へ渡し（useShared）、HTML の応答に CSP（server/csp.ts）を付け、<head> に Void の head では書けないものを足す:
// 既定（ライト）の theme-color（選んだテーマへの差し替えは <head> の THEME_SCRIPT）と、読み直しの移動でも View Transition でつなぐ opt-in（style）。
// テーマはブラウザで当てるので、cookie の無い要求にはどの人にも同じ HTML を返す（CDN の cache に置ける）
import { defineMiddleware } from 'void'
import { SIDEBAR_COOKIE } from '../nav/site-nav'
import { pageCsp } from '../server/csp'
import { DEFAULT_THEME, themeColorMeta } from '../nav/theme'

declare module 'void' {
  interface CloudContextVariables {
    shared: { navOpen: boolean }
  }
}

/**
 * 頁を読み直す移動（他のサイトから来たとき・再読み込み）も View Transition でつなぐ opt-in。<head> に直接書く。
 * 外部の CSS に置くと移動のたびに再検証で届くのが遅れ、Chrome が新しい頁を見せる時点で opt-in を見つけられず transition を飛ばしていた（2026-11-06 に本番で確認）
 */
const PAGE_TRANSITION_STYLE = '<style>@media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }</style>'

/** 閉じたことがある利用者は cookie に false が残る。無ければ開いて出す */
export const navOpen = (cookie: string | undefined) => !new RegExp(`(?:^|;\\s*)${SIDEBAR_COOKIE}=false(?:;|$)`).test(cookie ?? '')

export default defineMiddleware(async (c, next) => {
  const cookie = c.req.header('Cookie')
  c.set('shared', { navOpen: navOpen(cookie) })
  await next()
  if (!c.res.headers.get('Content-Type')?.startsWith('text/html')) return
  // サイドバーを閉じた人（cookie あり）には閉じた HTML を書くので、ブラウザの cache で取り違えさせない。
  // cookie の無い要求の HTML は誰にでも同じなので Vary を付けない（Vary の付いた応答は ISR の cache に置かれない。cookie の付いた要求は ISR を通らない）
  if (cookie) c.res.headers.append('Vary', 'Cookie')
  // View の器（routes/view-frame.ts）のように自分の policy を持つ応答はそのままにする
  if (!c.res.headers.has('Content-Security-Policy')) c.res.headers.set('Content-Security-Policy', await pageCsp())
  c.res = new HTMLRewriter().on('head', { element: (e) => void e.append(`${themeColorMeta(DEFAULT_THEME)}\n${PAGE_TRANSITION_STYLE}`, { html: true }) }).transform(c.res)
})
