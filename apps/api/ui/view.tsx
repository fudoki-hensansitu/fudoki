import { createContext, Fragment, StrictMode, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBridge, type Bridge } from './bridge'
import { BarList, FOLD } from './bars'

/** インラインでは要約として上位の数行だけを出す。全画面では FOLD 件ずつ */
const INLINE_FOLD = 5
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
import { ArrowLeft, ExternalLink } from 'lucide-react'
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

/** 見出しの右に置く範囲。会計は経路の先頭に出るので繰り返さない */
const headScopeOf = (n: TreeNode, names: Names) =>
  `${names[n.jurisdiction_code] ?? n.jurisdiction_code} · ${n.fiscal_year}年度 ${KIND_LABEL[n.document_kind] ?? n.document_kind}`
const scopeOf = (n: TreeNode, names: Names) =>
  `${names[n.jurisdiction_code] ?? n.jurisdiction_code} · ${n.fiscal_year}年度 ${KIND_LABEL[n.document_kind] ?? n.document_kind} · ${n.account_name}`
interface Named { kind: string; name: string }
/** 自身より上の科目（款・項）。自身が款・項ならその手前まで */
const ancestorsOf = (n: TreeNode): Named[] =>
  [{ kind: '款', name: n.kan_name }, { kind: '項', name: n.kou_name ?? '' }]
    .filter((a) => !!a.name && a.name !== n.name)

/** 区分のタグ。科目の軸は段（款・項・目）、それ以外の軸は軸の名前（節・事業）で呼ぶ */
const kindOf = (n: TreeNode) => (n.is_subject ? n.node_kind : n.axis)

interface Crumb { kind?: string; name: string; back?: () => void }

/**
 * 見出しの経路は 会計 › 款 › 項 › 目 の段だけにする（一覧の名前は入れない）。
 * 通ってきた画面にある段はそこへ戻り、無い款・項は名前で検索して開き直し、会計は款の一覧を取り直して移る。
 */
function crumbsOf(node: TreeNode, history: { data: ViewData }[], bridge: Bridge, levelsOf: (n: TreeNode) => Named[] = ancestorsOf): Crumb[] {
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
  const levels = levelsOf(node)
  // 節・事業は目の名前を列に持たないので、通ってきた目があれば段に加える
  if (!node.is_subject || !['款', '項', '目'].includes(node.node_kind)) {
    const moku = history.map(({ data }) => data).find((d): d is Extract<ViewData, { node: TreeNode }> =>
      'node' in d && same(d.node) && d.node.node_kind === '目' && d.node.is_subject === true)
    if (moku) levels.push({ kind: '目', name: moku.node.name })
  }
  return [root, ...levels.map((a) => {
    const index = visitedIndex(a.kind, a.name)
    const kind = a.kind
    return { ...a, back: index >= 0 ? () => bridge.backTo(index)
      : kind === '款' || kind === '項' ? () => void bridge.openLevel(node, kind) : undefined }
  })]
}

const pathOf = (n: TreeNode) => [...ancestorsOf(n), { kind: kindOf(n), name: n.name }].map((a) => `【${a.kind}】${a.name}`).join(' › ')


/** 割合は、続きが無く、金額がすべて分かる兄弟の中でだけ出す。途中や欠けがあると、合計が変わって割合が誤解を招く */
const shareable = (rows: TreeNode[], next?: string | null) =>
  !next && siblings(rows) && rows.every((n) => n.amount_yen !== null)

/** 検索結果が1件で続きも無いときだけ、明細の画面に置き換える */
const autoOpens = (rows: TreeNode[], next?: string | null) => rows.length === 1 && !next

