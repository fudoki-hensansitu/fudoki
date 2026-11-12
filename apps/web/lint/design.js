// DESIGN.md の token 以外の色を見つける oxlint の JS plugin。色の値は styles/tokens.css（DESIGN.md の Tokens）にだけ置き、画面は token の名前で塗る
const UTILITY = String.raw`(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|inset-ring|fill|stroke|outline|decoration|divide|from|via|to|shadow|inset-shadow|drop-shadow|caret|accent|placeholder)`
const PALETTE = 'slate|gray|zinc|neutral|stone|taupe|mauve|mist|olive|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const TOKEN = String.raw`(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|brand|emblem|sidebar|chart|hair|page|paper|night|shu|ai|kincha|sakura)(?:-[a-z0-9-]+)?`
const EDGE_L = String.raw`(?<![\w-])`
const EDGE_R = String.raw`(?![\w-])`

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

export default {
  meta: { name: 'design' },
  rules: Object.fromEntries(Object.entries(PATTERNS).map(([name, spec]) => [name, rule(spec)])),
}
