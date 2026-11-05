// 自治体一覧（/jurisdictions）の本文。サーバーが renderToString で HTML にし（検索エンジン・JavaScript が無い環境でも全自治体のリンクと金額が載る）、
// 画面では index.tsx が同じデータで hydrate して、地図の選択と表の絞り込み・並べ替えを動かす
import * as React from 'react'
import { flushSync } from 'react-dom'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { buttonVariants } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MagnifyingGlassIcon, SortDescendingIcon } from '@phosphor-icons/react'
import { JAPAN_TILES } from './japan-tiles'
import { PREFECTURE_MAPS } from './map.generated'
import { formatYen, reiwa, type IndexEntry, type JurisdictionKind } from './types'

type Sort = 'yen' | 'code'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'yen', label: '歳出の総額が大きい順' },
  { value: 'code', label: '自治体コード順' },
]
const PARTIAL = '金額の印字が無い款を除いた和'
/** 一部の款の和の印。注記の行を足すと選び直すたびに高さが変わるので、印だけを出し、説明は title と読み上げに置く（2026-11-05 yuito） */
const Partial = () => (
  <>
    <span aria-hidden="true">*</span>
    <span className="sr-only">（{PARTIAL}）</span>
  </>
)
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

function YearPills({ years, all }: { years: number[]; all: number[] }) {
  return (
    <span className="flex gap-1">
      {all.map((y) => (
        <span
          key={y}
          title={reiwa(y)}
          className={`inline-flex h-5 items-center rounded px-1.5 text-[11px] tabular-nums ${years.includes(y) ? 'bg-accent text-accent-foreground' : 'border border-dashed text-muted-foreground/60'}`}
        >
          {shortYear(y)}
        </span>
      ))}
    </span>
  )
}

