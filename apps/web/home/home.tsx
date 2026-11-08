// ホーム（/）。アプリの入口として、自治体を探す・くわしく見られる自治体・アシスタント・収録の更新・自分の AI からの使い方を一枚に並べる。
// 見出しも含めてゴシック（明朝は使わない）。データは loader（pages/index.server.ts）が渡す自治体の要約だけで、画面では集計しない
import * as React from 'react'
import { Link, useRouter } from '@void/react'
import { ArrowRightIcon, ArrowUpRightIcon, BookOpenIcon, ChatsIcon, MagnifyingGlassIcon, PlugIcon, SparkleIcon } from '@phosphor-icons/react'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { StartForm } from '../chat/start-form'
import { useTypedPlaceholder } from '../chat/assistant-home'
import type { MapEntry } from '../jurisdiction/index-table'
import { formatYen, INDEX_PATH } from '../jurisdiction/types'
import { Mark } from '../nav/site-nav'

export interface Featured {
  code: string
  name: string
  path: string
  vision?: string
  /** 頁で見られる節の名前 */
  sections: string[]
}

export interface HomeProps {
  sitekey: string
  entries: MapEntry[]
  featured: Featured[]
}

const DOCS = 'https://docs.fudoki.dev'
const CHATGPT_PLUGIN = 'https://chatgpt.com/plugins/plugin_asdk_app_6ad87dc03a608191a13bba05310ea5d9'
const GITHUB = 'https://github.com/fudoki-hensansitu/fudoki'

/** 入力欄の placeholder に打っては消して見せる問いの例 */
const TYPED_EXAMPLES = ['品川区で一番大きな金額の事業は？', '世田谷区は子育てにいくら使っている？', '八王子市と町田市の1人あたりの歳出を比べて']

/** 最近ふえた収録（取り込みの PR から手で写したもの） */
const UPDATES: { date: string; code: string; text: string }[] = [
  { date: '11/8', code: '131211', text: 'R6年度 決算（事業別の説明書）' },
  { date: '11/7', code: '131199', text: 'R6年度 決算・5会計' },
  { date: '11/7', code: '132101', text: 'R6年度 決算' },
  { date: '11/7', code: '133086', text: 'R6年度 決算・特別会計3つ' },
  { date: '11/6', code: '132055', text: 'R6年度 決算' },
]

const emblem = (code: string) => `/jurisdictions/${code}/emblem.svg`
const matches = (e: MapEntry, q: string) => {
  const s = q.trim()
  return !s || e.name.includes(s) || e.path.includes(s.toLowerCase())
}

