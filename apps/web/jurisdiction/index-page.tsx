// 自治体一覧（/jurisdictions）の本文。Void の頁（pages/jurisdictions.tsx）としてサーバーが HTML にし（検索エンジン・JavaScript が無い環境でも全自治体のリンクと金額が載る）、
// 画面では同じデータで hydrate して、地図の選択と表の絞り込み・並べ替えを動かす。個別ページへは Void の Link で頁を読み直さずに移る
import * as React from 'react'
import { flushSync } from 'react-dom'
import { Link, useRouter } from '@void/react'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { buttonVariants } from '@/components/ui/button'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ArrowDownIcon, ArrowsDownUpIcon, ArrowUpIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { JAPAN_TILES } from './japan-tiles'
import { PREFECTURE_MAPS } from './map.generated'
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

/** 比較表の列。見出しを押すとその列で並べ替える。数値の列は大きい順から、人口の無い自治体はどちらの向きでも末尾に置く */
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
    sortUndefined: 'last',
    sortDescFirst: true,
    meta: { numeric: true },
    cell: ({ row: { original: e } }) =>
      e.population ? <span title={`住民基本台帳人口（${formatAsOf(e.population.asOf)}時点）`}>{formatPeople(e.population.people)}</span> : <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'perCapita',
    header: '1人あたりの歳出',
    accessorFn: (e) => e.perCapita ?? undefined,
    sortUndefined: 'last',
    sortDescFirst: true,
    meta: { numeric: true },
    cell: ({ row: { original: e }, table }) => {
      if (e.perCapita === null) return <span className="text-[13px] text-muted-foreground">人口が無く出せません</span>
      const max = table.options.meta?.maxPerCapita ?? 1
      return (
        <span className="flex items-center justify-end gap-2.5">
          <span className="block h-2.5 w-24 sm:w-40">
            <span className="block h-full rounded-sm bg-primary" style={{ width: `${Math.max(1, (e.perCapita / max) * 100)}%` }} />
          </span>
          <span className="w-[5.5rem] text-right">{formatPerCapita(e.perCapita)}</span>
        </span>
      )
    },
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
        <small className="ml-2 text-[11px] text-muted-foreground" title={reiwa(e.year)}>{shortYear(e.year)}</small>
      </span>
    ),
  },
]

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    numeric?: boolean
  }
  interface TableMeta<TData> {
    /** 棒の長さの基準。絞り込んでも変えないよう、全自治体の最大 */
    maxPerCapita: number
  }
}

