// 試作: はじめて開いたときの流れ（marketingskills の onboarding skill に沿う）。
// 1 ホームに出すまちを選ぶ（名前／現在地。飛ばせる）→ 2 選んだまちの要点を一枚で見せる（価値の瞬間）→ ホームに入ったら小さなチェックリスト（1つ目は済み、閉じられる）。
// まちを探す（開くだけ）は上に残す。「住んでいるまち」を最初に聞くのは怖く見えるので、選ぶのは任意にする（2026-11-11 yuito）。文言は何が起きるかをそのまま書き、キャッチーにしない
import * as React from 'react'
import { ArrowRightIcon, CheckIcon, MagnifyingGlassIcon, NavigationArrowIcon, XIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Logo } from '../nav/site-nav'
import { Picker as TownPicker } from '../home/home'
import { LocateError, locateMunicipality } from '../home/locate'
import type { MapEntry } from '../jurisdiction/index-table'
import './onboarding.css'

/** 上の段: まちを探す。選んだまちの頁へ移るだけで、うちのまちには入れない */
export function FindTown({ entries }: { entries: MapEntry[] }) {
  const { visit } = useRouter()
  return (
    <section className="ob-rise rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7">
      <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
        <MagnifyingGlassIcon className="size-6 opacity-80" aria-hidden="true" />
        まちを探す
      </h2>
      <p className="mt-1 mb-4 text-sm opacity-80">収録しているまちの予算・決算・事業を開きます。</p>
      <TownPicker entries={entries} onPick={(e) => visit(e.path)} placeholder="自治体名で探す（例：品川）" />
    </section>
  )
}

type Locate = { busy?: boolean; error?: string; hit?: MapEntry }

/** 1 ホームに出すまちを選ぶ札。step は「1 / 2」の表示。onSkip（あとで）か onCancel（やめる）を出す */
export function AskCard({ entries, onPick, onSkip, onCancel, step }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; onSkip?: () => void; onCancel?: () => void; step?: [number, number] }) {
  const [mode, setMode] = React.useState<'idle' | 'pick' | 'locate'>('idle')
  const [loc, setLoc] = React.useState<Locate>({})
  const locate = async () => {
    setMode('locate')
    setLoc({ busy: true })
    try {
      const muni = await locateMunicipality()
      // 自治体コードは検査数字を足した6桁なので、先頭5桁で引く
      const hit = entries.find((e) => e.code.startsWith(muni))
      setLoc(hit ? { hit } : { error: '現在地のまちは、まだ収録していません' })
    } catch (e) {
      setLoc({ error: e instanceof LocateError ? e.message : '現在地を取得できませんでした' })
    }
  }
  return (
    <section className="ob-rise rounded-[24px] border bg-background p-5 sm:p-7" style={{ animationDelay: '.12s' }}>
      {step ? <Steps at={step[0]} of={step[1]} /> : null}
      <h2 className="text-[19px] leading-snug font-bold sm:text-[22px]">ホームに出すまちを選ぶ</h2>
      <p className="mt-1.5 text-[14px] text-muted-foreground">選んだまちの予算と事業が、開くたびにこのホームに並びます。あとから変えられます。</p>
      <div className="mt-5">
        {mode === 'idle' ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Choice icon={<MagnifyingGlassIcon />} title="名前で選ぶ" note="自治体名を入れます" onClick={() => setMode('pick')} />
            <Choice icon={<NavigationArrowIcon />} title="現在地から選ぶ" note="位置は保存しません" onClick={() => void locate()} />
          </div>
        ) : (
          <div key={mode} className="ob-swap">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[13px] font-bold">{mode === 'pick' ? '名前で選ぶ' : '現在地から選ぶ'}</span>
              <button type="button" onClick={() => (setMode('idle'), setLoc({}))} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                <XIcon className="size-3.5" />
                もどる
              </button>
            </div>
            {mode === 'pick' ? (
              <TownPicker entries={entries} onPick={onPick} placeholder="自治体名（例：品川）" />
            ) : (
              <LocateResult loc={loc} onPick={onPick} onRetry={() => void locate()} onPickByName={() => setMode('pick')} />
            )}
          </div>
        )}
      </div>
      {onSkip || onCancel ? (
        <button type="button" onClick={onSkip ?? onCancel} className="mt-4 text-[13px] text-muted-foreground hover:text-foreground">
          {onSkip ? 'あとで' : 'やめる'}
        </button>
      ) : null}
    </section>
  )
}

/** 何歩目か。点と「1 / 2」 */
export function Steps({ at, of }: { at: number; of: number }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
      <span className="flex gap-1">
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out', i < at ? 'w-5 bg-primary' : 'w-1.5 bg-border')} />
        ))}
      </span>
      <span className="tabular-nums">
        {at} / {of}
      </span>
    </div>
  )
}

function Choice({ icon, title, note, onClick }: { icon: React.ReactNode; title: string; note: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3.5 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.98] motion-reduce:transition-none"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-background text-muted-foreground [&_svg]:size-[18px]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">{title}</span>
        <span className="block text-[12px] text-muted-foreground">{note}</span>
      </span>
      <ArrowRightIcon className="size-4 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </button>
  )
}