function SelectedCard({ e }: { e: IndexEntry }) {
  const max = e.topKan[0]?.yen ?? 1
  return (
    <div className="flex flex-col rounded-[20px] border bg-background p-5 sm:p-6" aria-live="polite">
      <div className="text-xs text-muted-foreground">{e.prefecture}</div>
      <div className="mt-0.5 text-3xl leading-tight">{e.name}</div>
      <div className="mt-4 text-xs text-muted-foreground" title={reiwa(e.year)}>{shortYear(e.year)} 決算・一般会計の歳出</div>
      <div className="text-[2rem] leading-tight tabular-nums" title={e.amountMissing ? PARTIAL : undefined}>
        {formatYen(e.yen)}
        {e.amountMissing ? <Partial /> : null}
      </div>
      <div className="mt-4 text-xs text-muted-foreground">金額の大きい分野（款）</div>
      <ul className="mt-1">
        {e.topKan.map((k) => (
          <li key={k.name} className="border-b py-1.5 text-[13px] last:border-b-0">
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
      <a href={e.path} className={cn(buttonVariants({ size: 'lg' }), 'mt-auto h-11 rounded-full text-[15px]')}>
        {e.name}を開く →
      </a>
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

type TileProps = { code: string; name: string; e: IndexEntry | undefined; max: number; selected: string; onToggle: (code: string) => void; style?: React.CSSProperties }
function MunicipalityTile({ code, name, e, max, selected, onToggle, style }: TileProps) {
  const label = <span className="line-clamp-2 break-all px-0.5 text-center text-[10px] leading-tight sm:text-[11px]">{tileName(name)}</span>
  if (!e)
    return (
      <div key={code} style={style} title={`${name}（未収録）`} className="flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground/70">
        {label}
      </div>
    )
  const on = selected === code
  return (
    <button
      type="button"
      onClick={() => onToggle(code)}
      aria-pressed={on}
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
    </button>
  )
}

/** 都道府県の市区町村のタイル図。各自治体を同じ大きさの四角で、おおよその位置に並べ、歳出の総額で塗る。島しょは下の段に北から並べる */
function PrefectureTiles({ map, entries, selected, onToggle }: { map: PrefectureMap; entries: IndexEntry[]; selected: string; onToggle: (code: string) => void }) {
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const max = Math.max(...entries.map((e) => e.yen), 1)
  const columns = { gridTemplateColumns: `repeat(${map.cols}, minmax(0, 1fr))` }
  const props = { max, selected, onToggle }
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
  // 選んだ自治体。空のときは開いている都道府県自体を見せる（最初は都道府県自体）
  const [selected, setSelected] = React.useState('')
  const toggle = (code: string) => setSelected((s) => (s === code ? '' : code))
  // 日本⇄都道府県の切り替えは View Transition で拡大・縮小して見せる（未対応のブラウザと、動きを減らす設定ではそのまま切り替える）
  const transition = (update: () => void) => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof document === 'undefined' || !document.startViewTransition) return update()
    document.startViewTransition(() => flushSync(update))
  }
  const open = (pref: string) =>
    transition(() => {
      setView(pref)
      setSelected('')
    })
  const [query, setQuery] = React.useState('')
  const [kind, setKind] = React.useState<JurisdictionKind | null>(null)
  const [sort, setSort] = React.useState<Sort>('yen')
  const allYears = [...new Set(entries.flatMap((e) => e.years))].sort()
  const maxYen = byYen[0]?.yen ?? 1
  const q = query.trim().toLowerCase()
  const rows = (sort === 'yen' ? byYen : [...entries].sort((a, b) => a.code.localeCompare(b.code))).filter(
    (e) => (!kind || e.kind === kind) && (!q || e.name.includes(q) || e.prefecture.includes(q) || (e.path.split('/').pop() ?? '').includes(q)),
  )
  // 選んだ自治体が無いときは、開いている都道府県自体（収録していれば）
  const current = entries.find((e) => e.code === selected) ?? entries.find((e) => e.kind === '都道府県' && view !== null && prefOf(e) === view)

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-[clamp(2.2rem,1.6rem+2.4vw,3.4rem)] font-normal leading-tight">自治体を探す</h1>
      {entries.length ? null : <p className="mt-3 text-muted-foreground">まだ決算を収録した自治体がありません。</p>}

      {/* Esc で選択を外し、都道府県自体に戻す */}
      <section className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="地図" onKeyDown={(ev) => ev.key === 'Escape' && setSelected('')}>
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
            {view === null ? <JapanTiles counts={counts} onOpen={open} /> : map ? <PrefectureTiles map={map} entries={inView} selected={selected} onToggle={toggle} /> : <p className="w-full py-16 text-center text-sm text-muted-foreground">{viewName}の地図はまだありません。下の一覧から選べます。</p>}
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
                <Chip key={e.code} on={selected === e.code} onClick={() => toggle(e.code)}>
                  {e.name}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
        {current ? <SelectedCard e={current} /> : <p className="rounded-[20px] border p-6 text-muted-foreground">{entries.length ? '地図から自治体を選ぶと、ここに歳出の総額と大きい分野が出ます。' : 'まだ決算を収録した自治体がありません。'}</p>}
      </section>

      <section className="mt-14" aria-label="比較表">
        <h2 className="text-2xl font-normal">比較表</h2>
        <InputGroup className="mt-4 h-12 rounded-full bg-background px-2">
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput type="search" value={query} onChange={(ev) => setQuery(ev.target.value)} aria-label="自治体名で探す" placeholder="自治体名で探す（例：品川、shinagawa）" className="text-[15px]" />
        </InputGroup>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip on={kind === null} onClick={() => setKind(null)}>
            すべて <small className="opacity-70">{entries.length}</small>
          </Chip>
          {KINDS.map((k) => {
            const n = entries.filter((e) => e.kind === k).length
            return n ? (
              <Chip key={k} on={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                {k} <small className="opacity-70">{n}</small>
              </Chip>
            ) : null
          })}
          <span className="flex-1" />
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <SortDescendingIcon className="size-4" aria-hidden="true" />
            並び
            <Select items={SORTS} value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
              <SelectTrigger aria-label="並び" className="h-8 rounded-full bg-background pl-3.5 text-[13px] text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        </div>

        <div className="mt-5 border-t border-foreground">
          <div className="hidden grid-cols-[minmax(0,13rem)_7rem_minmax(0,1fr)_9rem] gap-5 border-b px-2 py-2.5 text-xs text-muted-foreground md:grid">
            <span>自治体</span>
            <span>収録した決算</span>
            <span>歳出の総額（最新の決算・一般会計）</span>
            <span>いちばん大きい分野</span>
          </div>
          <ul>
            {rows.map((e) => (
              <li key={e.code}>
                <a
                  href={e.path}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b px-2 py-3 transition-colors hover:bg-card md:grid-cols-[minmax(0,13rem)_7rem_minmax(0,1fr)_9rem] md:gap-5"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-[16px]">{e.name}</span>
                    <small className="ml-2 text-[11px] text-muted-foreground">{e.prefecture}</small>
                  </span>
                  <YearPills years={e.years} all={allYears} />
                  <span className="col-span-2 flex min-w-0 items-center gap-2.5 md:col-span-1">
                    <span className="block h-2.5 rounded-sm bg-primary" style={{ width: `${Math.max(0.6, (e.yen / maxYen) * 80)}%` }} />
                    <span className="whitespace-nowrap text-[13px] tabular-nums" title={e.amountMissing ? PARTIAL : undefined}>
                      {formatYen(e.yen)}
                      {e.amountMissing ? <Partial /> : null}
                    </span>
                    <small className="whitespace-nowrap text-[11px] text-muted-foreground">{shortYear(e.year)}</small>
                  </span>
                  <span className="hidden truncate text-[13px] text-muted-foreground md:block" title={e.amountMissing ? PARTIAL : undefined}>
                    {e.topKan[0]?.name}
                    {e.amountMissing ? <Partial /> : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {/* 絞り込みの結果を読み上げる。空でないときは件数だけを画面外で伝える */}
          <p role="status" aria-live="polite" className={rows.length === 0 && entries.length ? 'px-2 py-8 text-center text-muted-foreground' : 'sr-only'}>
            {!entries.length ? '' : rows.length ? `${rows.length} の自治体` : q && !kind ? `「${query}」に当たる自治体は、まだ収録していません。` : '条件に当たる自治体はありません。'}
          </p>
        </div>
      </section>
    </div>
  )
}
