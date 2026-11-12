// DESIGN.md の token 以外の色を apps/web のコードから見つける。CI（verify）で回し、新しいずれが入ったら落とす。
// 色の値は styles/tokens.css（DESIGN.md の Tokens の写し）にだけ置き、画面は token の名前で塗る。
//
// 見つけるもの:
//   literal  … #fff・rgb()・oklch() などの色の直書き（Tailwind の任意値 bg-[#fff] も含む）
//   mix      … color-mix() で token から別の色を作ること
//   palette  … Tailwind 標準の色名（bg-gray-100・text-white など）
//   opacity  … token に後から透明度を付けること（bg-primary/15）
// shadcn から取り込んだ chat/components/ui は shadcn のまま残すので見ない。
//
// どうしても要るときは、その行か直前の行に `design-allow: <理由>` のコメントを書く。
// ファイルごと値を持ってよいもの（token の正本・CSS 変数の届かない画像や HTML）は ALLOWED_FILES に置く。
//
// 使い方: bun scripts/check-design.ts [--json]
import { Glob } from 'bun'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

// token の値と対応（tokens.css・theme.css）、紹介の頁だけの色（DESIGN.md の紹介の構成）、
// CSS 変数が届かない出力（OGP 画像の SVG・PWA の起動画面・ロゴの SVG）
const ALLOWED_FILES = new Set([
  'styles/tokens.css',
  'chat/theme.css',
  'landing/landing.css',
  'tokens.ts',
  'server/og.ts',
  'pwa.ts',
  'logo.ts',
])
// shadcn の CLI が書く部品。shadcn のまま残す
const VENDOR = 'chat/components/ui/'

type Rule = 'literal' | 'mix' | 'palette' | 'opacity'
export type Finding = { file: string; line: number; rule: Rule; match: string }

const PALETTE =
  'slate|gray|zinc|neutral|stone|taupe|mauve|mist|olive|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const COLOR_UTILITY =
  'bg|text|border(?:-[xytrblse])?|ring|ring-offset|fill|stroke|outline|decoration|divide|from|via|to|shadow|inset-shadow|drop-shadow|caret|accent|placeholder'

const PATTERNS: [Rule, RegExp][] = [
  ['literal', /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g],
  ['literal', /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g],
  ['mix', /\bcolor-mix\(/g],
  [
    'palette',
    new RegExp(
      `(?<![\\w-])(?:${COLOR_UTILITY})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:/[\\w.\\[\\]]+)?(?![\\w-])`,
      'g'
    ),
  ],
]
// token に透明度を付けた class（bg-primary/15・ring-ring/[.3]）。palette に当たったものは除く
const OPACITY = new RegExp(
  `(?<![\\w-])(?:${COLOR_UTILITY})-([a-z][a-z-]*)/(?:\\d+|\\[[^\\]]+\\])(?![\\w-])`,
  'g'
)

// text-sm/6 は文字の大きさと行の高さ
const FONT_SIZE = new Set(['xs', 'sm', 'base', 'lg', 'xl'])

const ALLOW = /design-allow:\s*\S/

// コメントの中の文字（PR 番号の #534 など）を拾わないよう、行ごとにコメントを空白に置き換える
function stripComments(source: string, css: boolean): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < source.length) {
    const c = source[i]!
    const next = source[i + 1]
    if (quote) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
      continue
    }
    if (!css && c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      out += ' '.repeat(stop - i)
      i = stop
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    out += c
    i += 1
  }
  return out
}

export function scan(file: string, source: string): Finding[] {
  const css = file.endsWith('.css')
  const rawLines = source.split('\n')
  const lines = stripComments(source, css).split('\n')
  const findings: Finding[] = []
  lines.forEach((text, index) => {
    if (ALLOW.test(rawLines[index]!) || (index > 0 && ALLOW.test(rawLines[index - 1]!))) return
    const hits: Finding[] = []
    for (const [rule, pattern] of PATTERNS) {
      for (const m of text.matchAll(pattern)) hits.push({ file, line: index + 1, rule, match: m[0] })
    }
    for (const m of text.matchAll(OPACITY)) {
      if (FONT_SIZE.has(m[1]!) || hits.some((h) => h.rule === 'palette' && h.match === m[0])) continue
      hits.push({ file, line: index + 1, rule: 'opacity', match: m[0] })
    }
    findings.push(...hits)
  })
  return findings
}

export async function scanAll(): Promise<Finding[]> {
  const findings: Finding[] = []
  for await (const path of new Glob('**/*.{ts,tsx,css}').scan({ cwd: ROOT })) {
    const file = path
    if (file.includes('node_modules/') || file.startsWith('scripts/') || /\.test\.tsx?$/.test(file)) continue
    if (ALLOWED_FILES.has(file) || file.startsWith(VENDOR)) continue
    findings.push(...scan(file, await Bun.file(join(ROOT, file)).text()))
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

// 取り込み前からあるずれ。直すか design-allow にするまでの間だけ置き、新しいものは足さない
const BASELINE = join(ROOT, 'scripts/design-baseline.json')
type Baseline = Record<string, Record<string, number>>
const key = (f: Finding) => `${f.rule} ${f.match}`

if (import.meta.main) {
  const findings = await scanAll()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(findings, null, 2))
    process.exit(0)
  }
  if (process.argv.includes('--write-baseline')) {
    const baseline: Baseline = {}
    for (const f of findings) {
      const counts = (baseline[f.file] ??= {})
      counts[key(f)] = (counts[key(f)] ?? 0) + 1
    }
    await Bun.write(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`)
    console.log(`wrote ${findings.length} findings to scripts/design-baseline.json`)
    process.exit(0)
  }
  const baseline: Baseline = (await Bun.file(BASELINE).exists()) ? await Bun.file(BASELINE).json() : {}
  const remaining = structuredClone(baseline)
  const fresh: Finding[] = []
  for (const f of findings) {
    const counts = remaining[f.file]
    if (counts?.[key(f)]) counts[key(f)] -= 1
    else fresh.push(f)
  }
  const stale = Object.entries(remaining).flatMap(([file, counts]) =>
    Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${file}: ${k}${n > 1 ? ` ×${n}` : ''}`)
  )
  if (stale.length > 0)
    console.log(
      `直ったずれが baseline に残っています（bun scripts/check-design.ts --write-baseline で消せます）:\n  ${stale.join('\n  ')}`
    )
  if (fresh.length > 0) {
    console.error(
      `DESIGN.md の token 以外の色があります。token の名前で塗るか、要るなら行に design-allow: <理由> を書いてください:\n${fresh
        .map((f) => `  apps/web/${f.file}:${f.line} [${f.rule}] ${f.match}`)
        .join('\n')}`
    )
    process.exit(1)
  }
  console.log(JSON.stringify({ designTokensOnly: true, baselined: findings.length }))
}
