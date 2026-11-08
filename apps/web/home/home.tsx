// ホーム（/）。「うちのまち」（選んだ自治体の情報への入口）、見られる情報の種類（予算・決算・事業評価・議会・選挙）、収録の更新を並べるハブ。
// 自治体を探す・比べるのは自治体一覧（/jurisdictions）、AI との会話はアシスタント（/assistant）が受け持つので、ここでは重ねない。
// 面の色は、主張したい面（うちのまち）が緑（--primary）の地で中の押せるものは白、押せるものの状態は生成り。見出しも含めてゴシック（明朝は /about の読み物だけ）
import * as React from 'react'
import { Link } from '@void/react'
import { ArrowRightIcon, BankIcon, ArrowSquareOutIcon, CheckSquareOffsetIcon, ClipboardTextIcon, CoinsIcon, GavelIcon, MagnifyingGlassIcon, NavigationArrowIcon } from '@phosphor-icons/react'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import type { MapEntry } from '../jurisdiction/index-table'
import { INDEX_PATH } from '../jurisdiction/types'
import { LocateError, locateMunicipality } from './locate'
import { loadHomeCode, loadRecent, saveHomeCode } from './recent'

export interface Featured {
  code: string
  name: string
  path: string
  vision?: string
  /** 事業評価の載る年度 */
  evalYear?: number
}

export interface HomeProps {
  entries: MapEntry[]
  /** くわしい頁（事業評価・新しく始めること）のある自治体 */
  featured: Featured[]
}

const DOCS = 'https://docs.fudoki.dev'
const GITHUB = 'https://github.com/fudoki-hensansitu/fudoki'

/** 最近ふえた収録（取り込みの PR から手で写したもの。一覧に出ていない自治体の行は出さない） */
const UPDATES: { date: string; code: string; text: string }[] = [
  { date: '11/8', code: '131211', text: 'R6年度 決算（事業別の説明書）' },
  { date: '11/7', code: '131199', text: 'R6年度 決算・5会計' },
  { date: '11/7', code: '132101', text: 'R6年度 決算' },
  { date: '11/7', code: '133086', text: 'R6年度 決算・特別会計3つ' },
  { date: '11/6', code: '132055', text: 'R6年度 決算' },
  { date: '11/6', code: '131083', text: 'R6年度 決算・4会計' },
  { date: '11/6', code: '131130', text: 'R6年度 決算・4会計' },
  { date: '11/6', code: '131091', text: 'R6〜R8年度 当初予算' },
]

const emblem = (code: string) => `/jurisdictions/${code}/emblem.svg`
const matches = (e: MapEntry, q: string) => {
  const s = q.trim()
  return !s || e.name.includes(s) || e.path.includes(s.toLowerCase())
}

function Emblem({ code, name, className = 'size-10' }: { code: string; name: string; className?: string }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl border bg-white p-1.5', className)}>
      {failed ? <span className="text-sm text-foreground">{name[0]}</span> : <img src={emblem(code)} alt="" loading="lazy" className="size-full object-contain" onError={() => setFailed(true)} />}
    </span>
  )
}

function Picker({ entries, onPick, placeholder }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; placeholder: string }) {
  return (
    <Combobox autoHighlight items={entries} filter={(e: MapEntry, q: string) => matches(e, q)} itemToStringLabel={(e: MapEntry) => e.name} value={null} onValueChange={(e) => e && onPick(e as MapEntry)}>
      <ComboboxInput showTrigger={false} aria-label="自治体名で探す" placeholder={placeholder} className="h-12 rounded-full border-0 bg-background px-2 text-[15px] text-foreground shadow-[var(--shadow-pill)] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15">
        <InputGroupAddon>
          <MagnifyingGlassIcon className="size-5" />
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
  )
}

/** うちのまちで出す、その自治体の情報の入口。hash は自治体の頁の目次の id か年度（#y2024）。くわしい頁の無い自治体には無い節は出さない */
const townLinks = (name: string) => [
  { label: `${name.slice(-1)}の仕事`, hash: '#about', icon: <BankIcon /> },
  { label: 'お金の使い道', hash: '#budget', icon: <CoinsIcon /> },
  { label: '議会', icon: <GavelIcon /> },
  { label: '選挙', icon: <CheckSquareOffsetIcon /> },
]

/** 現在地から自治体を選ぶボタン。開いた時点の自動の判定で取れなかったときや、変えるときに使う */
function LocateButton({ entries, onPick }: { entries: MapEntry[]; onPick: (e: MapEntry) => void }) {
  const [state, setState] = React.useState<{ busy?: boolean; error?: string }>({})
  const locate = async () => {
    setState({ busy: true })
    try {
      const muni = await locateMunicipality()
      // 自治体コードは検査数字を足した6桁なので、先頭5桁で引く
      const hit = entries.find((e) => e.code.startsWith(muni))
      if (!hit) return setState({ error: '現在地の自治体は、まだ収録していません' })
      setState({})
      onPick(hit)
    } catch (e) {
      setState({ error: e instanceof LocateError ? e.message : '現在地を取得できませんでした' })
    }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" onClick={() => void locate()} disabled={state.busy} className="inline-flex items-center gap-1.5 rounded-full bg-background px-3.5 py-1.5 text-[13px] text-foreground transition-colors hover:bg-card disabled:opacity-60">
        <NavigationArrowIcon aria-hidden="true" className="size-4" />
        {state.busy ? '現在地を調べています…' : '現在地から選ぶ'}
      </button>
      {state.error ? (
        <span role="status" className="text-[13px] opacity-80">
          {state.error}
        </span>
      ) : null}
    </div>
  )
}

