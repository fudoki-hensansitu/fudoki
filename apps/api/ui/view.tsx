import { Fragment, StrictMode, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBridge, type Bridge } from './bridge'
import { BarList } from './bars'
import { Kind } from './kind'
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@fudoki/ui/components/breadcrumb'

type Names = Record<string, string>

/** 見出しの上の行。会計は見出しと経路の先頭に出るので、ここでは繰り返さない */
const headScopeOf = (n: TreeNode, names: Names) =>
  `${names[n.jurisdiction_code] ?? n.jurisdiction_code} · ${n.fiscal_year}年度 ${KIND_LABEL[n.document_kind] ?? n.document_kind}`
const scopeOf = (n: TreeNode, names: Names) =>
  `${names[n.jurisdiction_code] ?? n.jurisdiction_code} · ${n.fiscal_year}年度 ${KIND_LABEL[n.document_kind] ?? n.document_kind} · ${n.account_name}`
/** 自身より上の科目（款・項）。自身が款・項ならその手前まで */
interface Named { kind: string; name: string }
/** 自身より上の科目（款・項）と、その区分 */
const ancestorsOf = (n: TreeNode): Named[] =>
  [{ kind: '款', name: n.kan_name }, { kind: '項', name: n.kou_name ?? '' }]
    .filter((a) => !!a.name && a.name !== n.name)

/** 区分のタグ。科目の軸は段（款・項・目）、それ以外の軸は軸の名前（節・事業）で呼ぶ */
const kindOf = (n: TreeNode) => (n.axis === '科目' ? n.node_kind : n.axis)

/** 経路の1段。back があれば押してその画面に戻れる */
interface Crumb { kind?: string; name: string; back?: () => void }

/**
 * 見出しの経路は 会計 › 款 › 項 › 目 の段だけにする（一覧の名前は入れない）。
 * 通ってきた画面にある段はそこへ戻り、無い款・項は親を辿って、会計は款の一覧を取り直して移る。
 */
function crumbsOf(node: TreeNode, history: { data: ViewData }[], bridge: Bridge): Crumb[] {
  const same = (n: TreeNode) => n.document_kind === node.document_kind && n.jurisdiction_code === node.jurisdiction_code &&
    n.fiscal_year === node.fiscal_year && n.account_name === node.account_name
  const visitedIndex = (kind: string, name: string) => history.findIndex(({ data }) =>
    'node' in data && same(data.node) && kindOf(data.node) === kind && data.node.name === name)
  const listIndex = history.findIndex(({ data }) => 'nodes' in data && siblings(data.nodes) && data.nodes[0]!.node_kind === '款' && same(data.nodes[0]!))
  const root: Crumb = {
    name: node.account_name,
    back: listIndex >= 0 ? () => bridge.backTo(listIndex) : () => void bridge.call('search_expenditure_nodes', {
      document_kind: node.document_kind,
      fiscal_year: { min: node.fiscal_year, max: node.fiscal_year },
      where: { jurisdiction_code: { eq: [node.jurisdiction_code] }, account_name: { eq: [node.account_name] }, node_kind: { eq: ['款'] } },
      page_size: 100,
    }, 'reset'),
  }
  const levels = ancestorsOf(node)
  // 節・事業は目の名前を列に持たないので、通ってきた目があれば段に加える
  if (node.axis !== '科目' || !['款', '項', '目'].includes(node.node_kind)) {
    const moku = history.map(({ data }) => data).find((d): d is Extract<ViewData, { node: TreeNode }> =>
      'node' in d && same(d.node) && d.node.node_kind === '目' && d.node.axis === '科目')
    if (moku) levels.push({ kind: '目', name: moku.node.name })
  }
  return [root, ...levels.map((a) => {
    const index = visitedIndex(a.kind, a.name)
    return { ...a, back: index >= 0 ? () => bridge.backTo(index)
      : node.parent_node_id ? () => void bridge.climbTo(node, a.kind, a.name) : undefined }
  })]
}

const pathOf = (n: TreeNode) => [...ancestorsOf(n), { kind: kindOf(n), name: n.name }].map((a) => `【${a.kind}】${a.name}`).join(' › ')


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
      <Button variant="outline" size="sm" className="ref" aria-label={`参照: ${node.name}`}
        onClick={(event) => showPdf({ origin, location: node, selectedPage: page, trigger: event.currentTarget })}>
        参照
      </Button>
    )
  return (
    <Button variant="outline" size="sm" className="ref" onClick={() => bridge.openLink(origin.url)}>
      参照 ↗
    </Button>
  )
}

/**
 * 一覧と明細で共通の見出し。1行目は経路（今の画面は太字の見出し）と、右寄せの範囲。2行目は金額などの主役。
 * 今の画面も経路の続きに同じ大きさで並べ、大きくするのは金額だけにする。
 */
function PathHeader({ crumbs, kind, title, scope, busy, children }: {
  crumbs: Crumb[]
  kind?: string
  title: string
  scope?: string
  busy: boolean
  children?: ReactNode
}) {
  return (
    <header className="head">
      <div className="head-row">
        <Breadcrumb aria-label="経路" className="crumbs">
          <BreadcrumbList className="crumb-list">
            {crumbs.map((c, i) => (
              <Fragment key={`${i}-${c.name}`}>
                <BreadcrumbItem>
                  {c.back
                    ? <BreadcrumbLink render={<button type="button" disabled={busy} onClick={c.back} aria-label={`${c.name}に戻る`} />} className="crumb">
                        {c.kind && <Kind kind={c.kind} />}{c.name}
                      </BreadcrumbLink>
                    : <span>{c.kind && <Kind kind={c.kind} />}{c.name}</span>}
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </Fragment>
            ))}
            <BreadcrumbItem aria-current="page" className="current">
              <h2>{kind && <Kind kind={kind} />}{title}</h2>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {scope && <div className="scope">{scope}</div>}
      </div>
      {children && <div className="total">{children}</div>}
    </header>
  )
}

