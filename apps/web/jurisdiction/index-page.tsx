// 自治体一覧（/jurisdictions）の本文。サーバーが renderToString で HTML にし（検索エンジン・JavaScript が無い環境でも全自治体のリンクと金額が載る）、
// 画面では index.tsx が同じデータで hydrate して、地図の選択と表の絞り込み・並べ替えを動かす
import * as React from 'react'
import { TOKYO_MAP } from './map.generated'
import { formatYen, reiwa, type IndexEntry, type JurisdictionKind } from './types'

type Sort = 'yen' | 'code'
const PARTIAL = '金額の印字が無い款を除いた和'
const KINDS: JurisdictionKind[] = ['都道府県', '区', '市', '町村']
const MAP_CODES = new Set<string>(TOKYO_MAP.shapes.map((s) => s.code))

/** 塗りの濃さ。面積で見比べるので、金額の平方根に比例させる（最小でも地の色と区別できる濃さを残す） */
const shade = (yen: number, max: number) => `color-mix(in srgb, var(--primary) ${Math.round(22 + 78 * Math.sqrt(yen / max))}%, var(--background))`

const Chip = ({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
  >
    {children}
  </button>
)

function YearPills({ years, all }: { years: number[]; all: number[] }) {
  return (
    <span className="flex gap-1">
      {all.map((y) => (
        <span
          key={y}
          title={reiwa(y)}
          className={`inline-flex h-5 items-center rounded px-1.5 text-[11px] tabular-nums ${years.includes(y) ? 'bg-accent text-accent-foreground' : 'border border-dashed text-muted-foreground/60'}`}
        >
          {y >= 2019 ? `R${y - 2018}` : y}
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
      <a href={e.path} className="mt-auto flex h-11 items-center justify-center rounded-full bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90">
        {e.name}の家計簿を開く →
      </a>
    </div>
  )
}

function TokyoMap({ entries, selected, onSelect }: { entries: IndexEntry[]; selected: string; onSelect: (code: string) => void }) {
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const max = Math.max(...entries.filter((e) => MAP_CODES.has(e.code)).map((e) => e.yen), 1)
  // 指で触ったときは、1回目で選んでカードを見せ、2回目で開く。マウスは hover で選んでいるので1回で開く
  const touch = React.useRef(false)
  const sel = TOKYO_MAP.shapes.find((s) => s.code === selected)
  return (
    <svg viewBox={`0 0 ${TOKYO_MAP.width} ${TOKYO_MAP.height}`} className="block h-auto w-full" role="group" aria-label="東京都の市区町村の地図。収録している自治体を歳出の総額の濃さで塗っている">
      {TOKYO_MAP.shapes.map((s) => {
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

export function IndexPage({ entries }: { entries: IndexEntry[] }) {
  const byYen = React.useMemo(() => [...entries].sort((a, b) => b.yen - a.yen), [entries])
  const onMap = entries.filter((e) => MAP_CODES.has(e.code))
  // 都道府県自体は市区町村と面が重なるので、地図にもチップにも出さず表の行だけにする
  const offMap = entries.filter((e) => !MAP_CODES.has(e.code) && e.kind !== '都道府県')
  const [selected, setSelected] = React.useState(() => (onMap.length ? onMap : entries).reduce<IndexEntry | null>((a, b) => (!a || b.yen > a.yen ? b : a), null)?.code ?? '')
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
  const prefectures = [...new Set(entries.map((e) => e.prefecture))]

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-[clamp(2.2rem,1.6rem+2.4vw,3.4rem)] font-normal leading-tight">自治体を探す</h1>
      <p className="mt-3 max-w-[640px] text-muted-foreground">
        {entries.length ? `${prefectures.join('・')}の ${entries.length} の自治体の決算を収録しています。地図か表から選ぶと、その街の歳出の内訳へ進めます。` : 'まだ決算を収録した自治体がありません。'}
      </p>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="地図から選ぶ">
        <div className="rounded-[20px] bg-card p-4 sm:p-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-normal">東京都</h2>
            <span className="text-xs text-muted-foreground">島しょ部は下の一覧から</span>
          </div>
          <TokyoMap entries={entries} selected={selected} onSelect={setSelected} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span>歳出の総額</span>
            <span>少</span>
            <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${shade(0, 1)}, var(--primary))` }} />
            <span>多</span>
            <span className="ml-2 inline-block size-3 rounded-sm bg-muted" />
            <span>未収録</span>
          </div>
          {offMap.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-xs text-muted-foreground">地図の外</span>
              {offMap.map((e) => (
                <Chip key={e.code} on={selected === e.code} onClick={() => setSelected(e.code)}>
                  {e.name}
                  <small className="opacity-70">{e.prefecture === '東京都' ? '島しょ' : e.prefecture}</small>
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
        {current ? <SelectedCard e={current} /> : <p className="rounded-[20px] border p-6 text-muted-foreground">まだ決算を収録した自治体がありません。</p>}
      </section>

      <section className="mt-14" aria-label="表で比べる">
        <h2 className="text-2xl font-normal">表で比べる</h2>
        <label className="mt-4 flex h-12 items-center gap-2 rounded-full border bg-background px-5 shadow-[0_6px_24px_-14px_rgba(43,39,35,.35)] focus-within:ring-2 focus-within:ring-ring">
          <svg viewBox="0 0 256 256" className="size-4 shrink-0 fill-muted-foreground" aria-hidden="true">
            <path d="M229.66 218.34l-50.07-50.06a88.11 88.11 0 1 0-11.31 11.31l50.06 50.07a8 8 0 0 0 11.32-11.32zM40 112a72 72 0 1 1 72 72 72.08 72.08 0 0 1-72-72z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            aria-label="自治体名で探す"
            placeholder="自治体名で探す（例：品川、shinagawa）"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </label>
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
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            並び
            <select value={sort} onChange={(ev) => setSort(ev.target.value as Sort)} className="h-8 rounded-full border bg-background px-3 text-[13px] text-foreground">
              <option value="yen">歳出の総額が大きい順</option>
              <option value="code">自治体コード順</option>
            </select>
          </label>
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
                  onMouseEnter={() => MAP_CODES.has(e.code) && setSelected(e.code)}
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
                    <small className="whitespace-nowrap text-[11px] text-muted-foreground">{reiwa(e.year).replace('年度', '')}</small>
                  </span>
                  <span className="hidden truncate text-[13px] text-muted-foreground md:block" title={e.amountMissing ? PARTIAL : undefined}>
                    {e.topKan[0]?.name}
                    {e.amountMissing ? '*' : ''}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {rows.length === 0 && entries.length ? <p className="px-2 py-8 text-center text-muted-foreground">{q && !kind ? `「${query}」に当たる自治体は、まだ収録していません。` : '条件に当たる自治体はありません。'}</p> : null}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          R6 は令和6年度（2024年度）。点線は未収録の年度です。総額は、自治体ごとに最新の決算の一般会計の歳出（款の和）で、年度がそろっていない場合があります。* は金額の印字が無い款を除いた和と、その中でいちばん大きい分野です。人口の多い街ほど大きくなるので、住民1人あたりの比較は人口データを収録してから加えます。
        </p>
      </section>
    </div>
  )
}
