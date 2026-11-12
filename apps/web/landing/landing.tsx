// 風土記について（/about）。利用者に風土記を知ってもらう LP。視覚の規範は repo root の DESIGN.md、CSS は landing.css（.landing の中に閉じる）。
// 書体はゴシック1つ（--font-sans）。動くのは色の切り替え・冒頭のタブで替わる中身の浮き上がり・録画の再生だけで、スクロールでは動かさない。事業評価の画面は架空のデータのイメージ
import * as React from 'react'
import { ArrowRightIcon, CodeIcon, EnvelopeSimpleIcon, GavelIcon, HouseLineIcon, NewspaperIcon } from '@phosphor-icons/react'
import { Link } from '../nav/link'
import { Hint } from '@/components/hint'
import { HOME } from '../home-data'
import { LOGO_G, LOGO_WIDTH } from '../logo'
import { FEEDBACK } from '../nav/feedback'
import { ICON_SYMBOLS } from './icons'

const MCP = 'https://api.fudoki.dev/mcp'
const DOCS = 'https://docs.fudoki.dev'
const GITHUB = 'https://github.com/fudoki-hensansitu/fudoki'
const CHATGPT_PLUGIN = 'https://chatgpt.com/plugins/plugin_asdk_app_6ad87dc03a608191a13bba05310ea5d9'

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`
// 億・万の表記。万未満は切り捨てるので、正確な額は title に yen で添える
const oku = (n: number) => {
  if (n === 0) return '0円'
  const o = Math.floor(n / 1e8)
  const m = Math.floor((n % 1e8) / 1e4)
  return `${o ? `${o}億` : ''}${m ? `${m.toLocaleString('ja-JP')}万` : ''}円`
}
const Icon = ({ id }: { id: string }) => (
  <svg className="i" aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
)
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
/** クリップボードへ書けたら true */
const copy = (text: string) =>
  Promise.resolve()
    .then(() => navigator.clipboard.writeText(text))
    .then(
      () => true,
      () => false,
    )
/** 押すと一時だけ文言を替えるボタンの文言 */
function useFlash(idle: string): [string, (t: string) => void] {
  const [label, setLabel] = React.useState(idle)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  React.useEffect(() => () => clearTimeout(timer.current), [])
  return [
    label,
    (t) => {
      setLabel(t)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setLabel(idle), 2000)
    },
  ]
}

const { origin, library } = HOME
const libraryMax = Math.max(...library.rows.map((r) => r.amount))

const [cx0, cy0, cx1, cy1] = origin.crop
const [mx0, my0, mx1, my1] = origin.mark
const pct = (v: number, w: number) => `${((v / w) * 100).toFixed(2)}%`
const markStyle = { left: pct(mx0 - 3 - cx0, cx1 - cx0), top: pct(my0 - 3 - cy0, cy1 - cy0), width: pct(mx1 - mx0 + 6, cx1 - cx0), height: pct(my1 - my0 + 6, cy1 - cy0) }


const SETUP_PROMPT = [
  `風土記（自治体の行政情報）の MCP サーバーを、私が使っているこの AI クライアントに追加したいです。`,
  `- 種類: リモート MCP サーバー（Streamable HTTP）`,
  `- URL: ${MCP}`,
  `- 認証: 不要`,
  `- ChatGPT・Codex（ChatGPT デスクトップアプリ）なら、plugin ディレクトリの風土記（${CHATGPT_PLUGIN}）をインストールするだけで使えます`,
  ``,
  `私が使っているクライアントを確認したうえで、その設定画面（または設定ファイル）での追加手順を、一つずつ案内してください。`,
  `自分で設定を書き換えられる環境なら、書き換えてかまいません。`,
  `追加できたら、「北区に住んでいます。何の予算が見れますか？」と聞いて、接続を確かめてください。`,
].join('\n')

/** AI に貼り付ける文章の dialog。開くのは「そのほか」のタブのボタン */
function SetupDialog({ dialog }: { dialog: React.RefObject<HTMLDialogElement | null> }) {
  const [label, flash] = useFlash('コピーする')
  return (
    <dialog className="setup" id="setup" aria-labelledby="setup-h" ref={dialog} onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <h2 id="setup-h">AI に貼り付けて接続する</h2>
      <p>下の文章をコピーして、お使いの AI（Claude・ChatGPT など）に貼り付けると、風土記をつなぐ手順を案内してくれます。</p>
      <pre id="setup-text">{SETUP_PROMPT}</pre>
      <div className="acts">
        <button className="btn ol" type="button" onClick={() => dialog.current?.close()}>
          閉じる
        </button>
        <button className="btn" type="button" onClick={() => void copy(SETUP_PROMPT).then((ok) => flash(ok ? 'コピーしました' : 'コピーできませんでした'))}>
          {label}
        </button>
      </div>
    </dialog>
  )
}

function Code({ children }: { children: string }) {
  const [label, flash] = useFlash('コピー')
  return (
    <div className="ccode">
      <pre>
        <code>{children}</code>
      </pre>
      <button type="button" className="ccopy" onClick={() => void copy(children).then((ok) => ok && flash('コピーしました'))}>
        {label}
      </button>
    </div>
  )
}

const ASK = '「北区に住んでいます。何の予算が見れますか？」と聞きます。'
// 「AI から使う」のタブ。手順は docs の各クライアントの頁と揃える
const connect = (openSetup: () => void) => [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    icon: 'i-openai',
    steps: [
      <>
        風土記の plugin を開いて「＋」で追加します。
        <a className="btn" href={CHATGPT_PLUGIN} target="_blank" rel="noopener">
          風土記の plugin を開く
          <Icon id="arrow-square-out" />
        </a>
      </>,
      <>新しい会話で{ASK}ChatGPT でも Codex でも使えます。</>,
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    icon: 'i-asterisk',
    steps: [
      <>
        設定の「コネクタ」で、カスタムコネクタを追加します。名前は「風土記」、URL は次のとおりです。認証はいりません。<Code>{MCP}</Code>
      </>,
      <>会話で風土記を有効にして、{ASK}</>,
    ],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    icon: 'i-terminal',
    steps: [
      <>
        ターミナルで次を実行します。<Code>{'claude plugin marketplace add fudoki-hensansitu/fudoki\nclaude plugin install fudoki@fudoki-plugins'}</Code>
      </>,
      <>新しい会話で{ASK}</>,
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    icon: 'i-cursor',
    steps: [
      <>
        設定の Plugins で「From GitHub Repository」を選び、次の URL を入れて、出てきた風土記を Install します。<Code>{GITHUB}</Code>
      </>,
      <>新しい会話で{ASK}</>,
    ],
  },
  {
    id: 'other',
    label: 'そのほか',
    icon: 'i-plug',
    steps: [
      <>
        AI の設定で、つなぎ先として次の URL を追加します。認証はいりません。<Code>{MCP}</Code>
      </>,
      <>
        やり方が分からなければ、AI に聞くのが早道です。
        <button className="btn setup-open" type="button" onClick={openSetup}>
          AI に貼り付ける文章を見る
        </button>
      </>,
    ],
  },
]

/** 使っている AI ごとの接続の手順。矢印・Home・End でタブを移る */
function Connect({ openSetup }: { openSetup: () => void }) {
  const tabs = connect(openSetup)
  const [sel, setSel] = React.useState(0)
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key]
    if (next === undefined) return
    e.preventDefault()
    const k = (next + tabs.length) % tabs.length
    setSel(k)
    buttons.current[k]?.focus()
  }
  return (
    <div className="connect">
      <div className="ctabs" role="tablist" aria-label="使っている AI">
        {tabs.map((c, i) => (
          <button
            key={c.id}
            ref={(b) => {
              buttons.current[i] = b
            }}
            type="button"
            role="tab"
            id={`ct-${c.id}`}
            aria-controls={`cp-${c.id}`}
            aria-selected={i === sel}
            tabIndex={i === sel ? 0 : -1}
            onClick={() => setSel(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <Icon id={c.icon} />
            {c.label}
          </button>
        ))}
      </div>
      {tabs.map((c, i) => (
        <div className="cpanel" role="tabpanel" id={`cp-${c.id}`} aria-labelledby={`ct-${c.id}`} hidden={i !== sel} key={c.id}>
          <ol>
            {c.steps.map((st, j) => (
              <li key={j}>
                <b>{j + 1}</b>
                <div>{st}</div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

/** 操作の録画。見えている間だけ流し、利用者が止めたら（動きを減らす設定なら最初から）自分では流さない */
function Demo() {
  const ref = React.useRef<HTMLVideoElement>(null)
  const user = React.useRef(false)
  React.useEffect(() => {
    const v = ref.current
    if (!v) return
    user.current = reducedMotion()
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          if (!user.current) v.play().catch(() => {})
        } else v.pause()
      },
      { threshold: 0.4 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])
  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      user.current = false
      void v.play()
    } else {
      user.current = true
      v.pause()
    }
  }
  return (
    <figure className="demo">
      <video
        ref={ref}
        src="/home/demo.mp4"
        poster="/home/demo-poster.webp"
        width={1280}
        height={840}
        muted
        loop
        playsInline
        preload="none"
        tabIndex={0}
        aria-label="ChatGPT につないだ風土記に、北区の決算を聞いた操作の録画。Enter で再生・停止"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
      />
      <figcaption>
        <a href={DOCS}>
          つなぎ方をくわしく見る
          <Icon id="arrow-right" />
        </a>
      </figcaption>
    </figure>
  )
}


const SHINAGAWA = '/tokyo/shinagawa'
/** 自分のまちはホームのうちのまちで選ぶ */
const HOME_PATH = '/'

/** 品川区 R8年度当初予算の分野別の割合（自治体の頁と同じ値） */
const SHARES = [
  { name: '福祉・子育て', pct: 50.7 },
  { name: '教育', pct: 13.2 },
  { name: '行政・議会', pct: 10.1 },
  { name: '住まい・まちづくり', pct: 6.4 },
  { name: '産業・交通', pct: 4.3 },
  { name: '健康・医療', pct: 4.1 },
]
/** 品川区 R8年度の新しく始める事業（当初予算の主な施策のうち新規の印のもの） */
const NEW_PROJECTS = [
  { name: 'こども誰でも通園制度の開始', amount: '9.4', unit: '億円' },
  { name: '区の施設の「子ども料金」を無償に', amount: '3,047', unit: '万円' },
]
const QUESTIONS = [
  { q: '区の予算、いちばん多く使っているのは？', k: 'お金' },
  { q: '今年、新しく始まることは？', k: '事業' },
  { q: 'いちばんお金がかかっている事業は？', k: 'お金' },
  { q: '同じ事業に、毎年いくら使っている？', k: 'お金' },
  { q: 'やめた事業、見直した事業は？', k: '事業' },
  { q: '隣のまちと比べると、どう違う？', k: '比べる' },
]
const CYCLE = [
  { n: '組む', k: '予算', note: '1年の使い道を決める' },
  { n: '使う', k: '決算', note: '事業にお金を使う' },
  { n: '振り返る', k: '事業評価', note: '事業の成果を確かめる' },
  { n: '見直す', k: '次の予算', note: '広げる・やめるを決める' },
]

/** 議員・会派向けの AI 構築の相談の宛先 */
const COUNCIL_AI = `mailto:support@fudoki.dev?subject=${encodeURIComponent('議員・会派向け AI の相談')}`

const Soon = () => <span className="m-soon">画面はイメージです</span>

/** 手で丸を付けたような線。見出しの一語を囲む */
const Circle = () => (
  <svg className="circ" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
    <path d="M150 8c-62-3-136 9-141 42 -5 34 74 46 151 42 74-3 136-18 131-48C286 13 214 2 128 9" />
  </svg>
)
/** 鉛筆の落書き（渦と短い線）。読む内容は持たない */
const Spiral = ({ className }: { className: string }) => (
  <svg className={`doodle ${className}`} viewBox="0 0 80 80" aria-hidden="true">
    <path d="M40 42c-3 0-5-3-4-6 2-5 9-5 12-1 4 6-1 14-8 15-10 1-17-9-14-18 4-12 19-15 28-8 11 9 9 26-3 33-14 8-32 0-35-15" />
  </svg>
)
const Dashes = ({ className }: { className: string }) => (
  <svg className={`doodle ${className}`} viewBox="0 0 60 60" aria-hidden="true">
    <path d="M8 22l10 6M24 8l3 12M44 10l-6 10" />
  </svg>
)

/** 冒頭の画面のタブ。押すと画面の右半分の中身と、緑の札のボタンの色が替わる */
const STAGE = [
  {
    id: 'money',
    label: 'お金の使い道',
    title: '品川区 · R8年度の予算の使い道（分野ごとの割合）',
    body: (
      <ul className="m-bars">
        {SHARES.map((s) => (
          <li key={s.name}>
            <span>{s.name}</span>
            <i style={{ '--w': `${s.pct * 1.6}%` } as React.CSSProperties} />
            <b>
              {s.pct}
              <small>%</small>
            </b>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: 'new',
    label: '新しく始めること',
    title: '品川区 · R8年度に新しく始めること',
    body: (
      <ul className="m-list">
        {NEW_PROJECTS.map((p) => (
          <li key={p.name}>
            <span className="m-badge">NEW</span>
            <span>{p.name}</span>
            <b>
              {p.amount}
              <small>{p.unit}</small>
            </b>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: 'review',
    label: '振り返り',
    title: '放課後子ども教室 · R7年度の事業評価',
    soon: true,
    body: (
      <div className="m-eval">
        <small>参加した子ども（目標 9,000人）</small>
        <p>
          <em>8,420</em>
          <small>人</small>
        </p>
        <span className="m-meter">
          <i style={{ '--w': '93.6%' } as React.CSSProperties} />
        </span>
        <p className="m-dir">
          <small>これから</small>
          <b>拡充</b>
          <span>実施校を増やす</span>
        </p>
      </div>
    ),
  },
]

/** 冒頭の、自治体の頁を模した画面。下は切れていて、上に札を1枚浮かせる */
function Stage() {
  const [sel, setSel] = React.useState(0)
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: STAGE.length - 1 } as Record<string, number>)[e.key]
    if (next === undefined) return
    e.preventDefault()
    const k = (next + STAGE.length) % STAGE.length
    setSel(k)
    buttons.current[k]?.focus()
  }
  const cur = STAGE[sel]!
  return (
    <div className="stage">
      <div className="pills" role="tablist" aria-label="風土記で見られること">
        {STAGE.map((t, i) => (
          <button
            key={t.id}
            ref={(b) => {
              buttons.current[i] = b
            }}
            type="button"
            role="tab"
            id={`st-${t.id}`}
            aria-controls="st-panel"
            aria-selected={i === sel}
            tabIndex={i === sel ? 0 : -1}
            onClick={() => setSel(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pane-wrap">
        <Spiral className="d-pane" />
        <div className="pane">
          <div className="pane-main" aria-hidden="true">
            <div className="m-town-h">
              <img src="/jurisdictions/131091/emblem.svg" alt="" width={44} height={44} />
              <div>
                <b>品川区</b>
                <small>輝く笑顔 住み続けたいまち しながわ</small>
              </div>
            </div>
            <p className="m-big">
              R8年度の予算 <em>2,369</em>
              <small>億円</small>
            </p>
            <p className="m-sub">
              住民1人あたり 約<em>57</em>
              <small>万円</small>
            </p>
            <ul className="m-tabs">
              {STAGE.map((t, i) => (
                <li key={t.id} className={i === sel ? 'on' : undefined}>
                  {t.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="pane-side" role="tabpanel" id="st-panel" aria-labelledby={`st-${cur.id}`} key={cur.id}>
            <p className="m-h">
              {cur.title}
              {cur.soon && <Soon />}
            </p>
            {cur.body}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 生成りの札。上に文、下に画面のイメージ（下は切れる） */
function Sand({ k, title, body, children, className }: { k: string; title: React.ReactNode; body: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <article className={className ? `sand ${className}` : 'sand'}>
      <div className="sand-t">
        <span className="k">{k}</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <div className="mini" aria-hidden="true">
        {children}
      </div>
    </article>
  )
}

const ROLES = [
  { icon: HouseLineIcon, who: '住んでいる人', note: '自分のまちが何にお金を使い、今年何を始めるかを知る' },
  { icon: GavelIcon, who: '議員・職員', note: '予算・決算委員会の調査に。ほかのまちとも同じ物差しで比べる' },
  { icon: NewspaperIcon, who: '記者・研究者', note: '気になった数字を、出典の頁と印字の位置まで辿る' },
  { icon: CodeIcon, who: '開発者', note: '画面と同じデータを、API・MCP・オープンデータで使う' },
]

const FAQ: [string, React.ReactNode][] = [
  ['数字はどこから来ていますか', '自治体が公開した予算書・決算書・事業評価などの資料です。表に読み込んだあと、資料の中で重ねて印字された合計どうしが一致するかを確かめています。明細ごとに、資料の頁と印字された位置を持っています。'],
  ['事業や自治体の良し悪しを評価していますか', 'いいえ。風土記は評価を書かず、順位や良し悪しの色も付けません。事業評価は自治体が自分で振り返った結果で、風土記の評価ではありません。'],
  [
    'どのまちが入っていますか',
    <>
      収録するまちと年度は、順次広げています。いま入っている範囲は<Link href={HOME_PATH}>ホーム</Link>のまちの検索で確かめられます。
    </>,
  ],
  [
    '使うのにお金や登録は要りますか',
    <>
      このサイトで見たり、アシスタントに聞いたり、ふだんの調べものに使うなら要りません。会社の製品やサービスに組み込むなど商用で使うときは、事前にお問い合わせください。詳しくは<a href={`${DOCS}/terms`}>利用規約</a>をご覧ください。
    </>,
  ],
]

export function Landing() {
  const setup = React.useRef<HTMLDialogElement>(null)
  return (
    <div className="landing">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_SYMBOLS }} />
      <SetupDialog dialog={setup} />
      <main>
        <header className="hero wrap">
          <Spiral className="d-hero-l" />
          <Dashes className="d-hero-r" />
          <p className="eyebrow">風土記</p>
          <h1>
            私のお金は
            <br />
            <span className="circled">
              どこへ行った？
              <Circle />
            </span>
          </h1>
          <p className="sub">自治体が何にいくら使い、どう振り返ったかを、事業ごとに見られます。ほかのまちと同じ物差しで比べられ、出典の資料まで辿れます。</p>
          <div className="acts">
            <Link className="btn" href={HOME_PATH}>
              自分のまちを見る
              <ArrowRightIcon className="i" />
            </Link>
            <Link className="btn ol" href={SHINAGAWA}>
              品川区の例を見る
            </Link>
          </div>
          <p className="proof">登録なし・無料 · 出典の頁まで辿れる · 評価を書かない</p>
        </header>

        <section className="wrap" aria-label="自治体の頁のイメージ">
          <Stage />
        </section>

        <section className="sec wrap qs" aria-labelledby="qs-h">
          <h2 id="qs-h">
            気になったこと、
            <br />
            ありませんか
          </h2>
          <ul>
            {QUESTIONS.map((q) => (
              <li key={q.q}>
                <span className="k">{q.k}</span>
                {q.q}
              </li>
            ))}
          </ul>
        </section>

        <section className="wrap trio" aria-labelledby="trio-h">
          <div className="sec-h">
            <h2 id="trio-h">お金の使い道を、事業の単位まで</h2>
            <p className="lead">予算書・決算書・事業評価を読み込んで、区政の知識がなくても読める形にしました。</p>
          </div>
          <div className="trio-g">
            <Sand k="使う" title="いくらを、何に使っているか" body="分野ごとの割合も、住民1人あたりの額も、ひと目で。">
              <p className="m-h">
                品川区 · R8年度の予算
                <span>
                  <em>2,369</em>
                  <small>億円</small>
                </span>
              </p>
              <ul className="m-bars">
                {SHARES.map((s) => (
                  <li key={s.name}>
                    <span>{s.name}</span>
                    <i style={{ '--w': `${s.pct * 1.6}%` } as React.CSSProperties} />
                    <b>
                      {s.pct}
                      <small>%</small>
                    </b>
                  </li>
                ))}
              </ul>
            </Sand>
            <Sand k="新しく始める" title="今年、何が始まるか" body="新しく始まる事業、広げる事業、やめる事業を拾い出します。">
              <p className="m-h">品川区 · R8年度に新しく始めること</p>
              <ul className="m-list">
                {NEW_PROJECTS.map((p) => (
                  <li key={p.name}>
                    <span className="m-badge">NEW</span>
                    <span>{p.name}</span>
                    <b>
                      {p.amount}
                      <small>{p.unit}</small>
                    </b>
                  </li>
                ))}
              </ul>
            </Sand>
            <Sand k="振り返る" title="事業を、どう振り返ったか" body="自治体の事業評価を、事業ごとに、まちの言葉のまま。">
              <p className="m-h">
                放課後子ども教室 · R7年度 <Soon />
              </p>
              <div className="m-eval">
                <small>参加した子ども（目標 9,000人）</small>
                <p>
                  <em>8,420</em>
                  <small>人</small>
                </p>
                <span className="m-meter">
                  <i style={{ '--w': '93.6%' } as React.CSSProperties} />
                </span>
                <p className="m-dir">
                  <small>これから</small>
                  <b>拡充</b>
                  <span>実施校を増やす</span>
                </p>
              </div>
            </Sand>
          </div>
        </section>

        <section className="sec wrap" aria-labelledby="cycle-h">
          <div className="field">
            <div className="field-t">
              <p className="eyebrow">まちの一年</p>
              <h2 id="cycle-h">
                組んで、使って、
                <br />
                振り返る
              </h2>
              <p className="lead">自治体は予算を組み、そのお金で事業をし、事業を振り返って次の予算につなげます。風土記は、その一周をつなげて見せます。</p>
            </div>
            <ol className="tiles">
              {CYCLE.map((c, i) => (
                <li key={c.n} className={`t${i + 1}`}>
                  <small>{c.k}</small>
                  <b>{c.n}</b>
                  <span>{c.note}</span>
                </li>
              ))}
            </ol>
          </div>
          <ul className="roles" aria-label="使う人">
            {ROLES.map(({ icon: I, who, note }) => (
              <li key={who}>
                <I className="ri" />
                <b>{who}</b>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sec wrap duo" aria-labelledby="pair-h">
          <div className="sec-h">
            <h2 id="pair-h">
              隣のまちと、同じ物差しで。
              <br />
              数字は、出典の頁まで。
            </h2>
          </div>
          <div className="duo-g">
            <figure className="sand flat">
              <div className="sand-t">
                <span className="k">比べる</span>
                <h3>まちをまたいで並べる</h3>
                <p>まちごとに違う科目の名前を、国際基準の共通分類（COFOG）にそろえて並べます。人口あたりの額ではありません。</p>
              </div>
              <div className="mini open">
                <p className="m-h">
                  「{library.name}」に使った額 · {library.period}
                </p>
                <div className="bars">
                  {library.rows.map((r) => (
                    <div className="b" key={r.jurisdiction}>
                      <span>{r.jurisdiction}</span>
                      <i style={{ width: `${((r.amount / libraryMax) * 100).toFixed(1)}%` }} aria-hidden="true" />
                      <Hint label={yen(r.amount)}>
                        <span className="num">{oku(r.amount)}</span>
                      </Hint>
                    </div>
                  ))}
                </div>
              </div>
            </figure>
            <figure className="sand flat">
              <div className="sand-t">
                <span className="k">確かめる</span>
                <h3>出典の頁と、印字の位置まで</h3>
                <p>
                  「{origin.name}」の使った額 <b className="num">{yen(origin.amount)}</b> は、{origin.jurisdiction}の{origin.document}の {origin.page}頁のここに印字されています。
                </p>
              </div>
              <div className="mini open sheet">
                <p className="m-h">
                  {origin.jurisdiction} · {origin.document}
                  <span className="num">PDF {origin.page}頁</span>
                </p>
                <div className="crop">
                  <img src="/home/origin.webp" width={2136} height={879} loading="lazy" alt={`${origin.jurisdiction}の決算書 ${origin.page}頁の切り抜き。「${origin.name}」の使った額 ${yen(origin.amount)}`} />
                  <i className="mark" style={markStyle} aria-hidden="true" />
                </div>
              </div>
            </figure>
          </div>
        </section>

        <section className="sec wrap" id="mcp" aria-labelledby="mcp-h">
          <div className="mcp sand">
            <div>
              <p className="eyebrow">AI から使う</p>
              <h2 id="mcp-h">いつもの AI からも</h2>
              <p className="lead">ChatGPT や Claude に風土記をつなぐと、会話の中でまちの予算・決算・事業評価を調べられます。登録はいりません。</p>
              <Connect openSetup={() => setup.current?.showModal?.()} />
            </div>
            <Demo />
          </div>
        </section>

        <section className="wrap" id="council-ai" aria-labelledby="council-ai-h">
          <div className="council">
            <div>
              <p className="eyebrow">議員・会派の方へ</p>
              <h2 id="council-ai-h">
                予算・決算委員会の調査を、
                <br />
                AI で
              </h2>
              <p className="lead">担当する分野の事業と金額の推移を、風土記のデータと議事録・委員会資料から AI で調べる仕組みを、議員・会派ごとに一緒につくります。</p>
            </div>
            <ul>
              <li>担当分野の事業と、金額の年ごとの推移</li>
              <li>ほかのまちの同じ事業との比較</li>
              <li>議員・会派ごとの使い方と、始める順番の相談</li>
            </ul>
            <a className="btn" href={COUNCIL_AI}>
              <EnvelopeSimpleIcon className="i" />
              相談する
            </a>
          </div>
        </section>

        <section className="sec wrap faq" id="faq" aria-labelledby="faq-h">
          <h2 id="faq-h">よくある質問</h2>
          <div>
            {FAQ.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="wrap cta" aria-labelledby="cta-h">
          <Dashes className="d-cta" />
          <h2 id="cta-h">あなたのまちを、のぞいてみよう。</h2>
          <p>まちの名前を選ぶだけ。登録はいりません。</p>
          <Link className="btn" href={HOME_PATH}>
            自分のまちを見る
            <ArrowRightIcon className="i" />
          </Link>
        </section>
      </main>

      <footer className="wrap">
        <div className="cols">
          <div>
            <Link href="/" aria-label="風土記 ホーム">
              <svg className="logo" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${LOGO_WIDTH} 40`} role="img" aria-label="風土記" dangerouslySetInnerHTML={{ __html: `<title>風土記</title>${LOGO_G}` }} />
            </Link>
            <p>私のお金はどこへ行った？ 風土記は、自治体が何にいくら使い、どう振り返ったかを、事業ごとにわかりやすく見せるサイトです。ほかのまちと同じ物差しで比べられ、出典の資料まで辿れます。</p>
          </div>
          <div>
            <h2>使う</h2>
            <ul>
              <li>
                <Link href="/">ホーム</Link>
              </li>
              <li>
                <Link href="/assistant">アシスタント</Link>
              </li>
              <li>
                <a href="#mcp">AI から使う</a>
              </li>
              <li>
                <a href={DOCS}>ドキュメント</a>
              </li>
            </ul>
          </div>
          <div>
            <h2>作り</h2>
            <ul>
              <li>
                <a href={GITHUB}>GitHub</a>
              </li>
              <li>
                <a href={`${DOCS}/support`}>サポート</a>
              </li>
              <li>
                <a href={FEEDBACK}>フィードバック</a>
              </li>
              <li>
                <a href="mailto:support@fudoki.dev">お問い合わせ</a>
              </li>
              <li>
                <a href={COUNCIL_AI}>議員・会派向けの調査の相談</a>
              </li>
            </ul>
          </div>
          <div>
            <h2>決まりごと</h2>
            <ul>
              <li>
                <a href={`${DOCS}/privacy`}>プライバシーポリシー</a>
              </li>
              <li>
                <a href={`${DOCS}/terms`}>利用規約</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>713年、諸国に同じ様式で報告させた地誌にならって</span>
          <span>© 2026 風土記</span>
        </div>
      </footer>
    </div>
  )
}