/** 団体・年度・資料・会計ごとに分け、2つ以上のまとまりがどれも兄弟の一覧なら返す。年度、団体コードの順に並べる */
function groupByScope(rows: TreeNode[]): TreeNode[][] | undefined {
  const map = new Map<string, TreeNode[]>()
  for (const n of rows) {
    const key = JSON.stringify([n.fiscal_year, n.jurisdiction_code, n.document_kind, n.account_name])
    map.set(key, [...(map.get(key) ?? []), n])
  }
  if (map.size < 2) return undefined
  const groups = [...map.values()]
  if (!groups.every((g) => siblings(g)) || groups.every((g) => g.length === 1)) return undefined
  return groups.sort((a, b) => a[0]!.fiscal_year - b[0]!.fiscal_year || a[0]!.jurisdiction_code.localeCompare(b[0]!.jurisdiction_code))
}

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
  // 形式は文字の札で示す（lucide には PDF・CSV を区別するアイコンがない）。PDF は View の中で開き、CSV などは host 経由で元の URL を開く
  const format = <span className="ref-format" aria-hidden="true">{origin.format.toUpperCase()}</span>
  if (origin.format === 'pdf' && page)
    return (
      <Button variant="outline" size="sm" className="ref" aria-label={`参照（PDF）: ${node.name}`}
        onClick={(event) => showPdf({ origin, location: node, selectedPage: page, trigger: event.currentTarget })}>
        {format}参照
      </Button>
    )
  return (
    <Button variant="outline" size="sm" className="ref" aria-label={`参照（${origin.format.toUpperCase()}、外部で開く）: ${node.name}`}
      onClick={() => bridge.openLink(origin.url)}>
      {format}参照<ExternalLink aria-hidden="true" className="ref-external" />
    </Button>
  )
}

/**
 * 一覧と明細で共通の見出し。1行目は経路（今の画面は太字の見出し）と、右寄せの範囲。2行目は金額などの主役。
 * 今の画面も経路の続きに同じ大きさで並べ、大きくするのは金額だけにする。
 */
/** 前の画面がパンくずで辿れない（団体・年度をまたぐ一覧）ときだけ、見出しの頭に置く「戻る」 */
const BackContext = createContext<(() => void) | undefined>(undefined)

/** 全行が同じ団体・年度・資料なら、パンくずで辿れる一つの範囲とみなす */
const oneScope = (rows: TreeNode[]) => rows.every((n) => n.jurisdiction_code === rows[0]!.jurisdiction_code &&
  n.fiscal_year === rows[0]!.fiscal_year && n.document_kind === rows[0]!.document_kind)

function PathHeader({ crumbs, kind, title, scope, busy, children }: {
  crumbs: Crumb[]
  kind?: string
  title: string
  scope?: string
  busy: boolean
  children?: ReactNode
}) {
  const onBack = useContext(BackContext)
  return (
    <header className="head">
      <div className="head-row">
        <Breadcrumb aria-label="経路" className="crumbs">
          <BreadcrumbList className="crumb-list">
            {onBack && (
              <BreadcrumbItem className="crumb-back-item">
                <Button variant="link" className="crumb crumb-back" disabled={busy} onClick={onBack}><ArrowLeft aria-hidden="true" />戻る</Button>
              </BreadcrumbItem>
            )}
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
        <OriginButton node={node} origin={origin} bridge={bridge} showPdf={showPdf} />
      </PathHeader>
      {axes.map(([axis, rows]) => (
        <section key={axis} className="group" aria-label={`${rows[0]!.is_subject ? rows[0]!.node_kind : axis}ごとの内訳`}>
          {/* 節と事業など軸が混ざると同じ一覧に見えるので、軸が2つ以上のときだけ見出しを置く */}
          {axes.length > 1 && <div className="group-head"><h3>{rows[0]!.is_subject ? rows[0]!.node_kind : axis}ごとの内訳</h3></div>}
          <BarList label={`${node.name}の${axis}ごとの内訳`} share={shareable(rows, data.next_page_token)} busy={busy}
            bars={rows.map((n) => ({
              key: n.node_id, label: n.name, kind: kindOf(n), amount: n.amount_yen,
              onSelect: () => void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'drill', n),
            }))} />
        </section>
      ))}
    </>
  )
}

/** 兄弟の一覧の名前（BarList の aria-label） */
function nodesTitle(rows: TreeNode[]) {
  const first = rows[0]
  if (!first || !siblings(rows)) return `${rows.length}件の明細`
  return [first.account_name, ...ancestorsOf(first).map((a) => a.name)].join(' › ')
}

/**
 * 検索結果の行を、行ごとに違う値だけで名付ける。全行で同じ値（団体・年度・資料・会計・科目・名前）は見出しにまとめる。
 * 例: 民生費を団体・年度で比べる結果は、見出しが「【款】民生費」、行が「比較市 · 2024年度」になる。
 */
