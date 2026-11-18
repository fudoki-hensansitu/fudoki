// 風土記について（/about）。利用者に風土記を知ってもらう LP。構成は marketingskills の copywriting の LP の型（困りごと → やり方 → できるようになること → 不安への答え → 呼びかけ）に沿う（2026-11-18 yuito）。
// 見た目はアプリと同じ白地・ゴシック・Title の段で組み、画面の絵は実際の画面の画像（public/about/、ライト・ダークの2枚）を使う。切り替える部品（タブ・dialog）は置かない。
// 動くのは冒頭の絵の浮き上がりと AI の節の録画だけ（動きを減らす設定では止める）
import * as React from 'react'
import { ArrowRightIcon, ArrowSquareOutIcon, EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { Title } from '@/components/ui/title'
import { cn } from '@/lib/utils'
import { Footer } from '../home/home'
import { HOME } from '../home-data'

const DOCS = 'https://docs.fudoki.dev'
const HOME_PATH = '/'
/** 議員・会派向けの AI 構築の相談の宛先。導線として残す（2026-11-18 yuito） */
const COUNCIL_AI = `mailto:support@fudoki.dev?subject=${encodeURIComponent('議員・会派向け AI の相談')}`

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`
const { origin } = HOME
const [cx0, cy0, cx1, cy1] = origin.crop
const [mx0, my0, mx1, my1] = origin.mark
const pct = (v: number, w: number) => `${((v / w) * 100).toFixed(2)}%`
const markStyle = { left: pct(mx0 - 3 - cx0, cx1 - cx0), top: pct(my0 - 3 - cy0, cy1 - cy0), width: pct(mx1 - mx0 + 6, cx1 - cx0), height: pct(my1 - my0 + 6, cy1 - cy0) }

const primaryButton = 'inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90'
const textLink = 'inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline'

/** 実際の画面の画像。テーマに合わせてライト・ダークの片方を出す（about.css） */
function Shot({ name, width, height, alt, className }: { name: string; width: number; height: number; alt: string; className?: string }) {
  return (
    <span className={cn('block', className)}>
      <img className="shot-light block h-auto w-full" src={`/about/${name}-light.webp`} width={width} height={height} alt={alt} loading="lazy" decoding="async" />
      <img className="shot-dark hidden h-auto w-full" src={`/about/${name}-dark.webp`} width={width} height={height} alt="" aria-hidden="true" loading="lazy" decoding="async" />
    </span>
  )
}

/** 画面の画像を置く枠。アプリの札と同じ角丸と線 */
function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-3xl border bg-background', className)}>{children}</div>
}

/** 操作の録画。見えている間だけ流し、動きを減らす設定では流さない（押せば流れる）。再生の操作盤は出さない */
function Demo() {
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
    <Frame>
      <video
        ref={ref}
        className="block h-auto w-full cursor-pointer"
        src="/home/demo.mp4"
        poster="/home/demo-poster.webp"
        width={1280}
        height={840}
        muted
        loop
        playsInline
        preload="none"
        tabIndex={0}
        aria-label="ChatGPT につないだ風土記に、北区の決算を聞いた操作の録画。押すと再生・停止"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
      />
    </Frame>
  )
}

const STEPS = [
  { title: 'まちを選ぶ', body: '名前か、今いる場所から' },
  { title: '1人あたりのレシートを見る', body: 'その年の予算を、住民1人あたりに直して分野ごとに' },
  { title: '気になった事業を開く', body: 'お金のかかる順に、中身と年ごとの額まで' },
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

/** できるようになること。見出し・文・実際の画面 */
function Benefit({ title, body, children, flip }: { title: string; body: React.ReactNode; children: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-6 md:grid-cols-5 md:gap-10">
      <div className={cn('md:col-span-2', flip && 'md:order-2')}>
        <Title size="h3">{title}</Title>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className={cn('md:col-span-3', flip && 'md:order-1')}>{children}</div>
    </div>
  )
}

export function Landing({ count }: { count: number | null }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-4 pt-12 pb-28 sm:px-8 sm:pt-20 md:pb-10">
      {/* 冒頭: 困りごと（見出しの問い）→ できるようになること → ボタン */}
      <header className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <Title size="display" as="h1" className="leading-tight">
            私のお金は
            <br />
            どこへ行った？
          </Title>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">住んでいるまちが何にいくら使い、今年なにを始めるのか。予算書を開かなくても、事業ごとに分かります。</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link className={primaryButton} href={HOME_PATH}>
              うちのまちの使い道を見る
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">登録なし・無料{count ? ` · ${count}自治体を収録` : ''}</p>
        </div>
        <div className="about-rise mx-auto w-full max-w-sm">
          <Shot name="receipt" width={1664} height={2400} alt="品川区の札とレシート。R8年度の予算 2,369億1,400万円を1人あたりに直すと 56万9,993円で、福祉・子育て 288,905円、教育 75,332円など分野ごとに並ぶ" className="max-h-[560px] overflow-hidden rounded-3xl" />
        </div>
      </header>

      {/* 困りごと */}
      <section className="mt-28 max-w-2xl" aria-labelledby="pain-h">
        <Title size="h2" id="pain-h">
          公開されているのに、読めない
        </Title>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">自治体の予算・決算は誰でも見られます。ただ、数百頁の PDF で、まちごとに書き方も違います。自分の暮らしに関わる事業を探すだけで、半日かかります。</p>
      </section>

      {/* やり方 */}
      <section className="mt-28" aria-labelledby="how-h">
        <Title size="h2" id="how-h">
          まちを選ぶだけ
        </Title>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-3xl bg-card p-6">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{i + 1}</span>
              <Title size="headline" as="h3" className="mt-4">
                {s.title}
              </Title>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* できるようになること */}
      <section className="mt-28 grid gap-20" aria-label="風土記でできること">
        <Benefit title="税金がどの事業に回ったか、追える" body="税金や国・都からのお金が、福祉や教育に分かれ、一つ一つの事業に届くまでを、図と表でたどれます。">
          <Frame className="p-4 sm:p-6">
            <Shot name="sankey" width={2080} height={954} alt="品川区 R8年度予算のお金の流れの図。特別区税 28%・特別区交付金 22% などの入るお金が一般会計を通り、福祉・子育て 51%・教育 13% などへ分かれる" />
          </Frame>
        </Benefit>
        <Benefit flip title="隣のまちと比べられる" body="1人あたりいくら使ったか、借金や貯金はどれくらいか。問いを選ぶと、まちごとの答えが地図に並びます。">
          <Frame className="p-4 sm:p-6">
            <Shot name="compare" width={2020} height={1100} alt="まち比べの「1人あたり、いくら使った？」。東京都のまちを地図の形に並べ、額の多いまちほど濃い緑で塗っている" />
          </Frame>
          <Link href="/compare" className={cn(textLink, 'mt-3')}>
            まち比べを開く
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </Benefit>
        <Benefit title="その数字が、資料のどこにあるか確かめられる" body="事業の予算・決算・事業評価から、自治体の資料のその頁を開けます。">
          <div className="grid gap-4">
            <Frame className="p-4 sm:p-6">
              <Shot name="project" width={1190} height={600} alt="品川区「私立保育園費」の年度ごとの当初予算・決算・評価。どの額にも資料を開く印が付いている" />
            </Frame>
            <figure className="overflow-hidden rounded-3xl border bg-background">
              <div className="relative">
                <img src="/home/origin.webp" width={2136} height={879} loading="lazy" decoding="async" className="block h-auto w-full" alt={`${origin.jurisdiction}の${origin.document} ${origin.page}頁の切り抜き。「${origin.name}」の使った額 ${yen(origin.amount)}`} />
                <i className="absolute rounded-sm border-2 border-primary" style={markStyle} aria-hidden="true" />
              </div>
              <figcaption className="border-t px-4 py-3 text-xs text-muted-foreground">
                {origin.jurisdiction} · {origin.document} {origin.page}頁
              </figcaption>
            </figure>
          </div>
        </Benefit>
      </section>

      {/* 聞く */}
      <section className="mt-28 grid items-center gap-6 md:grid-cols-5 md:gap-10" aria-labelledby="ask-h">
        <div className="md:col-span-2">
          <Title size="h2" id="ask-h">
            分からないことは、そのまま聞ける
          </Title>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">「子育てにいくら使ってる？」と聞くと、風土記のデータから答えます。ChatGPT や Claude など、いつもの AI からも使えます。</p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
            <Link href="/assistant" className={textLink}>
              アシスタントに聞く
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
            <a href={DOCS} target="_blank" rel="noopener" className={textLink}>
              いつもの AI につなぐ
              <ArrowSquareOutIcon className="size-4" aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="md:col-span-3">
          <Demo />
        </div>
      </section>

      {/* 議員・会派の方へ */}
      <section className="mt-28 rounded-3xl bg-card p-6 sm:p-10" id="council-ai" aria-labelledby="council-ai-h">
        <p className="text-sm text-muted-foreground">議員・会派の方へ</p>
        <Title size="h2" id="council-ai-h" className="mt-2">
          予算・決算委員会の調査を、AI で
        </Title>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">担当する分野の事業と金額の推移を、風土記のデータと議事録・委員会資料から AI で調べる仕組みを、議員・会派ごとに一緒につくります。</p>
        <ul className="mt-6 grid gap-2 text-base sm:grid-cols-3 sm:gap-4">
          {['担当分野の事業と、金額の年ごとの推移', 'ほかのまちの同じ事業との比較', '議員・会派ごとの使い方と、始める順番の相談'].map((t) => (
            <li key={t} className="border-l-2 border-primary pl-3">
              {t}
            </li>
          ))}
        </ul>
        <a className={cn(primaryButton, 'mt-8')} href={COUNCIL_AI}>
          <EnvelopeSimpleIcon className="size-4" aria-hidden="true" />
          相談する
        </a>
      </section>

      {/* 不安への答え */}
      <section className="mt-28 grid gap-6 md:grid-cols-5 md:gap-10" aria-labelledby="faq-h">
        <Title size="h2" id="faq-h" className="md:col-span-2">
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
      <section className="mt-28 rounded-3xl bg-brand px-6 py-12 text-center text-brand-foreground sm:py-16" aria-labelledby="cta-h">
        <Title size="h2" id="cta-h">
          あなたのまちのレシートを見てみよう
        </Title>
        <Link className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-fill px-6 py-3 text-base font-medium text-brand-fill-foreground transition-colors duration-150 hover:bg-brand-fill-hover" href={HOME_PATH}>
          うちのまちの使い道を見る
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Link>
        <p className="mt-4 text-sm opacity-80">登録なし・無料</p>
      </section>

      <Footer />
    </main>
  )
}
