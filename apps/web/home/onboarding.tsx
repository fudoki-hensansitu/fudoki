// はじめて開いたときの流れ（marketingskills の onboarding skill に沿う）。
// 1 住んでいるまちを選ぶ（名前／現在地）→ 2 選んだまちの要点を一枚で見せる（価値の瞬間）→ チェックリスト（1つ目は済み、閉じられる）。使い方のツアーは置かない（見せるより、本人に触ってもらう）。
// まちの検索は、選ぶ前は住んでいるまちを選ぶ欄（AskTown）、選んだあとはほかのまちを見る欄（OtherTowns）の1つだけ出す。「ホーム」「見るまち」のような通じない言葉は使わない（2026-11-11 yuito）。文言は何が起きるかをそのまま書き、キャッチーにしない
import * as React from 'react'
import { ArrowRightIcon, CheckIcon, MagnifyingGlassIcon, NavigationArrowIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Mark } from '../nav/site-nav'
import { Picker as TownPicker } from './town-picker'
import { TownPalette, warmTowns } from '../nav/town-palette'
import { LocateError, locateMunicipality } from './locate'
import type { MapEntry } from '../jurisdiction/index-table'
import './onboarding.css'

type Locate = { busy?: boolean; error?: string; denied?: boolean; hit?: MapEntry }

/** 住んでいるまちを聞く札（はじめての流れの 1 / 2）。名前の入力欄をはじめから出し、「現在地から選ぶ」をスマホでは下、PC では右隣に置く。ホームの「リセット」のあともここに戻る */
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
      setLoc(e instanceof LocateError ? { error: e.message, denied: e.denied } : { error: '現在地を取得できませんでした' })
    }
  }
  return (
    <section className={'ob-rise rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7'}>
      {again ? null : <Steps at={1} of={2} onBrand />}
      <h2 className="mb-4 text-[20px] leading-snug font-semibold sm:text-[24px]">住んでいるまちを選ぶ</h2>
      {/* 一覧を読めなかったときに「未収録」と誤って伝えないよう、検索と現在地を出さない */}
      {entries.length ? (
        <>
          {/* PC は名前の欄と「現在地から選ぶ」を1行に並べ、スマホは縦に積む */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <TownPicker entries={entries} onPick={onPick} placeholder="住んでいるまちの名前（例：品川区）" />
            </div>
            <button
              type="button"
              onClick={() => void locate()}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-brand-foreground px-5 text-[15px] font-medium text-brand-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-brand-fill hover:text-brand-fill-foreground active:scale-[0.97] motion-reduce:transition-none"
            >
              <NavigationArrowIcon className="size-4" />
              現在地から選ぶ
            </button>
          </div>
          {loc ? (
            <div className={cn('ob-swap mt-3', !loc.error && 'text-foreground')}>
              <LocateResult loc={loc} onPick={onPick} onRetry={() => void locate()} onClose={() => setLoc(null)} />
            </div>
          ) : (
            <p className="mt-3 text-[12px] opacity-75">{LOCATION_NOTE}</p>
          )}
        </>
      ) : (
        <p className="text-[14px] opacity-80">今は自治体の一覧を読み込めません。少し時間をおいて開き直してください。</p>
      )}
    </section>
  )
}

/** 現在地から選ぶときに添える一言。押す前と調べている間の両方に出す */
const LOCATION_NOTE = '位置情報は保存されません'

/** 何歩目か。点と「1 / 2」 */
export function Steps({ at, of, onBrand }: { at: number; of: number; onBrand?: boolean }) {
  return (
    <div className={cn('mb-3 flex items-center gap-2 text-[12px]', onBrand ? 'opacity-80' : 'text-muted-foreground')}>
      <span className="flex gap-1">
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out', i < at ? cn('w-5', onBrand ? 'bg-brand-foreground' : 'bg-primary') : cn('w-1.5', onBrand ? 'bg-brand-foreground opacity-30' : 'bg-border'))} />
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
        <span className="flex flex-col gap-0.5">
          現在地のまちを調べています…
          <span className="text-[12px] text-muted-foreground">{LOCATION_NOTE}</span>
        </span>
      </div>
    )
  if (loc.hit)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3.5">
        <span className="min-w-0 flex-1 text-[14px]">
          現在地は <b className="text-[16px]">{loc.hit.name}</b> です
        </span>
        <button type="button" onClick={() => onPick(loc.hit!)} className="rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none">
          このまちを選ぶ
        </button>
      </div>
    )
  // 失敗は帯の上に1行で控えめに出す。ブロックされているときはサイトから聞き直せないので、ブラウザでの許可か名前で探すことを案内する。「もう一度」は許可を直したあとに押せるよう残す
  return (
    <div role="status" className="flex items-start gap-2 text-[13px] leading-relaxed">
      <WarningCircleIcon className="mt-[3px] size-4 shrink-0 opacity-80" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{loc.error}。</span>
        {loc.denied ? 'アドレスバーの鍵のアイコンから位置情報を許可するか、自治体名で探してください。' : '自治体名でも探せます。'}
        <button type="button" onClick={onRetry} className="ml-2 underline underline-offset-2 opacity-90 hover:opacity-100">
          もう一度
        </button>
      </p>
      <button type="button" onClick={onClose} aria-label="閉じる" className="-m-1 shrink-0 p-1 opacity-70 hover:opacity-100">
        <XIcon className="size-4" />
      </button>
    </div>
  )
}