function describeRows(rows: TreeNode[], names: Names) {
  const all = <T,>(f: (n: TreeNode) => T) => rows.every((n) => f(n) === f(rows[0]!))
  const first = rows[0]!
  const same = {
    jurisdiction: all((n) => n.jurisdiction_code), year: all((n) => n.fiscal_year),
    document: all((n) => n.document_kind), account: all((n) => n.account_name),
    kan: all((n) => n.kan_name), kou: all((n) => n.kou_name), name: all((n) => `${kindOf(n)}:${n.name}`),
  }
  const scopeParts = (n: TreeNode, common: boolean) => [
    same.jurisdiction === common && (names[n.jurisdiction_code] ?? n.jurisdiction_code),
    same.year === common && `${n.fiscal_year}年度`,
    same.document === common && (KIND_LABEL[n.document_kind] ?? n.document_kind),
  ].filter((v): v is string => !!v)
  const pathParts = (n: TreeNode, common: boolean) => ancestorsOf(n)
    .filter((a) => (a.kind === '款' ? same.kan : same.kou) === common).map((a) => a.name)
  return {
    scope: [same.jurisdiction && (names[first.jurisdiction_code] ?? first.jurisdiction_code),
      [same.year && `${first.fiscal_year}年度`, same.document && (KIND_LABEL[first.document_kind] ?? first.document_kind)].filter(Boolean).join(' ')]
      .filter(Boolean).join(' · ') || undefined,
    commonLevels: same.account
      ? (n: TreeNode) => ancestorsOf(n).filter((a) => (a.kind === '款' ? same.kan : same.kou))
      : undefined,
    title: same.name ? first.name : undefined,
    kind: same.name ? kindOf(first) : undefined,
    oneScope: same.jurisdiction && same.year && same.document,
    byYear: !same.year && same.jurisdiction && same.document && same.account && same.name,
    groupLabel: (n: TreeNode) => [...scopeParts(n, false), ...(same.account ? [] : [n.account_name])].join(' · '),
    label: (n: TreeNode) => same.name
      ? [...scopeParts(n, false), ...(same.account ? [] : [n.account_name])].join(' · ')
      : n.name,
    note: (n: TreeNode) => [
      ...pathParts(n, false),
      ...(same.name ? [] : scopeParts(n, false)),
      ...(same.account || same.name ? [] : [n.account_name]),
    ].join(' · ') || undefined,
  }
}

