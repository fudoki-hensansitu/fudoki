// MCP Apps の View（host の iframe の中で動く）。tool の structuredContent を受けて、団体と収録範囲・歳出の木のノードを表にする。
// 表示だけを担い、データの意味は REST・MCP の応答と同じ。追加のデータは fetch せず（既定の CSP で connect-src 'none'）、host 経由で tool を呼ぶ。
import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import { closePdf, showPdf, type PdfLocation } from './pdf-view'

type Json = Record<string, unknown>

interface Origin {
  origin_id: string
  title: string
  url: string
  format: string
}

interface TreeNode extends PdfLocation {
  document_kind: string
  node_id: string
  jurisdiction_code: string
  fiscal_year: number
  account_name: string
  axis: string
  node_kind: string
  code: string | null
  name: string
  amount_yen: number | null
  kan_name: string
  kou_name: string | null
  origin_id: string
  source_page: number | null
  amount_source_page: number | null
}

interface Jurisdiction {
  jurisdiction_code: string
  name: string
  prefecture_name: string
  coverage: { fiscal_year: number; document_kind: string; accounts: { account_name: string; account_kind: string; origins: Origin[] }[] }[]
}

const KIND_LABEL: Record<string, string> = { settlement: '決算', initial: '当初予算' }

const root = document.getElementById('root')!
const app = new App({ name: 'fudoki-view', version: '1.0.0' })
let apiOrigin = 'https://api.fudoki.dev'

// 結果を描いた tool と、その入力。「次のページ」は同じ入力に page_token を足して同じ tool を呼ぶ。
// tool は結果の形から決める（host が hostContext.toolInfo を渡すとは限らない）
let current: { tool: string; args: Json } = { tool: '', args: {} }
const stack: { tool: string; args: Json; data: Json }[] = []

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null)[]) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  for (const c of children) if (c !== null) el.append(c)
  return el
}

/** 原典へのリンク。iframe の中から直接は開けないことがあるので、host に開かせる。 */
function originLink(url: string, text: string, label: string) {
  const a = h('a', { href: url, title: label, class: 'origin' }, text)
  a.addEventListener('click', (e) => {
    e.preventDefault()
    void app.openLink({ url })
  })
  return a
}

/**
 * 明細の原典の位置。PDF は #page= で頁を開ける（Chrome・Edge・Firefox・Acrobat）が、Safari やダウンロードされた PDF では効かないので、頁番号も書く。
 * 頁が無い明細と CSV（頁ではなく行）には #page を付けない。
 */
function located(origin: Origin | undefined, page: number | null, prefix: string, text = '原典', node?: TreeNode) {
  if (!origin) return null
  const pdf = origin.format === 'pdf'
  const url = pdf && page !== null ? `${origin.url}#page=${page}` : origin.url
  const where = page === null ? '' : pdf ? `${page}ページ` : `${page}行目`
  let action: HTMLElement = originLink(url, text, origin.title)
  if (pdf && page !== null && node) {
    const button = h('button', { type: 'button', class: 'link', 'aria-label': `${prefix.trim()}の原典を表示: ${node.name}` }, '原典を表示')
    button.onclick = () => void showPdf(origin, node, page, apiOrigin, (url) => { void app.openLink({ url }) }, button)
    action = button
  }
  return h('span', { class: 'loc' }, prefix, action, where ? ' ' : '', where ? h('span', { class: 'nowrap' }, where) : '')
}

const wrap = (table: HTMLTableElement) => h('div', { class: 'table-wrap' }, table)

const yen = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('ja-JP')}円`)

function pager(token: unknown, onMore: (token: string) => void) {
  if (typeof token !== 'string') return null
  const button = h('button', { type: 'button' }, '次のページ')
  button.addEventListener('click', () => {
    button.setAttribute('disabled', '')
    onMore(token)
  })
  return h('div', { class: 'pager' }, button)
}

/** host 経由で tool を呼ぶ。失敗は表示を消さずに知らせ、ボタンを押し直せるようにする。 */
async function call(tool: string, args: Json, push: boolean) {
  root.setAttribute('aria-busy', 'true')
  let message: string
  try {
    const result = await app.callServerTool({ name: tool, arguments: args })
    if (typeof result._meta?.apiOrigin === 'string') apiOrigin = result._meta.apiOrigin
    if (!result.isError && result.structuredContent) {
      if (push) stack.push({ ...current, data: lastData })
      current = { tool, args }
      return result.structuredContent as Json
    }
    const text = result.content?.find((c) => c.type === 'text')
    message = text && 'text' in text ? String(text.text) : '取得に失敗しました'
  } catch (e) {
    message = `取得に失敗しました: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    root.removeAttribute('aria-busy')
  }
  root.querySelector('.call-error')?.remove()
  root.append(h('p', { class: 'error call-error' }, message))
  for (const b of root.querySelectorAll('.pager button')) b.removeAttribute('disabled')
  return null
}

let lastData: Json = {}

function showError(message: string) {
  root.replaceChildren(h('p', { class: 'error' }, message))
}

// --- 団体と収録範囲 ---

