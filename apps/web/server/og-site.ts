// 全頁共通の OG 画像（public/og.png）。特定のまちを出さず、風土記そのものを紹介する。
// ホームのレシートの OG 画像（og-receipt.ts）と同じ見た目で、左にロゴと問いかけと説明、右に差し出し口から垂れたレシートを描く。
// レシートの金額はダミー（どのまちの数字でもない）。分野の和を合計にする（2026-11-18 yuito「数字はダミーで良い」）。
// public/og.png は scripts/og-site.ts がこの SVG から作る（手で直さない）
import { LOGO_G } from '../logo'
import { OG_FONT, OG_HEIGHT, OG_WIDTH } from './og'

const BRAND = '#2f5d43'
const ON_BRAND = '#f8f5ee'
const PAPER = '#ffffff'
const TEXT = '#2b2723'
const MUTED = '#6b655c'
const RULE = '#ddd6c8'
const LEFT = 72
const SLOT_X = 640
const SLOT_W = 492
const SLOT_Y = 44
const PAPER_X = 656
const PAPER_W = 460
const PAD = 30

const TAGLINE = '私のお金はどこへ行った？'
const LEAD = ['自治体が何にいくら使い、', 'どう振り返ったかを、', '事業ごとにわかりやすく。']
/** 分野（COFOG 大分類の画面の名前）と、ダミーの1人あたりの金額 */
const ROWS: [string, number][] = [
  ['福祉・子育て', 214800],
  ['教育', 63500],
  ['行政・議会', 48200],
  ['住まい・まちづくり', 35700],
  ['産業・交通', 21900],
  ['健康・医療', 19400],
  ['環境', 17600],
  ['文化・スポーツ', 12300],
  ['防災・安全', 6800],
]
const TOTAL = ROWS.reduce((s, [, y]) => s + y, 0)

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ems = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x80 ? 0.6 : 1), 0)

type Anchor = 'start' | 'middle' | 'end'
/** 1,234円。円は小さく組む（og-receipt.ts と同じ） */
function yen(n: number, size: number, x: number, y: number, fill: string): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" text-anchor="end"><tspan font-size="${size}">${n.toLocaleString('ja-JP')}</tspan><tspan font-size="${(size * 0.55).toFixed(1)}" dx="${(size * 0.06).toFixed(1)}">円</tspan></text>`
}
const yenWidth = (n: number, size: number) => ems(n.toLocaleString('ja-JP')) * size + size * 0.61

function text(s: string, size: number, x: number, y: number, fill: string, anchor: Anchor = 'start', tracking = 0.02, opacity = 1): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''} text-anchor="${anchor}" letter-spacing="${(size * tracking).toFixed(2)}">${escape(s)}</text>`
}

export function siteOgSvg(): string {
  // 風土記のロゴ（朱の札だけ朱、ほかは生成り）を大きく、その下に問いかけと説明
  const logo = `<g transform="translate(${LEFT - 4} 92) scale(2.9)" color="${ON_BRAND}">${LOGO_G.replace(/style="fill:var\(--shu, (#[0-9a-f]+)\)"/i, 'fill="$1"')}</g>`
  const left =
    logo +
    text(TAGLINE, 38, LEFT, 300, ON_BRAND, 'start', 0.04) +
    `<rect x="${LEFT}" y="336" width="480" height="1" fill="${ON_BRAND}" fill-opacity="0.18"/>` +
    LEAD.map((line, i) => text(line, 26, LEFT, 396 + i * 44, ON_BRAND, 'start', 0.04, 0.82)).join('')

  const x0 = PAPER_X + PAD
  const x1 = PAPER_X + PAPER_W - PAD
  const mid = PAPER_X + PAPER_W / 2
  const rowsTop = 174
  const rowH = (528 - rowsTop) / ROWS.length
  const rows = ROWS.map(([name, n], i) => {
    const y = rowsTop + rowH * (i + 0.7)
    const nameEnd = x0 + ems(name) * 18 + 10
    const amountStart = x1 - yenWidth(n, 19) - 10
    const lead = `<line x1="${nameEnd.toFixed(1)}" y1="${(y - 5).toFixed(1)}" x2="${amountStart.toFixed(1)}" y2="${(y - 5).toFixed(1)}" stroke="${RULE}" stroke-width="1.5" stroke-dasharray="1.5 4"/>`
    return text(name, 18, x0, y, TEXT) + lead + yen(n, 19, x1, y, TEXT)
  }).join('')
  const dashed = (y: number) => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${RULE}" stroke-width="1.5" stroke-dasharray="5 4"/>`
  const totalY = 588
  const paper =
    `<g filter="url(#shadow)"><rect x="${PAPER_X}" y="${SLOT_Y + 6}" width="${PAPER_W}" height="${OG_HEIGHT}" fill="${PAPER}"/></g>` +
    `<rect x="${PAPER_X}" y="${SLOT_Y + 6}" width="${PAPER_W}" height="40" fill="url(#slotShade)"/>` +
    text('うちのまち', 22, mid, 106, TEXT, 'middle', 0.3) +
    text('予算・決算・1人あたり', 15, mid, 136, MUTED, 'middle') +
    dashed(156) +
    rows +
    dashed(totalY - 42) +
    text('1人あたりの合計', 18, x0, totalY - 6, TEXT) +
    yen(TOTAL, 34, x1, totalY, BRAND)
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
