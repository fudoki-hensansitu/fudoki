// まちを選ぶ札（トップ）。名前で探す欄と「現在地から選ぶ」。選んだらそのまちのレシートの頁へ移る。
// 風土記のホームのオンボーディングにあったもの（fudoki の apps/web/home/onboarding.tsx の AskTown）と同じ形と文言
import * as React from 'react'
import { NavigationArrowIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { cn } from '../lib/cn'
import { withCheckDigit, type TownEntry } from '../lib/fudoki'
import { LocateError, locateMunicipality } from '../lib/locate'
import { Title } from './title'
import { TownSearch } from './town-search'

type Locate = { busy?: boolean; error?: string; denied?: boolean; hit?: TownEntry }

/** 自治体コードの自治体。収録が無ければ undefined、読めなければ null */
const townOf = (code: string): Promise<TownEntry | undefined | null> =>
  fetch(`/api/jurisdictions?${new URLSearchParams({ code })}`)
    .then((r) => (r.ok ? (r.json() as Promise<TownEntry[]>) : null))
    .then((xs) => (xs ? xs[0] : null))
    .catch(() => null)

/** 現在地から選ぶときに添える一言。押す前と調べている間の両方に出す */
const LOCATION_NOTE = '位置情報は保存されません'

export function AskTown() {
  const { visit } = useRouter()
  const [loc, setLoc] = React.useState<Locate | null>(null)
  const locate = async () => {
    setLoc({ busy: true })
    try {
      // 自治体コードは検査数字を足した6桁なので、先頭5桁に検査数字を足して引く
      const hit = await townOf(withCheckDigit(await locateMunicipality()))
      setLoc(hit ? { hit } : hit === undefined ? { error: '現在地のまちは、まだ収録していません' } : { error: '現在地のまちを調べられませんでした' })
    } catch (e) {
      setLoc(e instanceof LocateError ? { error: e.message, denied: e.denied } : { error: '現在地を取得できませんでした' })
    }
  }
  return (
    <section className="ob-rise rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7">
      <Title size="h2" className="mb-4">住んでいるまちを選ぶ</Title>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <TownSearch brand placeholder="住んでいるまちの名前（例：品川区）" className="min-w-0 flex-1" />
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
        <div className={cn('ob-swap mt-3', !loc.error && 'text-brand-fill-foreground')}>
          <LocateResult loc={loc} onPick={(e) => visit(`/${e.code}`)} onRetry={() => void locate()} onClose={() => setLoc(null)} />
        </div>
      ) : (
        <p className="mt-3 text-xs opacity-75">{LOCATION_NOTE}</p>
      )}
    </section>
  )
}

/** 現在地の結果。当たったら「このまちを選ぶ」で確かめてから移る（勝手に移らない） */
function LocateResult({ loc, onPick, onRetry, onClose }: { loc: Locate; onPick: (e: TownEntry) => void; onRetry: () => void; onClose: () => void }) {
  if (loc.busy)
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl bg-brand-fill px-4 py-4 text-sm shadow-[var(--shadow-pill)] dark:shadow-none">
        <span className="ob-ping relative grid size-9 place-items-center rounded-full bg-secondary text-primary">
          <NavigationArrowIcon className="size-[18px]" />
        </span>
        <span className="flex flex-col gap-1">
          現在地のまちを調べています…
          <span className="text-xs text-brand-fill-muted">{LOCATION_NOTE}</span>
        </span>
      </div>
    )
  if (loc.hit)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-fill px-4 py-4 shadow-[var(--shadow-pill)] dark:shadow-none">
        <span className="min-w-0 flex-1 text-sm">
          現在地は <b className="text-base">{loc.hit.name}</b> です
        </span>
        <button type="button" onClick={() => onPick(loc.hit!)} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none">
          このまちを選ぶ
        </button>
      </div>
    )
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
