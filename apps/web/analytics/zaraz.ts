// アクセス解析は Cloudflare Zaraz が GA4 へ送る（サーバー側で送るのでブラウザは gtag.js を読まず、Google と通信しない）。
// Zaraz の script は middleware/01.site.ts が本番（fudoki.dev）の HTML にだけ入れる。無い所（preview・手元）では window.zaraz が無く、ここは何もしない。
// 頁の表示（SPA の移動も含む）は Zaraz の設定で送る。gtag.js の拡張計測は Zaraz では動かないので、要るもの（外部リンク・PDF・スクロール・検索）だけをここで送る。名前と項目は GA4 の拡張計測に合わせる

import { redact } from '../redact'

declare global {
  interface Window {
    zaraz?: { track: (name: string, properties?: Record<string, string | number>) => unknown }
  }
}

/** Zaraz を読み込む host。preview・手元では入れない */
export const ZARAZ_HOST = 'fudoki.dev'
/** Zaraz の自動差し込みは inline の script で CSP に止められるので切ってあり、同じ origin の script を </head> の直前に置く */
export const ZARAZ_SCRIPT = '<script src="/cdn-cgi/zaraz/i.js" referrerpolicy="origin"></script>'

const track = (name: string, properties: Record<string, string | number>) => void window.zaraz?.track(name, properties)

let installed = false
// 頁の表示ごとに一度だけ送る。layout が頁を移るたびに resetScroll で戻す
let scrolled = false

/** SPA で頁を移ったとき（同じ頁へ戻ったときも）スクロールを数え直す */
export const resetScroll = () => {
  scrolled = false
}

/** 外部リンク・PDF のクリックと、頁の 90% までのスクロールを送る。layout が一度だけ呼ぶ */
export function installTracking() {
  if (installed) return
  installed = true
  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement)) return
      const url = new URL(anchor.href, location.href)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return
      const linkText = (anchor.textContent ?? '').trim().slice(0, 100)
      // 出典の PDF（自治体のサイトと、api の PDF 中継 /v1/expenditures/origins/:id/pdf）
      if (/\.pdf$/i.test(url.pathname) || url.pathname.endsWith('/pdf')) {
        track('file_download', { file_extension: 'pdf', file_name: decodeURIComponent(url.pathname.split('/').pop() ?? ''), link_url: url.href, link_text: linkText })
      } else if (url.host !== location.host) {
        track('click', { link_url: url.href, link_domain: url.hostname, link_text: linkText, outbound: 'true' })
      }
    },
    { capture: true },
  )
  addEventListener(
    'scroll',
    () => {
      if (scrolled) return
      const height = document.documentElement.scrollHeight
      if (height <= innerHeight || scrollY + innerHeight < height * 0.9) return
      scrolled = true
      track('scroll', { percent_scrolled: 90 })
    },
    { passive: true },
  )
}

/** 事業の検索（/search?q=…）で言葉を引いたとき。メールアドレス・電話番号の形は伏せる（頁の URL の query は Zaraz の設定で落とす） */
export const trackSearch = (term: string) => {
  if (term) track('search', { search_term: redact(term).slice(0, 100) })
}