/** 現在地の結果。当たったら「このまちにする」で確かめてから決める（勝手に決めない） */
function LocateResult({ loc, onPick, onRetry, onPickByName }: { loc: Locate; onPick: (e: MapEntry) => void; onRetry: () => void; onPickByName: () => void }) {
  if (loc.busy)
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3.5 text-[14px]">
        <span className="ob-ping relative grid size-9 place-items-center rounded-full bg-background text-primary">
          <NavigationArrowIcon className="size-[18px]" />
        </span>
        現在地のまちを調べています…
      </div>
    )
  if (loc.hit)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3.5">
        <span className="min-w-0 flex-1 text-[14px]">
          現在地は <b className="text-[16px]">{loc.hit.name}</b> です
        </span>
        <button type="button" onClick={() => onPick(loc.hit!)} className="rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none">
          このまちを選ぶ
        </button>
      </div>
    )
  return (
    <div role="status" className="rounded-2xl bg-secondary px-4 py-3.5 text-[14px]">
      <p>{loc.error}</p>
      <div className="mt-2 flex gap-3 text-[13px]">
        <button type="button" onClick={onRetry} className="text-primary hover:underline">
          もう一度
        </button>
        <button type="button" onClick={onPickByName} className="text-primary hover:underline">
          名前で選ぶ
        </button>
      </div>
    </div>
  )
}

const SKIP = 'fudoki:proto-onboarding-skipped'

/** うちのまちを決めていないときのホーム。reveal があれば（まちを選んだ直後）2歩目の要点を出す */
export function Empty({ entries, onPick, reveal }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; reveal: React.ReactNode }) {
  const [skipped, setSkipped] = React.useState(false)
  React.useEffect(() => {
    try {
      setSkipped(localStorage.getItem(SKIP) === '1')
    } catch {
      // 読めなければ毎回出す
    }
  }, [])
  const skip = () => {
    setSkipped(true)
    try {
      localStorage.setItem(SKIP, '1')
    } catch {
      // 保存できなくても、この頁では閉じる
    }
  }
  return (
    <>
      <header className="ob-rise mb-6">
        {/* スマホはサイドバーが無くロゴが見えないので、見出しの上に出す。PC はサイドバーの頭にある */}
        <Logo className="mb-5 block h-7 w-auto text-primary md:hidden" />
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em] sm:text-[32px]">まちのお金、何に使ってる？</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">自治体が何にいくら使い、どう振り返ったかを、事業ごとに見られます。</p>
      </header>
      <FindTown entries={entries} />
      <div className="mt-4">
        {reveal ? (
          <div key="reveal">{reveal}</div>
        ) : skipped ? (
          <button type="button" onClick={() => setSkipped(false)} className="inline-flex items-center gap-1.5 text-[14px] text-primary hover:underline">
            ホームに出すまちを選ぶ
            <ArrowRightIcon className="size-4" />
          </button>
        ) : (
          <AskCard entries={entries} onPick={onPick} onSkip={skip} step={[1, 2]} />
        )}
      </div>
    </>
  )
}

export type CheckItem = { key: string; label: string; href: string }
const CHECK = 'fudoki:proto-checklist'
type CheckState = { done: string[]; closed?: boolean }

/** ホームのチェックリスト。まちを選んだときに start() で始め、1つ目（まちを選ぶ）は済みにしておく */
export const startChecklist = () => {
  try {
    localStorage.setItem(CHECK, JSON.stringify({ done: ['town'] } satisfies CheckState))
  } catch {
    // 保存できなければ出さない
  }
}

export function Checklist({ items }: { items: CheckItem[] }) {
  const [st, setSt] = React.useState<CheckState | null>(null)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(CHECK)
      setSt(raw ? (JSON.parse(raw) as CheckState) : null)
    } catch {
      setSt(null)
    }
  }, [])
  const save = (next: CheckState) => {
    setSt(next)
    try {
      localStorage.setItem(CHECK, JSON.stringify(next))
    } catch {
      // この頁では反映する
    }
  }
  if (!st || st.closed) return null
  const all = [{ key: 'town', label: 'ホームに出すまちを選ぶ', href: '' }, ...items]
  const n = all.filter((x) => st.done.includes(x.key)).length
  const complete = n === all.length
  return (
    <section className="ob-rise mb-4 rounded-2xl border bg-background p-4 sm:p-5" aria-label="はじめにやること">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-[15px] font-bold">{complete ? 'ひととおり見ました' : 'はじめにやること'}</h2>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {n} / {all.length}
        </span>
        <button type="button" onClick={() => save({ ...st, closed: true })} aria-label="閉じる" className="text-muted-foreground hover:text-foreground">
          <XIcon className="size-4" />
        </button>
      </div>
      <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-secondary">
        <span className="block h-full origin-left rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${(n / all.length) * 100}%` }} />
      </span>
      {complete ? null : (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {all.map((x) => {
            const done = st.done.includes(x.key)
            const body = (
              <>
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-200', done ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                  {done ? <CheckIcon className="size-3" weight="bold" /> : null}
                </span>
                <span className={cn('flex-1', done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{x.label}</span>
                {done ? null : <ArrowRightIcon className="size-3.5 text-muted-foreground" />}
              </>
            )
            return (
              <li key={x.key}>
                {done || !x.href ? (
                  <span className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[14px]">{body}</span>
                ) : (
                  <Link href={x.href} onClick={() => save({ ...st, done: [...st.done, x.key] })} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[14px] transition-colors hover:bg-secondary">
                    {body}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
