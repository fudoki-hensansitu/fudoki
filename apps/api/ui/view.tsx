import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { createBridge, type Bridge } from './bridge'
import { BarList } from './bars'
import { PdfViewer, type PdfSelection } from './pdf-view'
import {
  KIND_LABEL,
  shortYen,
  yen,
  type Jurisdiction,
  type Origin,
  type TreeNode,
  type ViewData,
} from './types'
import { Button } from '@fudoki/ui/components/button'
import { Alert, AlertTitle, AlertDescription } from '@fudoki/ui/components/alert'
import { Skeleton } from '@fudoki/ui/components/skeleton'

type Names = Record<string, string>

const scopeOf = (n: TreeNode, names: Names) =>
  `${names[n.jurisdiction_code] ?? n.jurisdiction_code} · ${n.fiscal_year}年度 ${KIND_LABEL[n.document_kind] ?? n.document_kind} · ${n.account_name}`
/** 自身より上の科目（款・項）。自身が款・項ならその手前まで */
const ancestorsOf = (n: TreeNode) =>
  [n.kan_name, n.kou_name].filter((v): v is string => !!v && v !== n.name)
const pathOf = (n: TreeNode) => [...ancestorsOf(n), n.name].join(' › ')

/** 割合は、続きが無く、金額がすべて分かる兄弟の中でだけ出す。途中や欠けがあると、合計が変わって割合が誤解を招く */
const shareable = (rows: TreeNode[], next?: string | null) =>
  !next && siblings(rows) && rows.every((n) => n.amount_yen !== null)

/** 全行が同じ資料・会計・親・段にあるなら、割合を出せる兄弟とみなす */
function siblings(rows: TreeNode[]) {
  const key = (n: TreeNode) => JSON.stringify([n.document_kind, n.jurisdiction_code, n.fiscal_year,
    n.account_name, n.axis, n.node_kind, n.parent_node_id ?? null])
  return rows.length > 0 && rows.every((n) => n.parent_node_id !== undefined && key(n) === key(rows[0]!))
}

function describe(data: ViewData, names: Names) {
  if ('jurisdictions' in data) return `風土記の View で団体と収録範囲（${data.jurisdictions.length}団体）を表示中。`
  if ('nodes' in data)
    return `風土記の View で歳出明細の検索結果${data.nodes.length}件を表示中。上位: ${[...data.nodes]
      .sort((a, b) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0)).slice(0, 5)
      .map((n) => `${scopeOf(n, names)} ${pathOf(n)} ${yen(n.amount_yen)}`).join(' / ')}`
  const n = data.node
  return `風土記の View で「${scopeOf(n, names)} ${pathOf(n)}」（${yen(n.amount_yen)}、document_kind=${n.document_kind}、node_id=${n.node_id}）の内訳を表示中。`
}

function OriginButton({ node, origin, bridge, showPdf }: {
  node: TreeNode
  origin?: Origin
  bridge: Bridge
  showPdf: (selection: PdfSelection) => void
}) {
  if (!origin) return null
  const page = [node.source_page, node.amount_source_page]
    .find((p): p is number => typeof p === 'number' && Number.isInteger(p) && p > 0)
  if (origin.format === 'pdf' && page)
    return (
      <Button variant="outline" size="sm" aria-label={`原典を見る: ${node.name}`}
        onClick={(event) => showPdf({ origin, location: node, selectedPage: page, trigger: event.currentTarget })}>
        原典を見る
      </Button>
    )
  return (
    <Button variant="outline" size="sm" onClick={() => bridge.openLink(origin.url)}>
      原典を開く
    </Button>
  )
}