/**
 * うちのまち。選んだ自治体はブラウザに残し、サーバーで描く HTML では選ぶ前の形を出す（描いたあとに読む）。
 * まだ選んでいなければ開いた時点で現在地を調べて出し（保存はしない）、取れなければ最近見た自治体で代える
 */
function MyTown({ entries, featured }: HomeProps) {
  const byCode = React.useMemo(() => new Map(entries.map((e) => [e.code, e])), [entries])
  const [code, setCode] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [here, setHere] = React.useState<'locating' | 'found' | null>(null)
  React.useEffect(() => {
    const saved = loadHomeCode()
    const fallback = () => setCode(saved ?? loadRecent()[0]?.code ?? null)
    if (saved || !entries.length) return fallback()
    // まだ選んでいなければ、開いた時点で現在地を調べる。取れなければ最近見た自治体で代える
    let alive = true
    setHere('locating')
    locateMunicipality()
      .then((muni) => {
        const hit = entries.find((e) => e.code.startsWith(muni))
        if (!alive) return
        if (!hit) return (setHere(null), fallback())
        setCode(hit.code)
        setHere('found')
      })
      .catch(() => alive && (setHere(null), fallback()))
    return () => {
      alive = false
    }
  }, [entries])
  const town = code ? byCode.get(code) : undefined
  const vision = town && featured.find((f) => f.code === town.code)?.vision
  const pick = (e: MapEntry) => {
    saveHomeCode(e.code)
    setCode(e.code)
    setHere(null)
    setEditing(false)
  }
  return (
    <section aria-labelledby="town-h" className="rounded-[24px] bg-primary p-5 text-primary-foreground sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 id="town-h" className="text-sm opacity-80">
          うちのまち
          {town && !editing && here === 'found' ? <span className="ml-2 text-[12px]">· 現在地から</span> : null}
        </h2>
        {town && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className="rounded-full px-3 py-1 text-[13px] opacity-80 transition hover:bg-white/10 hover:opacity-100">
            変える
          </button>
        ) : null}
      </div>
      {town && !editing ? (
        <>
          <Link href={town.path} className="group mt-3 flex items-center gap-4">
            <Emblem code={town.code} name={town.name} className="size-14 rounded-2xl border-0 p-2 sm:size-16" />
            <span className="min-w-0 flex-1">
              <span className="block text-2xl font-bold sm:text-[28px]">{town.name}</span>
              {vision ? <span className="mt-0.5 block truncate text-sm opacity-80">{vision}</span> : null}
            </span>
            <ArrowRightIcon className="size-5 shrink-0 opacity-80 transition-transform group-hover:translate-x-1" />
          </Link>
          <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {townLinks(town.name).map((l) => (
              <li key={l.label}>
                {l.hash ? (
                  <Link href={`${town.path}${l.hash}`} className="flex h-full flex-col gap-2 rounded-2xl bg-background p-3.5 text-sm text-foreground transition-colors hover:bg-card [&_svg]:size-5 [&_svg]:text-accent-foreground">
                    {l.icon}
                    {l.label}
                  </Link>
                ) : (
                  <span className="flex h-full flex-col gap-2 rounded-2xl border border-dashed border-white/25 p-3.5 text-sm opacity-70 [&_svg]:size-5">
                    {l.icon}
                    <span>
                      {l.label}
                      <span className="ml-1.5 text-[11px]">準備中</span>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-3">
          <p className="text-xl font-bold sm:text-2xl">{here === 'locating' && !editing ? '現在地のまちを調べています…' : '住んでいるまちを選ぶ'}</p>
          {entries.length ? (
            <>
              <p className="mt-1 mb-4 text-sm opacity-80">選ぶと、そのまちの仕事とお金への入口がここに並びます。議会・選挙は準備中です。</p>
              <Picker entries={entries} onPick={pick} placeholder="自治体名で探す（例：品川）" />
              <LocateButton entries={entries} onPick={pick} />
            </>
          ) : (
            <p className="mt-1 text-sm opacity-80">今は自治体の一覧を読み込めません。少し時間をおいて開き直してください。</p>
          )}
          {editing ? (
            <button type="button" onClick={() => setEditing(false)} className="mt-3 text-[13px] opacity-80 hover:opacity-100">
              やめる
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}

/** 見られる情報の種類。収録の無いものは準備中として並べる */
function Topics({ entries, featured }: HomeProps) {
  const evaluated = featured.filter((f) => f.evalYear)
  const topics = [
    // 一覧を読めなかったときは件数を出さない（0件と取り違えないように）
    { title: '予算・決算', body: '何にいくら使ったか', meta: entries.length ? `${entries.length}の自治体` : undefined, href: INDEX_PATH, icon: <CoinsIcon /> },
    { title: '事業評価', body: '事業をどう振り返ったか', meta: evaluated.map((f) => f.name).join('・'), href: evaluated[0] ? `${evaluated[0].path}#y${evaluated[0].evalYear}` : undefined, icon: <ClipboardTextIcon /> },
    { title: '議会', body: '何を決めたか（議案・議決）', icon: <GavelIcon /> },
    { title: '選挙', body: '誰が立ち、どうなったか', icon: <CheckSquareOffsetIcon /> },
  ]
  return (
    <section aria-labelledby="topics-h" className="mt-12">
      <h2 id="topics-h" className="mb-4 text-lg font-bold">
        見られる情報
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {topics.map((t) => {
          const inner = (
            <>
              <span className="flex items-center justify-between text-muted-foreground [&_svg]:size-6">
                {t.icon}
                {t.href ? <ArrowRightIcon className="size-4!" /> : <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">準備中</span>}
              </span>
              <span className="mt-6 block text-base font-bold">{t.title}</span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">{t.body}</span>
              {t.meta ? <span className="mt-3 block text-xs text-primary">{t.meta}</span> : null}
            </>
          )
          return (
            <li key={t.title}>
              {t.href ? (
                <Link href={t.href} className="flex h-full flex-col rounded-2xl border bg-background p-4 transition-colors hover:bg-card sm:p-5">
                  {inner}
                </Link>
              ) : (
                <div className="flex h-full flex-col rounded-2xl border border-dashed bg-background p-4 opacity-70 sm:p-5">{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Updates({ entries }: { entries: MapEntry[] }) {
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const rows = UPDATES.flatMap((u) => {
    const e = byCode.get(u.code)
    return e ? [{ ...u, e }] : []
  }).slice(0, 5)
  if (!rows.length) return null
  return (
    <section aria-labelledby="updates-h" className="mt-12">
      <h2 id="updates-h" className="mb-4 text-lg font-bold">
        最近の更新
      </h2>
      <ul className="divide-y rounded-2xl border bg-background">
        {rows.map((u) => (
          <li key={`${u.code}-${u.text}`}>
            <Link href={u.e.path} className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-card">
              <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums">{u.date}</span>
              <Emblem code={u.code} name={u.e.name} className="size-7 rounded-lg p-1" />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{u.e.name}</span>
                <span className="ml-2 text-muted-foreground">{u.text}</span>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

const MORE = [
  { title: 'アシスタントに聞く', body: '予算・決算のことを AI に聞く', href: '/assistant' },
  { title: '自分の AI から使う', body: 'ChatGPT・Claude などにつなぐ（MCP）', href: `${DOCS}/mcp` },
  { title: 'API・データ', body: 'REST API とデータの読み方', href: DOCS },
  { title: '風土記について', body: '何を、どう集めているか', href: '/about' },
]

function More() {
  return (
    <nav aria-label="ほかの使い方" className="mt-12 grid gap-x-8 border-t sm:grid-cols-2">
      {MORE.map((m) => {
        const external = !m.href.startsWith('/')
        const cls = 'flex items-center gap-3 border-b py-4 transition-colors hover:text-primary'
        const inner = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{m.title}</span>
              <span className="block text-xs text-muted-foreground">{m.body}</span>
            </span>
            {external ? <ArrowSquareOutIcon aria-hidden="true" className="size-4 text-muted-foreground" /> : <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />}
          </>
        )
        return external ? (
          <a key={m.title} href={m.href} target="_blank" rel="noopener" className={cls}>
            {inner}
          </a>
        ) : (
          <Link key={m.title} href={m.href} className={cls}>
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}

export function Home(props: HomeProps) {
  return (
    <main id="home" className="mx-auto w-full max-w-4xl px-4 pt-10 pb-28 sm:px-8 sm:pt-16">
      <header className="mb-6">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em] sm:text-[32px]">うちのまち、なにしてる？</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">自治体が何を決めて、何にいくら使ったかを、出典つきで。</p>
      </header>
      <MyTown {...props} />
      <Topics {...props} />
      <Updates entries={props.entries} />
      <More />
      <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>© 2026 風土記</span>
        <span className="flex flex-wrap gap-x-5 gap-y-2">
          <a href={`${DOCS}/terms`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-foreground">
            利用規約
            <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
          </a>
          <a href={`${DOCS}/privacy`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-foreground">
            プライバシーポリシー
            <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
          </a>
          <a href={GITHUB} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-foreground">
            GitHub
            <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
          </a>
          <a href="mailto:support@fudoki.dev" className="hover:text-foreground">
            お問い合わせ
          </a>
        </span>
      </footer>
    </main>
  )
}
