// AIP-160 の部分集合: 比較、AND / OR / NOT、括弧、文字列値の先頭か末尾の `*`。
// それ以外（`:` の has、関数、フィールドの辿り、並べただけの暗黙の AND）は
// 受け付けない（ADR 0022）。AIP-160 のとおり OR は AND より強く結ぶ。

export type Comparator = '=' | '!=' | '<' | '<=' | '>' | '>='

export type Value =
  | { kind: 'string'; text: string }
  | { kind: 'number'; text: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }

export type Expr =
  | { kind: 'and'; terms: Expr[] }
  | { kind: 'or'; terms: Expr[] }
  | { kind: 'not'; term: Expr }
  | { kind: 'cmp'; field: string; op: Comparator; value: Value }

export class FilterError extends Error {}

const MAX_LENGTH = 2000
const MAX_RESTRICTIONS = 50

type Token =
  | { kind: 'word'; text: string; at: number }
  | { kind: 'string'; text: string; at: number }
  | { kind: 'op'; text: Comparator; at: number }
  | { kind: '(' | ')'; at: number }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    if (/\s/.test(ch)) {
      i++
    } else if (ch === '(' || ch === ')') {
      tokens.push({ kind: ch, at: i++ })
    } else if (ch === '"' || ch === "'") {
      const start = i++
      let text = ''
      while (i < input.length && input[i] !== ch) {
        if (input[i] === '\\' && i + 1 < input.length) i++
        text += input[i++]
      }
      if (i >= input.length) throw new FilterError(`文字列が閉じていません（位置 ${start}）`)
      i++
      tokens.push({ kind: 'string', text, at: start })
    } else if ('=!<>'.includes(ch)) {
      const two = input.slice(i, i + 2)
      const op = (['!=', '<=', '>='] as const).find((o) => o === two) ?? ch
      if (!['=', '!=', '<', '<=', '>', '>='].includes(op))
        throw new FilterError(`未対応の演算子です（位置 ${i}）`)
      tokens.push({ kind: 'op', text: op as Comparator, at: i })
      i += op.length
    } else if (ch === ':' || ch === '~') {
      throw new FilterError(`演算子 '${ch}' は使えません（位置 ${i}）`)
    } else {
      const start = i
      while (i < input.length && !/[\s()=!<>"':~]/.test(input[i]!)) i++
      tokens.push({ kind: 'word', text: input.slice(start, i), at: start })
    }
  }
  return tokens
}

