// はじめて開いたときの流れ（marketingskills の onboarding skill に沿う）。
// 1 住んでいるまちを選ぶ（名前／現在地）→ 2 選んだまちの要点を一枚で見せる（価値の瞬間）→ ツアー（tour.tsx）→ チェックリスト（1つ目は済み、閉じられる）。
// ほかのまちを見る導線として、まちの検索はホームに常に出す。「ホーム」「見るまち」のような通じない言葉は使わない（2026-11-11 yuito）。文言は何が起きるかをそのまま書き、キャッチーにしない
import * as React from 'react'
import { ArrowRightIcon, CheckIcon, NavigationArrowIcon, XIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Mark } from '../nav/site-nav'
import { Picker as TownPicker } from './town-picker'
import { LocateError, locateMunicipality } from './locate'
import type { MapEntry } from '../jurisdiction/index-table'
import './onboarding.css'

type Locate = { busy?: boolean; error?: string; hit?: MapEntry }

/** 住んでいるまちを聞く札（はじめての流れの 1 / 2）。名前の入力欄をはじめから出し、下に「現在地から選ぶ」。ホームの「リセット」のあともここに戻る */
export function AskTown({ entries, onPick, again }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; again?: boolean }) {
  const [loc, setLoc] = React.useState<Locate | null>(null)
  const locate = async () => {
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
    <section className={'ob-rise rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7'}>
      {again ? null : <Steps at={1} of={2} onBrand />}
      <h2 className="mb-4 text-[20px] leading-snug font-bold sm:text-[24px]">住んでいるまちを選ぶ</h2>
      {/* 一覧を読めなかったときに「未収録」と誤って伝えないよう、検索と現在地を出さない */}
      {entries.length ? (
        <>
          {/* PC は名前の欄と「現在地から選ぶ」を1行に並べ、スマホは縦に積む */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <TownPicker entries={entries} onPick={onPick} placeholder="自治体名で探す（例：品川）" />
            </div>
            <button
              type="button"
              onClick={() => void locate()}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-foreground/15 px-5 text-[15px] font-bold text-brand-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-brand-foreground/25 active:scale-[0.97] motion-reduce:transition-none"
            >
              <NavigationArrowIcon className="size-4" />
              現在地から選ぶ
            </button>
          </div>
          {loc ? (
            <div className="ob-swap mt-3 text-foreground">
              <LocateResult loc={loc} onPick={onPick} onRetry={() => void locate()} onClose={() => setLoc(null)} />
            </div>
          ) : (
            <p className="mt-3 text-[12px] opacity-75">位置は保存しません</p>
          )}
        </>
      ) : (
        <p className="text-[14px] opacity-80">今は自治体の一覧を読み込めません。少し時間をおいて開き直してください。</p>
      )}
    </section>
  )
}

/** 何歩目か。点と「1 / 2」 */
export function Steps({ at, of, onBrand }: { at: number; of: number; onBrand?: boolean }) {
  return (
    <div className={cn('mb-3 flex items-center gap-2 text-[12px]', onBrand ? 'opacity-80' : 'text-muted-foreground')}>
      <span className="flex gap-1">
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out', i < at ? cn('w-5', onBrand ? 'bg-brand-foreground' : 'bg-primary') : cn('w-1.5', onBrand ? 'bg-brand-foreground/30' : 'bg-border'))} />
        ))}
      </span>
      <span className="tabular-nums">
        {at} / {of}
      </span>
    </div>
  )
}

/** 現在地の結果。当たったら「このまちを選ぶ」で確かめてから決める（勝手に決めない） */
function LocateResult({ loc, onPick, onRetry, onClose }: { loc: Locate; onPick: (e: MapEntry) => void; onRetry: () => void; onClose: () => void }) {
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
        <button type="button" onClick={onClose} className="text-primary hover:underline">
          閉じる
        </button>
      </div>
    </div>
  )
}

/** ほかのまちを見る検索。ホームに常に出し、選んだまちの頁へ移るだけ（住んでいるまちは変えない） */
export function OtherTowns({ entries, className }: { entries: MapEntry[]; className?: string }) {
  const { visit } = useRouter()
  if (!entries.length) return null
  return (
    <section className={cn('ob-rise', className)} aria-label="ほかのまちを見る">
      <TownPicker plain entries={entries} onPick={(e) => visit(e.path)} placeholder="自治体名で探す（例：世田谷）" />
    </section>
  )
}

/**
 * 頁の見出しと説明。サーバーの HTML にも載せるため、まちの有無に関わらず描く。
 * まちを選ぶ前は大きく、選んだあと（ダッシュボード）はロゴのマークと1行の小さめの見出しにする。読み込み中は読み上げだけに残す
 */
export function Intro({ mode }: { mode: 'full' | 'compact' | 'hidden' }) {
  const title = '私のお金はどこへ行った？'
  const lead = '自治体が何にいくら使い、どう振り返ったかを、事業ごとに見られます。'
  if (mode === 'compact')
    return (
      <header className="mb-5 flex items-center gap-2.5">
        <Mark className="size-7 shrink-0 text-primary" />
        <h1 className="text-lg leading-snug font-bold tracking-[0.02em] sm:text-xl">{title}</h1>
        <p className="sr-only">{lead}</p>
      </header>
    )
  const shown = mode === 'full'
  return (
    <header className={shown ? 'ob-rise mb-7 sm:mb-8' : 'sr-only'}>
      {/* 見出しの頭にロゴのマーク（まちを選んだあとの1行の見出しと同じ並び） */}
      <div className="flex items-center gap-3 sm:gap-4">
        {shown ? <Mark className="size-9 shrink-0 text-primary sm:size-11" /> : null}
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em] sm:text-[32px]">{title}</h1>
      </div>
      <p className="mt-2 text-[15px] text-muted-foreground">{lead}</p>
    </header>
  )
}

/** まちを選んでいないときの画面。reveal があれば（まちを選んだ直後）2歩目の要点を出す */
export function Empty({ entries, onPick, reveal, again }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; reveal: React.ReactNode; again?: boolean }) {
  return (
    <>
      {reveal ? <div key="reveal">{reveal}</div> : <AskTown entries={entries} onPick={onPick} again={again} />}
    </>
  )
}

export type CheckItem = { key: string; label: string; href: string }
const CHECK = 'fudoki:checklist'
type CheckState = { done: string[]; closed?: boolean }

/** まちの画面のチェックリスト。まちを選んだときに startChecklist() で始め、1つ目（まちを選ぶ）は済みにしておく */
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
  const all = [{ key: 'town', label: '住んでいるまちを選ぶ', href: '' }, ...items]
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
