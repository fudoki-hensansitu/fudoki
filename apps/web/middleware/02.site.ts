// pages/ の頁に共通するもの。サイドバーの開閉（cookie）を layout へ渡し、<head> に色の token・theme-color・頁の間の View Transition の opt-in・
// service worker の登録を足す（Void の head は style と media 付きの meta を持てないので、HTMLRewriter で足す）
import { defineMiddleware } from 'void'
import { TOKENS_CSS } from '../landing'
import { navOpen, PAGE_TRANSITION_STYLE } from '../nav/render'
import { PWA_HEAD, PWA_REGISTER } from '../pwa'
import { THEME_COLOR_META } from '../tokens'

declare module 'void' {
  interface CloudContextVariables {
    shared: { navOpen: boolean }
  }
}

const HEAD = `${THEME_COLOR_META}
${PAGE_TRANSITION_STYLE}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${PWA_HEAD}
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:image" content="https://fudoki.dev/og.png">
<meta name="twitter:card" content="summary_large_image">
<style>${TOKENS_CSS}</style>`

export default defineMiddleware(async (c, next) => {
  c.set('shared', { navOpen: navOpen(c.req.header('Cookie')) })
  await next()
  if (!c.res.headers.get('Content-Type')?.startsWith('text/html')) return
  // サイドバーの開閉を cookie で変えて書くので、開閉の違う HTML を取り違えさせない
  c.res.headers.append('Vary', 'Cookie')
  c.res = new HTMLRewriter()
    .on('head', { element: (e) => void e.append(HEAD, { html: true }) })
    .on('body', { element: (e) => void e.append(PWA_REGISTER, { html: true }) })
    .transform(c.res)
})
