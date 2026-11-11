// 自治体の頁の OG 画像（GET /jurisdictions/<code>/og.png）。紋章・名前と、最新の決算の総額・分野（COFOG 大分類）のサンキーを、
// 頁と同じデータ（jurisdiction-routes.ts の page）から SVG に組み、resvg（wasm）で PNG にする。決算が本番に出れば次の取得から変わる。
// 文字はロゴと同じ書体（Zen Kaku Gothic New の Medium）の <text> で書き、書体は描くときに Google Fonts から取る（og-render.ts）。
// 緑は総額・ロゴ・サンキーに使い、文字は墨色にする
import { formatYen, reiwa } from '../jurisdiction/types'

export const INK = '#2f5d43'
const PAPER = '#f4f1e6'
const TEXT = '#2b2723'
const TAGLINE = 'まちのお金、何に使ってる？'
export const OG_WIDTH = 1200
export const OG_HEIGHT = 630
const LEFT = 80
// サンキー: 総額の棒（左）から分野の棒（右）へ。名前を付けるのは大きい順に6分野で、残りは「ほか」にまとめる
const TOP_AREAS = 6
const FLOW_TOP = 64
const FLOW_BOTTOM = 566
const LABEL_MIN = 58
const SOURCE_X = 548
const TARGET_X = 852
const BAR_W = 14

export const OG_FONT = 'Zen Kaku Gothic New'

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 字送りの見積もり（em）。半角は 0.6、ほかは 1。名前の大きさを決めるのに使う */
const ems = (s: string, tracking: number) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x80 ? 0.6 : 1) + tracking, 0) - tracking

/** 文字を1行書く。字間は letter-spacing（tracking × size） */
function text(s: string, size: number, x: number, baseline: number, tracking = 0.04): string {
  return `<text x="${x.toFixed(2)}" y="${baseline.toFixed(2)}" font-size="${size}" letter-spacing="${(size * tracking).toFixed(2)}">${escape(s)}</text>`
}

/** formatYen（1,234億円・12.3億円・5,000万円）を数字と単位に分け、数字を大きく単位を小さく組む */
function amount(yen: number, size: number, unitSize: number, x: number, baseline: number, tracking = 0): string {
  const [, num = '', unit = ''] = formatYen(yen).match(/^([\d,.]+)(.*)$/) ?? []
  return `<text x="${x.toFixed(2)}" y="${baseline.toFixed(2)}"><tspan font-size="${size}" letter-spacing="${(size * tracking).toFixed(2)}">${escape(num)}</tspan><tspan font-size="${unitSize}" letter-spacing="${(unitSize * 0.02).toFixed(2)}" dx="${(unitSize * 0.15).toFixed(2)}">${escape(unit)}</tspan></text>`
}

export interface OgArea {
  name: string
  yen: number
}

function sankey(areas: OgArea[]): string {
  const named = areas.filter((a) => a.name !== 'その他').slice(0, TOP_AREAS)
  const total = areas.reduce((s, a) => s + a.yen, 0)
  const rest = total - named.reduce((s, a) => s + a.yen, 0)
  const nodes = rest > 0 ? [...named, { name: 'ほか', yen: rest }] : named
  const room = FLOW_BOTTOM - FLOW_TOP
  let k = (room - 12 * (nodes.length - 1)) / total
  while (nodes.reduce((s, n) => s + Math.max(n.yen * k, LABEL_MIN), 0) > room) k *= 0.97
  const heights = nodes.map((n) => n.yen * k)
  const gap = (room - heights.reduce((s, h) => s + Math.max(h, LABEL_MIN), 0)) / Math.max(nodes.length - 1, 1)
  const sourceH = total * k
  const sourceY = FLOW_TOP + (room - sourceH) / 2
  const parts = [`<rect x="${SOURCE_X}" y="${sourceY.toFixed(1)}" width="${BAR_W}" height="${sourceH.toFixed(1)}" rx="3" fill="${INK}"/>`]
  const x0 = SOURCE_X + BAR_W
  const x1 = TARGET_X
  const c = (x0 + x1) / 2
  let ySource = sourceY
  let slotY = FLOW_TOP
  nodes.forEach((n, i) => {
    const h = heights[i]!
    const slot = Math.max(h, LABEL_MIN)
    const y = slotY + (slot - h) / 2
    const f = (v: number) => v.toFixed(1)
    parts.push(
      `<path d="M${x0} ${f(ySource)} C${c} ${f(ySource)} ${c} ${f(y)} ${x1} ${f(y)} L${x1} ${f(y + h)} C${c} ${f(y + h)} ${c} ${f(ySource + h)} ${x0} ${f(ySource + h)} Z" fill="${INK}" fill-opacity="0.16"/>`,
      `<rect x="${TARGET_X}" y="${f(y)}" width="${BAR_W}" height="${f(Math.max(h, 2))}" rx="2" fill="${INK}"/>`,
    )
    const mid = slotY + slot / 2
    const labelX = TARGET_X + 30
    parts.push(`<g fill="${TEXT}" fill-opacity="0.65">${text(n.name, 19, labelX, mid - 4, 0.02)}</g>`, `<g fill="${TEXT}">${amount(n.yen, 26, 15, labelX, mid + 25)}</g>`)
    ySource += h
    slotY += slot + gap
  })
  return parts.join('')
}

function dataUri(svg: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(svg)) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

export interface OgInput {
  name: string
  /** 市区町村なら都道府県名。都道府県そのものは null */
  prefecture: string | null
  /** 最新の決算の年度（西暦） */
  year: number
  /** 頁の見出しと同じ総額（一般会計の款の和） */
  total: number
  /** 分野（COFOG 大分類）ごとの金額。大きい順で「その他」が最後（cofogFlow の並び） */
  areas: OgArea[]
  emblemSvg: string
  logoSvg: string
}

export function ogSvg(o: OgInput): string {
  const size = Math.min(64, 300 / ems(o.name, 0.04))
  const baseline = 236 + (o.prefecture ? 14 : 0)
  let head = `<g fill="${TEXT}">${text(o.name, size, 196, baseline)}</g>`
  if (o.prefecture) head += `<g fill="${TEXT}" fill-opacity="0.65">${text(o.prefecture, 24, 198, baseline - size - 8)}</g>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" font-family="${OG_FONT}" font-weight="500">` +
    `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${PAPER}"/>` +
    `<image href="${dataUri(o.logoSvg)}" x="${LEFT}" y="64" width="160" height="46" preserveAspectRatio="xMinYMid meet"/>` +
    `<rect x="${LEFT}" y="160" width="96" height="96" rx="18" fill="#ffffff"/>` +
    `<image href="${dataUri(o.emblemSvg)}" x="${LEFT + 12}" y="172" width="72" height="72" preserveAspectRatio="xMidYMid meet"/>` +
    head +
    `<g fill="${TEXT}" fill-opacity="0.65">${text(`${reiwa(o.year)}に使ったお金`, 26, LEFT + 2, 352, 0.02)}</g>` +
    `<g fill="${INK}">${amount(o.total, 92, 36, LEFT - 2, 448)}</g>` +
    `<g fill="${TEXT}">${text(TAGLINE, 26, LEFT + 2, 548, 0.06)}</g>` +
    sankey(o.areas) +
    '</svg>'
  )
}

/** SVG に書いた文字（<text> の中身）。書体はこの字だけを取る */
export function ogChars(svg: string): string {
  const body = svg.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  return [...new Set(body)].sort().join('')
}
