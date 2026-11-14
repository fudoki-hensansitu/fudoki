// 比べる。2つのまちを、同じ年度の一般会計の決算の分野で並べる。真ん中に分野、左に a（住んでいるまち）、右に b の棒を伸ばし、下に a に似たまちを出す。
// a は緑、b は灰で分け、印（塗り・輪）でも見分けられるようにする。まちどうしの順位や良し悪しの色は付けない
import * as React from 'react'
import { ArrowsLeftRightIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { FieldIcon, yenParts } from '../home/parts'
import { reiwa, TAB_SLUGS } from '../jurisdiction/types'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../jurisdiction/domains'
import { Emblem } from '../home/town-picker'
import { searchTowns, useMyTown } from '../home/towns'
import type { MapEntry } from '../jurisdiction/index-table'
import { AskDock } from '../jurisdiction/ask-dock'
import type { CompareTown, Props, TownRef, Version } from '../pages/compare.server'


type Measure = 'head' | 'share'
const FIELDS = [...DOMAIN_FRAMES.filter((f) => f.id !== 'boei'), OTHER_FRAME]

const versionQuery = (side: 'a' | 'b', v?: Version | null) => (v ? `&${side}y=${v.year}&${side}k=${v.kind}` : '')
export const compareHref = (a: string, b?: string | null, av?: Version | null, bv?: Version | null) => `/compare?a=${a}${versionQuery('a', av)}${b ? `&b=${b}` : ''}${versionQuery('b', bv)}`
const KIND_LABEL = { settlement: '決算', initial: '当初予算' } as const
/** 「R6年度 決算」 */
export const versionLabel = (v: Version) => `${reiwa(v.year)} ${KIND_LABEL[v.kind]}`
/** そのまちの頁の、選んでいる年度の決算・予算のタブ */
const docHref = (t: CompareTown) => `${t.path}/${t.version.year}/${t.version.kind === 'settlement' ? TAB_SLUGS.settled : TAB_SLUGS.money}`

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
      <small className="ml-px text-[max(0.6em,11px)]">{u}</small>
    </span>
  )
}
const popText = (n: number) => (n ? `人口 ${(n / 1e4).toFixed(1)}万人` : '')

/** 打ち終えるのを待つ間 */
const TYPING_MS = 150

/** まちの名前そのものが選ぶ欄。押すと名前で探せる候補が開く。候補は頁に全部を載せず、打った語でサーバー（/api/jurisdictions?q=）に上位だけを聞く */
function TownPicker({ current, onPick, children, className }: { current: string; onPick: (code: string) => void; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  // null は読めなかった
  const [items, setItems] = React.useState<MapEntry[] | null>([])
  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = setTimeout(() => void searchTowns(q, controller.signal).then((e) => !controller.signal.aborted && setItems(e)), q ? TYPING_MS : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, q])
  return (
    <Combobox open={open} onOpenChange={setOpen} items={items ?? []} filter={null} itemToStringLabel={(e: MapEntry) => e.name} value={null} onInputValueChange={(v) => setQ(v)} onValueChange={(e) => e && (e as MapEntry).code !== current && onPick((e as MapEntry).code)}>
      <ComboboxTrigger aria-label="まちを選ぶ" className={cn('-mx-1.5 flex max-w-full min-w-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-left text-[17px] font-semibold text-foreground hover:bg-card', className)}>
        {children}
      </ComboboxTrigger>
      <ComboboxContent className="w-64">
        <ComboboxInput showTrigger={false} placeholder="まちの名前" className="h-9" />
        <ComboboxEmpty>{items === null ? '読み込めませんでした' : '見つかりません'}</ComboboxEmpty>
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
  )
}

