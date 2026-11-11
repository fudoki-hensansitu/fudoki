// 事業を検索。言葉で全部のまち（または1つのまち）の決算の内訳を引き、まちごとに並べる。まちは自治体コードの順で、金額の順位は付けない
import * as React from 'react'
import { ArrowRightIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem } from '../home/town-picker'
import { reiwa } from '../jurisdiction/types'
import { Amt } from '../home/parts'
import { useMyTown } from '../home/towns'
import type { Props, TownHits } from '../pages/search.server'

export const EXAMPLES = ['給食', 'プール', '保育', '図書館', '防災', '公園', 'DX']

export const searchHref = (q: string, code?: string | null) => `/search?q=${encodeURIComponent(q)}${code ? `&code=${code}` : ''}`

/** 事業を検索する欄。サイドバー・ホーム・この頁で同じものを使う */
export function ProjectSearchBox({ q = '', code, placeholder, className, size = 'lg' }: { q?: string; code?: string | null; placeholder?: string; className?: string; size?: 'lg' | 'md' }) {
  const { visit } = useRouter()
  const [text, setText] = React.useState(q)
  React.useEffect(() => setText(q), [q])
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) visit(searchHref(text.trim(), code))
      }}
    >
      <InputGroup className={cn('bg-background', size === 'lg' ? 'h-12' : 'h-10')}>
        <InputGroupAddon>
          <MagnifyingGlassIcon className="size-5" />
        </InputGroupAddon>
        <InputGroupInput maxLength={48} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? '例：給食、プール、保育'} aria-label="事業を検索" className="text-base" />
      </InputGroup>
    </form>
  )
}

function TownCard({ t }: { t: TownHits }) {
  return (
    <section className="flex flex-col rounded-2xl border bg-background p-4">
      <div className="mb-2 flex items-center gap-2">
        <Emblem code={t.code} name={t.name} className="size-8 rounded-lg p-1" />
        <span className="flex-1 font-bold">{t.name}</span>
        <span className="text-xs text-muted-foreground">
          {reiwa(t.year)} 決算・{t.count}件
        </span>
      </div>
      <ul className="flex-1 divide-y">
        {t.hits.map((h, i) => (
          <li key={i} className="flex items-baseline gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug">{h.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{h.where}</span>
            </span>
            <Amt yen={h.yen} className="text-sm font-medium" />
          </li>
        ))}
      </ul>
      <Link href={t.code.slice(2, 5) === '000' ? t.path : `${t.path}/${t.year}/settlement`} className="mt-2 inline-flex items-center gap-1 self-start text-[13px] text-primary hover:underline">
        {t.name}の決算を見る <ArrowRightIcon className="size-3.5" />
      </Link>
    </section>
  )
}

export function Search({ q, code, townName, towns, capped, failed }: Props) {
  const { town } = useMyTown()
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-20 pb-28 sm:px-8">
      <header className="mb-5">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em]">事業を検索</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">言葉で、決算の中身を引きます。ほかのまちが同じことにいくら使っているかも見られます。</p>
      </header>
      <ProjectSearchBox q={q} code={code} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* 範囲: 全部のまち／うちのまち */}
        <div className="flex gap-1 rounded-full bg-secondary p-1 text-[13px]" role="group" aria-label="探す範囲">
          <Link href={searchHref(q || EXAMPLES[0]!)} aria-current={!code ? 'page' : undefined} className={cn('rounded-full px-3 py-1 transition-colors', !code ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            全部のまち
          </Link>
          {town || code ? (
            <Link href={searchHref(q || EXAMPLES[0]!, code ?? town?.code)} aria-current={code ? 'page' : undefined} className={cn('rounded-full px-3 py-1 transition-colors', code ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {townName ?? town?.name}だけ
            </Link>
          ) : null}
        </div>
        {EXAMPLES.map((x) => (
          <Link key={x} href={searchHref(x, code)} className={cn('rounded-full px-3 py-1 text-[13px] transition-colors', x === q ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent')}>
            {x}
          </Link>
        ))}
      </div>

      {failed ? <p className="mt-8 text-sm text-muted-foreground">今は検索できません。少し時間をおいてやり直してください。</p> : null}
      {q && !failed ? (
        <>
          <p className="mt-8 mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {code ? (
              <>
                {townName}で「{q}」が名前に入る内訳です。
                <Link href={searchHref(q)} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                  <XIcon className="size-3" />
                  ほかのまちも見る
                </Link>
              </>
            ) : (
              <>
                「{q}」が名前に入る内訳が <b className="text-foreground tabular-nums">{towns.length}</b> のまちにありました。
              </>
            )}
            <span>まちごとに、当たる内訳がある新しい年度の分です。内訳は入れ子なので、金額は足していません。</span>
            {capped ? <span>広い言葉なので、金額の大きい内訳から年度ごとに {(5000).toLocaleString('ja-JP')} 件までを見ています。ほかにも当たるまちがあります。</span> : null}
          </p>
          {towns.length ? (
            <div className={cn('grid gap-3', !code && 'md:grid-cols-2')}>
              {towns.map((t) => (
                <TownCard key={t.code} t={t} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">当たる内訳はありませんでした。</p>
          )}
        </>
      ) : null}
    </main>
  )
}
