// 試作: うちのまちを決めていないときのホーム。上に「まちを探す」（開くだけで、うちのまちにはしない）、その下に本物のまちのホームを「見本」として敷き、その上に一つの行動「うちのまちにする（名前で／現在地から）」を載せる。
// marketingskills の onboarding skill に沿う: 骨組みの絵で見せず本物のデータで見せる（空の状態は「データが入るとどう見えるか」を見せる）、行動は一つ、選んだらすぐ自分のまちのホームになる。
// 「住んでいるまち」を最初に聞くのは怖く見えるので、探すを先に置き、うちのまちは任意の次の一歩にする（2026-11-11 yuito）
import * as React from 'react'
import { ArrowRightIcon, HouseIcon, MagnifyingGlassIcon, NavigationArrowIcon, XIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { cn } from '@/lib/utils'
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

/** うちのまちを決める札。sample（見本のまちの名前）があれば見本の上に載せる文言にし、onCancel があれば「やめる」を出す（うちのまちを変えるとき） */
export function Onboarding({ entries, onPick, onCancel, sample }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; onCancel?: () => void; sample?: string }) {
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
    <section className={cn('ob-rise rounded-[24px] border bg-background p-5 sm:p-7', sample && 'shadow-[0_12px_40px_-12px_rgb(0_0_0/0.18)]')} style={{ animationDelay: sample ? '.45s' : '0s' }}>
      <div>
        <div>
          <h2 className="text-[19px] leading-snug font-bold sm:text-[22px]">{sample ? 'うちのまちにすると、ホームがこうなります' : 'うちのまちを変える'}</h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            {sample ? `うしろは${sample}の見本です。予算・新しく始めた事業・事業評価が、開くたびにここに並びます。あとからいつでも変えられます。` : '名前か現在地で選びます。'}
          </p>

          <div className="mt-5">
            {mode === 'idle' ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Choice icon={<HouseIcon />} title="住んでいるまちを選ぶ" note="名前で選びます" onClick={() => setMode('pick')} />
                <Choice icon={<NavigationArrowIcon />} title="現在地から選ぶ" note="位置は保存しません" onClick={() => void locate()} />
                {onCancel ? (
                  <button type="button" onClick={onCancel} className="justify-self-start text-[13px] text-muted-foreground hover:text-foreground sm:col-span-2">
                    やめる
                  </button>
                ) : null}
              </div>
            ) : (
              <div key={mode} className="ob-swap">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[13px] font-bold">{mode === 'pick' ? '住んでいるまちを選ぶ' : '現在地から選ぶ'}</span>
                  <button
                    type="button"
                    onClick={() => (setMode('idle'), setLoc({}))}
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
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

/** うちのまちを決めていないときのホーム。sample は見本のまちのホーム（本物のデータ）。押せないようにして下へ薄れさせ、その上に決める札を重ねる */
export function Empty({ entries, onPick, sample, sampleName }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; sample: React.ReactNode; sampleName: string }) {
  return (
    <>
      <header className="ob-rise mb-6">
        {/* スマホはサイドバーが無くロゴが見えないので、見出しの上に出す。PC はサイドバーの頭にある */}
        <Logo className="mb-5 block h-7 w-auto text-primary md:hidden" />
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em] sm:text-[32px]">まちのお金、何に使ってる？</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">自治体が何にいくら使い、どう振り返ったかを、事業ごとに見られます。</p>
      </header>
      <FindTown entries={entries} />
      <section className="mt-8" aria-label="うちのまちを決める">
        <p className="ob-rise mb-3 flex items-center gap-2 text-[13px] text-muted-foreground" style={{ animationDelay: '.1s' }}>
          <span className="rounded-full border px-2 py-0.5 text-[11px] font-bold">見本</span>
          {sampleName}のホーム
        </p>
        <div inert aria-hidden="true" className="ob-sample pointer-events-none h-[460px] overflow-hidden select-none [mask-image:linear-gradient(to_bottom,#000_30%,transparent_92%)] sm:h-[520px]">
          {sample}
        </div>
        <div className="relative -mt-44 sm:-mt-52 sm:px-6">
          <Onboarding entries={entries} onPick={onPick} sample={sampleName} />
        </div>
      </section>
    </>
  )
}
