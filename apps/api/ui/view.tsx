import {
  StrictMode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createRoot } from 'react-dom/client'
import { createBridge, type Bridge } from './bridge'
import { ExpenditureCharts, chartGroups } from './expenditure-charts'
import { PdfViewer, type PdfSelection } from './pdf-view'
import {
  KIND_LABEL,
  nodePath,
  yen,
  type Origin,
  type TreeNode,
  type Jurisdiction,
  type ViewData,
} from './types'
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@fudoki/ui/components/table'
import { Button } from '@fudoki/ui/components/button'
import { Input } from '@fudoki/ui/components/input'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@fudoki/ui/components/empty'
import { Alert, AlertTitle, AlertDescription } from '@fudoki/ui/components/alert'
import { Skeleton } from '@fudoki/ui/components/skeleton'
import { Field, FieldGroup, FieldLabel } from '@fudoki/ui/components/field'
import { Separator } from '@fudoki/ui/components/separator'

function EmptyResult({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  )
}
function OriginLink({
  origin,
  bridge,
  label = origin.title,
}: {
  origin: Origin
  bridge: Bridge
  label?: string
}) {
  return (
    <a
      className="origin"
      href={origin.url}
      title={origin.title}
      onClick={(e) => {
        e.preventDefault()
        bridge.openLink(origin.url)
      }}
    >
      {label}
    </a>
  )
}
function Located({
  origin,
  page,
  prefix,
  node,
  bridge,
  showPdf,
}: {
  origin?: Origin
  page: number | null
  prefix: string
  node: TreeNode
  bridge: Bridge
  showPdf: (selection: PdfSelection) => void
}) {
  if (!origin) return null
  const pdf = origin.format === 'pdf'
  const known = typeof page === 'number' && Number.isInteger(page) && page > 0
  const where = known ? (pdf ? `${page}ページ` : `${page}行目`) : ''
  return (
    <span className="loc">
      {pdf && known ? (
        <Button
          variant="link"
          size="sm"
          aria-label={`${prefix}の原典を表示: ${node.name}`}
          onClick={(event) =>
            showPdf({
              origin,
              location: node,
              selectedPage: page,
              trigger: event.currentTarget,
            })
          }
        >
          {node.amount_source_page !== node.source_page && `${prefix} `}
          {where}
        </Button>
      ) : (
        <>
          <OriginLink origin={origin} bridge={bridge} label="原典" />
          {where && ` ${where}`}
        </>
      )}
    </span>
  )
}
function Jurisdictions({ list }: { list: Jurisdiction[] }) {
  const [query, setQuery] = useState('')
  const q = query.normalize('NFKC').trim()
  const matches = list.filter(
    (j) =>
      !q ||
      `${j.name} ${j.prefecture_name} ${j.jurisdiction_code}`
        .normalize('NFKC')
        .includes(q),
  )
  return (
    <>
      {list.length > 1 && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="jurisdiction-filter" className="sr-only">
              団体名・団体コードで絞る
            </FieldLabel>
            <Input
              id="jurisdiction-filter"
              type="search"
              placeholder="団体名・団体コードで絞る"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
        </FieldGroup>
      )}
      {q && (
        <p className="text-muted-foreground small count" role="status">
          {matches.length}団体
        </p>
      )}
      {matches.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>団体</TableHead>
              <TableHead>都道府県</TableHead>
              <TableHead>団体コード</TableHead>
              <TableHead>収録範囲</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((j) => (
              <TableRow key={j.jurisdiction_code}>
                <TableCell>{j.name}</TableCell>
                <TableCell>{j.prefecture_name}</TableCell>
                <TableCell className="mono">{j.jurisdiction_code}</TableCell>
                <TableCell>
                  {j.coverage.length ? (
                    <div className="flex flex-col gap-3">
                      {j.coverage.map((c) => (
                        <section
                          key={`${c.fiscal_year}-${c.document_kind}`}
                          className="flex flex-col gap-1"
                        >
                          <div>
                            {c.fiscal_year}年度{' '}
                            {KIND_LABEL[c.document_kind] ?? c.document_kind}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">収録なし</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyResult
          title={
            list.length
              ? '絞り込みに一致する団体はありません'
              : '団体はありません'
          }
          description={
            list.length ? '団体名または団体コードを変えてください。' : undefined
          }
        />
      )}
    </>
  )
}
function Scope({ node }: { node: TreeNode }) {
  return (
    <div className="text-muted-foreground small">
      {node.jurisdiction_code} ・ {node.fiscal_year}年度{' '}
      {KIND_LABEL[node.document_kind] ?? ''} ・ {node.account_name}
    </div>
  )
}
function NodeTable({
  rows,
  origins,
  withScope,
  nameHeading = '科目',
  showOrigins = true,
  bridge,
  showPdf,
  busy,
}: {
  rows: TreeNode[]
  origins: Map<string, Origin>
  withScope: boolean
  nameHeading?: string
  showOrigins?: boolean
  bridge: Bridge
  showPdf: (selection: PdfSelection) => void
  busy: boolean
}) {
  if (!rows.length) return null
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{nameHeading}</TableHead>
          <TableHead className="num">金額</TableHead>
          {showOrigins && <TableHead>原典</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((n) => (
          <TableRow key={`${n.document_kind}-${n.node_id}`}>
            <TableCell className="name">
              <Button
                variant="link"
                size="sm"
                aria-label={`内訳: ${n.name}`}
                disabled={busy}
                onClick={() => {
                  void bridge.call(
                    'get_expenditure_node',
                    { document_kind: n.document_kind, node_id: n.node_id },
                    'drill',
                  )
                }}
              >
                {withScope ? nodePath(n) : n.name}
              </Button>
              {withScope && <Scope node={n} />}
            </TableCell>
            <TableCell className="num">{yen(n.amount_yen)}</TableCell>
            {showOrigins && <TableCell className="locs">
              <Located
                origin={origins.get(n.origin_id)}
                page={n.source_page}
                prefix="項目"
                node={n}
                bridge={bridge}
                showPdf={showPdf}
              />
              {n.amount_yen !== null &&
                n.amount_source_page !== null &&
                n.amount_source_page !== n.source_page && (
                  <>
                    <br />
                    <Located
                      origin={origins.get(n.origin_id)}
                      page={n.amount_source_page}
                      prefix="金額"
                      node={n}
                      bridge={bridge}
                      showPdf={showPdf}
                    />
                  </>
                )}
            </TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
function Result({
  data,
  bridge,
  showPdf,
  busy,
}: {
  data: ViewData
  bridge: Bridge
  showPdf: (selection: PdfSelection) => void
  busy: boolean
}) {
  const origins = new Map((data.origins ?? []).map((o) => [o.origin_id, o]))
  const chartRows = new Set(chartGroups('nodes' in data ? data.nodes : 'node' in data ? Object.values(data.children).flat() : []).flatMap((g) => g.rows))
  if ('jurisdictions' in data)
    return <Jurisdictions list={data.jurisdictions} />
  if ('nodes' in data)
    return data.nodes.length ? (
      <>
      <ExpenditureCharts rows={data.nodes} partial={!!data.next_page_token} busy={busy}
        onSelect={(n) => { void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'drill') }} />
      <NodeTable
        rows={data.nodes.filter((n) => !chartRows.has(n))}
        showOrigins={false}
        origins={origins}
        withScope
        bridge={bridge}
        showPdf={showPdf}
        busy={busy}
      />
      </>
    ) : (
      <EmptyResult title="該当する歳出明細はありません" />
    )
  const node = data.node
  const origin = origins.get(node.origin_id)
  return (
    <>
      <div className="head flex flex-col gap-2">
        <Scope node={node} />
        <h3>
          {nodePath(node) || node.name}
        </h3>
        <div className="num big">{yen(node.amount_yen)}</div>
        <div>
          <Located
            origin={origin}
            page={node.source_page}
            prefix="項目"
            node={node}
            bridge={bridge}
            showPdf={showPdf}
          />
          {node.amount_source_page !== null &&
            node.amount_source_page !== node.source_page && (
              <>
                {' '}
                ・{' '}
                <Located
                  origin={origin}
                  page={node.amount_source_page}
                  prefix="金額"
                  node={node}
                  bridge={bridge}
                  showPdf={showPdf}
                />
              </>
            )}
        </div>
      </div>
      <ExpenditureCharts showScope={false} rows={Object.values(data.children).flat()} partial={!!data.next_page_token} busy={busy}
        onSelect={(n) => { void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'drill') }} />
      {Object.entries(data.children).map(([axis, rows]) => [axis, rows.filter((n) => !chartRows.has(n))] as const).filter(([, rows]) => rows.length).map(([axis, rows]) => (
        <section key={axis} className="flex flex-col gap-2">
          <NodeTable
            rows={rows}
            origins={origins}
            withScope={false}
            nameHeading={axis}
            bridge={bridge}
            showPdf={showPdf}
            busy={busy}
          />
        </section>
      ))}
      {!Object.values(data.children).some((rows) => rows.length) && (
        <EmptyResult title="内訳はありません" />
      )}
    </>
  )
}
function View({ bridge }: { bridge: Bridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
  const [pdf, setPdf] = useState<{ selection: PdfSelection; id: number }>()
  const pdfId = useRef(0)
  const showPdf = (selection: PdfSelection) =>
    setPdf({ selection, id: ++pdfId.current })
  useEffect(() => {
    setPdf(undefined)
  }, [state.entry?.revision])
  function closePdf() {
    const trigger = pdf?.selection.trigger
    setPdf(undefined)
    queueMicrotask(() => {
      if (trigger?.isConnected) trigger.focus()
    })
  }
  return (
    <main aria-busy={state.busy} className="flex min-w-0 flex-col gap-3">
      {pdf && (
        <>
          <PdfViewer
            key={pdf.id}
            selection={pdf.selection}
            apiOrigin={state.apiOrigin}
            onClose={closePdf}
            openLink={bridge.openLink}
          />
          <Separator />
        </>
      )}
      {state.history.length > 0 && (
        <div>
          <Button variant="link" size="sm" onClick={bridge.back}>
            ← 戻る
          </Button>
        </div>
      )}
      <div className="expenditure-browser" data-history={state.history.length > 0 || undefined}>
          {state.history.map((entry, index) => {
            const rows = 'nodes' in entry.data ? entry.data.nodes : 'node' in entry.data ? Object.values(entry.data.children).flat() : []
            const next = state.history[index + 1] ?? state.entry
            const selectedId = next && 'node' in next.data ? next.data.node.node_id : undefined
            return <ExpenditureCharts showScope={false} key={entry.revision} rows={rows}
              partial={!!entry.data.next_page_token} busy={state.busy} selectedId={selectedId}
              onSelect={(n) => { void bridge.call('get_expenditure_node', { document_kind: n.document_kind, node_id: n.node_id }, 'drill', index) }} />
          })}
      {state.entry && (
        <div className="flex min-w-0 flex-col gap-3"><Result
          key={state.entry.revision}
          data={state.entry.data}
          bridge={bridge}
          showPdf={showPdf}
          busy={state.busy}
        /></div>
      )}
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>取得できませんでした</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.busy && (
        <div role="status" className="flex flex-col gap-2">
          <span>読み込み中…</span>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}
      {typeof state.entry?.data.next_page_token === 'string' && (
        <div className="pager">
          <Button
            variant="outline"
            disabled={state.busy}
            onClick={() => {
              const entry = state.entry!
              void bridge.call(
                entry.tool,
                { ...entry.args, page_token: entry.data.next_page_token },
                'append',
              )
            }}
          >
            さらに表示
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
