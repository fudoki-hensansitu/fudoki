// はじめて開いたときの流れ（marketingskills の onboarding skill に沿う）。
// 住んでいるまちを選ぶ（名前／現在地）だけの1歩。選んだ時点でそのまちに決め、ホームのダッシュボードを出す。要点を見せてから決めさせる2歩目・使い方のツアー・何歩目かの表示・はじめにやることのチェックリストは置かない（直感的でない・何のためにあるか伝わらないため外した、2026-11-17 yuito）。
// まちの検索は、選ぶ前は住んでいるまちを選ぶ欄（AskTown）、選んだあとはほかのまちを見る欄（OtherTowns）の1つだけ出す。「ホーム」「見るまち」のような通じない言葉は使わない（2026-11-11 yuito）。文言は何が起きるかをそのまま書き、キャッチーにしない
import * as React from 'react'
import { MagnifyingGlassIcon, NavigationArrowIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Mark } from '../nav/site-nav'
import { Picker as TownPicker } from './town-picker'
import { TownPalette } from '../nav/town-palette'
import { LocateError, locateMunicipality } from './locate'
import { townOf } from './towns'
import { withCheckDigit } from '../jurisdiction/code'
import type { MapEntry } from '../jurisdiction/index-table'
import './onboarding.css'
import { Title } from '@/components/ui/title'

type Locate = { busy?: boolean; error?: string; denied?: boolean; hit?: MapEntry }

/** 住んでいるまちを聞く札。名前の入力欄をはじめから出し、「現在地から選ぶ」をスマホでは下、PC では右隣に置く。ホームの「リセット」のあともここに戻る */
export function AskTown({ listed, onPick }: { listed: boolean; onPick: (e: MapEntry) => void }) {
  const [loc, setLoc] = React.useState<Locate | null>(null)
  const locate = async () => {
    setLoc({ busy: true })
    try {
      const muni = await locateMunicipality()
      // 自治体コードは検査数字を足した6桁なので、先頭5桁に検査数字を足して引く
      const hit = await townOf(withCheckDigit(muni))
      setLoc(hit ? { hit } : hit === undefined ? { error: '現在地のまちは、まだ収録していません' } : { error: '現在地のまちを調べられませんでした' })
    } catch (e) {
      setLoc(e instanceof LocateError ? { error: e.message, denied: e.denied } : { error: '現在地を取得できませんでした' })
    }
  }
  return (
    <section className={'ob-rise rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7'}>
      <Title size="h2" className="mb-4">住んでいるまちを選ぶ</Title>
      {/* 一覧を読めなかったときに「未収録」と誤って伝えないよう、検索と現在地を出さない */}
      {listed ? (
        <>
          {/* PC は名前の欄と「現在地から選ぶ」を1行に並べ、スマホは縦に積む */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <TownPicker onPick={onPick} placeholder="住んでいるまちの名前（例：品川区）" />
            </div>
            <button
              type="button"
              onClick={() => void locate()}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-brand-foreground px-5 text-sm font-medium text-brand-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-brand-fill hover:text-brand-fill-foreground active:scale-[0.97] motion-reduce:transition-none"
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
            <p className="mt-3 text-xs opacity-75">{LOCATION_NOTE}</p>
          )}
        </>
      ) : (
        <p className="text-sm opacity-80">今は自治体の一覧を読み込めません。少し時間をおいて開き直してください。</p>
      )}
    </section>
  )
}

/** 現在地から選ぶときに添える一言。押す前と調べている間の両方に出す */
const LOCATION_NOTE = '位置情報は保存されません'

/** 現在地の結果。当たったら「このまちを選ぶ」で確かめてから決める（勝手に決めない） */
function LocateResult({ loc, onPick, onRetry, onClose }: { loc: Locate; onPick: (e: MapEntry) => void; onRetry: () => void; onClose: () => void }) {
  if (loc.busy)
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-4 text-sm">
        <span className="ob-ping relative grid size-9 place-items-center rounded-full bg-background text-primary">
          <NavigationArrowIcon className="size-[18px]" />
        </span>
        <span className="flex flex-col gap-1">
          現在地のまちを調べています…
          <span className="text-xs text-muted-foreground">{LOCATION_NOTE}</span>
        </span>
      </div>
    )
  if (loc.hit)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-4">
        <span className="min-w-0 flex-1 text-sm">
          現在地は <b className="text-base">{loc.hit.name}</b> です
        </span>
        <button type="button" onClick={() => onPick(loc.hit!)} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none">
          このまちを選ぶ
        </button>
      </div>
    )
  // 失敗は帯の上に1行で控えめに出す。ブロックされているときはサイトから聞き直せないので、ブラウザでの許可か名前で探すことを案内する。「もう一度」は許可を直したあとに押せるよう残す
  return (
    <div role="status" className="flex items-start gap-2 text-sm leading-relaxed">
      <WarningCircleIcon className="mt-1 size-4 shrink-0 opacity-80" />
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

/** ほかのまちを見る検索。住んでいるまちを選んだあとのホームに出し、選んだまちの頁へ移るだけ（住んでいるまちは変えない）。
 * large ではレシートの下の別の節として大きく出し、影を付けてレシートとは別の物に見せる（2026-11-18 yuito） */
export function OtherTowns({ className, large = false }: { className?: string; large?: boolean }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className={cn('ob-rise', className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center gap-3 rounded-full border border-border bg-background px-4 text-left text-muted-foreground transition-colors hover:bg-card',
          large ? 'h-14 px-5 text-base shadow-lg' : 'h-12 text-sm',
        )}
      >
        <MagnifyingGlassIcon className={cn('shrink-0', large ? 'size-6' : 'size-5')} aria-hidden="true" />
        他のまちを探す
      </button>
      <TownPalette open={open} onOpenChange={setOpen} />
    </div>
  )
}

/**
 * 頁の見出し。サーバーの HTML にも載せるため、まちの有無に関わらず描く。
 * まちを選ぶ前は大きく、選んだあと（ダッシュボード）はロゴのマークと1行の小さめの見出しにする。読み込み中は読み上げだけに残す
 */
export function Intro({ mode }: { mode: 'full' | 'compact' | 'hidden' }) {
  const title = '私のお金はどこへ行った？'
  // まちを選ぶ前もあとも同じ見出し。浮き上がりはまちを選ぶ前だけ
  const shown = mode !== 'hidden'
  return (
    <header className={shown ? cn('mb-7 sm:mb-8', mode === 'full' && 'ob-rise') : 'sr-only'}>
      <div className="flex items-center gap-3 sm:gap-4">
        {shown ? <Mark className="size-9 shrink-0 text-primary sm:size-11" /> : null}
        <Title size="h1">{title}</Title>
      </div>
    </header>
  )
}
