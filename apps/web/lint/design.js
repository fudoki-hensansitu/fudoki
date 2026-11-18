// DESIGN.md から外れた色・余白・文字の大きさ・太さを見つける oxlint の JS plugin。色の値は styles/tokens.css（DESIGN.md の Tokens）にだけ置き、画面は token の名前で塗る。
// 余白は 4px の格子、文字は Title の段と text-xs・text-sm・text-base だけ（表と段落は本文の text-base）、太さは 600 まで
const UTILITY = String.raw`(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|inset-ring|fill|stroke|outline|decoration|divide|from|via|to|shadow|inset-shadow|drop-shadow|caret|accent|placeholder)`
const PALETTE = 'slate|gray|zinc|neutral|stone|taupe|mauve|mist|olive|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const TOKEN = String.raw`(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|brand|emblem|sidebar|chart|hair|page|paper|night|shu|ai|kincha|sakura)(?:-[a-z0-9-]+)?`
const EDGE_L = String.raw`(?<![\w-])`
const EDGE_R = String.raw`(?![\w-])`
const SPACE = String.raw`-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])`

const PATTERNS = {
  'color-literal': {
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/,
    message: '色の値を直に書いている。DESIGN.md の token の名前で塗る',
  },
  'color-palette': {
    pattern: new RegExp(`${EDGE_L}${UTILITY}-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:/[\\w.\\[\\]]+)?${EDGE_R}`),
    message: 'Tailwind 標準の色名を使っている。DESIGN.md の token の名前で塗る',
  },
  'color-opacity': {
    pattern: new RegExp(`${EDGE_L}${UTILITY}-${TOKEN}/(?:\\d+|\\[[^\\]]+\\])${EDGE_R}`),
    message: 'token に後から透明度を付けている。要る濃さは DESIGN.md の token に足す',
  },
  'space-step': {
    pattern: new RegExp(`${EDGE_L}${SPACE}-(?:\\d+\\.5|\\[-?[\\d.]+(?:px|rem)\\])${EDGE_R}`),
    message: '余白が 4px の格子から外れている。DESIGN.md の余白の段（Tailwind の整数の段）にする',
  },
  'text-size': {
    pattern: new RegExp(`${EDGE_L}text-(?:\\[(?![\\d.]+em\\]|max\\([\\d.]+em,[\\d.]+px\\)\\])[^\\]\\s]+\\]|lg|[2-9]?xl)${EDGE_R}`),
    message: '文字の大きさが DESIGN.md の段から外れている。本文は text-xs・text-sm・text-base、それより大きい文字（見出し・金額）は Title か titleVariants にする（単位を小さく添える em は可）',
  },
  'font-weight': {
    pattern: new RegExp(`${EDGE_L}font-(?:bold|extrabold|black)${EDGE_R}`),
    message: '太さが 600 を超えている。データの面は 400〜600（DESIGN.md）',
  },
}

const rule = ({ pattern, message }) => ({
  create(context) {
    const check = (node, text) => {
      const match = typeof text === 'string' ? pattern.exec(text) : null
      if (match) context.report({ node, message: `${message}: ${match[0]}` })
    }
    return {
      Literal: (node) => check(node, node.value),
      TemplateElement: (node) => check(node, node.value.cooked ?? node.value.raw),
    }
  },
})

// 本文は 16px（text-base）。表の中身と、行間を本文の段で組む段落（p）は本文なので、補足・注記の大きさ（text-sm・text-xs）にしない。
// 表は部品（components/ui/table）の既定が本文の大きさなので、使う側で小さくしない
const SMALL = new RegExp(`${EDGE_L}text-(?:xs|sm)${EDGE_R}`)
const TABLE = new Set(['Table', 'TableHeader', 'TableBody', 'TableFooter', 'TableRow', 'TableHead', 'TableCell', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'])
const BODY_LEADING = new RegExp(`${EDGE_L}leading-(?:relaxed|loose|\\[1\\.[6-9]\\]|body)${EDGE_R}`)
// className の式から文字列を集める。cn(...) の引数・三項・&& の枝も読む
const strings = (e) => {
  if (!e) return []
  switch (e.type) {
    case 'Literal': return typeof e.value === 'string' ? [e.value] : []
    case 'TemplateLiteral': return e.quasis.map((q) => q.value.cooked ?? q.value.raw)
    case 'JSXExpressionContainer': return strings(e.expression)
    case 'CallExpression': return e.arguments.flatMap(strings)
    case 'ConditionalExpression': return [...strings(e.consequent), ...strings(e.alternate)]
    case 'LogicalExpression': return [...strings(e.left), ...strings(e.right)]
    default: return []
  }
}
const classText = (attr) => strings(attr.value).join(' ') || null
const bodyText = {
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null
        const attr = node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'className')
        const text = attr ? classText(attr) : null
        const small = text ? SMALL.exec(text) : null
        if (!small) return
        if (name && TABLE.has(name)) context.report({ node: attr, message: `表の中身は本文の大きさ（16px）にする。補足・注記の大きさにしない（DESIGN.md）: ${small[0]}` })
        else if (name === 'p' && small[0] === 'text-sm' && BODY_LEADING.test(text)) context.report({ node: attr, message: `本文の行間で組む段落は本文の大きさ（text-base）にする。補足なら行間を本文の段にしない（DESIGN.md）: ${small[0]}` })
      },
    }
  },
}

export default {
  meta: { name: 'design' },
  rules: { ...Object.fromEntries(Object.entries(PATTERNS).map(([name, spec]) => [name, rule(spec)])), 'body-text': bodyText },
}
