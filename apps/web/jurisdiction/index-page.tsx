// 自治体一覧（/jurisdictions）の本文。Void の頁（pages/jurisdictions.tsx）としてサーバーが HTML にし（検索エンジン・JavaScript が無い環境でも全自治体のリンクと金額が載る）、
// 画面では同じデータで hydrate して、地図の切り替えと表の絞り込み・並べ替え（サーバーで30件ずつ）を動かす。個別ページへは Void の Link で頁を読み直さずに移る
import * as React from 'react'
import { flushSync } from 'react-dom'
import { Link, useRouter } from '@void/react'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button, buttonVariants } from '@/components/ui/button'
import { Hint } from '@/components/hint'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ArrowDownIcon, ArrowsDownUpIcon, ArrowUpIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { JAPAN_TILES } from './japan-tiles'
import { PREFECTURE_MAPS } from './map.generated'
import { DEFAULT_INDEX_QUERY, indexQueryString, type IndexQuery, type IndexSort, type IndexTable, type MapEntry } from './index-table'
import { formatAsOf, formatPeople, formatPerCapita, formatYen, reiwa, type IndexEntry, type JurisdictionKind } from './types'

const KINDS: JurisdictionKind[] = ['都道府県', '区', '市', '町村']

/** 塗りの濃さ。面積で見比べるので、金額の平方根に比例させる（最小でも地の色と区別できる濃さを残す） */
const shade = (yen: number, max: number) => `color-mix(in srgb, var(--primary) ${Math.round(22 + 78 * Math.sqrt(yen / max))}%, var(--background))`

const Chip = ({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={cn(buttonVariants({ variant: on ? 'default' : 'outline' }), 'rounded-full px-3.5 text-[13px] font-normal', !on && 'text-muted-foreground')}>
    {children}
  </button>
)

/** 令和の年度は R7 のように短く書く（2019年より前は西暦のまま） */
const shortYear = (y: number) => (y >= 2019 ? `R${y - 2018}` : String(y))

/** 比較表の列。見出しを押すとその列で並べ替える（並べ替えはサーバーで行う。数値の列は大きい順から、値の無い自治体はどちらの向きでも末尾） */
const columns: ColumnDef<IndexEntry>[] = [
  {
    id: 'name',
    header: '自治体',
    // 自治体コードの順（都道府県ごとにまとまる）
    accessorFn: (e) => e.code,
    sortDescFirst: false,
    cell: ({ row: { original: e } }) => (
      <Link href={e.path} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring/40">
        <span className="text-[16px]">{e.name}</span>
        <small className="ml-2 text-[11px] text-muted-foreground">{e.prefecture}</small>
      </Link>
    ),
  },
  {
    id: 'population',
    header: '人口',
    accessorFn: (e) => e.population?.people,
    sortDescFirst: true,
    meta: { numeric: true },
    cell: ({ row: { original: e } }) =>
      e.population ? (
        <Hint label={`住民基本台帳人口（${formatAsOf(e.population.asOf)}時点）`}>
          <span className="relative z-10">{formatPeople(e.population.people)}</span>
        </Hint>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: 'perCapita',
    header: '1人あたりの歳出',
    accessorFn: (e) => e.perCapita ?? undefined,
    sortDescFirst: true,
    meta: { numeric: true },
    cell: ({ row: { original: e } }) => (e.perCapita === null ? <span className="text-muted-foreground">人口が無く出せません</span> : formatPerCapita(e.perCapita)),
  },
  {
    id: 'yen',
    header: '歳出の総額',
    accessorFn: (e) => e.yen,
    sortDescFirst: true,
    meta: { numeric: true },
    cell: ({ row: { original: e } }) => (
      <span>
        {formatYen(e.yen)}
        <Hint label={reiwa(e.year)}>
          <small className="relative z-10 ml-2 text-[11px] text-muted-foreground">{shortYear(e.year)}</small>
        </Hint>
      </span>
    ),
  },
]

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    numeric?: boolean
  }
}

type PrefectureMap = (typeof PREFECTURE_MAPS)[number]
const MAPS = new Map<string, PrefectureMap>(PREFECTURE_MAPS.map((m) => [m.code, m]))
const prefOf = (e: MapEntry) => e.code.slice(0, 2)

