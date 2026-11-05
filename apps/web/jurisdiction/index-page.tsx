// 自治体一覧（/jurisdictions）の本文。サーバーが renderToString で HTML にし（検索エンジン・JavaScript が無い環境でも全自治体のリンクと金額が載る）、
// 画面では index.tsx が同じデータで hydrate して、地図の選択と表の絞り込み・並べ替えを動かす
import * as React from 'react'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { buttonVariants } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { JAPAN_TILES } from './japan-tiles'
import { PREFECTURE_MAPS } from './map.generated'
import { formatYen, reiwa, type IndexEntry, type JurisdictionKind } from './types'

type Sort = 'yen' | 'code'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'yen', label: '歳出の総額が大きい順' },
  { value: 'code', label: '自治体コード順' },
]
const PARTIAL = '金額の印字が無い款を除いた和'
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
      <div className="mt-4 text-xs text-muted-foreground">{reiwa(e.year)} 決算・一般会計の歳出</div>
      <div className="text-[2rem] leading-tight tabular-nums">{formatYen(e.yen)}</div>
      {e.amountMissing ? <div className="text-[11px] text-muted-foreground">{PARTIAL}</div> : null}
      <div className="mt-4 text-xs text-muted-foreground">金額の大きい分野（款）{e.amountMissing ? '・金額の印字がある款の中で' : ''}</div>
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
          <span key={y} className="rounded bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
            {reiwa(y)}
          </span>
        ))}
      </div>
      <a href={e.path} className={cn(buttonVariants({ size: 'lg' }), 'mt-auto h-11 rounded-full text-[15px]')}>
        {e.name}の家計簿を開く →
      </a>
    </div>
  )
}

type PrefectureMap = (typeof PREFECTURE_MAPS)[number]
const MAPS = new Map<string, PrefectureMap>(PREFECTURE_MAPS.map((m) => [m.code, m]))
const prefOf = (e: IndexEntry) => e.code.slice(0, 2)