function NodesResult({ rows, next, history, names, bridge, busy, failed, fold }: {
  rows: TreeNode[]
  fold: number
  failed: boolean
  history: { data: ViewData }[]
  next?: string | null
  names: Names
  bridge: Bridge
  busy: boolean
}) {
  if (!rows.length) return <p className="quiet">該当する歳出明細はありません。</p>
  const drill = (n: TreeNode) => () => void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'drill', n)
  // 明細の画面に置き換わるまでの間、同じ見出しを出しておく
  if (autoOpens(rows, next)) {
    const n = rows[0]!
    return (
      <PathHeader crumbs={crumbsOf(n, history, bridge)} kind={kindOf(n)} title={n.name} scope={headScopeOf(n, names)} busy={busy}>
        <span className="total-short" title={yen(n.amount_yen)}>{shortYen(n.amount_yen)}</span>
        {failed && !busy && <Button variant="link" className="bar-more" onClick={drill(n)}>再読み込み</Button>}
      </PathHeader>
    )
  }
  const sibling = siblings(rows)
  const share = shareable(rows, next)
  const total = share ? rows.reduce((sum, n) => sum + (n.amount_yen ?? 0), 0) : undefined
  if (sibling) {
    const title = nodesTitle(rows)
    // 款の一覧は会計そのもの、項・目の一覧は親の科目の内訳として、親を今の画面に、その上を経路にする
    const first = rows[0]!
    const parent = ancestorsOf(first).at(-1)
    return (
      <>
        <PathHeader crumbs={parent ? crumbsOf(first, history, bridge, (n) => ancestorsOf(n).slice(0, -1)) : []}
          kind={parent?.kind} title={parent?.name ?? first.account_name} scope={headScopeOf(first, names)} busy={busy}>
          {total !== undefined && <span className="total-short" title={yen(total)}>{shortYen(total)}</span>}
        </PathHeader>
        <BarList label={title} share={share} busy={busy} fold={fold}
          bars={rows.map((n) => ({ key: `${n.document_kind}-${n.node_id}`, label: n.name, kind: kindOf(n), amount: n.amount_yen, onSelect: drill(n) }))} />
      </>
    )
  }
  const groups = groupByScope(rows)
  if (groups) {
    // 団体・年度ごとの兄弟の一覧を、それぞれ一つの画面と同じ形（合計・割合）で縦に並べる。
    // 款の名前は団体ごとに違うので、行を混ぜて金額順に並べると比べられない
    const d = describeRows(rows, names)
    const first = rows[0]!
    const parent = ancestorsOf(first).at(-1)
    const sameParent = rows.every((n) => ancestorsOf(n).at(-1)?.name === parent?.name)
    const title = sameParent && parent ? parent.name : first.account_name
    return (
      <>
        <PathHeader crumbs={[]} kind={sameParent ? parent?.kind : undefined} title={title}
          scope={[d.scope, sameParent && parent ? first.account_name : undefined].filter(Boolean).join(' · ')} busy={busy} />
        {groups.map((group) => {
          const g = group[0]!
          const label = d.groupLabel(g)
          const gShare = shareable(group, next)
          const gTotal = group.reduce((sum, n) => sum + (n.amount_yen ?? 0), 0)
          return (
            <section className="group" key={`${g.jurisdiction_code}-${g.fiscal_year}-${g.document_kind}-${g.account_name}`} aria-label={label}>
              <div className="group-head">
                <h3>{label}</h3>
                {gShare && <span className="group-total" title={yen(gTotal)}>{shortYen(gTotal)}</span>}
              </div>
              <BarList label={label} share={gShare} busy={busy} fold={Math.min(5, fold)}
                bars={group.map((n) => ({ key: `${n.document_kind}-${n.node_id}`, label: n.name, kind: kindOf(n), amount: n.amount_yen, onSelect: drill(n) }))} />
            </section>
          )
        })}
      </>
    )
  }
  const d = describeRows(rows, names)
  const title = d.title ?? `${rows.length}件の明細`
  const ordered = d.byYear ? [...rows].sort((a, b) => a.fiscal_year - b.fiscal_year) : rows
  return (
    <>
      {/* 団体・年度・資料が混ざると、段を押して移る先を一つに決められないのでパンくずを置かない */}
      <PathHeader crumbs={d.commonLevels && d.oneScope ? crumbsOf(rows[0]!, history, bridge, d.commonLevels) : []} kind={d.kind} title={title}
        scope={[d.scope, !d.oneScope && d.commonLevels ? rows[0]!.account_name : undefined].filter(Boolean).join(' · ') || undefined} busy={busy} />
      <BarList label={title} share={false} busy={busy} keepOrder={d.byYear} fold={fold}
        bars={ordered.map((n) => ({
          key: `${n.document_kind}-${n.node_id}`,
          label: d.label(n),
          kind: d.title ? undefined : kindOf(n),
          note: d.note(n),
          amount: n.amount_yen,
          onSelect: drill(n),
        }))} />
    </>
  )
}

function JurisdictionsResult({ list, bridge, busy, fold }: { list: Jurisdiction[]; bridge: Bridge; busy: boolean; fold: number }) {
  const [limit, setLimit] = useState(fold)
  if (!list.length) return <p className="quiet">団体はありません。</p>
  // 絞らずに引くと収録の無い団体が大半になるので、収録のある団体を先に置き、最初は FOLD 件だけ出す
  const ordered = [...list.filter((j) => j.coverage.length), ...list.filter((j) => !j.coverage.length)]
  const hidden = ordered.length - Math.min(limit, ordered.length)
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
        {ordered.slice(0, limit).map((j) => (
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
                      <Button variant="link" key={c.document_kind} className="chip" disabled={busy || !account}
                        aria-label={`${j.name} ${y}年度 ${label}の${account?.account_name ?? ''}をチャットで聞く`}
                        onClick={() => account && bridge.ask(`${j.name}（団体コード ${j.jurisdiction_code}）の${y}年度 ${label}・${account.account_name}の歳出を款ごとに見せて`)}>
                        {label}
                      </Button>
                    )
                  })}
                </span>
              )
            })}
            {!years.length && <span role="cell" className="quiet">収録なし</span>}
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <Button variant="link" className="bar-more" onClick={() => setLimit(limit + fold)}>もっと見る（残り{hidden}団体）</Button>
      )}
    </>
  )
}