function SelectedCard({ e }: { e: IndexEntry }) {
  const max = e.topKan[0]?.yen ?? 1
  return (
    <div className="flex flex-col rounded-[20px] border bg-background p-5 sm:p-6" aria-live="polite">
      <div className="text-xs text-muted-foreground">{e.prefecture}</div>
      <div className="mt-0.5 text-3xl leading-tight">{e.name}</div>
      <div className="mt-4 text-xs text-muted-foreground" title={reiwa(e.year)}>{shortYear(e.year)} 決算・一般会計の歳出</div>
      <div className="text-[2rem] leading-tight tabular-nums">{formatYen(e.yen)}</div>
      <div className="mt-4 text-xs text-muted-foreground">金額の大きい分野（款）</div>
      <ul className="mt-1">
        {e.topKan.map((k) => (
          <li key={k.name} className="py-1.5 text-[13px]">
            <div className="flex justify-between gap-2">
              <span className="truncate">{k.name}</span>
              <span className="tabular-nums">{formatYen(k.yen)}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-muted">
              <div className="h-1 rounded-full bg-primary" style={{ width: `${(k.yen / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 text-xs text-muted-foreground">収録している決算</div>
      <div className="mb-5 mt-1 flex flex-wrap gap-1.5">
        {e.years.map((y) => (
          <span key={y} className="rounded bg-accent px-2 py-0.5 text-[11px] text-accent-foreground" title={reiwa(y)}>
            {shortYear(y)}
          </span>
        ))}
      </div>
      <Link href={e.path} className={cn(buttonVariants({ size: 'lg' }), 'mt-auto h-11 rounded-full text-[15px]')}>
        {e.name}を開く →
      </Link>
    </div>
  )
}

type PrefectureMap = (typeof PREFECTURE_MAPS)[number]
const MAPS = new Map<string, PrefectureMap>(PREFECTURE_MAPS.map((m) => [m.code, m]))
const prefOf = (e: IndexEntry) => e.code.slice(0, 2)

/** 図に並べた自治体のコード（本土と島しょ） */
const mapCodes = (map: PrefectureMap | undefined) => new Set<string>(map ? [...map.tiles, ...map.islands].map((t) => t.code) : [])
/** タイルに書く短い名前。種別（区・市・町・村）は落とし、1文字になるときだけ残す（港区・北区） */
const tileName = (name: string) => (name.length > 2 ? name.replace(/[区市町村]$/, '') : name)

type TileProps = { code: string; name: string; e: IndexEntry | undefined; max: number; selected: string; onPreview: (code: string) => void; style?: React.CSSProperties }
/** 収録した自治体のタイルは個別ページへのリンク。マウスを載せる・フォーカスすると横のカードに中身を出す */
function MunicipalityTile({ code, name, e, max, selected, onPreview, style }: TileProps) {
  const label = <span className="line-clamp-2 break-all px-0.5 text-center text-[10px] leading-tight sm:text-[11px]">{tileName(name)}</span>
  if (!e)
    return (
      <div key={code} style={style} title={`${name}（未収録）`} className="flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground/70">
        {label}
      </div>
    )
  const on = selected === code
  return (
    <Link
      href={e.path}
      onPointerEnter={(ev) => ev.pointerType === 'mouse' && onPreview(code)}
      onFocus={() => onPreview(code)}
      aria-label={`${name} ${formatYen(e.yen)}`}
      title={name}
      style={{ ...style, background: shade(e.yen, max) }}
      className={cn(
        'flex aspect-square items-center justify-center rounded-md transition hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        Math.sqrt(e.yen / max) > 0.5 ? 'text-primary-foreground' : 'text-foreground',
        on && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
      )}
    >
      {label}
    </Link>
  )
}

/** 都道府県の市区町村のタイル図。各自治体を同じ大きさの四角で、おおよその位置に並べ、歳出の総額で塗る。島しょは下の段に北から並べる */
function PrefectureTiles({ map, entries, selected, onPreview }: { map: PrefectureMap; entries: IndexEntry[]; selected: string; onPreview: (code: string) => void }) {
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const max = Math.max(...entries.map((e) => e.yen), 1)
  const columns = { gridTemplateColumns: `repeat(${map.cols}, minmax(0, 1fr))` }
  const props = { max, selected, onPreview }
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
const slugOf = (e: IndexEntry) => e.path.split('/').pop() ?? ''
/** 名前・都道府県名・ローマ字の slug のどれかに当たるか */
const matches = (e: IndexEntry, query: string) => {
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

export function IndexPage({ entries }: { entries: IndexEntry[] }) {
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
  // カードに出す自治体。タイルにマウスを載せる・フォーカスした自治体で、空のときは開いている都道府県自体を見せる。
  // タイルを押すと個別ページへ進む（押して選ぶ形はモバイルで何が変わったか分かりにくかった）
  const [selected, setSelected] = React.useState('')
  // 日本⇄都道府県の切り替えは View Transition で拡大・縮小して見せる（未対応のブラウザと、動きを減らす設定ではそのまま切り替える）
  const transition = (update: () => void) => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof document === 'undefined' || !document.startViewTransition) return update()
    // 頁の間の移動では本文（.site-main）を薄く消して浮かせるが、図の切り替えでは本文を動かさない（styles/app.css の data-map-transition）
    const root = document.documentElement
    root.dataset.mapTransition = ''
    document.startViewTransition(() => flushSync(update)).finished.finally(() => delete root.dataset.mapTransition)
  }
  const open = (pref: string) =>
    transition(() => {
      setView(pref)
      setSelected('')
    })
  // 地図の検索で選んだ市区町村は個別ページへ進む。都道府県ならその図を開く
  const router = useRouter()
  const find = (e: IndexEntry) => (e.kind === '都道府県' ? open(prefOf(e)) : router.visit(e.path))
  // 表の絞り込み。種類ごとに選んだ値（都道府県はコードの先頭2桁、市区町村は自治体コード）
  const [picked, setPicked] = React.useState<Record<JurisdictionKind, string[]>>({ 都道府県: [], 区: [], 市: [], 町村: [] })
  const prefPicks = picked['都道府県']
  const namePicks = [...picked['区'], ...picked['市'], ...picked['町村']]
  const filtered = prefPicks.length + namePicks.length > 0
  const maxPerCapita = React.useMemo(() => Math.max(1, ...entries.map((e) => e.perCapita ?? 0)), [entries])
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'perCapita', desc: true }])
  // 都道府県と市区町村の選択は AND（東京都 × 八王子市なら八王子市）。同じ都道府県・市区町村どうしは、どれかに当たれば残す
  const data = React.useMemo(
    () => entries.filter((e) => (!prefPicks.length || prefPicks.includes(prefOf(e))) && (!namePicks.length || namePicks.includes(e.code))),
    [entries, prefPicks.join(), namePicks.join()],
  )
  const table = useReactTable({ data, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getRowId: (e) => e.code, meta: { maxPerCapita } })
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
  // 選んだ自治体が無いときは、開いている都道府県自体（収録していれば）
  const current = entries.find((e) => e.code === selected) ?? entries.find((e) => e.kind === '都道府県' && view !== null && prefOf(e) === view)

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-[clamp(2.2rem,1.6rem+2.4vw,3.4rem)] font-normal leading-tight">自治体を探す</h1>
      {entries.length ? (
        <Combobox autoHighlight items={byYen} filter={(e: IndexEntry, q: string) => matches(e, q)} itemToStringLabel={(e: IndexEntry) => e.name} value={null} onValueChange={(e) => e && find(e as IndexEntry)}>
          <ComboboxInput showTrigger={false} aria-label="自治体名で探す" placeholder="自治体名で探す（例：品川、shinagawa）" className="mt-6 h-12 rounded-full bg-background px-2 text-[15px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
          </ComboboxInput>
          <ComboboxContent>
            <ComboboxEmpty>当たる自治体は、まだ収録していません</ComboboxEmpty>
            <ComboboxList>
              {(e: IndexEntry) => (
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

      {/* 地図とカードの外へマウスかフォーカスが出たら、カードを都道府県自体に戻す（カードのボタンへ動かす間は下見を保つ） */}
      <section
        className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        aria-label="地図"
        onPointerLeave={(ev) => ev.pointerType === 'mouse' && !ev.currentTarget.contains(document.activeElement) && setSelected('')}
        onBlur={(ev) => !ev.currentTarget.contains(ev.relatedTarget) && setSelected('')}
      >
        <div className="flex min-w-0 flex-col rounded-[20px] bg-card p-4 sm:p-6">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <Breadcrumb>
              <BreadcrumbList className="text-lg">
                <BreadcrumbItem>{view ? <BreadcrumbLink render={<button type="button" onClick={() => transition(() => (setView(null), setSelected('')))} />}>日本</BreadcrumbLink> : <BreadcrumbPage>日本</BreadcrumbPage>}</BreadcrumbItem>
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
            <span className="text-xs text-muted-foreground">{view ? '' : '収録のある都道府県を選ぶ'}</span>
          </div>
          <div className="flex flex-1 items-center">
            {view === null ? <JapanTiles counts={counts} onOpen={open} /> : map ? <PrefectureTiles map={map} entries={inView} selected={selected} onPreview={setSelected} /> : <p className="w-full py-16 text-center text-sm text-muted-foreground">{viewName}の地図はまだありません。下の一覧から選べます。</p>}
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
                <Link key={e.code} href={e.path} onPointerEnter={(ev) => ev.pointerType === 'mouse' && setSelected(e.code)} onFocus={() => setSelected(e.code)} className={cn(buttonVariants({ variant: selected === e.code ? 'default' : 'outline' }), 'rounded-full px-3.5 text-[13px] font-normal')}>
                  {e.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        {current ? <SelectedCard e={current} /> : <p className="rounded-[20px] border p-6 text-muted-foreground">{entries.length ? (view ? '地図の自治体にカーソルを載せると、ここに歳出の総額と大きい分野が出ます。' : '都道府県を選ぶと、その市区町村の図が開きます。') : 'まだ決算を収録した自治体がありません。'}</p>}
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
          <Table className="tabular-nums">
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
          <p role="status" aria-live="polite" className={rows.length === 0 && entries.length ? 'px-2 py-8 text-center text-muted-foreground' : 'sr-only'}>
            {!entries.length ? '' : rows.length ? `${rows.length} の自治体` : '条件に当たる自治体はありません。'}
          </p>
        </div>
      </section>
    </div>
  )
}