export function parseFilter(input: string): Expr {
  if (input.length > MAX_LENGTH)
    throw new FilterError(`filter は ${MAX_LENGTH} 文字までです`)
  const tokens = tokenize(input)
  let pos = 0
  let restrictions = 0
  const peek = () => tokens[pos]
  const isWord = (t: Token | undefined, w: string): boolean =>
    t?.kind === 'word' && t.text === w

  const expression = (): Expr => {
    const terms = [factor()]
    while (isWord(peek(), 'AND')) {
      pos++
      terms.push(factor())
    }
    return terms.length === 1 ? terms[0]! : { kind: 'and', terms }
  }
  const factor = (): Expr => {
    const terms = [term()]
    while (isWord(peek(), 'OR')) {
      pos++
      terms.push(term())
    }
    return terms.length === 1 ? terms[0]! : { kind: 'or', terms }
  }
  const term = (): Expr => {
    const t = peek()
    if (isWord(t, 'NOT')) {
      pos++
      return { kind: 'not', term: simple() }
    }
    if (t?.kind === 'word' && t.text.startsWith('-') && t.text.length > 1) {
      // `-field = x` is AIP-160's unary negation.
      tokens[pos] = { ...t, text: t.text.slice(1) }
      return { kind: 'not', term: simple() }
    }
    return simple()
  }
  const simple = (): Expr => {
    const t = peek()
    if (t?.kind === '(') {
      pos++
      const inner = expression()
      if (peek()?.kind !== ')') throw new FilterError(`')' が必要です（位置 ${peek()?.at ?? input.length}）`)
      pos++
      return inner
    }
    if (t?.kind !== 'word' || ['AND', 'OR', 'NOT'].includes(t.text))
      throw new FilterError(`列名が必要です（位置 ${t?.at ?? input.length}）`)
    if (t.text.includes('.')) throw new FilterError(`フィールドの辿りは使えません: ${t.text}`)
    pos++
    const op = peek()
    if (op?.kind !== 'op') throw new FilterError(`${t.text} の後に比較演算子が必要です`)
    pos++
    const v = peek()
    if (v === undefined || (v.kind !== 'word' && v.kind !== 'string'))
      throw new FilterError(`${t.text} ${op.text} の後に値が必要です`)
    pos++
    if (++restrictions > MAX_RESTRICTIONS)
      throw new FilterError(`条件は ${MAX_RESTRICTIONS} 個までです`)
    return { kind: 'cmp', field: t.text, op: op.text, value: literal(v) }
  }
  const literal = (v: Token & { kind: 'word' | 'string' }): Value => {
    if (v.kind === 'string') return { kind: 'string', text: v.text }
    if (v.text === 'true' || v.text === 'false') return { kind: 'boolean', value: v.text === 'true' }
    if (v.text === 'null') return { kind: 'null' }
    if (/^-?\d+(\.\d+)?$/.test(v.text)) return { kind: 'number', text: v.text }
    if (v.text.includes('(')) throw new FilterError('関数は使えません')
    return { kind: 'string', text: v.text }
  }

  if (tokens.length === 0) throw new FilterError('filter が空です')
  const expr = expression()
  if (pos < tokens.length) {
    const t = tokens[pos]!
    throw new FilterError(
      t.kind === 'word' || t.kind === 'string' || t.kind === '('
        ? `条件は AND でつないでください（位置 ${t.at}）`
        : `想定外の記号です（位置 ${t.at}）`
    )
  }
  return expr
}

/** 最上位の AND の項。AND を囲む括弧は展開する。 */
export function conjuncts(expr: Expr): Expr[] {
  return expr.kind === 'and' ? expr.terms.flatMap(conjuncts) : [expr]
}

export type ColumnType = 'string' | 'integer' | 'number' | 'boolean'

export function compileFilter(
  expr: Expr,
  columns: ReadonlyMap<string, ColumnType>
): { sql: string; params: (string | number)[] } {
  const params: (string | number)[] = []
  const walk = (e: Expr): string => {
    switch (e.kind) {
      case 'and':
        return `(${e.terms.map(walk).join(' AND ')})`
      case 'or':
        return `(${e.terms.map(walk).join(' OR ')})`
      case 'not':
        return `(NOT ${walk(e.term)})`
      case 'cmp':
        return restriction(e)
    }
  }
  const restriction = (e: Extract<Expr, { kind: 'cmp' }>): string => {
    const type = columns.get(e.field)
    if (type === undefined) throw new FilterError(`filter に使えない列です: ${e.field}`)
    const col = `"${e.field}"`
    const { op, value } = e
    if (value.kind === 'null') {
      if (op === '=') return `${col} IS NULL`
      if (op === '!=') return `${col} IS NOT NULL`
      throw new FilterError(`null は = と != だけです: ${e.field}`)
    }
    if (type === 'boolean') {
      if (value.kind !== 'boolean') throw new FilterError(`${e.field} は true か false です`)
      if (op !== '=' && op !== '!=') throw new FilterError(`${e.field} は = と != だけです`)
      params.push(value.value ? 1 : 0)
      return `${col} ${op} ?`
    }
    if (type === 'integer') {
      if (value.kind !== 'number' || !/^-?\d+$/.test(value.text)) throw new FilterError(`${e.field} は整数です`)
      const n = Number(value.text)
      if (!Number.isSafeInteger(n)) throw new FilterError(`${e.field} の整数が大きすぎます`)
      params.push(n)
      return `${col} ${op} ?`
    }
    if (type === 'number') {
      if (value.kind !== 'number') throw new FilterError(`${e.field} は数値です`)
      const n = Number(value.text)
      if (!Number.isFinite(n)) throw new FilterError(`${e.field} の数値が大きすぎます`)
      params.push(n)
      return `${col} ${op} ?`
    }
    if (value.kind === 'boolean') throw new FilterError(`${e.field} は文字列です`)
    const text = value.text
    const prefix = text.endsWith('*'),
      suffix = text.startsWith('*')
    const core = value.kind === 'string' ? text.slice(suffix ? 1 : 0, prefix ? -1 : undefined) : text
    if (core.includes('*'))
      throw new FilterError(`* は値の先頭か末尾だけに書けます（前方・後方・部分一致）: ${e.field}`)
    if ((prefix || suffix) && value.kind === 'string') {
      if (op !== '=' && op !== '!=')
        throw new FilterError(`ワイルドカードは = と != だけです: ${e.field}`)
      if (core.length === 0) throw new FilterError(`ワイルドカードには値が必要です: ${e.field}`)
      // BINARY の index が前方一致に効き、= と同じ大文字小文字の区別になる GLOB を使う。
      params.push(`${suffix ? '*' : ''}${core.replace(/[*?[]/g, (m) => `[${m}]`)}${prefix ? '*' : ''}`)
      return `${col} ${op === '=' ? 'GLOB' : 'NOT GLOB'} ?`
    }
    params.push(text)
    return `${col} ${op} ?`
  }
  return { sql: walk(expr), params }
}