/** 資料（当初予算・決算）と年度を分けて選ぶ。資料を替えたとき同じ年度が無ければ、その資料の最新の年度にする */
function VersionPicker({ t, onVersion }: { t: CompareTown; onVersion: (v: Version) => void }) {
  const kinds = (['initial', 'settlement'] as const).filter((k) => t.versions.some((v) => v.kind === k))
  const years = t.versions.filter((v) => v.kind === t.version.kind).map((v) => v.year)
  const items = years.map((y) => ({ value: String(y), label: reiwa(y) }))
  const pickKind = (kind: Version['kind']) => {
    const same = t.versions.find((v) => v.kind === kind && v.year === t.version.year)
    const next = same ?? t.versions.find((v) => v.kind === kind)
    if (next) onVersion(next)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup aria-label={`${t.name}の資料`} value={[t.version.kind]} onValueChange={(x) => x[0] && pickKind(x[0] as Version['kind'])} variant="outline" size="sm" spacing={0}>
        {kinds.map((k) => <ToggleGroupItem key={k} value={k}>{KIND_LABEL[k]}</ToggleGroupItem>)}
      </ToggleGroup>
      <Select items={items} value={String(t.version.year)} onValueChange={(y) => y && onVersion({ year: Number(y), kind: t.version.kind })}>
        <SelectTrigger size="sm" aria-label={`${t.name}の年度`} className="rounded-full px-3"><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

/** まちの札。紋章・名前・人口と、1人あたりの総額 */
function TownCard({ t, mark, onPick, onVersion }: { t: CompareTown; mark: React.ReactNode; onPick: (code: string) => void; onVersion: (v: Version) => void }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border bg-background p-3 sm:p-4">
      {/* 紋章・名前・人口のまとまり全体で、まちを選ぶ */}
      <TownPicker current={t.code} onPick={onPick} className="-m-1.5 max-w-none gap-3 rounded-xl p-1.5">
        <Emblem code={t.code} name={t.name} className="hidden size-10 sm:grid" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{t.name}</span>
            {mark}
          </span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{popText(t.pop)}</span>
        </span>
      </TownPicker>
      <VersionPicker t={t} onVersion={onVersion} />
      {!t.total ? (
        <p className="text-sm text-muted-foreground">この資料の金額はまだありません</p>
      ) : t.pop ? (
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
    </section>
  )
}

// 2つのまちの見分け: 左のまちは塗った印、右のまちは輪の印（色だけに頼らない）
const MarkA = () => <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full bg-primary" />
const MarkB = () => <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full border-2 border-muted-foreground bg-background" />

/** 棒の列の見出し。狭い幅では1行に収まるよう、まちの名前だけ（同じまちどうしなら資料だけ）にする */
function ColumnLabel({ t, sameTown }: { t: CompareTown; sameTown: boolean }) {
  return (
    <span className="truncate">
      <span className={cn(sameTown && 'hidden sm:inline')}>{t.name}</span>
      <span className={cn(!sameTown && 'hidden sm:inline')}> {versionLabel(t.version)}</span>
    </span>
  )
}

/** 真ん中に分野、左に a・右に b の棒。棒の長さは全部の分野で同じ物差し */
function Butterfly({ a, b, m }: { a: CompareTown; b: CompareTown; m: Measure }) {
  const max = Math.max(...FIELDS.flatMap((f) => [value(a, f.id, m), value(b, f.id, m)]))
  // 一番長い棒を列の 75% にし、ほかの棒はその比で縮める（棒ごとに上限で切ると比が崩れる）
  const w = (n: number) => `${max ? (n / max) * 75 : 0}%`
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 pb-2 text-sm font-medium">
        <Link href={docHref(a)} className="flex min-w-0 items-center justify-end gap-1.5 text-foreground underline-offset-2 hover:underline"><MarkA /><ColumnLabel t={a} sameTown={a.code === b.code} /></Link>
        <span className="w-24 sm:w-36" />
        <Link href={docHref(b)} className="flex min-w-0 items-center gap-1.5 text-foreground underline-offset-2 hover:underline"><MarkB /><ColumnLabel t={b} sameTown={a.code === b.code} /></Link>
      </div>
      {FIELDS.map((f) => {
        const va = value(a, f.id, m)
        const vb = value(b, f.id, m)
        return (
          <div key={f.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5">
            <div className="flex items-center justify-end gap-2">
              <Num n={va} m={m} className="text-sm" />
              <span className="h-4 rounded-l-[4px] bg-primary" style={{ width: w(va) }} />
            </div>
            <span className="flex w-24 flex-col items-center text-center text-xs sm:w-36 sm:text-sm">
              <FieldIcon id={f.id} className="mb-0.5 size-4 text-muted-foreground" />
              {f.name}
            </span>
            <div className="flex items-center gap-2">
              <span className="h-4 rounded-r-[4px] bg-muted-foreground" style={{ width: w(vb) }} />
              <Num n={vb} m={m} className="text-sm" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 似たまち。いま比べているまちは出さない */
function SimilarList({ title, note, items, onPick }: { title: string; note: string; items: TownRef[]; onPick: (code: string) => void }) {
  return (
    <div className="min-w-0 flex-1">
      <h3 className="text-[15px] font-medium">{title}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{note}</p>
      <div className="-mx-2.5 flex flex-col">
        {items.map((s) => (
          <button key={s.code} type="button" onClick={() => onPick(s.code)} className="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-card">
            <Emblem code={s.code} name={s.name} className="size-[30px] rounded-[9px] p-1" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">{s.name}</span>
              <span className="block text-xs text-muted-foreground">{popText(s.pop)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
              <ArrowsLeftRightIcon className="size-4" aria-hidden="true" />
              入れ替える
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** まちの指定の無い /compare は、見本の組み合わせ（品川区と、使い方が一番近いまち）を SSR で最初から出す。
 * サイトのナビは住んでいるまちを付けて開くので、ここで開き直すのは URL を直に開いたときだけ */
function Sample({ body }: { body: React.ReactNode }) {
  const { town } = useMyTown()
  const { visit } = useRouter()
  React.useEffect(() => {
    if (town) void visit(compareHref(town.code), { replace: true })
  }, [town, visit])
  return body
}

export function Compare(props: Props) {
  const { a, b, byUse, byPopulation, failed, sample } = props
  const { visit } = useRouter()
  const [picked, setM] = React.useState<Measure>('share')
  // 人口の無いまちは1人あたりを出せないので、割合だけにする
  const perHead = !!a?.pop && !!b?.pop
  const m: Measure = perHead ? picked : 'share'
  const go = (na: string, av: Version | null, nb: string | null, bv: Version | null) => void visit(compareHref(na, nb, av, bv))
  const body = (a: CompareTown) => (
        <>
          <div className="flex flex-col items-stretch gap-2 min-[360px]:flex-row sm:gap-4">
            <TownCard t={a} mark={<MarkA />} onPick={(c) => go(c, null, b?.code ?? null, b?.version ?? null)} onVersion={(v) => go(a.code, v, b?.code ?? null, b?.version ?? null)} />
            {b ? (
              <>
                <button type="button" aria-label="左右を入れ替える" onClick={() => go(b.code, b.version, a.code, a.version)} className="grid size-9 shrink-0 rotate-90 place-items-center self-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-card min-[360px]:rotate-0">
                  <ArrowsLeftRightIcon className="size-4" />
                </button>
                <TownCard t={b} mark={<MarkB />} onPick={(c) => go(a.code, a.version, c, null)} onVersion={(v) => go(a.code, a.version, b.code, v)} />
              </>
            ) : null}
          </div>

          {b ? (
            <>
              <div className="mt-6">
                <ToggleGroup value={[m]} onValueChange={(x) => x[0] && setM(x[0] as Measure)} variant="outline" size="sm" spacing={0}>
                  <ToggleGroupItem value="share">割合</ToggleGroupItem>
                  <ToggleGroupItem value="head" disabled={!perHead}>1人あたり</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="mt-5"><Butterfly a={a} b={b} m={m} /></div>
              <AskDock name={a.code === b.code ? a.name : `${a.name}と${b.name}`} code={a.code} year={a.version.year} sitekey={props.sitekey} page="まち比べの頁" ask="AIに質問" detail={() => `比べている: ${a.name}（${a.code}）の${versionLabel(a.version)}と、${b.name}（${b.code}）の${versionLabel(b.version)}。一般会計の目を COFOG の分野へ分けて足したもの。表示: ${m === 'head' ? '1人あたり' : '割合'}`} />
            </>
          ) : (
            <div className="mt-8 flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">比べるまちを選んでください。</p>
              <TownPicker current={a.code} onPick={(c) => go(a.code, a.version, c, null)}>
                <span className="text-sm">まちを選ぶ</span>
              </TownPicker>
            </div>
          )}

          {byUse.length || byPopulation.length ? (
            <section className="mt-12">
              {b ? (
                <>
                  <h2 className="flex flex-wrap items-center gap-1.5 text-[17px] font-semibold"><MarkB />{b.name}と入れ替える</h2>
                  <p className="mt-1 mb-3 text-sm text-muted-foreground">{a.name}に似たまちから選べます</p>
                </>
              ) : <h2 className="mb-3 text-[17px] font-semibold">{a.name}に似たまち</h2>}
              <div className="flex flex-col gap-6 sm:flex-row">
                {byUse.length ? <SimilarList title="使い方が近い" note="一般会計を分野ごとの割合で比べて近いまち" items={byUse.filter((x) => x.code !== b?.code).slice(0, 5)} onPick={(c) => go(a.code, a.version, c, null)} /> : null}
                {byPopulation.length ? <SimilarList title="人口が近い" note="住民基本台帳の人口が近いまち" items={byPopulation.filter((x) => x.code !== b?.code).slice(0, 5)} onPick={(c) => go(a.code, a.version, c, null)} /> : null}
              </div>
            </section>
          ) : null}

        </>
  )
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-10 pb-28 sm:px-8 sm:pt-14">
      <header className="mb-5">
        <h1 className="text-[26px] leading-[1.35] font-semibold tracking-[0.02em]">まち比べ</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">2つのまちのお金の使い方を、分野ごとに並べます</p>
      </header>
      {failed || !a ? <p className="text-sm text-muted-foreground">今は読み込めません。少し時間をおいてやり直してください。</p> : sample ? <Sample body={body(a)} /> : body(a)}
    </main>
  )
}