/** ほかのまちを見る検索。住んでいるまちを選んだあとのホームに出し、選んだまちの頁へ移るだけ（住んでいるまちは変えない） */
export function OtherTowns({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <section className={cn('ob-rise', className)} aria-label="ほかのまちを見る">
      <button
        type="button"
        onClick={() => (warmTowns(), setOpen(true))}
        onPointerEnter={warmTowns}
        className="flex h-12 w-full items-center gap-3 rounded-full border border-border bg-background px-4 text-left text-[15px] text-muted-foreground transition-colors hover:bg-card"
      >
        <MagnifyingGlassIcon className="size-5 shrink-0" aria-hidden="true" />
        まちを探す
      </button>
      <TownPalette open={open} onOpenChange={setOpen} />
    </section>
  )
}

/**
 * 頁の見出しと説明。サーバーの HTML にも載せるため、まちの有無に関わらず描く。
 * まちを選ぶ前は大きく、選んだあと（ダッシュボード）はロゴのマークと1行の小さめの見出しにする。読み込み中は読み上げだけに残す
 */
export function Intro({ mode }: { mode: 'full' | 'compact' | 'hidden' }) {
  const title = '私のお金はどこへ行った？'
  const lead = '住んでいるまちが何にいくら使い、どう振り返ったかを、事業ごとに見られます。'
  // まちを選ぶ前もあとも同じ見出しと説明。浮き上がりはまちを選ぶ前だけ
  const shown = mode !== 'hidden'
  return (
    <header className={shown ? cn('mb-7 sm:mb-8', mode === 'full' && 'ob-rise') : 'sr-only'}>
      <div className="flex items-center gap-3 sm:gap-4">
        {shown ? <Mark className="size-9 shrink-0 text-primary sm:size-11" /> : null}
        <h1 className="text-[26px] leading-[1.35] font-semibold tracking-[0.02em] sm:text-[32px]">{title}</h1>
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

/** はじめにやることの項目。href へ移る。押しても済みにはしない（済みは丸を押したときだけ） */
export type CheckItem = { key: string; label: string; href?: string }
const CHECK = 'fudoki:checklist'
type CheckState = { done: string[]; closed?: boolean }

/** 前にはじめての流れを通った（チェックリストか、前の版のツアーの保存がある）か。ホームのリセットのあとは、はじめての流れを出さずにまちだけ選び直す */
export const onboarded = () => {
  try {
    return localStorage.getItem(CHECK) !== null || localStorage.getItem('fudoki:tour') !== null
  } catch {
    return false
  }
}

/** まちの画面のチェックリスト。まちを選んだときに startChecklist() で始め、1つ目（まちを選ぶ）は済みにしておく */
export const startChecklist = () => {
  try {
    localStorage.setItem(CHECK, JSON.stringify({ done: ['town'] } satisfies CheckState))
  } catch {
    // 保存できなければ出さない
  }
}

/** はじめにやること。各行は頁へ移るだけ。済みにするのは丸を押したときだけで、もう一度押すと外せる */
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
  const all: CheckItem[] = [{ key: 'town', label: '住んでいるまちを選ぶ' }, ...items]
  const isDone = (key: string) => st.done.includes(key)
  // 丸を押したときだけ済み・未了を切り替える
  const toggle = (key: string) => save({ ...st, done: isDone(key) ? st.done.filter((k) => k !== key) : [...st.done, key] })
  const n = all.filter((x) => isDone(x.key)).length
  const complete = n === all.length
  const row = 'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-[14px] transition-colors hover:bg-secondary'
  return (
    <section className="ob-rise mb-4 rounded-2xl border bg-background p-4 sm:p-5" aria-label="はじめにやること">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-[15px] font-medium">{complete ? 'ひととおり見ました' : 'はじめにやること'}</h2>
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
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {all.map((x) => {
          const done = isDone(x.key)
          const label = <span className={cn('min-w-0 flex-1', done && 'text-muted-foreground line-through decoration-border')}>{x.label}</span>
          return (
            <li key={x.key} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggle(x.key)}
                aria-pressed={done}
                aria-label={done ? `${x.label}を未了に戻す` : `${x.label}を済みにする`}
                className="grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-secondary"
              >
                <span className={cn('grid size-5 place-items-center rounded-full border transition-colors duration-200', done ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                  {done ? <CheckIcon className="size-3" weight="bold" /> : null}
                </span>
              </button>
              {x.href ? (
                <Link href={x.href} className={row}>
                  {label}
                  <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                <span className="flex min-w-0 flex-1 px-2 py-2 text-[14px]">{label}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