/** 図に並べた自治体のコード（本土と島しょ） */
const mapCodes = (map: PrefectureMap | undefined) => new Set<string>(map ? [...map.tiles, ...map.islands].map((t) => t.code) : [])
/** タイルに書く短い名前。種別（区・市・町・村）は落とし、1文字になるときだけ残す（港区・北区） */
const tileName = (name: string) => (name.length > 2 ? name.replace(/[区市町村]$/, '') : name)

type TileProps = { code: string; name: string; e: MapEntry | undefined; max: number; style?: React.CSSProperties }
/** 収録した自治体のタイルは個別ページへのリンク */
function MunicipalityTile({ code, name, e, max, style }: TileProps) {
  const label = <span className="line-clamp-2 break-all px-0.5 text-center text-[10px] leading-tight sm:text-[11px]">{tileName(name)}</span>
  if (!e)
    return (
      <Hint key={code} label={`${name}（未収録）`}>
        <div style={style} className="flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground/70">
          {label}
        </div>
      </Hint>
    )
  return (
    <Hint label={name}>
    <Link
      href={e.path}
      aria-label={`${name} ${formatYen(e.yen)}`}
      style={{ ...style, background: shade(e.yen, max) }}
      className={cn(
        'flex aspect-square items-center justify-center rounded-md transition hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        Math.sqrt(e.yen / max) > 0.5 ? 'text-primary-foreground' : 'text-foreground',
      )}
    >
      {label}
    </Link>
    </Hint>
  )
}

