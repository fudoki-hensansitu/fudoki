// 試作: 事業をさがす。言葉で全部のまちの決算の内訳を引き、まちごとに並べる。まちは自治体コードの順で、金額の順位は付けない
import * as React from 'react'
import { ArrowRightIcon, MagnifyingGlassIcon, StarIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem } from '../home/home'
import { reiwa } from '../jurisdiction/types'
import { Amt } from './parts'
import { useSaved } from './saved'
import type { Props } from '../pages/prototype/search.server'

const EXAMPLES = ['給食', 'プール', '保育', '図書館', '防災', '公園', 'DX']

export function Search({ q, towns, trackable, failed }: Props) {
  const { visit } = useRouter()
  const [text, setText] = React.useState(q)
  const saved = useSaved()
  React.useEffect(() => setText(q), [q])
  const go = (v: string) => v.trim() && visit(`/prototype/search?q=${encodeURIComponent(v.trim())}`)
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-28 sm:px-8 sm:pt-12">
      <header className="mb-5">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em]">事業をさがす</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">言葉で、収録しているまちの決算の中身を引きます。</p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          go(text)
        }}
      >
        <InputGroup className="h-12 bg-background">
          <InputGroupAddon>
            <MagnifyingGlassIcon className="size-5" />
          </InputGroupAddon>
          <InputGroupInput value={text} onChange={(e) => setText(e.target.value)} placeholder="例：給食、プール、保育" aria-label="事業をさがす" className="text-base" />
        </InputGroup>
      </form>
      <p className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((x) => (
          <Link key={x} href={`/prototype/search?q=${encodeURIComponent(x)}`} className={cn('rounded-full px-3 py-1 text-[13px] transition-colors', x === q ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent')}>
            {x}
          </Link>
        ))}
      </p>

      {failed ? <p className="mt-8 text-sm text-muted-foreground">今は検索できません。少し時間をおいてやり直してください。</p> : null}
      {q && !failed ? (
        <>
          <p className="mt-8 mb-3 text-[13px] text-muted-foreground">
            「{q}」が名前に入る内訳が <b className="text-foreground tabular-nums">{towns.length}</b> のまちにありました。まちごとに、決算がある新しい年度の分です。内訳は入れ子なので、金額は足していません。
          </p>

          {trackable.length ? (
            <section className="mb-6 rounded-2xl border bg-card p-4 sm:p-5">
              <h2 className="text-[15px] font-bold">年度をまたいで追える事業</h2>
              <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">☆を押すと「追っている事業」に入り、年度ごとの金額を並べて見られます。</p>
              <ul className="divide-y">
                {trackable.map((t) => {
                  const on = saved.has(t.projectId)
                  return (
                    <li key={t.projectId} className="flex items-center gap-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => saved.toggle({ projectId: t.projectId, code: t.code, town: t.town, name: t.name })}
                        aria-pressed={on}
                        aria-label={on ? `${t.name}を追うのをやめる` : `${t.name}を追う`}
                        className="grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-150 ease-out active:scale-90 hover:bg-secondary"
                      >
                        <StarIcon weight={on ? 'fill' : 'regular'} className={cn('size-5', on ? 'text-primary' : 'text-muted-foreground')} />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.town}・{t.years.map((y) => reiwa(y).replace('年度', '')).join('、')}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              {saved.list.length ? (
                <Link href="/prototype/saved" className="mt-2 inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
                  追っている事業（{saved.list.length}）を見る <ArrowRightIcon className="size-3.5" />
                </Link>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {towns.map((t) => (
              <section key={t.code} className="flex flex-col rounded-2xl border bg-background p-4">
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
                <Link href={`${t.path}/${t.year}/settlement`} className="mt-2 inline-flex items-center gap-1 self-start text-[13px] text-primary hover:underline">
                  {t.name}の決算を見る <ArrowRightIcon className="size-3.5" />
                </Link>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </main>
  )
}