/**
 * 1回の問い合わせが走査する行を抑える検査: `document_kind` を受け付ける値の一つに
 * 固定し、`fiscal_year` を5年以内に絞る。どちらも最上位の AND の肯定の項だけを見る。
 */
export function requireScope(
  expr: Expr,
  acceptedKinds: readonly string[],
  maxYears = 5
): { documentKind: string; fiscalYears: number[] } {
  const terms = conjuncts(expr)
  const cmp = (e: Expr): e is Extract<Expr, { kind: 'cmp' }> => e.kind === 'cmp'
  const kinds = terms.filter(
    (e) => cmp(e) && e.field === 'document_kind' && e.op === '=' && e.value.kind === 'string'
  ) as Extract<Expr, { kind: 'cmp' }>[]
  if (kinds.length !== 1)
    throw new FilterError(
      `filter には最上位の AND で document_kind = "<資料区分>" を一つだけ含めてください（${acceptedKinds.join('・')}）`
    )
  const kind = (kinds[0]!.value as { text: string }).text
  if (!acceptedKinds.includes(kind))
    throw new FilterError(`document_kind は ${acceptedKinds.join('・')} のどれかです: ${kind}`)

  const year = (e: Expr) =>
    cmp(e) && e.field === 'fiscal_year' && e.value.kind === 'number' ? Number(e.value.text) : undefined
  const fail = () =>
    new FilterError(
      `filter で fiscal_year を ${maxYears} 年以内に絞ってください。最上位の AND に ` +
        `fiscal_year = Y、fiscal_year = Y1 OR fiscal_year = Y2 ...、fiscal_year >= A AND fiscal_year <= B のどれかを書きます`
    )
  for (const e of terms) {
    if (cmp(e) && e.op === '=' && year(e) !== undefined) return { documentKind: kind, fiscalYears: [year(e)!] }
    if (e.kind === 'or' && e.terms.every((t) => cmp(t) && t.op === '=' && year(t) !== undefined)) {
      const years = [...new Set(e.terms.map((t) => year(t)!))]
      if (years.length <= maxYears) return { documentKind: kind, fiscalYears: years.sort() }
    }
  }
  let low: number | undefined, high: number | undefined
  for (const e of terms) {
    const y = year(e)
    if (!cmp(e) || y === undefined) continue
    if (e.op === '>=' || e.op === '>') low = Math.max(low ?? -Infinity, e.op === '>' ? y + 1 : y)
    if (e.op === '<=' || e.op === '<') high = Math.min(high ?? Infinity, e.op === '<' ? y - 1 : y)
  }
  if (low === undefined || high === undefined || high - low + 1 > maxYears) throw fail()
  const years: number[] = []
  for (let y = low; y <= high; y++) years.push(y)
  return { documentKind: kind, fiscalYears: years }
}