function NodeResult({ data, crumbs, names, bridge, showPdf, busy }: {
  data: Extract<ViewData, { node: TreeNode }>
  crumbs: Crumb[]
  names: Names
  bridge: Bridge
  showPdf: (selection: PdfSelection) => void
  busy: boolean
}) {
  const node = data.node
  const origin = data.origins?.find((o) => o.origin_id === node.origin_id)
  const axes = Object.entries(data.children).filter(([, rows]) => rows.length)
  return (
    <>
      <PathHeader crumbs={crumbs} kind={kindOf(node)} title={node.name} scope={headScopeOf(node, names)} busy={busy}>
        {node.amount_yen === null ? <span className="quiet">金額の記載なし</span> : (
          <span className="total-short" title={yen(node.amount_yen)}>{shortYen(node.amount_yen)}</span>
        )}
        {/* 参照は金額の行の右に置き、参照のためだけに縦の行を使わない */}
        <OriginButton node={node} origin={origin} bridge={bridge} showPdf={showPdf} />
      </PathHeader>
      {axes.map(([axis, rows]) => (
        <section key={axis} className="section" aria-label={`${axis === '科目' ? rows[0]!.node_kind : axis}ごとの内訳`}>
          <BarList label={`${node.name}の${axis}ごとの内訳`} share={shareable(rows, data.next_page_token)} busy={busy}
            bars={rows.map((n) => ({
              key: n.node_id, label: n.name, kind: kindOf(n), amount: n.amount_yen,
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
  return [first.account_name, ...ancestorsOf(first).map((a) => a.name)].join(' › ')
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
  const share = shareable(rows, next)
  const total = share ? rows.reduce((sum, n) => sum + (n.amount_yen ?? 0), 0) : undefined
  return (
    <>
      <PathHeader crumbs={[]} title={title} scope={common && (sibling ? headScopeOf(rows[0]!, names) : common)} busy={busy}>
        {/* 兄弟が揃っているときだけ合計を主役に置く。途中や混在では合計に意味が無い */}
        {total !== undefined && <span className="total-short" title={yen(total)}>{shortYen(total)}</span>}
      </PathHeader>
      <BarList label={title} share={share} busy={busy}
        bars={rows.map((n) => ({
          key: `${n.document_kind}-${n.node_id}`,
          label: n.name,
          kind: kindOf(n),
          // 兄弟でなければ、どの科目の下か・どの団体と年度かを添える
          note: [sibling ? '' : ancestorsOf(n).map((a) => a.name).join(' › '), common ? '' : scopeOf(n, names)].filter(Boolean).join('　') || undefined,
          amount: n.amount_yen,
          onSelect: () => void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'drill'),
        }))} />
    </>
  )
}

/** 団体 × 年度の表に、収録した資料の区分を置く */
function JurisdictionsResult({ list, bridge, busy }: { list: Jurisdiction[]; bridge: Bridge; busy: boolean }) {
  if (!list.length) return <p className="quiet">団体はありません。</p>
  const years = [...new Set(list.flatMap((j) => j.coverage.map((c) => c.fiscal_year)))].sort()
  return (
    <>
      <PathHeader crumbs={[]} title={`${list.length}団体の収録範囲`} busy={busy} />
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
              const covered = j.coverage.filter((c) => c.fiscal_year === y)
              return (
                <span role="cell" key={y} className="coverage-cell">
                  {covered.map((c) => {
                    const label = KIND_LABEL[c.document_kind] ?? c.document_kind
                    // View の中では移らず、チャットで AI に呼び直させる。一般会計を優先し、別の会計はチャットで聞き直せばよい
                    const account = c.accounts.find((a) => a.account_name === '一般会計') ?? c.accounts[0]
                    return (
                      <button type="button" key={c.document_kind} className="chip" disabled={!account}
                        aria-label={`${j.name} ${y}年度 ${label}の${account?.account_name ?? ''}をチャットで聞く`}
                        onClick={() => account && bridge.ask(`${j.name}（団体コード ${j.jurisdiction_code}）の${y}年度 ${label}・${account.account_name}の歳出を款ごとに見せて`)}>
                        {label}
                      </button>
                    )
                  })}
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
    // 文脈は最後の1件で上書きされるので、PDF を閉じたら明細を見ている状態に戻す
    if (entry) bridge.tellModel(describe(entry.data, state.names))
    queueMicrotask(() => { if (trigger?.isConnected) trigger.focus() })
  }
  if (pdf)
    return (
      <main className="view" data-fullscreen={state.fullscreen.active || undefined}>
        <PdfViewer selection={pdf} apiOrigin={state.apiOrigin} onClose={closePdf} openLink={bridge.openLink} />
      </main>
    )
  return (
    <main aria-busy={state.busy} className="view">
      {entry && (
        <div key={entry.revision} className="result">
          {'jurisdictions' in entry.data ? <JurisdictionsResult list={entry.data.jurisdictions} bridge={bridge} busy={state.busy} />
            : 'nodes' in entry.data ? <NodesResult rows={entry.data.nodes} next={entry.data.next_page_token} names={state.names} bridge={bridge} busy={state.busy} />
            : <NodeResult data={entry.data} crumbs={crumbsOf(entry.data.node, state.history, bridge)} names={state.names} bridge={bridge} showPdf={showPdf} busy={state.busy} />}
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
        <button type="button" className="bar-more" disabled={state.busy}
          onClick={() => void bridge.call(entry.tool, { ...entry.args, page_token: entry.data.next_page_token }, 'append')}>
          続き
        </button>
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