function Emblem({ code, className = 'size-10' }: { code: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl border bg-background p-1.5 ${className}`}>
      <img src={emblem(code)} alt="" loading="lazy" className="size-full object-contain" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
    </span>
  )
}

function SectionHead({ title, href, more }: { title: string; href?: string; more?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-bold tracking-[0.02em]">{title}</h2>
      {href && more ? (
        <Button variant="link" size="inline" nativeButton={false} render={<Link href={href} />} className="text-[13px]">
          {more}
          <ArrowRightIcon />
        </Button>
      ) : null}
    </div>
  )
}

function FindJurisdiction({ entries }: { entries: MapEntry[] }) {
  const router = useRouter()
  return (
    <Combobox autoHighlight items={entries} filter={(e: MapEntry, q: string) => matches(e, q)} itemToStringLabel={(e: MapEntry) => e.name} value={null} onValueChange={(e) => e && router.visit((e as MapEntry).path)}>
      <ComboboxInput showTrigger={false} aria-label="自治体名で探す" placeholder="自治体名で探す（例：品川）" className="h-14 rounded-full bg-background px-3 text-base shadow-[0_6px_24px_-12px_rgb(0_0_0/0.25)] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15">
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

function FeaturedCard({ f }: { f: Featured }) {
  return (
    <Link href={f.path} className="group flex h-full flex-col rounded-[var(--radius-card)] border bg-card p-5 transition-colors hover:border-primary sm:p-6">
      <div className="flex items-center gap-4">
        <Emblem code={f.code} className="size-16" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SparkleIcon className="size-3.5 text-primary" />
            くわしく見られます
          </p>
          <p className="mt-0.5 text-2xl font-bold">{f.name}</p>
          {f.vision ? <p className="mt-1 truncate text-sm text-muted-foreground">{f.vision}</p> : null}
        </div>
      </div>
      <ul className="mt-5 flex flex-wrap gap-2">
        {f.sections.map((s) => (
          <li key={s} className="rounded-full bg-accent px-3 py-1 text-[13px] text-accent-foreground">
            {s}
          </li>
        ))}
      </ul>
      <span className="mt-auto flex items-center gap-1 pt-5 text-sm text-primary">
        {f.name}のページを開く
        <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

function AskCard({ sitekey }: { sitekey: string }) {
  const placeholder = useTypedPlaceholder(TYPED_EXAMPLES)
  return (
    <div className="flex h-full flex-col rounded-[var(--radius-card)] border bg-card p-5 sm:p-6">
      <p className="flex items-center gap-2 text-base font-bold">
        <ChatsIcon className="size-5 text-muted-foreground" />
        アシスタントに聞く
      </p>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">予算・決算のことを、出典の頁つきで答えます。</p>
      <div className="mt-auto">
        <StartForm sitekey={sitekey} placeholder={placeholder} />
      </div>
    </div>
  )
}

function Tiles({ entries }: { entries: MapEntry[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map((e) => (
        <li key={e.code}>
          <Link href={e.path} className="flex items-center gap-3 rounded-xl border bg-background p-2.5 transition-colors hover:border-primary hover:bg-accent">
            <Emblem code={e.code} className="size-9" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{e.name}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">歳出 {formatYen(e.yen)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Updates({ entries }: { entries: MapEntry[] }) {
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const rows = UPDATES.flatMap((u) => {
    const e = byCode.get(u.code)
    return e ? [{ ...u, e }] : []
  })
  if (!rows.length) return null
  return (
    <ul className="divide-y rounded-[var(--radius-card)] border bg-background">
      {rows.map((u) => (
        <li key={`${u.code}-${u.text}`}>
          <Link href={u.e.path} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent">
            <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">{u.date}</span>
            <Emblem code={u.code} className="size-7 rounded-lg p-1" />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{u.e.name}</span>
              <span className="text-muted-foreground">　{u.text}を追加</span>
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

const CONNECT = [
  { title: 'ChatGPT で使う', body: 'plugin を追加すると、会話の中で調べられます', href: CHATGPT_PLUGIN, icon: <PlugIcon /> },
  { title: 'Claude などで使う（MCP）', body: '接続先の URL を登録するだけ。登録はいりません', href: `${DOCS}/mcp`, icon: <PlugIcon /> },
  { title: 'API・データの説明', body: 'REST API と、データの読み方', href: DOCS, icon: <BookOpenIcon /> },
]

export function Home({ sitekey, entries, featured }: HomeProps) {
  const municipalities = React.useMemo(() => entries.filter((e) => e.kind !== '都道府県'), [entries])
  const tiles = React.useMemo(() => [...municipalities].sort((a, b) => b.yen - a.yen).slice(0, 12), [municipalities])
  return (
    <main id="home" className="mx-auto w-full max-w-5xl px-4 pt-12 pb-28 sm:px-8 sm:pt-16">
      <header className="mx-auto max-w-2xl text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent">
          <Mark className="size-7 text-primary" />
        </div>
        <h1 className="mt-5 text-[28px] leading-[1.35] font-bold tracking-[0.02em] sm:text-4xl">うちのまち、なにしてる？</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          自治体が何を決めて、何にいくら使ったか。
          <br className="sm:hidden" />
          {municipalities.length ? `${entries.length}の自治体の予算・決算を、出典つきで。` : '予算・決算を、出典つきで。'}
        </p>
        <div className="mt-7 text-left">{entries.length ? <FindJurisdiction entries={entries} /> : null}</div>
      </header>

      <section className="mt-14 grid gap-4 md:grid-cols-2" aria-label="はじめる">
        {featured.map((f) => (
          <FeaturedCard key={f.code} f={f} />
        ))}
        <AskCard sitekey={sitekey} />
      </section>

      {tiles.length ? (
        <section className="mt-14" aria-label="自治体から見る">
          <SectionHead title="自治体から見る" href={INDEX_PATH} more={`すべての自治体（${entries.length}）`} />
          <Tiles entries={tiles} />
        </section>
      ) : null}

      <div className="mt-14 grid gap-10 md:grid-cols-[1.2fr_1fr] md:gap-8">
        <section aria-label="最近ふえたデータ">
          <SectionHead title="最近ふえたデータ" />
          <Updates entries={entries} />
        </section>
        <section aria-label="自分の AI から使う">
          <SectionHead title="自分の AI から使う" />
          <ul className="grid gap-2">
            {CONNECT.map((c) => (
              <li key={c.title}>
                <a href={c.href} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-xl border bg-background p-3.5 transition-colors hover:border-primary hover:bg-accent [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
                  {c.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{c.title}</span>
                    <span className="block text-xs text-muted-foreground">{c.body}</span>
                  </span>
                  <ArrowUpRightIcon className="size-4! text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-xs text-muted-foreground">
        <span>© 2026 風土記</span>
        <nav aria-label="決まりごと" className="flex flex-wrap gap-x-5 gap-y-2">
          <a href={`${DOCS}/terms`} className="hover:text-foreground">
            利用規約
          </a>
          <a href={`${DOCS}/privacy`} className="hover:text-foreground">
            プライバシーポリシー
          </a>
          <a href={GITHUB} className="hover:text-foreground">
            GitHub
          </a>
          <a href="mailto:support@fudoki.dev" className="hover:text-foreground">
            お問い合わせ
          </a>
        </nav>
      </footer>
    </main>
  )
}
