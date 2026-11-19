// 「気になる」のタブ。問いの札を1列に流し、押すとその問いと作り置きの答えから AI との会話が始まる。
// 札は答えの冒頭だけを出し、下を薄くして続きがあると見せる（全文は会話で読む）。分野のチップで分野ごとのフィードに切り替える（?field=）。チップはスクロールしても上に残す
import * as React from 'react'
import { ArrowRightIcon, RobotIcon } from '@phosphor-icons/react'
import { Markdown } from '../../chat/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { Title } from '@/components/ui/title'
import { cn } from '@/lib/utils'
import { FieldIcon } from '../../home/parts'
import { Chip } from '../chip'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../domains'
import { feedOf } from '.'
import { loadInterests } from '../../home/towns'
import type { Question, QuestionFeed } from './types'

/** 分野をまたぐ問いは、分野の分け方と同じ「その他」に入れる */
const FRAMES = [...DOMAIN_FRAMES, OTHER_FRAME]
const FIELD_NAME = new Map(FRAMES.map((f) => [f.id, f.name]))

/** 分野のバッジ。事業の頁の分野と同じ形 */
function Category({ field }: { field?: string }) {
  return (
    <span className="flex">
      <Chip>
        <FieldIcon id={field ?? OTHER_FRAME.id} />
        {FIELD_NAME.get(field ?? OTHER_FRAME.id)}
      </Chip>
    </span>
  )
}

function QuestionCard({ q, onOpen }: { q: Question; onOpen: (q: Question) => void }) {
  // 答えが枠に収まらないときだけ下を薄くする（短い答えの最後の行まで薄くしない）
  const body = React.useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = React.useState(true)
  React.useEffect(() => {
    const el = body.current
    if (!el) return
    const ro = new ResizeObserver(() => setClipped(el.scrollHeight > el.clientHeight + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <article className="group/q relative flex flex-col gap-3 border-b py-6 first:pt-2">
      {/* 札の全体を押せるようにする。答えの冒頭のリンクは会話の中で押す */}
      <button type="button" onClick={() => onOpen(q)} className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="sr-only">{q.q}</span>
      </button>
      <Category field={q.field} />
      <Title size="h2" as="h3">{q.q}</Title>
      {q.big ? (
        <p className="flex flex-col gap-1">
          <Title size="h3" as="span" className="tabular-nums text-primary">{q.big.value}</Title>
          <span className="text-sm text-muted-foreground">{q.big.note}</span>
        </p>
      ) : null}
      <div ref={body} aria-hidden="true" inert className={cn('max-h-36 overflow-hidden text-base leading-relaxed', clipped && 'q-fade')}>
        <Markdown text={q.answer} />
      </div>
    </article>
  )
}

export function QuestionFeedView({ feed, onOpen, onAsk }: { feed: QuestionFeed | undefined; onOpen: (q: Question) => void; /** フィードに無いことを聞く欄を開く */ onAsk: () => void }) {
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
  // 興味のある分野（ホームのオンボーディングでレシートから選んだもの）。すべてのフィードはその分野の問いから並べる（2026-11-19 yuito）
  const [interests, setInterests] = React.useState<string[]>([])
  React.useEffect(() => setInterests(loadInterests()), [])
  if (!feed) return <FeedSkeleton />
  const fields = FRAMES.filter((f) => feed.questions.some((q) => (q.field ?? OTHER_FRAME.id) === f.id))
  const items = feedOf(feed, field, interests)
  const chip = (on: boolean) => cn('inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-4 text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-card')
  const ask = (
    <button type="button" onClick={onAsk} className="flex items-center gap-4 rounded-xl border bg-card p-5 text-left">
      <RobotIcon className="size-6 shrink-0 text-primary" aria-hidden="true" />
      <Title size="h3" as="span" className="min-w-0 flex-1">ほかのことを聞く</Title>
      <ArrowRightIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
    </button>
  )
  // 問いをまだ作っていないまちは、見出しも分野も出さず質問の入口だけを置く
  if (!feed.questions.length) return <div className="mx-auto max-w-[640px]">{ask}</div>
  return (
    <section aria-labelledby="q-feed-title" className="mx-auto flex max-w-[640px] flex-col gap-4">
      {/* 何が並んでいるかを先に言う（数字の大きい札がいきなり並ぶと驚く） */}
      <div className="flex flex-col gap-2">
        <Title size="h1" as="h2" id="q-feed-title">気になること</Title>
        <p className="text-base leading-relaxed text-muted-foreground">住民が気になりそうな問いに、予算書・決算書の数字で答えています。押すと、その答えから AI に続けて聞けます。</p>
      </div>
      <div role="group" aria-label="分野" className="sticky top-0 z-20 -mx-4 flex gap-2 overflow-x-auto bg-background px-4 py-2 [scrollbar-width:none]">
        <button type="button" aria-pressed={!field} onClick={() => pick(null)} className={chip(!field)}>すべて</button>
        {fields.map((f) => (
          <button key={f.id} type="button" aria-pressed={field === f.id} onClick={() => pick(f.id)} className={chip(field === f.id)}>
            <FieldIcon id={f.id} className="size-4" />
            {f.name}
          </button>
        ))}
      </div>
      <div className="flex flex-col">
        {items.map((q) => <QuestionCard key={q.id} q={q} onOpen={onOpen} />)}
      </div>
      {/* フィードを読み終えた人に、並んでいない問いを自分で聞く入口を出す */}
      {ask}
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
