// 試作: うちのまちを決めていないときのホーム。上に「まちを探す」（開くだけで、うちのまちにはしない）、その下にオンボーディング。
// オンボーディングは、うちのまちを決めるとホームが何になるかを小さな動く絵で見せ、住んでいるまちを選ぶ／現在地から選ぶ の二択を出す。
// 「住んでいるまち」を最初に聞くのは怖く見えるので、探すを先に置き、うちのまちは任意の次の一歩にする（2026-11-11 yuito）
import * as React from 'react'
import { ArrowRightIcon, HouseIcon, MagnifyingGlassIcon, NavigationArrowIcon, XIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
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

/** 小さく動く絵: うちのまちの札が付き、金額・分野の棒・新しく始めた事業の札が順に組み上がる。動きを減らす設定では止めて全部出す */
function Preview() {
  return (
    <div aria-hidden="true" className="ob-preview relative overflow-hidden rounded-2xl border bg-muted/40 p-4">
      <div className="rounded-xl border bg-background p-3 shadow-[0_1px_0_rgb(0_0_0/0.03)]">
        <div className="ob-step flex items-center gap-2" style={{ '--d': '0s' } as React.CSSProperties}>
          <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
            <HouseIcon className="size-3.5" />
          </span>
          <span className="text-[12px] font-bold">うちのまち</span>
          <span className="ml-auto h-2 w-10 rounded-full bg-muted" />
        </div>
        <div className="ob-step mt-3" style={{ '--d': '.35s' } as React.CSSProperties}>
          <span className="block h-1.5 w-14 rounded-full bg-muted" />
          <span className="mt-1.5 block h-4 w-28 rounded-md bg-primary/80" />
        </div>
        <div className="mt-3 space-y-1.5">
          {[0.92, 0.64, 0.41].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-8 shrink-0 rounded-full bg-muted" />
              <span className="ob-bar h-2 rounded-full bg-foreground/15" style={{ width: `${w * 100}%`, '--d': `${0.7 + i * 0.12}s` } as React.CSSProperties} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="ob-step rounded-xl border bg-background p-2.5" style={{ '--d': `${1.25 + i * 0.15}s` } as React.CSSProperties}>
            <span className="inline-block rounded-[4px] bg-primary/10 px-1 text-[9px] leading-[14px] font-bold text-primary">NEW</span>
            <span className="mt-1.5 block h-1.5 w-[80%] rounded-full bg-muted" />
            <span className="mt-1 block h-1.5 w-[55%] rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

type Locate = { busy?: boolean; error?: string; hit?: MapEntry }

/** 下の段: オンボーディング。picking=true で、まちの欄を開いた状態から始める（うちのまちを変えるとき） */
export function Onboarding({ entries, onPick, picking: startPicking, onCancel }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; picking?: boolean; onCancel?: () => void }) {
  const [mode, setMode] = React.useState<'idle' | 'pick' | 'locate'>(startPicking ? 'pick' : 'idle')
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
    <section className="ob-rise mt-4 rounded-[24px] border bg-background p-5 sm:p-7" style={{ animationDelay: '.08s' }}>
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-8">
        <Preview />
        <div>
          <p className="ob-fade text-[12px] font-bold tracking-[0.04em] text-primary" style={{ '--d': '.15s' } as React.CSSProperties}>
            はじめに
          </p>
          <h2 className="ob-fade mt-1 text-[19px] leading-snug font-bold sm:text-[22px]" style={{ '--d': '.22s' } as React.CSSProperties}>
            うちのまちを決めると、
            <br className="hidden sm:inline" />
            ホームがそのまちのお金になります
          </h2>
          <p className="ob-fade mt-2 text-[14px] text-muted-foreground" style={{ '--d': '.3s' } as React.CSSProperties}>
            予算・新しく始めた事業・事業評価が、開くたびにここに並びます。あとからいつでも変えられます。
          </p>

          <div className="ob-fade mt-5" style={{ '--d': '.4s' } as React.CSSProperties}>
            {mode === 'idle' ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Choice icon={<HouseIcon />} title="住んでいるまちを選ぶ" note="名前で選びます" onClick={() => setMode('pick')} />
                <Choice icon={<NavigationArrowIcon />} title="現在地から選ぶ" note="位置は保存しません" onClick={() => void locate()} />
              </div>
            ) : (
              <div key={mode} className="ob-swap">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[13px] font-bold">{mode === 'pick' ? '住んでいるまちを選ぶ' : '現在地から選ぶ'}</span>
                  <button
                    type="button"
                    onClick={() => (onCancel && startPicking ? onCancel() : (setMode('idle'), setLoc({})))}
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                    {onCancel && startPicking ? 'やめる' : 'もどる'}
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
        </div>
      </div>
    </section>
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
          このまちにする
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

/** うちのまちを決めていないときのホーム */
export function Empty({ entries, onPick }: { entries: MapEntry[]; onPick: (e: MapEntry) => void }) {
  return (
    <>
      <header className="ob-rise mb-6">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em] sm:text-[32px]">まちのお金、何に使ってる？</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">自治体が何にいくら使い、どう振り返ったかを、事業ごとに見られます。</p>
      </header>
      <FindTown entries={entries} />
      <Onboarding entries={entries} onPick={onPick} />
    </>
  )
}

