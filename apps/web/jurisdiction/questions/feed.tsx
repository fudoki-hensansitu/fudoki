// 「気になる」のタブ。問いの札を1列に流し、押すとその問いと作り置きの答えから AI との会話が始まる。
// 札は答えの冒頭だけを出し、下を薄くして続きがあると見せる（全文は会話で読む）。分野のチップで分野ごとのフィードに切り替える（?field=）
import * as React from 'react'
import { CityIcon } from '@phosphor-icons/react'
import { Markdown } from '../../chat/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { Title } from '@/components/ui/title'
import { cn } from '@/lib/utils'
import { FieldIcon } from '../../home/parts'
import { DOMAIN_FRAMES } from '../domains'
import { feedOf } from '.'
import type { Question, QuestionFeed } from './types'

const FIELD_NAME = new Map(DOMAIN_FRAMES.map((f) => [f.id, f.name]))

/** 分野をまたぐ問いのカテゴリ */
const WHOLE = 'まち全体'

function Category({ field }: { field?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {field ? <FieldIcon id={field} className="size-4" /> : <CityIcon className="size-4" aria-hidden="true" />}
      {field ? FIELD_NAME.get(field) : WHOLE}
    </span>
  )
}

function QuestionCard({ q, onOpen }: { q: Question; onOpen: (q: Question) => void }) {
  return (
    <article className="group/q relative flex flex-col gap-3 border-b py-6 first:pt-2">
      {/* 札の全体を押せるようにする。答えの冒頭のリンクは会話の中で押す */}
      <button type="button" onClick={() => onOpen(q)} className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="sr-only">{q.q}</span>
      </button>
      <Category field={q.field} />
      <Title size="h3" className="text-balance transition-colors group-has-[button:hover]/q:text-primary">{q.q}</Title>
      {q.big ? (
        <p className="flex flex-col gap-1">
          <Title size="h2" as="span" className="tabular-nums text-primary">{q.big.value}</Title>
          <span className="text-sm text-muted-foreground">{q.big.note}</span>
        </p>
      ) : null}
      <div aria-hidden="true" inert className="q-fade max-h-36 overflow-hidden text-base leading-relaxed">
        <Markdown text={q.answer} />
      </div>
    </article>
  )
}

export function QuestionFeedView({ feed, onOpen }: { feed: QuestionFeed | undefined; onOpen: (q: Question) => void }) {
  // 分野は ?field= に持つ（ホームのレシートの分野の行から、その分野のフィードを開く）
  const [field, setField] = React.useState<string | null>(null)
  React.useEffect(() => {
    const f = new URLSearchParams(location.search).get('field')
    if (f && FIELD_NAME.has(f)) setField(f)
  }, [])
  const pick = (f: string | null) => {
    setField(f)
    const url = new URL(location.href)
    if (f) url.searchParams.set('field', f)
    else url.searchParams.delete('field')
    history.replaceState(history.state, '', url)
  }
  if (!feed) return <FeedSkeleton />
  const fields = DOMAIN_FRAMES.filter((f) => feed.questions.some((q) => q.field === f.id))
  const items = feedOf(feed, field)
  const chip = (on: boolean) => cn('inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-4 text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-card')
  return (
    <section aria-label="気になる問い" className="mx-auto flex max-w-[640px] flex-col gap-4">
      <div role="tablist" aria-label="分野" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <button type="button" role="tab" aria-selected={!field} onClick={() => pick(null)} className={chip(!field)}>すべて</button>
        {fields.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={field === f.id} onClick={() => pick(f.id)} className={chip(field === f.id)}>
            <FieldIcon id={f.id} className="size-4" />
            {f.name}
          </button>
        ))}
      </div>
      <div className="flex flex-col">
        {items.map((q) => <QuestionCard key={q.id} q={q} onOpen={onOpen} />)}
      </div>
    </section>
  )
}

function FeedSkeleton() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-3" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-9 rounded-full" />
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}
