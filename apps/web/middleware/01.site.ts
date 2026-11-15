// 全頁に共通するもの。HTML の応答に CSP（server/csp.ts）を付け、<head> に Void の head では書けないものを足す:
// 既定（ライト）の theme-color（選んだテーマへの差し替えは <head> の THEME_SCRIPT）と、本番だけアクセス解析の script（analytics/zaraz.ts）。
// テーマ・サイドバーの開閉はブラウザで当て（nav/theme.ts・nav/nav-state.ts）、cookie を読まない。どの人にも同じ HTML を返し、CDN（Void の ISR）に置く。
// AI エージェント向けに、API の在処を Link ヘッダーで示し、Accept で text/markdown を望む要求には頁を Markdown にして返す（server/agent-discovery.ts）
import { defineMiddleware } from 'void'
import { PAGE_CSP } from '../server/csp'
import { DISCOVERY_LINK, htmlToMarkdown, wantsMarkdown } from '../server/agent-discovery'
import { DEFAULT_THEME, themeColorMeta } from '../nav/theme'
import { ZARAZ_HOST, ZARAZ_SCRIPT } from '../server/zaraz'
import { NOT_FOUND_HEADER } from '../server/not-found'

export default defineMiddleware(async (c, next) => {
  await next()
  // 見つからない頁（server/not-found.ts）。Void は頁を 200 で描くので、HTML は 404 にする。頁を移るときの JSON は、画面が描けるよう 200 のままにする
  if (c.res.headers.has(NOT_FOUND_HEADER)) {
    if (c.res.headers.get('Content-Type')?.startsWith('text/html')) c.res = new Response(c.res.body, { status: 404, headers: c.res.headers })
    // Hono は c.res を差し替えるとき前の応答の header を写すので、差し替えた後で外す
    c.res.headers.delete(NOT_FOUND_HEADER)
  }
  if (!c.res.headers.get('Content-Type')?.startsWith('text/html')) return
  // HTML には Vary: Accept を付けない（Void の ISR は X-VoidPages 以外の Vary が付いた応答を CDN に置かない）。
  // CDN に置くのは HTML だけで、Markdown は下で置かないようにする。Accept に text/markdown を含む要求は ISR を通らずここに届く（patches/@void%2Fisr@1.5.0.patch）
  c.res.headers.append('Link', DISCOVERY_LINK)
  if (c.res.status === 200 && wantsMarkdown(c.req.header('Accept'))) {
    const markdown = await htmlToMarkdown(c.env.AI, await c.res.clone().text(), c.req.url)
    if (markdown !== undefined) {
      const headers = new Headers(c.res.headers)
      headers.set('Content-Type', 'text/markdown; charset=utf-8')
      headers.delete('Content-Length')
      // ISR の key は path だけなので、Markdown を CDN に置かない（置くと HTML を望む人にも Markdown を返す）
      headers.set('x-revalidate', '0')
      headers.set('Cache-Control', 'no-store')
      headers.append('Vary', 'Accept')
      c.res = new Response(markdown, { status: 200, headers })
      return
    }
  }
  // View の器（routes/view-frame.ts）のように自分の policy を持つ応答はそのままにする
  if (!c.res.headers.has('Content-Security-Policy')) c.res.headers.set('Content-Security-Policy', PAGE_CSP)
  // アクセス解析（Cloudflare Zaraz → GA4）は本番だけ。preview・手元には入れない（analytics/zaraz.ts）
  const analytics = new URL(c.req.url).hostname === ZARAZ_HOST ? `\n${ZARAZ_SCRIPT}` : ''
  c.res = new HTMLRewriter().on('head', { element: (e) => void e.append(`${themeColorMeta(DEFAULT_THEME)}${analytics}`, { html: true }) }).transform(c.res)
})