function View({ bridge }: { bridge: Bridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
  const [pdf, setPdf] = useState<PdfSelection>()
  const entry = state.entry
  // 最初の結果は AI 自身が受け取っているので、利用者が画面で動かしたあとだけ伝える
  const moved = useRef(false)
  // 利用者が「全画面で開く」を押したか。PDF や明細の切り替えで勝手にインラインへ戻さない
  const manualFullscreen = useRef(false)
  const inline = state.fullscreen.available && !state.fullscreen.active
  const fold = inline ? INLINE_FOLD : FOLD
  useEffect(() => {
    if (!state.fullscreen.active) manualFullscreen.current = false
  }, [state.fullscreen.active])
  useEffect(() => {
    if (entry && 'nodes' in entry.data && autoOpens(entry.data.nodes, entry.data.next_page_token)) {
      const n = entry.data.nodes[0]!
      void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'reset', n)
    }
    setPdf(undefined)
    if (!manualFullscreen.current) bridge.setFullscreen(false)
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
    if (!manualFullscreen.current) bridge.setFullscreen(false)
    // 文脈は最後の1件で上書きされるので、PDF を閉じたら明細を見ている状態に戻す
    if (entry) bridge.tellModel(describe(entry.data, state.names))
    queueMicrotask(() => { if (trigger?.isConnected) trigger.focus() })
  }
  const toggleFullscreen = () => {
    manualFullscreen.current = inline
    bridge.setFullscreen(inline)
  }
  const previous = state.history.at(-1)
  const backToList = previous && 'nodes' in previous.data && !oneScope(previous.data.nodes)
    ? () => bridge.backTo(state.history.length - 1) : undefined
  if (pdf)
    return (
      <main className="view" data-fullscreen={state.fullscreen.active || undefined}>
        <PdfViewer selection={pdf} apiOrigin={state.apiOrigin} onClose={closePdf} openLink={bridge.openLink} />
      </main>
    )
  return (
    <BackContext.Provider value={backToList}>
    <main aria-busy={state.busy} className="view" data-fullscreen={state.fullscreen.active || undefined}>
      {state.fullscreen.available && entry && !state.pending && (
        <Button variant="outline" size="sm" className="expand" onClick={toggleFullscreen}>
          {inline ? '全画面で開く' : '元の大きさに戻す'}
        </Button>
      )}
      {state.pending ? (
        <div className="result">
          <PathHeader crumbs={crumbsOf(state.pending, entry ? [...state.history, entry] : state.history, bridge)}
            kind={kindOf(state.pending)} title={state.pending.name} scope={headScopeOf(state.pending, state.names)} busy>
            <span className="total-short" title={yen(state.pending.amount_yen)}>{shortYen(state.pending.amount_yen)}</span>
          </PathHeader>
          <div role="status" className="loading">
            <span className="sr-only">読み込み中</span>
            {[0, 1, 2].map((i) => <Fragment key={i}><Skeleton className="h-4 w-1/3" /><Skeleton className="h-1.5 w-full" /></Fragment>)}
          </div>
        </div>
      ) : entry && (
        <div key={entry.revision} className="result">
          {'jurisdictions' in entry.data ? <JurisdictionsResult list={entry.data.jurisdictions} bridge={bridge} busy={state.busy} fold={fold} />
            : 'nodes' in entry.data ? <NodesResult rows={entry.data.nodes} next={entry.data.next_page_token} history={state.history} names={state.names} bridge={bridge} busy={state.busy} failed={!!state.error} fold={fold} />
            : <NodeResult data={entry.data} crumbs={crumbsOf(entry.data.node, state.history, bridge)} names={state.names} bridge={bridge} showPdf={showPdf} busy={state.busy} />}
        </div>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>取得できませんでした</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.busy && !state.pending && (
        <div role="status" className="loading">
          <span className="sr-only">読み込み中</span>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      )}
      {typeof entry?.data.next_page_token === 'string' && !state.pending && (
        <Button variant="link" className="bar-more" disabled={state.busy}
          onClick={() => void bridge.call(entry.tool, { ...entry.args, page_token: entry.data.next_page_token }, 'append')}>
          続き
        </Button>
      )}
    </main>
    </BackContext.Provider>
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