function NodeResult({ data, parent, names, bridge, showPdf, busy }: {
  data: Extract<ViewData, { node: TreeNode }>
  /** 掘り下げる前に見ていた明細。節・事業は目の名前を列に持たないので、経路の補いに使う */
  parent?: TreeNode
  names: Names
  bridge: Bridge
  showPdf: (selection: PdfSelection) => void
  busy: boolean
}) {
  const node = data.node
  const origin = data.origins?.find((o) => o.origin_id === node.origin_id)
  const axes = Object.entries(data.children).filter(([, rows]) => rows.length)
  const ancestors = ancestorsOf(node)
  if (parent && parent.name !== node.name && !ancestors.includes(parent.name)) ancestors.push(parent.name)
  return (
    <>
      <header className="head">
        <div className="scope">{scopeOf(node, names)}</div>
        {ancestors.length > 0 && (
          <div className="crumbs">
            {ancestors.map((name) => <span key={name}>{name}<span className="sep" aria-hidden="true">›</span></span>)}
          </div>
        )}
        <h2>{node.name}</h2>
        {node.amount_yen === null ? <p className="quiet">原典に金額の記載がありません。</p> : (
          <div className="total">
            <span className="total-short" title={yen(node.amount_yen)}>{shortYen(node.amount_yen)}</span>
            {shortYen(node.amount_yen) !== yen(node.amount_yen) && <span className="total-exact">{yen(node.amount_yen)}</span>}
          </div>
        )}
        <div><OriginButton node={node} origin={origin} bridge={bridge} showPdf={showPdf} /></div>
      </header>
      {axes.map(([axis, rows]) => (
        <section key={axis} className="section">
          <h3>{axis === '科目' ? `${rows[0]!.node_kind}ごとの内訳` : `${axis}ごとの内訳`}</h3>
          <BarList label={`${node.name}の${axis}ごとの内訳`} share={shareable(rows, data.next_page_token)} busy={busy}
            bars={rows.map((n) => ({
              key: n.node_id, label: n.name, amount: n.amount_yen,
              onSelect: () => void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'drill'),
            }))} />
        </section>
      ))}
      {!axes.length && <p className="quiet">これより細かい内訳は収録されていません。</p>}
    </>
  )
}

/** 検索結果の見出し。戻るリンクの名前にも使う */
function nodesTitle(rows: TreeNode[]) {
  const first = rows[0]
  if (!first || !siblings(rows)) return `${rows.length}件の明細`
  return first.node_kind === '款' ? '款ごとの歳出' : `${ancestorsOf(first).join(' › ')} の${first.node_kind}ごとの内訳`
}

function NodesResult({ rows, next, names, bridge, busy }: {
  rows: TreeNode[]
  next?: string | null
  names: Names
  bridge: Bridge
  busy: boolean
}) {
  if (!rows.length) return <p className="quiet">該当する歳出明細はありません。</p>
  const scopes = new Set(rows.map((n) => scopeOf(n, names)))
  const common = scopes.size === 1 ? [...scopes][0] : undefined
  const sibling = siblings(rows)
  const title = nodesTitle(rows)
  return (
    <>
      <header className="head">
        {common && <div className="scope">{common}</div>}
        <h2>{title}</h2>
      </header>
      <BarList label={title} share={shareable(rows, next)} busy={busy}
        bars={rows.map((n) => ({
          key: `${n.document_kind}-${n.node_id}`,
          label: sibling ? n.name : pathOf(n),
          note: common ? undefined : scopeOf(n, names),
          amount: n.amount_yen,
          onSelect: () => void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'drill'),
        }))} />
    </>
  )
}

