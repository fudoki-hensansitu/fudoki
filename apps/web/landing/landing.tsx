// 風土記について（/about）。利用者に風土記を知ってもらう LP。中身は marketingskills の copywriting の LP の型（できるようになること → やり方 → 機能 → 困りごととの比べ → 不安への答え → 呼びかけ）に沿う（2026-11-18 yuito）。
// 組み方は fluz.app/us の構成に倣う（2026-11-19 yuito）: 緑の面に中央の大見出し、面の縁にまたがる画面の絵、色の面に画面を載せて左右に振る機能の節、暗い帯の比べの表、色の面の呼びかけ。
// 色・文字・余白は風土記の token と Title の段のまま。色の面（paper・sakura・kincha・ai・night）は読み物の絵の面としてだけ使う（DESIGN.md）。
// 動くのは冒頭の絵の浮き上がりと、機能の節の録画だけ（見えている間だけ流し、動きを減らす設定では止める）
import * as React from 'react'
import { ArrowRightIcon, ArrowSquareOutIcon, ChartLineUpIcon, CheckCircleIcon, EnvelopeSimpleIcon, ScalesIcon, UsersThreeIcon, XCircleIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { Title } from '@/components/ui/title'
import { cn } from '@/lib/utils'
import { Footer } from '../nav/footer'
import { HOME } from '../home-data'
import { Logo } from '../nav/site-nav'

const DOCS = 'https://docs.fudoki.dev'
const HOME_PATH = '/'
/** 都知事杯オープンデータ・ハッカソン 2026 の FinalStage の配信（風土記の発表の 9分15秒から）。風土記はここでデータ活用賞（審査委員特別賞）を受けた（2026-11-19 yuito） */
const AWARD_VIDEO = 'https://www.youtube.com/watch?v=ABHPUTt3NCA&t=555s'
/** 議員・会派向けの AI 構築の相談の宛先。導線として残す（2026-11-18 yuito） */
const COUNCIL_AI = `mailto:support@fudoki.dev?subject=${encodeURIComponent('議員・会派向け AI の相談')}`

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`
const { origin } = HOME
const [cx0, cy0, cx1, cy1] = origin.crop
const [mx0, my0, mx1, my1] = origin.mark
const pct = (v: number, w: number) => `${((v / w) * 100).toFixed(2)}%`
const markStyle = { left: pct(mx0 - 3 - cx0, cx1 - cx0), top: pct(my0 - 3 - cy0, cy1 - cy0), width: pct(mx1 - mx0 + 6, cx1 - cx0), height: pct(my1 - my0 + 6, cy1 - cy0) }

const primaryButton = 'inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90'
const fillButton = 'inline-flex items-center gap-2 rounded-full bg-brand-fill px-6 py-3 text-base font-medium text-brand-fill-foreground transition-colors duration-150 hover:bg-brand-fill-hover motion-reduce:transition-none'
const textLink = 'inline-flex items-center gap-1 text-base font-medium text-primary underline-offset-4 hover:underline'

/** 実際の画面の画像。テーマに合わせてライト・ダークの片方を出す（about.css）。隠れた方は読み上げられないので、どちらにも同じ alt を付ける */
function Shot({ name, width, height, alt, className, eager }: { name: string; width: number; height: number; alt: string; className?: string; eager?: boolean }) {
  const img = 'h-auto w-full'
  return (
    <span className={cn('block', className)}>
      <img className={cn('shot-light block', img)} src={`/about/${name}-light.webp`} width={width} height={height} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      <img className={cn('shot-dark hidden', img)} src={`/about/${name}-dark.webp`} width={width} height={height} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </span>
  )
}

/** 操作の録画。見えている間だけ流し、動きを減らす設定では流さない（押せば流れる）。再生の操作盤は出さず、押す操作は button に持たせる（video に button の役は付けられない） */
function Clip({ src, poster, width, height, label, className }: { src: string; poster: string; width: number; height: number; label: string; className?: string }) {
  const ref = React.useRef<HTMLVideoElement>(null)
  const toggle = () => {
    const v = ref.current
    if (v) void (v.paused ? v.play() : v.pause())
  }
  React.useEffect(() => {
    const v = ref.current
    if (!v || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.4 })
    io.observe(v)
    return () => io.disconnect()
  }, [])
  return (
    <button type="button" className={cn('block w-full cursor-pointer', className)} aria-label={`${label}。押すと再生・停止`} onClick={toggle}>
      <video ref={ref} className="block h-auto w-full" src={src} poster={poster} width={width} height={height} muted loop playsInline preload="none" aria-hidden="true" />
    </button>
  )
}

/** 機能の節の絵を載せる色の面。読み物の絵の色だけを地にする */
const TONE = { paper: 'bg-paper', sakura: 'bg-sakura', kincha: 'bg-kincha', ai: 'bg-ai' } as const

/** 色の面の上で、スマホの画面を下の縁まで差し込む */
function PhoneStage({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <div className={cn('relative aspect-square overflow-hidden rounded-3xl sm:aspect-[5/6]', TONE[tone])}>
      <div className="absolute inset-x-0 top-10 bottom-0 mx-auto w-3/5 overflow-hidden rounded-t-3xl border-x-8 border-t-8 border-background bg-background shadow-(--shadow-sheet) sm:top-12">
        {children}
      </div>
    </div>
  )
}

/** 色の面の上に、横長の画面を札として載せる */
function SheetStage({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <div className={cn('grid gap-4 rounded-3xl p-6 sm:p-10', TONE[tone])}>{children}</div>
}

/** 機能の節。札の名前・見出し・文・導線と、色の面の絵を左右に置き、節ごとに左右を入れ替える */
function Feature({ tag, title, body, links, flip, children }: { tag: string; title: React.ReactNode; body: React.ReactNode; links?: React.ReactNode; flip?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
      <div className={cn(flip && 'md:order-2')}>
        <span className="inline-block rounded-full border px-3 py-1 text-xs font-medium">{tag}</span>
        <Title size="h1" as="h3" className="mt-4">
          {title}
        </Title>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{body}</p>
        {links && <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">{links}</div>}
      </div>
      <div className={cn(flip && 'md:order-1')}>{children}</div>
    </div>
  )
}

const STEPS = [
  { title: 'まちを選ぶ', body: '名前か、今いる場所から', shot: 'step-town', alt: 'ホームの「住んでいるまちを選ぶ」。まちの名前を入れる欄と「現在地から選ぶ」のボタン' },
  { title: '何にいくら使っているかを見る', body: 'その年の予算を分野ごとに、住民1人あたりの額で', shot: 'step-fields', alt: '品川区の予算の「何に使う？」。福祉・子育て 50.7%、教育 13.2% など、分野ごとの額と割合の棒' },
  { title: '気になった事業を開く', body: 'お金のかかる順に、中身と年ごとの額まで', shot: 'step-project', alt: '品川区「私立保育園費」の年度ごとの当初予算・決算・評価' },
]

/** 予算書の PDF で調べるときと、風土記で調べるときの比べ。左が風土記 */
const COMPARE: [string, string][] = [
  ['まちを選ぶと、事業がお金のかかる順に並ぶ', '数百頁の PDF から探す'],
  ['どのまちも同じ物差しで並ぶ', 'まちごとに書き方が違う'],
  ['問いを選ぶと、まちごとの答えが地図に並ぶ', '比べるには資料を何冊も開く'],
  ['どの数字も、資料のその頁まで辿れる', '数字の出どころを自分で探す'],
  ['分からないことは、そのまま AI に聞ける', '用語や仕組みを自分で調べる'],
]

const COUNCIL_POINTS = [
  { icon: ChartLineUpIcon, text: '担当分野の事業と、金額の年ごとの推移' },
  { icon: ScalesIcon, text: 'ほかのまちの同じ事業との比較' },
  { icon: UsersThreeIcon, text: '議員・会派ごとの使い方と、始める順番の相談' },
]

const FAQ: [string, React.ReactNode][] = [
  ['数字は正しいですか', '自治体が公開した予算書・決算書・事業評価から読み込み、資料の中で重ねて印字された合計どうしが合うかを確かめています。どの数字も資料の頁まで辿れます。'],
  ['偏った見せ方ではありませんか', '風土記は評価を書かず、まちに順位や良し悪しの色も付けません。事業評価は自治体が自分で振り返った結果です。'],
  [
    'うちのまちは入っていますか',
    <>
      収録するまちは順に広げています。<Link href={HOME_PATH}>ホーム</Link>でまちの名前を入れると確かめられます。
    </>,
  ],
  [
    'お金や登録は要りますか',
    <>
      見る・聞く・ふだんの調べものなら要りません。製品やサービスに組み込むなど商用で使うときは、事前にお問い合わせください。詳しくは<a href={`${DOCS}/terms`}>利用規約</a>をご覧ください。
    </>,
  ],
]

export function Landing() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 pt-4 pb-28 sm:px-8 sm:pt-8 md:pb-10">
      {/* 冒頭: 緑の面に問いの見出し・できるようになること・ボタン。下に実際の画面を、面の縁にまたがせて並べる */}
      <header>
        <div className="rounded-3xl bg-brand px-6 pt-12 pb-40 text-center text-brand-foreground sm:pt-16 sm:pb-64">
          {/* 白抜きのロゴ（DESIGN.md の Logo）。サイドバーの無いスマホでも風土記の頁だと分かるように、見出しの上に置く */}
          <p className="flex justify-center">
            <Logo className="h-9 w-auto sm:h-10" />
            <span className="sr-only">風土記</span>
          </p>
          <Title size="display" as="h1" className="mt-10 leading-tight sm:mt-12">
            私のお金は
            <br />
            どこへ行った？
          </Title>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed">住んでいるまちが何にいくら使い、今年なにを始めるのか。予算書を開かなくても、事業ごとに分かります。</p>
          <Link className={cn(fillButton, 'mt-8')} href={HOME_PATH}>
            うちのまちの使い道を見る
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
          <p className="mt-4 text-sm">登録なし・無料</p>
        </div>
        {/* 中央はお金の流れの図（2026-11-18 yuito。「どこへ行った？」に答える）。左右は分野と事業の画面で、幅の広い画面だけに出す */}
        <div className="relative -mt-28 grid items-end gap-4 px-4 sm:-mt-52 sm:px-8 md:grid-cols-4">
          <div className="hidden translate-y-10 overflow-hidden rounded-3xl border bg-background p-5 md:block">
            <Shot name="step-fields" width={780} height={880} alt="" />
          </div>
          <div className="about-rise overflow-hidden rounded-3xl border bg-background p-4 shadow-(--shadow-sheet) sm:p-6 md:col-span-2">
            <Shot eager name="sankey" width={2080} height={954} alt="品川区 R8年度予算のお金の流れの図。特別区税 28%・特別区交付金 22% などの入るお金が一般会計を通り、福祉・子育て 51%・教育 13% などへ分かれる" />
          </div>
          <div className="hidden translate-y-10 overflow-hidden rounded-3xl border bg-background p-5 md:block">
            <Shot name="step-project" width={780} height={880} alt="" />
          </div>
        </div>
      </header>

      {/* やり方 */}
      <section className="mt-28 sm:mt-40" aria-labelledby="how-h">
        <Title size="h1" as="h2" id="how-h" className="text-center">
          まちを選ぶだけ
        </Title>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col overflow-hidden rounded-3xl bg-card">
              <div className="p-6 pb-8">
                <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{i + 1}</span>
                <Title size="h3" className="mt-4">
                  {s.title}
                </Title>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
              <div className="mt-auto px-6">
                <Shot name={s.shot} width={780} height={880} alt={s.alt} className="overflow-hidden rounded-t-2xl border-x border-t bg-background px-5 pt-5" />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* できるようになること。色の面に実際の画面と操作の録画を載せ、左右を入れ替えて並べる */}
      <section className="mt-28 grid gap-24 sm:mt-40 sm:gap-32" aria-label="風土記でできること">
        <Feature tag="事業" title="税金がどの事業に回ったか、追える" body="税金や国・都からのお金が、福祉や教育に分かれ、一つ一つの事業に届くまでを、図と表でたどれます。">
          <PhoneStage tone="paper">
            <Clip src="/about/projects.mp4" poster="/about/projects-poster.webp" width={780} height={1520} label="品川区の事業の一覧で「保育」「学校」と入れて事業を絞り込む操作の録画" />
          </PhoneStage>
        </Feature>
        <Feature
          flip
          tag="まち比べ"
          title="隣のまちと比べられる"
          body="1人あたりいくら使ったか、借金や貯金はどれくらいか。問いを選ぶと、まちごとの答えが地図に並びます。"
          links={
            <Link href="/compare" className={textLink}>
              まち比べを開く
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          <PhoneStage tone="sakura">
            <Clip src="/about/compare.mp4" poster="/about/compare-poster.webp" width={780} height={1520} label="まち比べで問いを「1人あたりの借金」「1人あたりの貯金」「福祉・子育ての割合」と替え、東京都のまちの地図の塗りが替わる操作の録画" />
          </PhoneStage>
        </Feature>
        <Feature tag="出典" title="その数字が、資料のどこにあるか確かめられる" body="事業の予算・決算・事業評価から、自治体の資料のその頁を開けます。">
          <SheetStage tone="kincha">
            <div className="overflow-hidden rounded-2xl bg-background p-4 shadow-(--shadow-sheet) sm:p-6">
              <Shot name="project" width={1190} height={600} alt="品川区「私立保育園費」の年度ごとの当初予算・決算・評価。どの額にも資料を開く印が付いている" />
            </div>
            <figure className="overflow-hidden rounded-2xl bg-page text-page-foreground shadow-(--shadow-sheet) sm:ml-12">
              <div className="relative">
                <img src="/home/origin.webp" width={2136} height={879} loading="lazy" decoding="async" className="block h-auto w-full" alt={`${origin.jurisdiction}の${origin.document} ${origin.page}頁の切り抜き。「${origin.name}」の使った額 ${yen(origin.amount)}`} />
                <i className="absolute rounded-sm border-2 border-primary" style={markStyle} aria-hidden="true" />
              </div>
              <figcaption className="border-t px-4 py-3 text-xs">
                {origin.jurisdiction} · {origin.document} {origin.page}頁
              </figcaption>
            </figure>
          </SheetStage>
        </Feature>
        <Feature
          flip
          tag="AI"
          title={
            <>
              分からないことは、
              <br />
              そのまま聞ける
            </>
          }
          body="「子育てにいくら使ってる？」と聞くと、風土記のデータから答えます。ChatGPT や Claude など、いつもの AI からも使えます。"
          links={
            <>
              <Link href="/assistant" className={textLink}>
                アシスタントに聞く
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
              <a href={DOCS} target="_blank" rel="noopener" className={textLink}>
                いつもの AI につなぐ
                <ArrowSquareOutIcon className="size-4" aria-hidden="true" />
              </a>
            </>
          }
        >
          <SheetStage tone="ai">
            <div className="overflow-hidden rounded-2xl bg-background shadow-(--shadow-sheet)">
              <Clip src="/home/demo.mp4" poster="/home/demo-poster.webp" width={1280} height={840} label="ChatGPT につないだ風土記に、北区の決算を聞いた操作の録画" />
            </div>
          </SheetStage>
        </Feature>
      </section>

      {/* 困りごとと、風土記で調べるときの比べ。暗い帯に置く */}
      <section className="mt-28 rounded-3xl bg-night px-4 py-16 text-night-foreground sm:mt-40 sm:px-12 sm:py-24" aria-labelledby="pain-h">
        <div className="mx-auto max-w-2xl text-center">
          <Title size="h1" as="h2" id="pain-h">
            公開されているのに、読めない
          </Title>
          <p className="mt-4 text-base leading-relaxed">自治体の予算・決算は誰でも見られます。ただ、数百頁の PDF で、まちごとに書き方も違います。自分の暮らしに関わる事業を探すだけで、半日かかります。</p>
        </div>
        <div className="about-night-line mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border">
          <div className="about-night-line hidden grid-cols-2 border-b text-sm font-medium sm:grid">
            <p className="px-4 py-4 sm:px-6">風土記</p>
            <p className="about-night-line border-l px-4 py-4 sm:px-6">予算書の PDF</p>
          </div>
          <ul className="about-night-line divide-y">
            {COMPARE.map(([ours, theirs]) => (
              <li key={ours} className="about-night-line grid py-2 text-base sm:grid-cols-2 sm:py-0">
                <p className="flex items-start gap-3 px-4 py-2 sm:px-6 sm:py-4">
                  <CheckCircleIcon className="mt-1 size-5 shrink-0 text-kincha" aria-label="風土記" />
                  {ours}
                </p>
                <p className="about-night-line about-night-dim flex items-start gap-3 px-4 py-2 sm:border-l sm:px-6 sm:py-4">
                  <XCircleIcon className="mt-1 size-5 shrink-0" aria-label="予算書の PDF" />
                  {theirs}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 議員・会派の方へ */}
      <section className="mt-28 grid gap-10 sm:mt-40 md:grid-cols-2 md:gap-16" id="council-ai" aria-labelledby="council-ai-h">
        <div>
          <p className="text-sm text-muted-foreground">議員・会派の方へ</p>
          <Title size="h1" as="h2" id="council-ai-h" className="mt-2">
            予算・決算委員会の調査を、AI で
          </Title>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">担当する分野の事業と金額の推移を、風土記のデータと議事録・委員会資料から AI で調べる仕組みを、議員・会派ごとに一緒につくります。</p>
          <a className={cn(primaryButton, 'mt-8')} href={COUNCIL_AI}>
            <EnvelopeSimpleIcon className="size-4" aria-hidden="true" />
            相談する
          </a>
        </div>
        <ul className="grid content-center gap-4">
          {COUNCIL_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-4 rounded-3xl bg-card p-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-base font-medium">{text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 受賞。決め手ではない情報なので冒頭に出さず、不安への答えの前に節で置く（2026-11-19 yuito） */}
      <section className="mt-28 grid items-center gap-10 sm:mt-40 md:grid-cols-2 md:gap-16" aria-labelledby="award-h">
        <div>
          <p className="text-sm text-muted-foreground">受賞</p>
          <Title size="h1" as="h2" id="award-h" className="mt-2">
            都知事杯オープンデータ・ハッカソンで受賞しました
          </Title>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">2026 年の大会で、データ活用賞（審査委員特別賞）をいただきました。</p>
          <a href={AWARD_VIDEO} target="_blank" rel="noopener" className={cn(textLink, 'mt-6')}>
            発表の配信を見る
            <ArrowSquareOutIcon className="size-4" aria-hidden="true" />
          </a>
        </div>
        <div className="overflow-hidden rounded-3xl border bg-card">
          <img className="block h-auto w-full" src="/about/award.webp" width={1200} height={602} alt="データ活用賞（審査委員特別賞）の発表の画面" loading="lazy" decoding="async" />
        </div>
      </section>

      {/* 不安への答え */}
      <section className="mt-28 grid gap-6 sm:mt-40 md:grid-cols-5 md:gap-10" aria-labelledby="faq-h">
        <Title size="h1" as="h2" id="faq-h" className="md:col-span-2">
          よくある質問
        </Title>
        <div className="divide-y border-y md:col-span-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden="true" className="text-muted-foreground transition-transform duration-200 group-open:rotate-45">
                  ＋
                </span>
              </summary>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 終わりの呼びかけ */}
      <section className="mt-28 rounded-3xl bg-brand px-6 py-20 text-center text-brand-foreground sm:mt-40 sm:py-28" aria-labelledby="cta-h">
        <Title size="h1" as="h2" id="cta-h">
          うちのまちの使い道を見てみよう
        </Title>
        <Link className={cn(fillButton, 'mt-8')} href={HOME_PATH}>
          まちを選ぶ
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Link>
        <p className="mt-4 text-sm">登録なし・無料</p>
      </section>

      <Footer />
    </main>
  )
}
