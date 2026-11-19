// 頁の Content-Security-Policy。middleware/01.site.ts が HTML の応答に付ける。
// script は自分の配る JS と inline・Turnstile だけ。inline は Void の defer が HTML の後ろに流す値の script（nonce を付けられず中身が毎回変わる）のために許す。nonce は ISR に置いた HTML では全員に同じ値が返り意味を持たない。style は React の style 属性と inline の <style> があるので unsafe-inline を残す
const TURNSTILE = 'https://challenges.cloudflare.com'
// ホームの「現在地から選ぶ」が緯度・経度を渡す国土地理院の逆ジオコーダー（home/locate.ts）
const GSI_GEOCODER = 'https://mreversegeocoder.gsi.go.jp'

/** 頁の policy。他のサイトの frame には入れさせない */
export const PAGE_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // 風土記のデータは同じ origin の /api だけから読む（api.fudoki.dev は直接呼ばない）
  `connect-src 'self' ${GSI_GEOCODER}`,
  // Turnstile の widget
  `frame-src ${TURNSTILE}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')