/** 団体 × 年度の表に、収録した資料の区分を置く */
function JurisdictionsResult({ list }: { list: Jurisdiction[] }) {
  if (!list.length) return <p className="quiet">団体はありません。</p>
  const years = [...new Set(list.flatMap((j) => j.coverage.map((c) => c.fiscal_year)))].sort()
  return (
    <>
      <header className="head"><h2>{list.length}団体の収録範囲</h2></header>
      <div className="coverage" role="table" aria-label="団体ごとの収録範囲"
        style={{ gridTemplateColumns: `minmax(7em, 1fr) repeat(${Math.max(1, years.length)}, minmax(4.5em, max-content))` }}>
        <div role="row" className="coverage-row">
          <span role="columnheader" className="coverage-year">団体</span>
          {years.map((y) => <span role="columnheader" key={y} className="coverage-year">{y}年度</span>)}
          {!years.length && <span role="columnheader" />}
        </div>
        {list.map((j) => (
          <div role="row" className="coverage-row" key={j.jurisdiction_code}>
            <span role="rowheader" className="coverage-name">
              {j.name}<span className="bar-note">{j.prefecture_name}</span>
            </span>
            {years.map((y) => {
              const kinds = j.coverage.filter((c) => c.fiscal_year === y).map((c) => KIND_LABEL[c.document_kind] ?? c.document_kind)
              return (
                <span role="cell" key={y} className="coverage-cell">
                  {kinds.map((k) => <span key={k} className="chip">{k}</span>)}
                </span>
              )
            })}
            {!years.length && <span role="cell" className="quiet">収録なし</span>}
          </div>
        ))}
      </div>
    </>
  )
}

function View({ bridge }: { bridge: Bridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
  const [pdf, setPdf] = useState<PdfSelection>()
  const entry = state.entry
  // 最初の結果は AI 自身が受け取っているので、利用者が画面で動かしたあとだけ伝える
  const moved = useRef(false)
  useEffect(() => {
    setPdf(undefined)
    bridge.setFullscreen(false)
    if (entry && moved.current) bridge.tellModel(describe(entry.data, state.names))
    if (entry) moved.current = true
  }, [entry?.revision])
  function showPdf(selection: PdfSelection) {
    setPdf(selection)
    bridge.setFullscreen(true)
    bridge.tellModel(`風土記の View で原典「${selection.origin.title}」の${selection.selectedPage}ページを表示中。`)
  }
  function closePdf() {
    const trigger = pdf?.trigger
    setPdf(undefined)
    bridge.setFullscreen(false)
    queueMicrotask(() => { if (trigger?.isConnected) trigger.focus() })
  }
  if (pdf)
    return (
      <main className="view" data-fullscreen={state.fullscreen.active || undefined}>
        <PdfViewer selection={pdf} apiOrigin={state.apiOrigin} onClose={closePdf} openLink={bridge.openLink} />
      </main>
    )
  const previous = state.history.at(-1)?.data
  const back = previous && ('node' in previous ? previous.node.name : 'nodes' in previous ? nodesTitle(previous.nodes) : '団体一覧')
  return (
    <main aria-busy={state.busy} className="view">
      {back && (
        <div><Button variant="link" size="sm" onClick={bridge.back} disabled={state.busy}>← {back}に戻る</Button></div>
      )}
      {entry && (
        <div key={entry.revision} className="result">
          {'jurisdictions' in entry.data ? <JurisdictionsResult list={entry.data.jurisdictions} />
            : 'nodes' in entry.data ? <NodesResult rows={entry.data.nodes} next={entry.data.next_page_token} names={state.names} bridge={bridge} busy={state.busy} />
            : <NodeResult data={entry.data} parent={previous && 'node' in previous ? previous.node : undefined} names={state.names} bridge={bridge} showPdf={showPdf} busy={state.busy} />}
        </div>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>取得できませんでした</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.busy && (
        <div role="status" className="loading">
          <span className="sr-only">読み込み中</span>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      )}
      {typeof entry?.data.next_page_token === 'string' && (
        <div>
          <Button variant="ghost" size="sm" disabled={state.busy}
            onClick={() => void bridge.call(entry.tool, { ...entry.args, page_token: entry.data.next_page_token }, 'append')}>
            続きを読み込む
          </Button>
        </div>
      )}
    </main>
  )
}

const bridge = createBridge()
const root = createRoot(document.getElementById('root')!)
const dispose = () => {
  root.unmount()
  bridge.dispose()
}
bridge.app.onteardown = async () => {
  root.unmount()
  setTimeout(() => bridge.dispose(), 0)
  return {}
}
window.addEventListener('pagehide', dispose, { once: true })
root.render(
  <StrictMode>
    <View bridge={bridge} />
  </StrictMode>,
)
void bridge.connect()