function coverageSummary(j: Jurisdiction) {
  if (j.coverage.length === 0) return h('span', { class: 'muted' }, '収録なし')
  const chips = h('span', { class: 'chips' })
  for (const c of j.coverage) chips.append(h('span', { class: `chip ${c.document_kind}` }, `${c.fiscal_year} ${KIND_LABEL[c.document_kind] ?? c.document_kind}`))
  return chips
}

function coverageDetail(j: Jurisdiction) {
  const box = h('div', { class: 'detail' })
  for (const c of j.coverage) {
    const list = h('ul')
    for (const a of c.accounts) {
      const li = h('li', {}, h('span', { class: 'account' }, a.account_name), a.account_kind !== a.account_name ? h('span', { class: 'muted' }, `（${a.account_kind}）`) : null)
      // 収録範囲の原典は資料そのものへのリンク（頁は付けない）
      for (const o of a.origins) li.append(' ', originLink(o.url, o.title, o.title))
      list.append(li)
    }
    box.append(h('h4', {}, `${c.fiscal_year}年度 ${KIND_LABEL[c.document_kind] ?? c.document_kind}`), list)
  }
  return box
}

function renderJurisdictions(data: Json, append: boolean) {
  const list = data.jurisdictions as Jurisdiction[]
  let table = root.querySelector<HTMLTableSectionElement>('tbody.jurisdictions')
  if (!append || !table) {
    table = h('tbody', { class: 'jurisdictions' })
    const filter = h('input', { type: 'search', placeholder: '団体名・団体コードで絞る', 'aria-label': '団体名・団体コードで絞る' })
    filter.addEventListener('input', () => {
      const q = filter.value.normalize('NFKC').trim()
      for (const row of table!.querySelectorAll<HTMLElement>('tr.row')) {
        const hit = !q || (row.dataset.search ?? '').includes(q)
        row.hidden = !hit
        const detail = row.nextElementSibling as HTMLElement | null
        if (detail?.classList.contains('detail-row')) detail.hidden = !hit || !row.classList.contains('open')
      }
    })
    root.replaceChildren(
      h('div', { class: 'toolbar' }, filter, h('span', { class: 'muted count' })),
      wrap(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '団体'), h('th', {}, '都道府県'), h('th', {}, '団体コード'), h('th', {}, '収録範囲'))), table))
    )
  }
  for (const j of list) {
    const row = h(
      'tr',
      { class: 'row', 'data-search': `${j.name} ${j.prefecture_name} ${j.jurisdiction_code}`.normalize('NFKC'), tabindex: '0' },
      h('td', { class: 'nowrap' }, j.name),
      h('td', { class: 'nowrap' }, j.prefecture_name),
      h('td', { class: 'mono' }, j.jurisdiction_code),
      h('td', {}, coverageSummary(j))
    )
    table.append(row)
    if (j.coverage.length > 0) {
      const detail = h('tr', { class: 'detail-row' }, h('td', { colspan: '4' }, coverageDetail(j)))
      detail.hidden = list.length > 1 || append
      if (!detail.hidden) row.classList.add('open')
      table.append(detail)
      const toggle = () => {
        row.classList.toggle('open')
        detail.hidden = !row.classList.contains('open')
      }
      row.addEventListener('click', (e) => {
        if (!(e.target instanceof HTMLAnchorElement)) toggle()
      })
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      })
    }
  }
  const rows = [...table.querySelectorAll('tr.row')]
  const covered = rows.filter((r) => r.nextElementSibling?.classList.contains('detail-row')).length
  root.querySelector('.count')!.textContent = `${rows.length}団体（収録あり ${covered}）`
  root.querySelector('.pager')?.remove()
  const more = pager(data.next_page_token, async (token) => {
    const next = await call(current.tool, { ...current.args, page_token: token }, false)
    if (next) renderJurisdictions(next, true)
  })
  if (more) root.append(more)
}

// --- 歳出の木のノード ---

function nodePath(n: TreeNode) {
  return [n.kan_name, n.kou_name, n.node_kind === '款' || n.node_kind === '項' ? null : n.name].filter((p) => p).join(' / ')
}

function nodeRow(n: TreeNode, origins: Map<string, Origin>, withScope: boolean) {
  const origin = origins.get(n.origin_id)
  const loc = h('td', { class: 'locs' }, located(origin, n.source_page, '項目 ', '原典', n))
  // 金額の位置は、項目と同じ頁なら繰り返さない
  if (n.amount_yen !== null && n.amount_source_page !== null && n.amount_source_page !== n.source_page) loc.append(h('br'), located(origin, n.amount_source_page, '金額 ', '原典', n)!)
  const drill = h('button', { type: 'button', class: 'link' }, '内訳')
  drill.addEventListener('click', async () => {
    const data = await call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, true)
    if (data) render(data, false)
  })
  // 狭い host でも原典の列が見えるよう、団体・年度・会計は科目の下の行にまとめる
  const scope = withScope ? h('div', { class: 'muted small' }, `${n.jurisdiction_code} ・ ${n.fiscal_year} ${KIND_LABEL[n.document_kind] ?? ''} ・ ${n.account_name}`) : null
  return h(
    'tr',
    {},
    h('td', { class: 'name' }, h('span', { class: 'kind' }, n.node_kind), ' ', withScope ? nodePath(n) : n.name, scope, h('div', {}, drill)),
    h('td', { class: 'num' }, yen(n.amount_yen)),
    loc
  )
}

