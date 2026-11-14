// 頁の Content-Security-Policy。middleware/01.site.ts が HTML の応答に付け、View の器（routes/view-frame.ts）は自分の policy を持つ。
// script は自分の配る JS・service worker の登録・テーマ・サイドバーの開閉（inline、hash で許す）・Turnstile・アクセス解析の Zaraz（同じ origin の /cdn-cgi/zaraz/ と、それが挿す trigger の記録の inline。送信先も同じ origin で、GA4 へは Cloudflare が送る）だけ。style は React の style 属性と inline の <style> があるので unsafe-inline を残す
import { SW_REGISTER } from '../pwa'
import { THEME_SCRIPT } from '../nav/theme'
import { NAV_SCRIPT } from '../nav/nav-state'
import { zarazInlineScripts } from './zaraz'

const TURNSTILE = 'https://challenges.cloudflare.com'
// ホームの「現在地から選ぶ」が緯度・経度を渡す国土地理院の逆ジオコーダー（home/locate.ts）
const GSI_GEOCODER = 'https://mreversegeocoder.gsi.go.jp'

const sha256 = async (text: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))))

let page: Promise<string> | undefined
/** 頁（View の器以外の HTML）の policy。他のサイトの frame には入れさせない */
export const pageCsp = () =>
  (page ??= Promise.all([SW_REGISTER, THEME_SCRIPT, NAV_SCRIPT, ...zarazInlineScripts()].map(sha256)).then((hashes) =>
    [
      "default-src 'self'",
      `script-src 'self' ${hashes.map((h) => `'sha256-${h}'`).join(' ')} ${TURNSTILE}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // 風土記のデータは同じ origin の /api だけから読む（api.fudoki.dev は直接呼ばない）
      `connect-src 'self' ${GSI_GEOCODER}`,
      // View の器（同じ origin の /view-frame）と Turnstile の widget
      `frame-src 'self' ${TURNSTILE}`,
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  ))

/** View の器の外枠の policy。View は inline の script だけで動き、通信は apps/api だけ（View の resource が宣言する接続先は器が meta でさらに絞る） */
export const VIEW_FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'connect-src https://api.fudoki.dev',
  "worker-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  // 風土記の会話の頁の中にだけ置ける
  "frame-ancestors 'self'",
].join('; ')

/** View の器が準備できたことを親に知らせ、親が View の HTML を返すメッセージの type */
export const VIEW_READY_MESSAGE = 'fudoki:view-ready'
export const VIEW_HTML_MESSAGE = 'fudoki:view-html'

/**
 * View の器。srcdoc の iframe は親の頁の CSP を引き継ぎ、View の inline の script が止まるので、器を別の文書として配り、
 * 親（会話の頁）から届いた View の HTML を書き込む。iframe は sandbox="allow-scripts" で同じ origin を与えない
 */
export const VIEW_FRAME_HTML = `<!doctype html><meta charset="utf-8"><script>addEventListener('message',function f(e){if(e.source!==parent||!e.data||e.data.type!=='${VIEW_HTML_MESSAGE}'||typeof e.data.html!=='string')return;removeEventListener('message',f);document.open();document.write(e.data.html);document.close()});parent.postMessage({type:'${VIEW_READY_MESSAGE}'},'*')</script>`