/** 都道府県の市区町村のタイル図。各自治体を同じ大きさの四角で、おおよその位置に並べ、歳出の総額で塗る。島しょは下の段に北から並べる */
function PrefectureTiles({ map, entries }: { map: PrefectureMap; entries: MapEntry[] }) {
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const max = Math.max(...entries.map((e) => e.yen), 1)
  const columns = { gridTemplateColumns: `repeat(${map.cols}, minmax(0, 1fr))` }
  const props = { max }
  // 横にスクロールする幅のときは、歳出の総額で重みを付けた収録自治体の重心が真ん中に来るところから見せる（東京都なら区部）
  const scroller = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = scroller.current
    const recorded = map.tiles.filter((t) => byCode.has(t.code))
    if (!el || el.scrollWidth <= el.clientWidth || !recorded.length) return
    const yen = (code: string) => byCode.get(code)?.yen ?? 0
    const col = recorded.reduce((a, t) => a + (t.col + 0.5) * yen(t.code), 0) / Math.max(recorded.reduce((a, t) => a + yen(t.code), 0), 1)
    el.scrollLeft = (col / map.cols) * el.scrollWidth - el.clientWidth / 2
  }, [map.code])
  // 本土と島しょで同じマスの大きさ（狭い画面でも名前が読める 40px 以上）にする
  const width = { maxWidth: map.cols * 56, minWidth: map.cols * 40 }
  return (
    // 日本のタイルと同じ view-transition-name を付け、切り替えでタイルがこの図へ拡大する（戻るときは縮む）
    <div className="w-full min-w-0" style={{ viewTransitionName: `pref-${map.code}` }}>
      {/* 狭い画面では横にスクロールさせる。島しょは区部へ寄せたスクロールに巻き込まれないよう、別の段にする */}
      <div ref={scroller} className="overflow-x-auto p-1">
        <div className="mx-auto grid gap-1" style={{ ...columns, ...width }} role="group" aria-label={`${map.name}の市区町村のタイル図。収録している自治体を歳出の総額の濃さで塗っている`}>
          {map.tiles.map((t) => (
            <MunicipalityTile key={t.code} {...t} e={byCode.get(t.code)} style={{ gridColumn: t.col + 1, gridRow: t.row + 1 }} {...props} />
          ))}
        </div>
      </div>
      {map.islands.length ? (
        <div className="mt-2 border-t pt-3">
          <div className="mx-auto mb-1.5 px-1 text-[11px] text-muted-foreground" style={{ maxWidth: width.maxWidth }}>島しょ</div>
          {/* 島は数が少ないので、スクロールさせずに折り返す。マスの幅は本土と同じにする */}
          <div className="mx-auto flex flex-wrap gap-1 p-1" style={{ maxWidth: width.maxWidth }} role="group" aria-label={`${map.name}の島しょの自治体`}>
            {map.islands.map((t) => (
              <MunicipalityTile key={t.code} {...t} e={byCode.get(t.code)} style={{ width: `max(40px, calc((100% - ${(map.cols - 1) * 4}px) / ${map.cols}))` }} {...props} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** 全国のタイル地図。収録した市区町村の数で塗り、収録のある都道府県を選ぶとその地図へ進む */
function JapanTiles({ counts, onOpen }: { counts: Map<string, number>; onOpen: (pref: string) => void }) {
  const max = Math.max(...counts.values(), 1)
  return (
    <div className="mx-auto grid w-full max-w-[560px] grid-cols-12 gap-1" role="group" aria-label="都道府県のタイル地図。収録した市区町村の数で塗っている">
      {JAPAN_TILES.map((t) => {
        const n = counts.get(t.code) ?? 0
        const style = { gridColumn: t.col + 1, gridRow: t.row + 1 }
        const label = <span className="text-[10px] leading-none sm:text-[11px]">{t.name}</span>
        return n ? (
          <button
            key={t.code}
            type="button"
            onClick={() => onOpen(t.code)}
            style={{ ...style, background: shade(n, max), viewTransitionName: `pref-${t.code}` }}
            aria-label={`${t.name} ${n} の自治体`}
            className={cn('flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md transition hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none', Math.sqrt(n / max) > 0.5 ? 'text-primary-foreground' : 'text-foreground')}
          >
            {label}
            <span className="text-[10px] tabular-nums opacity-80">{n}</span>
          </button>
        ) : (
          <div key={t.code} style={style} className="flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground/70">
            {label}
          </div>
        )
      })}
    </div>
  )
}

/** タイルの短い名前（東京・大阪）に都・府・県を付ける */
const prefName = (n: string) => (n === '北海道' ? n : n === '東京' ? '東京都' : n === '大阪' || n === '京都' ? `${n}府` : `${n}県`)
const slugOf = (e: MapEntry) => e.path.split('/').pop() ?? ''
/** 名前・都道府県名・ローマ字の slug のどれかに当たるか */
const matches = (e: MapEntry, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || e.name.includes(q) || e.prefecture.includes(q) || slugOf(e).includes(q)
}

/** タグの候補の先頭に置く「すべての〇〇」の値 */
const ALL = '__all__'

/** 表の種類のタグ。押すとその種類の候補を選べる combobox が開き、複数選べる。先頭の「すべての〇〇」で選べる候補を一度に選ぶ・外す */
function TagFilter({ label, count, options, picked, onChange }: { label: string; count: number; options: { value: string; label: string; sub?: string; disabled?: boolean }[]; picked: string[]; onChange: (v: string[]) => void }) {
  const byValue = new Map(options.map((o) => [o.value, o]))
  const selectable = options.filter((o) => !o.disabled).map((o) => o.value)
  const all = selectable.length > 0 && selectable.every((v) => picked.includes(v))
  const change = (next: string[]) => {
    if (next.includes(ALL) && !all) return onChange(selectable)
    if (!next.includes(ALL) && all) return onChange([])
    onChange(next.filter((v) => v !== ALL))
  }
  const summary = all ? 'すべて' : picked.length ? `${picked.length} 件を選択` : null
  return (
    <Combobox multiple items={[ALL, ...options.map((o) => o.value)]} value={all ? [ALL, ...picked] : picked} onValueChange={(v) => change(v as string[])} itemToStringLabel={(v: string) => (v === ALL ? `すべての${label}` : (byValue.get(v)?.label ?? v))}>
      <ComboboxTrigger
        render={<button type="button" aria-label={`${label}で絞る${summary ? `（${summary}）` : ''}`} />}
        className={cn(buttonVariants({ variant: picked.length ? 'default' : 'outline' }), 'gap-1 rounded-full px-3.5 text-[13px] font-normal [&_svg]:text-current', !picked.length && 'text-muted-foreground')}
      >
        {label} <small className="opacity-70">{summary ?? count}</small>
      </ComboboxTrigger>
      <ComboboxContent className="w-64">
        <ComboboxInput showTrigger={false} placeholder={`${label}を探す`} aria-label={`${label}を探す`} className="has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15" />
        <ComboboxEmpty>当たる{label}はありません</ComboboxEmpty>
        <ComboboxList>
          {(v: string) => {
            if (v === ALL)
              return (
                <ComboboxItem key={v} value={v} className="border-b pb-1.5 mb-1 rounded-b-none">
                  すべての{label}
                  <small className="text-[11px] text-muted-foreground">{selectable.length}</small>
                </ComboboxItem>
              )
            const o = byValue.get(v)!
            return (
              <ComboboxItem key={v} value={v} disabled={o.disabled}>
                {o.label}
                {o.sub ? <small className="text-[11px] text-muted-foreground">{o.sub}</small> : null}
              </ComboboxItem>
            )
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/**
 * 比較表のデータ。最初の1頁は頁に載せてあり（既定の並び・絞り込み無し）、条件が変わったら取り直し、続きは末尾に足す。
 * 取り直している間は前の行を薄く残す
 */
function useIndexTable(initial: IndexTable, key: string, initialKey: string) {
  const [state, setState] = React.useState({ key: initialKey, table: initial })
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState<{ key: string; offset: number } | null>(null)
  const request = React.useRef<AbortController | null>(null)
  const load = React.useCallback(async (k: string, offset: number) => {
    request.current?.abort()
    const ac = new AbortController()
    request.current = ac
    setLoading(true)
    setFailed(null)
    try {
      const res = await fetch(`/api/jurisdictions/table?${k}${offset ? `&offset=${offset}` : ''}`, { signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const t = (await res.json()) as IndexTable
      setState((s) => ({ key: k, table: offset && s.key === k ? { ...t, rows: [...s.table.rows, ...t.rows] } : t }))
    } catch {
      if (!ac.signal.aborted) setFailed({ key: k, offset })
    } finally {
      if (request.current === ac) {
        request.current = null
        setLoading(false)
      }
    }
  }, [])
  React.useEffect(() => {
    if (key !== state.key) return void load(key, 0)
    // 取り直しの途中で表示中の条件へ戻したときは、その取り直しを捨てる（遅れて届いた行で表が入れ替わらないように）
    request.current?.abort()
    request.current = null
    setLoading(false)
    setFailed(null)
  }, [key])
  const stale = state.key !== key
  return {
    table: state.table,
    stale,
    loading,
    failed: failed !== null,
    more: () => !loading && !stale && !failed && state.table.next !== null && void load(key, state.table.next),
    retry: () => failed && void load(failed.key, failed.offset),
  }
}

/** 表の末尾。画面に近づいたら続きを読み込む（スクロールしない環境のためにボタンも置く） */
function LoadMore({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const latest = React.useRef(onVisible)
  React.useEffect(() => {
    latest.current = onVisible
  })
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && latest.current(), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className="flex justify-center py-6">
      <button type="button" onClick={() => latest.current()} disabled={loading} className={cn(buttonVariants({ variant: 'outline' }), 'rounded-full px-4 text-[13px] font-normal text-muted-foreground')}>
        {loading ? '読み込んでいます…' : '続きを読み込む'}
      </button>
    </div>
  )
}

export function IndexPage({ map: entries, initial }: { map: MapEntry[]; initial: IndexTable }) {
  const byYen = React.useMemo(() => [...entries].sort((a, b) => b.yen - a.yen), [entries])
  // 都道府県自体は市区町村と面が重なるので、地図にもチップにも出さず表の行だけにする
  const municipalities = entries.filter((e) => e.kind !== '都道府県')
  const counts = new Map<string, number>()
  for (const e of municipalities) counts.set(prefOf(e), (counts.get(prefOf(e)) ?? 0) + 1)
  // 最初は収録した市区町村がいちばん多い都道府県の地図を開く
  const [view, setView] = React.useState<string | null>(() => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null)
  const inView = municipalities.filter((e) => view !== null && prefOf(e) === view)
  const map = view ? MAPS.get(view) : undefined
  const shapeCodes = mapCodes(map)
  const offMap = map ? inView.filter((e) => !shapeCodes.has(e.code)) : []
  const viewName = view ? (map?.name ?? inView[0]?.prefecture ?? '') : '日本'
  // 日本⇄都道府県の切り替えは View Transition で拡大・縮小して見せる（未対応のブラウザと、動きを減らす設定ではそのまま切り替える）
  const transition = (update: () => void) => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof document === 'undefined' || !document.startViewTransition) return update()
    // 頁の間の移動では本文（.site-main）を薄く消して浮かせるが、図の切り替えでは本文を動かさない（styles/app.css の data-map-transition）
    const root = document.documentElement
    root.dataset.mapTransition = ''
    document.startViewTransition(() => flushSync(update)).finished.finally(() => delete root.dataset.mapTransition)
  }
  const open = (pref: string) => transition(() => setView(pref))
  // 地図の検索で選んだ市区町村は個別ページへ進む。都道府県ならその図を開く
  const router = useRouter()
  const find = (e: MapEntry) => (e.kind === '都道府県' ? open(prefOf(e)) : router.visit(e.path))
  // 表の絞り込み。種類ごとに選んだ値（都道府県はコードの先頭2桁、市区町村は自治体コード）
  const [picked, setPicked] = React.useState<Record<JurisdictionKind, string[]>>({ 都道府県: [], 区: [], 市: [], 町村: [] })
  const prefPicks = picked['都道府県']
  const namePicks = [...picked['区'], ...picked['市'], ...picked['町村']]
  const filtered = prefPicks.length + namePicks.length > 0
  const [sorting, setSorting] = React.useState<SortingState>([{ id: DEFAULT_INDEX_QUERY.sort, desc: DEFAULT_INDEX_QUERY.desc }])
  // 表は30件ずつサーバーから取る。並び・絞り込みが変わったら最初から取り直し、末尾が見えたら続きを足す
  const query: IndexQuery = { sort: (sorting[0]?.id ?? DEFAULT_INDEX_QUERY.sort) as IndexSort, desc: sorting[0]?.desc ?? true, offset: 0, prefs: prefPicks, codes: namePicks }
  const key = indexQueryString(query)
  const { table: page, stale, more, retry, loading, failed } = useIndexTable(initial, key, indexQueryString(DEFAULT_INDEX_QUERY))
  const table = useReactTable({ data: page.rows, columns, state: { sorting }, onSortingChange: setSorting, manualSorting: true, enableSortingRemoval: false, getCoreRowModel: getCoreRowModel(), getRowId: (e) => e.code })
  const rows = table.getRowModel().rows
  const prefCount = new Map<string, number>()
  for (const e of entries) prefCount.set(prefOf(e), (prefCount.get(prefOf(e)) ?? 0) + 1)
  const optionsOf = (k: JurisdictionKind) =>
    k === '都道府県'
      ? JAPAN_TILES.map((t) => t)
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((t) => ({ value: t.code, label: prefName(t.name), sub: prefCount.get(t.code) ? `${prefCount.get(t.code)}` : '未収録', disabled: !prefCount.get(t.code) }))
      : entries
          .filter((e) => e.kind === k)
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((e) => ({ value: e.code, label: e.name, sub: e.prefecture }))
  // 開いている都道府県自体（収録していれば）の頁へのリンクを図の上に出す
  const prefEntry = view === null ? undefined : entries.find((e) => e.kind === '都道府県' && prefOf(e) === view)

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-[clamp(2.2rem,1.6rem+2.4vw,3.4rem)] font-normal leading-tight">自治体を探す</h1>
      {entries.length ? (
        <Combobox autoHighlight items={byYen} filter={(e: MapEntry, q: string) => matches(e, q)} itemToStringLabel={(e: MapEntry) => e.name} value={null} onValueChange={(e) => e && find(e as MapEntry)}>
          <ComboboxInput showTrigger={false} aria-label="自治体名で探す" placeholder="自治体名で探す（例：品川、shinagawa）" className="mt-6 h-12 rounded-full bg-background px-2 text-[15px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
          </ComboboxInput>
          <ComboboxContent>
            <ComboboxEmpty>当たる自治体は、まだ収録していません</ComboboxEmpty>
            <ComboboxList>
              {(e: MapEntry) => (
                <ComboboxItem key={e.code} value={e}>
                  {e.name}
                  <small className="text-[11px] text-muted-foreground">{e.kind === '都道府県' ? '都道府県' : e.prefecture}</small>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : (
        <p className="mt-3 text-muted-foreground">まだ決算を収録した自治体がありません。</p>
      )}

      {/* 地図のタイルを押すと、その自治体の頁へ進む */}
      <section className="mt-6" aria-label="地図">
        <div className="flex min-w-0 flex-col rounded-[20px] bg-card p-4 sm:p-6">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <Breadcrumb>
              <BreadcrumbList className="text-lg">
                <BreadcrumbItem>{view ? <BreadcrumbLink render={<button type="button" onClick={() => transition(() => setView(null))} />}>日本</BreadcrumbLink> : <BreadcrumbPage>日本</BreadcrumbPage>}</BreadcrumbItem>
                {view ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{viewName}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </BreadcrumbList>
            </Breadcrumb>
            {prefEntry ? (
              <Button variant="link" size="inline" nativeButton={false} render={<Link href={prefEntry.path} />} className="text-[13px]">
                {prefEntry.name}を開く →
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{view ? '' : '収録のある都道府県を選ぶ'}</span>
            )}
          </div>
          <div className="flex flex-1 items-center">
            {view === null ? <JapanTiles counts={counts} onOpen={open} /> : map ? <PrefectureTiles map={map} entries={inView} /> : <p className="w-full py-16 text-center text-sm text-muted-foreground">{viewName}の地図はまだありません。下の一覧から選べます。</p>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span>{view ? '歳出の総額' : '収録した市区町村の数'}</span>
            <span>少</span>
            <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${shade(0, 1)}, var(--primary))` }} />
            <span>多</span>
            <span className="ml-2 inline-block size-3 rounded-sm bg-muted" />
            <span>未収録</span>
          </div>
          {view && offMap.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-xs text-muted-foreground">地図の外</span>
              {offMap.map((e) => (
                <Link key={e.code} href={e.path} className={cn(buttonVariants({ variant: 'outline' }), 'rounded-full px-3.5 text-[13px] font-normal')}>
                  {e.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-14" aria-label="比較表">
        <h2 className="text-2xl font-normal">比較表</h2>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip on={!filtered} onClick={() => setPicked({ 都道府県: [], 区: [], 市: [], 町村: [] })}>
            すべて <small className="opacity-70">{entries.length}</small>
          </Chip>
          {KINDS.map((k) => {
            // 都道府県のタグは都道府県の単位で絞るので、収録のある都道府県の数を出す
            const n = k === '都道府県' ? prefCount.size : entries.filter((e) => e.kind === k).length
            return n ? <TagFilter key={k} label={k} count={n} options={optionsOf(k)} picked={picked[k]} onChange={(v) => setPicked((p) => ({ ...p, [k]: v }))} /> : null
          })}
        </div>

        {/* 絞り込みで行が減っても頁の高さが急に縮まないよう、表の高さの下限を持たせる */}
        <div className="mt-5 min-h-[min(80vh,44rem)] border-t border-foreground">
          <Table className={cn('tabular-nums transition-opacity', stale && 'opacity-50')}>
            <TableHeader>
              {table.getHeaderGroups().map((g) => (
                <TableRow key={g.id} className="hover:bg-transparent">
                  {g.headers.map((h) => {
                    const dir = h.column.getIsSorted()
                    const Icon = dir === 'asc' ? ArrowUpIcon : dir === 'desc' ? ArrowDownIcon : ArrowsDownUpIcon
                    return (
                      <TableHead key={h.id} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'} className={cn('h-auto py-1.5 text-xs font-normal text-muted-foreground', h.column.columnDef.meta?.numeric && 'text-right')}>
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn('inline-flex items-center gap-1 rounded px-1 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', dir && 'text-foreground')}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <Icon className={cn('size-3.5', !dir && 'opacity-40')} aria-hidden="true" />
                        </button>
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="relative hover:bg-card">
                  {r.getVisibleCells().map((c) => (
                    <TableCell key={c.id} className={cn('py-3 text-[13px]', c.column.columnDef.meta?.numeric && 'text-right')}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* 絞り込みの結果を読み上げる。空でないときは件数だけを画面外で伝える */}
          <p role="status" aria-live="polite" className={rows.length === 0 && entries.length && !loading ? 'px-2 py-8 text-center text-muted-foreground' : 'sr-only'}>
            {!entries.length || loading ? '' : rows.length ? `${page.total} の自治体` : '条件に当たる自治体はありません。'}
          </p>
          {failed ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              読み込めませんでした。
              <button type="button" onClick={retry} className="ml-2 text-primary underline-offset-4 hover:underline">
                もう一度読み込む
              </button>
            </p>
          ) : page.next !== null ? (
            <LoadMore onVisible={more} loading={loading} />
          ) : null}
        </div>
      </section>
    </div>
  )
}
