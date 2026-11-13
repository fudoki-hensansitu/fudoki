// 比べる。2つのまちを、同じ年度の一般会計の決算の分野で並べる。真ん中に分野、左に a（住んでいるまち）、右に b の棒を伸ばし、下に a に似たまちを出す。
// a は緑、b は灰で分け、印（塗り・輪）でも見分けられるようにする。まちどうしの順位や良し悪しの色は付けない
import * as React from 'react'
import { ArrowsLeftRightIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { FieldIcon, yenParts } from '../home/parts'
import { reiwa } from '../jurisdiction/types'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../jurisdiction/domains'
import { Emblem } from '../home/town-picker'
import { useMyTown } from '../home/towns'
import type { CompareTown, Props, TownRef } from '../pages/compare.server'

type Option = Props['options'][number]

type Measure = 'head' | 'share'
const FIELDS = [...DOMAIN_FRAMES.filter((f) => f.id !== 'boei'), OTHER_FRAME]

export const compareHref = (a: string, b?: string | null, year?: number | null) => `/compare?a=${a}${b ? `&b=${b}` : ''}${year ? `&year=${year}` : ''}`

function value(t: CompareTown, field: string, m: Measure): number {
  const yen = t.fields[field] ?? 0
  if (m === 'share') return t.total ? (yen / t.total) * 100 : 0
  return t.pop ? yen / t.pop : 0
}
function parts(n: number, m: Measure | 'yen'): [string, string] {
  if (m === 'share') return [n.toFixed(1), '%']
  if (m === 'head') return n >= 1e4 ? [(n / 1e4).toFixed(1), '万円'] : [Math.round(n).toLocaleString('ja-JP'), '円']
  return yenParts(n)
}
function Num({ n, m, className }: { n: number; m: Measure | 'yen'; className?: string }) {
  const [v, u] = parts(n, m)
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {v}
      <small className="ml-px text-[0.6em]">{u}</small>
    </span>
  )
}
const popText = (n: number) => (n ? `人口 ${(n / 1e4).toFixed(1)}万人` : '')