function MunicipalityMap({ map, entries, selected, onSelect }: { map: PrefectureMap; entries: IndexEntry[]; selected: string; onSelect: (code: string) => void }) {
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const shapeCodes = new Set<string>(map.shapes.map((s) => s.code))
  const max = Math.max(...entries.filter((e) => shapeCodes.has(e.code)).map((e) => e.yen), 1)
  // 指で触ったときは、1回目で選んでカードを見せ、2回目で開く。マウスは hover で選んでいるので1回で開く
  const touch = React.useRef(false)
  const sel = map.shapes.find((s) => s.code === selected)
  return (
    <svg viewBox={`0 0 ${map.width} ${map.height}`} className="mx-auto block h-auto max-h-[480px] w-full" role="group" aria-label={`${map.name}の市区町村の地図。収録している自治体を歳出の総額の濃さで塗っている`}>
      {map.shapes.map((s) => {
        const e = byCode.get(s.code)
        if (!e) return <path key={s.code} d={s.d} fill="var(--muted)" stroke="var(--background)" strokeWidth={1} strokeLinejoin="round" />
        return (
          <a
            key={s.code}
            href={e.path}
            aria-label={`${e.name} ${formatYen(e.yen)}`}
            onPointerDown={(ev) => (touch.current = ev.pointerType !== 'mouse')}
            onPointerEnter={(ev) => ev.pointerType === 'mouse' && onSelect(e.code)}
            onFocus={() => onSelect(e.code)}
            onClick={(ev) => {
              if (touch.current && selected !== e.code) {
                ev.preventDefault()
                onSelect(e.code)
              }
            }}
            className="outline-none"
          >
            <title>{e.name}</title>
            <path d={s.d} fill={shade(e.yen, max)} stroke="var(--background)" strokeWidth={1} strokeLinejoin="round" className="transition-[fill] hover:brightness-110" />
          </a>
        )
      })}
      {sel ? <path d={sel.d} fill="none" stroke="var(--foreground)" strokeWidth={2.5} strokeLinejoin="round" pointerEvents="none" /> : null}
    </svg>
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
            style={{ ...style, background: shade(n, max) }}
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
  const shapeCodes = new Set<string>(map?.shapes.map((s) => s.code) ?? [])
  const offMap = inView.filter((e) => !shapeCodes.has(e.code))
  const viewName = view ? (map?.name ?? inView[0]?.prefecture ?? '') : '日本'
  const [selected, setSelected] = React.useState(() => (inView.length ? inView : entries).reduce<IndexEntry | null>((a, b) => (!a || b.yen > a.yen ? b : a), null)?.code ?? '')
  const open = (pref: string) => {
    setView(pref)
    const top = municipalities.filter((e) => prefOf(e) === pref).reduce<IndexEntry | null>((a, b) => (!a || b.yen > a.yen ? b : a), null)
    if (top) setSelected(top.code)
  }
  const [query, setQuery] = React.useState('')
  const [kind, setKind] = React.useState<JurisdictionKind | null>(null)
  const [sort, setSort] = React.useState<Sort>('yen')
  const allYears = [...new Set(entries.flatMap((e) => e.years))].sort()
  const maxYen = byYen[0]?.yen ?? 1
  const q = query.trim().toLowerCase()
  const rows = (sort === 'yen' ? byYen : [...entries].sort((a, b) => a.code.localeCompare(b.code))).filter(
    (e) => (!kind || e.kind === kind) && (!q || e.name.includes(q) || e.prefecture.includes(q) || (e.path.split('/').pop() ?? '').includes(q)),
  )
  const current = entries.find((e) => e.code === selected)

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-[clamp(2.2rem,1.6rem+2.4vw,3.4rem)] font-normal leading-tight">自治体を探す</h1>
      <p className="mt-3 text-muted-foreground [word-break:auto-phrase]">
        {entries.length ? `${entries.length} の自治体の決算を収録しています。地図か表から選ぶと、その街の歳出の内訳へ進めます。` : 'まだ決算を収録した自治体がありません。'}
      </p>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="地図から選ぶ">
        <div className="flex flex-col rounded-[20px] bg-card p-4 sm:p-6">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <Breadcrumb>
              <BreadcrumbList className="text-lg">
                <BreadcrumbItem>{view ? <BreadcrumbLink render={<button type="button" onClick={() => setView(null)} />}>日本</BreadcrumbLink> : <BreadcrumbPage>日本</BreadcrumbPage>}</BreadcrumbItem>
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
            <span className="text-xs text-muted-foreground">{view ? (offMap.length ? '島しょ部は地図の下から' : '') : '収録のある都道府県を選ぶ'}</span>
          </div>
          <div className="flex flex-1 items-center">
            {view === null ? <JapanTiles counts={counts} onOpen={open} /> : map ? <MunicipalityMap map={map} entries={inView} selected={selected} onSelect={setSelected} /> : <p className="w-full py-16 text-center text-sm text-muted-foreground">{viewName}の地図はまだありません。下の一覧から選べます。</p>}
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
                <Chip key={e.code} on={selected === e.code} onClick={() => setSelected(e.code)}>
                  {e.name}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
        {current ? <SelectedCard e={current} /> : <p className="rounded-[20px] border p-6 text-muted-foreground">まだ決算を収録した自治体がありません。</p>}
      </section>

      <section className="mt-14" aria-label="表で比べる">
        <h2 className="text-2xl font-normal">表で比べる</h2>
        <InputGroup className="mt-4 h-12 rounded-full bg-background px-2 shadow-[0_6px_24px_-14px_rgba(43,39,35,.35)]">
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
                  onMouseEnter={() => shapeCodes.has(e.code) && setSelected(e.code)}
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
                      {e.amountMissing ? '*' : ''}
                    </span>
                    <small className="whitespace-nowrap text-[11px] text-muted-foreground">{shortYear(e.year)}</small>
                  </span>
                  <span className="hidden truncate text-[13px] text-muted-foreground md:block" title={e.amountMissing ? PARTIAL : undefined}>
                    {e.topKan[0]?.name}
                    {e.amountMissing ? '*' : ''}
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
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          R6 は令和6年度（2024年度）。点線は未収録の年度です。総額は、自治体ごとに最新の決算の一般会計の歳出（款の和）で、年度がそろっていない場合があります。* は金額の印字が無い款を除いた和と、その中でいちばん大きい分野です。人口の多い街ほど大きくなるので、住民1人あたりの比較は人口データを収録してから加えます。
        </p>
      </section>
    </div>
  )
}
