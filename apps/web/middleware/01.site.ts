// 全頁に共通するもの。サイドバーの開閉とテーマ（cookie）を layout へ渡し（useShared）、テーマを html の data-theme に書き、HTML の応答に CSP（server/csp.ts）を付け、<head> に Void の head では書けないものを足す:
// ライト・ダークの theme-color（Void の head は meta を name で1つにまとめる）と、読み直しの移動でも View Transition でつなぐ opt-in（style）。
// AI エージェント向けに、API の在処を Link ヘッダーで示し、Accept で text/markdown を望む要求には頁を Markdown にして返す（server/agent-discovery.ts）
import { defineMiddleware } from 'void'
import { SIDEBAR_COOKIE } from '../nav/site-nav'
import { pageCsp } from '../server/csp'
import { DISCOVERY_LINK, htmlToMarkdown, wantsMarkdown } from '../server/agent-discovery'
import { themeColorMeta, themeFromCookie, type Theme } from '../nav/theme'

declare module 'void' {
  interface CloudContextVariables {
    shared: { navOpen: boolean; theme: Theme }
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
  const theme = themeFromCookie(cookie)
  c.set('shared', { navOpen: navOpen(cookie), theme })
  await next()
  if (!c.res.headers.get('Content-Type')?.startsWith('text/html')) return
  // サイドバーの開閉・テーマを cookie で変えて書き、Accept で Markdown に変えるので、違う表現を取り違えさせない
  c.res.headers.append('Vary', 'Cookie')
  c.res.headers.append('Vary', 'Accept')
  c.res.headers.append('Link', DISCOVERY_LINK)
  if (c.res.status === 200 && wantsMarkdown(c.req.header('Accept'))) {
    const markdown = await htmlToMarkdown(c.env.AI, await c.res.clone().text(), c.req.url)
    if (markdown !== undefined) {
      const headers = new Headers(c.res.headers)
      headers.set('Content-Type', 'text/markdown; charset=utf-8')
      headers.delete('Content-Length')
      c.res = new Response(markdown, { status: 200, headers })
      return
    }
  }
  // View の器（routes/view-frame.ts）のように自分の policy を持つ応答はそのままにする
  if (!c.res.headers.has('Content-Security-Policy')) c.res.headers.set('Content-Security-Policy', await pageCsp())
  c.res = new HTMLRewriter()
    .on('html', { element: (e) => void (theme !== 'system' && e.setAttribute('data-theme', theme)) })
    .on('head', { element: (e) => void e.append(`${themeColorMeta(theme)}\n${PAGE_TRANSITION_STYLE}`, { html: true }) })
    .transform(c.res)
})