function TownPicker({ options, exclude = [], onPick, placeholder = 'まちを変える' }: { options: Option[]; exclude?: string[]; onPick: (code: string) => void; placeholder?: string }) {
  const items = options.filter((o) => !exclude.includes(o.code))
  return (
    <Combobox items={items} itemToStringLabel={(o: Option) => o.name} value={null} onValueChange={(o) => o && onPick((o as Option).code)}>
      <ComboboxInput placeholder={placeholder} className="h-8 w-full rounded-full text-sm" />
      <ComboboxContent>
        <ComboboxEmpty>見つかりません</ComboboxEmpty>
        <ComboboxList>{(o: Option) => <ComboboxItem key={o.code} value={o}>{o.name}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** まちの札。紋章・名前・人口と、1人あたりの総額 */
function TownCard({ t, mark, options, exclude, onPick }: { t: CompareTown; mark: React.ReactNode; options: Option[]; exclude: string[]; onPick: (code: string) => void }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border bg-background p-4">
      <div className="flex items-center gap-3">
        <Emblem code={t.code} name={t.name} className="size-10" />
        <div className="min-w-0 flex-1">
          <Link href={t.path} className="flex items-center gap-1 text-[17px] font-semibold text-foreground no-underline hover:underline">
            {t.name}
            {mark}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{popText(t.pop)}</p>
        </div>
      </div>
      {t.pop ? (
        <div>
          <p className="text-xs text-muted-foreground">1人あたり</p>
          <Num n={t.total / t.pop} m="head" className="text-[28px] leading-tight font-semibold text-primary" />
          <p className="text-xs text-muted-foreground">総額 <Num n={t.total} m="yen" /></p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted-foreground">総額</p>
          <Num n={t.total} m="yen" className="text-[28px] leading-tight font-semibold text-primary" />
        </div>
      )}
      <TownPicker options={options} exclude={exclude} onPick={onPick} />
    </section>
  )
}

// 2つのまちの見分け: 左のまちは塗った印、右のまちは輪の印（色だけに頼らない）
const MarkA = () => <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full bg-primary" />
const MarkB = () => <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full border-2 border-muted-foreground bg-background" />

/** 真ん中に分野、左に a・右に b の棒。棒の長さは全部の分野で同じ物差し */
function Butterfly({ a, b, m }: { a: CompareTown; b: CompareTown; m: Measure }) {
  const max = Math.max(...FIELDS.flatMap((f) => [value(a, f.id, m), value(b, f.id, m)]))
  const w = (n: number) => `${max ? (n / max) * 100 : 0}%`
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 pb-2 text-sm font-medium">
        <span className="flex items-center justify-end gap-1.5"><MarkA />{a.name}</span>
        <span className="w-24 sm:w-36" />
        <span className="flex items-center gap-1.5"><MarkB />{b.name}</span>
      </div>
      {FIELDS.map((f) => {
        const va = value(a, f.id, m)
        const vb = value(b, f.id, m)
        return (
          <div key={f.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5">
            <div className="flex items-center justify-end gap-2">
              <Num n={va} m={m} className="text-sm" />
              <span className="h-4 rounded-l-[4px] bg-primary" style={{ width: w(va), maxWidth: '75%' }} />
            </div>
            <span className="flex w-24 flex-col items-center text-center text-xs sm:w-36 sm:text-sm">
              <FieldIcon id={f.id} className="mb-0.5 size-4 text-muted-foreground" />
              {f.name}
            </span>
            <div className="flex items-center gap-2">
              <span className="h-4 rounded-r-[4px] bg-muted-foreground" style={{ width: w(vb), maxWidth: '75%' }} />
              <Num n={vb} m={m} className="text-sm" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SimilarList({ title, items, current, onPick }: { title: string; items: TownRef[]; current: string | null; onPick: (code: string) => void }) {
  return (
    <div className="min-w-0 flex-1">
      <h3 className="mb-1 px-2.5 text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="flex flex-col">
        {items.map((s) => (
          <button key={s.code} type="button" onClick={() => onPick(s.code)} data-selected={s.code === current || undefined} className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-card data-selected:bg-accent">
            <Emblem code={s.code} name={s.name} className="size-[30px] rounded-[9px] p-1" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">{s.name}</span>
              <span className="block text-xs text-muted-foreground">{popText(s.pop)}</span>
            </span>
            {s.code === current ? <span className="text-xs text-primary">比べている</span> : <CaretRightIcon className="size-4 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/** a の無い /compare。住んでいるまちがあればそのまちで開き直し、無ければ選んでもらう */
function PickFirst({ options }: { options: Option[] }) {
  const { town } = useMyTown()
  const { visit } = useRouter()
  React.useEffect(() => {
    if (town) void visit(compareHref(town.code), { replace: true })
  }, [town, visit])
  if (town) return null
  return (
    <section className="max-w-md">
      <p className="mb-2 text-[15px]">まず、比べたいまちを1つ選んでください。</p>
      <TownPicker options={options} onPick={(c) => void visit(compareHref(c))} placeholder="まちの名前" />
    </section>
  )
}

export function Compare({ year, years, a, b, byUse, byPopulation, options, failed }: Props) {
  const { visit } = useRouter()
  const [picked, setM] = React.useState<Measure>('head')
  // 人口の無いまちは1人あたりを出せないので、割合だけにする
  const perHead = !!a?.pop && !!b?.pop
  const m: Measure = perHead ? picked : 'share'
  const go = (na: string, nb: string | null, y?: number | null) => void visit(compareHref(na, nb, y))
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-10 pb-28 sm:px-8 sm:pt-14">
      <header className="mb-5">
        <h1 className="text-[26px] leading-[1.35] font-semibold tracking-[0.02em]">比べる</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">2つのまちのお金の使い方を、分野ごとに並べます。</p>
      </header>
      {failed ? <p className="text-sm text-muted-foreground">今は読み込めません。少し時間をおいてやり直してください。</p> : !a ? <PickFirst options={options} /> : (
        <>
          <div className="flex items-stretch gap-2 sm:gap-4">
            <TownCard t={a} mark={<MarkA />} options={options} exclude={[a.code, b?.code ?? '']} onPick={(c) => go(c, b?.code ?? null)} />
            {b ? (
              <>
                <button type="button" aria-label="左右を入れ替える" onClick={() => go(b.code, a.code, year)} className="grid size-9 shrink-0 place-items-center self-center rounded-full border bg-background text-muted-foreground hover:bg-card">
                  <ArrowsLeftRightIcon className="size-4" />
                </button>
                <TownCard t={b} mark={<MarkB />} options={options} exclude={[a.code, b.code]} onPick={(c) => go(a.code, c)} />
              </>
            ) : null}
          </div>

          {b && year ? (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
                <ToggleGroup value={[m]} onValueChange={(x) => x[0] && setM(x[0] as Measure)} variant="outline" size="sm" spacing={0}>
                  <ToggleGroupItem value="head" disabled={!perHead}>1人あたり</ToggleGroupItem>
                  <ToggleGroupItem value="share">割合</ToggleGroupItem>
                </ToggleGroup>
                <ToggleGroup value={[String(year)]} onValueChange={(x) => x[0] && go(a.code, b.code, Number(x[0]))} variant="outline" size="sm" spacing={0}>
                  {years.map((y) => <ToggleGroupItem key={y} value={String(y)}>{reiwa(y)} 決算</ToggleGroupItem>)}
                </ToggleGroup>
              </div>
              <div className="mt-5"><Butterfly a={a} b={b} m={m} /></div>
            </>
          ) : <p className="mt-8 text-sm text-muted-foreground">{b ? `${a.name}と${b.name}に、同じ年度の決算がありません。` : '比べるまちを選んでください。'}</p>}

          {byUse.length || byPopulation.length ? (
            <section className="mt-12">
              <h2 className="mb-3 text-[17px] font-semibold">{a.name}に似たまち</h2>
              <div className="flex flex-col gap-6 sm:flex-row">
                {byUse.length ? <SimilarList title="使い方が近い" items={byUse} current={b?.code ?? null} onPick={(c) => go(a.code, c)} /> : null}
                {byPopulation.length ? <SimilarList title="人口が近い" items={byPopulation} current={b?.code ?? null} onPick={(c) => go(a.code, c)} /> : null}
              </div>
            </section>
          ) : null}

          <p className="mt-10 px-2.5 text-xs leading-relaxed text-muted-foreground">一般会計の決算を、目ごとに COFOG（政府支出の機能別分類）の分野へ分けて足しています。1人あたりは住民基本台帳の人口で割っています。使い方が近いまちは、分野ごとの割合の差が小さいまちです。</p>
        </>
      )}
    </main>
  )
}