function originMap(data: Json, previous?: Map<string, Origin>) {
  const map = new Map(previous)
  for (const o of (data.origins as Origin[] | undefined) ?? []) map.set(o.origin_id, o)
  return map
}

let nodeOrigins = new Map<string, Origin>()

function renderNodes(data: Json, append: boolean) {
  nodeOrigins = originMap(data, append ? nodeOrigins : undefined)
  let body = root.querySelector<HTMLTableSectionElement>('tbody.nodes')
  if (!append || !body) {
    body = h('tbody', { class: 'nodes' })
    root.replaceChildren(
      backButton(),
      wrap(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '科目'), h('th', {}, '金額'), h('th', {}, '原典'))), body))
    )
  }
  for (const n of data.nodes as TreeNode[]) body.append(nodeRow(n, nodeOrigins, true))
  root.querySelector('.pager')?.remove()
  const more = pager(data.next_page_token, async (token) => {
    const next = await call(current.tool, { ...current.args, page_token: token }, false)
    if (next) renderNodes(next, true)
  })
  if (more) root.append(more)
}

function renderNode(data: Json, append: boolean) {
  nodeOrigins = originMap(data, append ? nodeOrigins : undefined)
  const node = data.node as TreeNode
  const children = data.children as Record<string, TreeNode[]>
  if (!append) {
    const origin = nodeOrigins.get(node.origin_id)
    root.replaceChildren(
      backButton(),
      h(
        'div',
        { class: 'head' },
        h('div', { class: 'muted' }, `${node.jurisdiction_code} ・ ${node.fiscal_year}年度 ${KIND_LABEL[node.document_kind] ?? ''} ・ ${node.account_name}`),
        h('h3', {}, h('span', { class: 'kind' }, node.node_kind), ' ', nodePath(node) || node.name),
        h('div', { class: 'num big' }, yen(node.amount_yen)),
        h('div', { class: 'muted' }, origin?.title ?? ''),
        h('div', {}, located(origin, node.source_page, '項目 ', '原典', node), node.amount_source_page !== null && node.amount_source_page !== node.source_page ? h('span', {}, ' ・ ', located(origin, node.amount_source_page, '金額 ', '原典', node)!) : null)
      )
    )
  }
  for (const [axis, rows] of Object.entries(children)) {
    let body = root.querySelector<HTMLTableSectionElement>(`tbody[data-axis="${CSS.escape(axis)}"]`)
    if (!body) {
      body = h('tbody', { 'data-axis': axis })
      root.append(h('h4', {}, `${axis}の内訳`), wrap(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '名称'), h('th', {}, '金額'), h('th', {}, '原典'))), body)))
    }
    for (const n of rows) body.append(nodeRow(n, nodeOrigins, false))
  }
  if (!append && Object.keys(children).length === 0) root.append(h('p', { class: 'muted' }, '内訳はありません'))
  root.querySelector('.pager')?.remove()
  const more = pager(data.next_page_token, async (token) => {
    const next = await call(current.tool, { ...current.args, page_token: token }, false)
    if (next) renderNode(next, true)
  })
  if (more) root.append(more)
}

function backButton() {
  if (stack.length === 0) return ''
  const button = h('button', { type: 'button', class: 'link back' }, '← 戻る')
  button.addEventListener('click', () => {
    const prev = stack.pop()!
    current = { tool: prev.tool, args: prev.args }
    render(prev.data, false)
  })
  return button
}

function render(data: Json, append: boolean) {
  closePdf()
  lastData = data
  root.querySelector('.call-error')?.remove()
  if (Array.isArray(data.jurisdictions)) {
    current.tool = 'list_jurisdictions'
    renderJurisdictions(data, append)
  } else if (Array.isArray(data.nodes)) {
    current.tool = 'search_expenditure_nodes'
    renderNodes(data, append)
  } else if (data.node && data.children) {
    current.tool = 'get_expenditure_node'
    renderNode(data, append)
  } else showError('表示できない結果です')
}

function applyHost(ctx: McpUiHostContext | undefined) {
  if (!ctx) return
  if (ctx.theme) applyDocumentTheme(ctx.theme)
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
}

// handler は connect の前に置く（接続直後に届く通知を落とさない）
app.ontoolinput = (params) => {
  current.args = (params.arguments ?? {}) as Json
}
app.ontoolresult = (result) => {
  if (typeof result._meta?.apiOrigin === 'string') apiOrigin = result._meta.apiOrigin
  if (result.isError || !result.structuredContent) {
    const text = result.content?.find((c) => c.type === 'text')
    showError(text && 'text' in text ? String(text.text) : '結果がありません')
    return
  }
  render(result.structuredContent as Json, false)
}
app.onhostcontextchanged = () => applyHost(app.getHostContext())

await app.connect()
applyHost(app.getHostContext())
