// ホームのレシートをシェアしたときの OG 画像（GET /jurisdictions/<code>/receipt.png?year=）。
// ホームの札と同じく、緑の札に予算と1人あたりを書き、札の差し出し口から垂れたレシートに分野ごとの1人あたりと合計を書く。
// 金額はホームと同じ perHeadParts で割り、分野の和が合計に合う。描き方（書体・PNG にする）は自治体の OG 画像（og.ts・og-render.ts）と同じ
import { reiwa } from '../jurisdiction/types'
import { withUnits } from '../home/units'
import { LOGO_G } from '../logo'
import { OG_FONT, OG_HEIGHT, OG_WIDTH } from './og'

const BRAND = '#2f5d43'
const ON_BRAND = '#f8f5ee'
const PAPER = '#ffffff'
const TEXT = '#2b2723'
const MUTED = '#6b655c'
const RULE = '#ddd6c8'
const LEFT = 72
// レシート（右）。差し出し口の溝から紙が下へ垂れ、画像の下端で切れる
const SLOT_X = 640
const SLOT_W = 492
const SLOT_Y = 44
const PAPER_X = 656
const PAPER_W = 460
const PAD = 30

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** 字送りの見積もり（em）。半角は 0.6、ほかは 1 */
const ems = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x80 ? 0.6 : 1), 0)

type Anchor = 'start' | 'middle' | 'end'
function text(s: string, size: number, x: number, y: number, fill: string, anchor: Anchor = 'start', tracking = 0.02, opacity = 1): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''} text-anchor="${anchor}" letter-spacing="${(size * tracking).toFixed(2)}">${escape(s)}</text>`
}

/** 1,234円。円は小さく組む */
function yen(n: number, size: number, x: number, y: number, fill: string, anchor: Anchor = 'start'): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" text-anchor="${anchor}"><tspan font-size="${size}">${n.toLocaleString('ja-JP')}</tspan><tspan font-size="${(size * 0.55).toFixed(1)}" dx="${(size * 0.06).toFixed(1)}">円</tspan></text>`
}

/** 9,606億8,000万円。札と同じく兆・億・万を挟み、単位と円は小さく組む */
function yenUnits(n: number, size: number, x: number, y: number, fill: string): string {
  const small = (size * 0.55).toFixed(1)
  const spans = withUnits(n)
    .split(/([兆億万])/)
    .filter(Boolean)
    .map((part) => (/^[兆億万]$/.test(part) ? `<tspan font-size="${small}" dx="${(size * 0.04).toFixed(1)}">${part}</tspan>` : `<tspan font-size="${size}" dx="${(size * 0.04).toFixed(1)}">${part}</tspan>`))
    .join('')
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}">${spans}<tspan font-size="${small}" dx="${(size * 0.06).toFixed(1)}">円</tspan></text>`
}

/** 金額の幅の見積もり（数字とカンマは 0.6em、円は 0.55em） */
const yenWidth = (n: number, size: number) => ems(n.toLocaleString('ja-JP')) * size + size * 0.61

export interface ReceiptOgInput {
  name: string
  year: number
  /** 決算か当初予算か */
  settled: boolean
  /** 一般会計の総額 */
  total: number
  /** 総額を人口で割って丸めた1人あたり（分野の和と同じ） */
  perHead: number
  /** 分野ごとの1人あたり。大きい順で「その他」が最後 */
  rows: { name: string; yen: number }[]
}

export function receiptOgSvg(o: ReceiptOgInput): string {
  const kind = o.settled ? '決算' : '予算'
  const nameSize = Math.min(60, 470 / ems(o.name))
  const left =
    text(o.name, nameSize, LEFT, 132, ON_BRAND, 'start', 0.04) +
    text(`${reiwa(o.year)}の${kind}`, 26, LEFT + 2, 222, ON_BRAND, 'start', 0.02, 0.8) +
    yenUnits(o.total, 60, LEFT, 294, ON_BRAND) +
    `<rect x="${LEFT}" y="330" width="480" height="1" fill="${ON_BRAND}" fill-opacity="0.18"/>` +
    text('1人あたりに直すと', 26, LEFT + 2, 386, ON_BRAND, 'start', 0.02, 0.8) +
    yenUnits(o.perHead, 60, LEFT, 458, ON_BRAND) +
    // 風土記のロゴ（画面のロゴと同じ形。朱の札だけ朱、ほかは生成り）と、その右に問いかけ
    `<g transform="translate(${LEFT - 2} 536) scale(1.3)" color="${ON_BRAND}">${LOGO_G.replace(/style="fill:var\(--shu, (#[0-9a-f]+)\)"/i, 'fill="$1"')}</g>` +
    text('私のお金はどこへ行った？', 22, LEFT + 206, 568, ON_BRAND, 'start', 0.06, 0.7)

  // 紙の中身。行の高さは分野の数で決め、合計が画像の下端より上に収まるようにする
  const x0 = PAPER_X + PAD
  const x1 = PAPER_X + PAPER_W - PAD
  const mid = PAPER_X + PAPER_W / 2
  const rowsTop = 174
  const rowH = Math.min(38, (528 - rowsTop) / Math.max(o.rows.length, 1))
  const rows = o.rows
    .map((r, i) => {
      const y = rowsTop + rowH * (i + 0.7)
      const nameEnd = x0 + ems(r.name) * 18 + 10
      const amountStart = x1 - yenWidth(r.yen, 19) - 10
      const lead = amountStart > nameEnd ? `<line x1="${nameEnd.toFixed(1)}" y1="${(y - 5).toFixed(1)}" x2="${amountStart.toFixed(1)}" y2="${(y - 5).toFixed(1)}" stroke="${RULE}" stroke-width="1.5" stroke-dasharray="1.5 4"/>` : ''
      return text(r.name, 18, x0, y, TEXT) + lead + yen(r.yen, 19, x1, y, TEXT, 'end')
    })
    .join('')
  const dashed = (y: number) => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${RULE}" stroke-width="1.5" stroke-dasharray="5 4"/>`
  const totalY = 588
  const paper =
    `<g filter="url(#shadow)"><rect x="${PAPER_X}" y="${SLOT_Y + 6}" width="${PAPER_W}" height="${OG_HEIGHT}" fill="${PAPER}"/></g>` +
    `<rect x="${PAPER_X}" y="${SLOT_Y + 6}" width="${PAPER_W}" height="40" fill="url(#slotShade)"/>` +
    text(o.name, 22, mid, 106, TEXT, 'middle', 0.3) +
    text(`${reiwa(o.year)} ${o.settled ? '決算' : '当初予算'}・1人あたり`, 15, mid, 136, MUTED, 'middle') +
    dashed(156) +
    rows +
    dashed(totalY - 42) +
    text('1人あたりの合計', 18, x0, totalY - 6, TEXT) +
    yen(o.perHead, 34, x1, totalY, BRAND, 'end')
  const slot = `<rect x="${SLOT_X}" y="${SLOT_Y}" width="${SLOT_W}" height="12" rx="6" fill="#0b1a12"/>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" font-family="${OG_FONT}" font-weight="500">` +
    '<defs>' +
    `<filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000" flood-opacity="0.25"/></filter>` +
    '<linearGradient id="slotShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>' +
    '</defs>' +
    `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${BRAND}"/>` +
    left +
    paper +
    slot +
    '</svg>'
  )
}
