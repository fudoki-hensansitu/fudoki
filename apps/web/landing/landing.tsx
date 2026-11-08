// 風土記について（/about）。利用者に風土記を知ってもらう LP。視覚の規範は repo root の DESIGN.md、CSS は landing.css（.landing の中に閉じる）。
// 見出しの明朝は /fonts/mincho.woff2（この頁で使う字だけの subset）。文言を変えたら `bun run --cwd apps/web build:font` で作り直す
// 動き（見出しの sweep・節の浮き上がり・録画の再生）はどれも無くても読める。議会・選挙・事業評価の画面は架空のデータのイメージ
import * as React from 'react'
import { Link } from '@void/react'
import { Hint } from '@/components/hint'
import { HOME } from '../home-data'
import { LOGO_G, LOGO_WIDTH } from '../logo'
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

/** 見出し。画面に入ったら一度だけ色を流す */
function Sweep({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLHeadingElement>(null)
  const [seen, setSeen] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (l) => {
        if (l.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <h1 ref={ref} className={seen ? 'sweep in' : 'sweep'}>
      {children}
    </h1>
  )
}


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
const JURISDICTIONS = '/jurisdictions'

/** 品川区 R8年度当初予算の分野別の割合（自治体の頁と同じ値） */
const SHARES = [
  { name: '福祉・子育て', pct: 50.7 },
  { name: '教育', pct: 13.2 },
  { name: '行政・議会', pct: 10.1 },
  { name: '住まい・まちづくり', pct: 6.4 },
  { name: '産業・交通', pct: 4.3 },
  { name: '健康・医療', pct: 4.1 },
]
/** 品川区 R8年度の新しく始める事業（当初予算の主な施策。事業の予算額は profiles.ts の budgetNew と同じ） */
const NEW_PROJECTS = [
  { name: '乳児等通園支援事業費', note: '運営費助成（80園）。在宅で子育てする世帯の子どもにも通園の機会を', amount: '9.4', unit: '億円' },
  { name: '子ども・若者活動拠点経費', note: '子ども・若者活動拠点施設等の整備。中高生・若者が企画できる多世代のスペース', amount: '6.8', unit: '億円' },
]
/** 議会のイメージ（架空） */
const BILLS = [
  { no: '第45号議案', title: '令和8年度 一般会計補正予算（第2号）', result: '可決', vote: [24, 16] },
  { no: '第46号議案', title: '区立学校設置条例の一部を改正する条例', result: '可決', vote: [40, 0] },
  { no: '請願第3号', title: '駅前の自転車置き場の増設を求める請願', result: '継続審査', vote: null },
] as const
/** 選挙のイメージ（架空。並びは届出順） */
const CANDIDATES = [
  { tag: 'A', age: 52, from: '元区職員', words: ['子育て', '防災'] },
  { tag: 'B', age: 44, from: 'NPO 代表', words: ['若者の居場所', '公園'] },
  { tag: 'C', age: 61, from: '会社経営', words: ['商店街', '税の使い方'] },
]
const QUESTIONS = [
  { q: '区の予算、いちばん多く使っているのは？', k: 'お金' },
  { q: '今年、新しく始まることは？', k: '事業' },
  { q: '議会で、何が決まった？', k: '議会' },
  { q: '次の選挙、誰が立候補している？', k: '選挙' },
  { q: 'やめた事業、見直した事業は？', k: '事業' },
  { q: '隣のまちと比べると、どう違う？', k: '比べる' },
]
const CYCLE = [
  { n: '選ぶ', k: '選挙', note: '区長と議員を選ぶ' },
  { n: '決める', k: '議会', note: '予算と条例を決める' },
  { n: '使う', k: '予算・決算', note: '事業にお金を使う' },
  { n: '振り返る', k: '事業評価', note: '事業をどうするか見直す' },
]

/** 画面に入ったら一度だけ .in を付ける。隠すのは .rv-on を付けた後だけ（動きを減らす設定では隠さない） */
function useReveal() {
  React.useEffect(() => {
    const root = document.querySelector('.landing')
    const els = [...document.querySelectorAll('.landing .rv')]
    if (!root || reducedMotion()) return
    root.classList.add('rv-on')
    const io = new IntersectionObserver((l) => l.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { rootMargin: '0px 0px -12% 0px' })
    els.forEach((e) => io.observe(e))
    return () => {
      io.disconnect()
      root.classList.remove('rv-on')
    }
  }, [])
}

const Soon = () => <span className="m-soon">画面はイメージです</span>

/** 冒頭の、自治体の頁を模した札 */
function HeroCard() {
  return (
    <div className="hcard" aria-hidden="true">
      <Soon />
      <div className="m-town">
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
          <li>区の仕事</li>
          <li>お金の使い道</li>
          <li>議会</li>
          <li>選挙</li>
        </ul>
      </div>
      <div className="m-float f1">
        <span className="m-badge new">NEW</span>
        <span>
          子ども・若者活動拠点
          <small>6.8億円</small>
        </span>
      </div>
      <div className="m-float f2">
        <span className="m-badge vote">選挙</span>
        <span>
          区長選挙
          <small>投票日 11月15日（日）</small>
        </span>
      </div>
      <div className="m-float f3">
        <span className="m-badge gikai">議会</span>
        <span>
          補正予算（第2号）
          <small>可決</small>
        </span>
      </div>
    </div>
  )
}

function Feature({ id, k, title, body, children, flip }: { id: string; k: string; title: React.ReactNode; body: React.ReactNode; children: React.ReactNode; flip?: boolean }) {
  return (
    <article className={flip ? 'feat flip rv' : 'feat rv'} id={id}>
      <div className="feat-t">
        <span className="k">{k}</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <div className="feat-m">{children}</div>
    </article>
  )
}

const FAQ: [string, React.ReactNode][] = [
  ['数字はどこから来ていますか', '自治体が公開した予算書・決算書・事業評価などの資料です。表に読み込んだあと、資料の中で重ねて印字された合計どうしが一致するかを確かめています。明細ごとに、資料の頁と印字された位置を持っています。'],
  ['議員や候補者、事業の良し悪しを評価していますか', 'いいえ。風土記は評価を書かず、順位や良し悪しの色も付けません。事業評価は自治体が自分で振り返った結果で、風土記の評価ではありません。'],
  ['議会や選挙の情報はいつ見られますか', '準備を進めています。予算や事業とつなげて、議案・議決や候補者・結果を同じ様式で載せていきます。'],
  [
    'どのまちが入っていますか',
    <>
      収録するまちと年度は、順次広げています。いま入っている範囲は<Link href={JURISDICTIONS}>自治体の一覧</Link>で確かめられます。
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
  useReveal()
  return (
    <div className="landing">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_SYMBOLS }} />
      <SetupDialog dialog={setup} />
      <main>
        <header className="hero wrap">
          <div className="hero-t">
            <p className="eyebrow">風土記</p>
            <Sweep>
              うちのまち、
              <br />
              なにしてる？
            </Sweep>
            <p className="sub">まちが決めたこと、使ったお金、その振り返り。議会の議決や選挙の候補者まで、あなたのまちのことを、ひとつの場所で、出典つきで。</p>
            <div className="acts">
              <Link className="btn" href={JURISDICTIONS}>
                自分のまちを見る
                <Icon id="arrow-right" />
              </Link>
              <Link className="btn ol" href={SHINAGAWA}>
                品川区の例を見る
              </Link>
            </div>
          </div>
          <HeroCard />
        </header>

        <section className="sec wrap qs" aria-labelledby="qs-h">
          <h2 id="qs-h" className="rv">
            気になったこと、
            <br />
            ありませんか
          </h2>
          <ul>
            {QUESTIONS.map((q, i) => (
              <li key={q.q} className="rv" style={{ '--d': `${i * 60}ms` } as React.CSSProperties}>
                <span className="k">{q.k}</span>
                {q.q}
              </li>
            ))}
          </ul>
          <p className="qs-a rv">ぜんぶ、風土記で見られます。</p>
        </section>

        <section className="sec wrap cycle" aria-labelledby="cycle-h">
          <div className="sec-h rv">
            <p className="eyebrow">まちの一年</p>
            <h2 id="cycle-h">選んで、決めて、使って、振り返る</h2>
            <p className="lead">まちの仕事は、ひとつながりです。選挙で選ばれた人が議会で予算を決め、まちがそのお金で事業をし、事業を振り返って次の予算につなげる。風土記は、その一周をつなげて見せます。</p>
          </div>
          <ol>
            {CYCLE.map((c, i) => (
              <li key={c.n} className="rv" style={{ '--d': `${i * 90}ms` } as React.CSSProperties}>
                <b>{c.n}</b>
                <span className="k">{c.k}</span>
                <small>{c.note}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="wrap feats" aria-label="風土記で見られること">
          <Feature id="money" k="使う ── お金の使い道" title="いくらを、何に使っているか" body="予算書と決算書を、事業の単位まで読み込みました。分野ごとの割合も、住民1人あたりの額も、ひと目でわかります。">
            <div className="m-card">
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
            </div>
          </Feature>

          <Feature id="new" flip k="使う ── 新しく始めること" title="今年、何が始まり、何が変わるか" body="毎年の予算で新しく始まる事業、広げる事業、やめる事業を拾い出します。区の広報を読み込まなくても、変わったところがわかります。">
            <div className="m-card">
              <p className="m-h">品川区 · R8年度に新しく始めること</p>
              <ul className="m-list">
                {NEW_PROJECTS.map((p) => (
                  <li key={p.name}>
                    <span className="m-badge new">NEW</span>
                    <span>
                      {p.name}
                      <small>{p.note}</small>
                    </span>
                    <b>
                      {p.amount}
                      <small>{p.unit}</small>
                    </b>
                  </li>
                ))}
              </ul>
              <p className="m-note">ほかにも、防災・教育・まちづくりなどの事業が並びます</p>
            </div>
          </Feature>

          <Feature id="council" k="決める ── 議会" title="議会で、何が決まったか" body="提案された議案と、その結果を一覧にします。会派ごとの賛否も、そのまま並べます。お金の使い道とつながっているので、決まったことが何に効くかまで辿れます。">
            <div className="m-card">
              <p className="m-h">
                〇〇区議会 · 第4回定例会 <Soon />
              </p>
              <ul className="m-bills">
                {BILLS.map((b) => (
                  <li key={b.no}>
                    <small>{b.no}</small>
                    <span>{b.title}</span>
                    <b>{b.result}</b>
                    {b.vote && (
                      <span className="m-vote">
                        賛成 {b.vote[0]}・反対 {b.vote[1]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Feature>

          <Feature id="election" flip k="選ぶ ── 選挙" title="次の選挙、誰が、何を訴えているか" body="候補者の経歴と訴えを、同じ様式で並べます。並びは届出順。順位も、良し悪しの色も付けません。比べて決めるのは、あなたです。">
            <div className="m-card">
              <p className="m-h">
                〇〇区長選挙 · 投票日 11月15日（日） <Soon />
              </p>
              <ul className="m-cands">
                {CANDIDATES.map((c) => (
                  <li key={c.tag}>
                    <span className="m-face">{c.tag}</span>
                    <span>
                      候補者{c.tag}
                      <small>
                        {c.age}歳・{c.from}
                      </small>
                    </span>
                    <span className="m-words">
                      {c.words.map((w) => (
                        <i key={w}>{w}</i>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="m-note">前回の投票率 32.6%（イメージ）</p>
            </div>
          </Feature>

          <Feature id="review" k="振り返る ── 事業評価" title="まちは、自分の事業をどう振り返ったか" body="自治体が毎年まとめる事業評価を、事業ごとに読める形にします。目標にどこまで届いたか、これからどうするかを、まちの言葉のまま。">
            <div className="m-card">
              <p className="m-h">放課後子ども教室 · R7年度の評価</p>
              <div className="m-eval">
                <div>
                  <small>参加した子ども（目標 9,000人）</small>
                  <p>
                    <em>8,420</em>
                    <small>人</small>
                    
                  </p>
                  <span className="m-meter">
                    <i style={{ '--w': '93.6%' } as React.CSSProperties} />
                  </span>
                </div>
                <div className="m-dir">
                  <small>これから</small>
                  <b>拡充</b>
                  <span>実施校を増やす</span>
                </div>
              </div>
              <p className="m-note">
                <Soon />
              </p>
            </div>
          </Feature>
        </section>

        <section className="sec wrap pair" aria-labelledby="pair-h">
          <div className="sec-h rv">
            <p className="eyebrow">比べる・確かめる</p>
            <h2 id="pair-h">隣のまちと、同じ物差しで。数字は、出典の頁まで。</h2>
          </div>
          <div className="pair-g">
            <figure className="m-card rv">
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
              <figcaption>まちごとに違う科目の名前を、国際基準の共通分類（COFOG）にそろえて並べます。人口あたりの額ではありません。</figcaption>
            </figure>
            <figure className="sheet rv">
              <figcaption>
                <span>
                  {origin.jurisdiction} · {origin.document}
                </span>
                <span className="num">PDF {origin.page}頁</span>
              </figcaption>
              <div className="crop">
                <img src="/home/origin.webp" width={2136} height={879} loading="lazy" alt={`${origin.jurisdiction}の決算書 ${origin.page}頁の切り抜き。「${origin.name}」の使った額 ${yen(origin.amount)}`} />
                <i className="mark" style={markStyle} aria-hidden="true" />
              </div>
              <p>
                「{origin.name}」の使った額 <b className="num">{yen(origin.amount)}</b>
                <small>どの数字も、資料のどの頁のどこに印字されているかまで辿れます。</small>
              </p>
            </figure>
          </div>
        </section>

        <section className="sec wrap stance" aria-labelledby="stance-h">
          <h2 id="stance-h" className="rv">
            評価はしません。
            <br />
            並べて、見せるだけ。
          </h2>
          <ul>
            <li className="rv">
              <b>良し悪しを書かない</b>
              <span>事業にも、議員や候補者にも、順位や色を付けません。読み解くのは、読む人です。</span>
            </li>
            <li className="rv">
              <b>同じ様式で集める</b>
              <span>713年、諸国に同じ様式で報告させて集めた地誌『風土記』にならい、どのまちも同じ形で載せます。</span>
            </li>
            <li className="rv">
              <b>誰でも使える</b>
              <span>画面に出しているのと同じデータを、出典つきで API・MCP・オープンデータとして配っています。</span>
            </li>
          </ul>
        </section>

        <section className="mcp wrap" id="mcp" aria-labelledby="mcp-h">
          <div>
            <p className="eyebrow">AI から使う</p>
            <h2 id="mcp-h">いつもの AI からも</h2>
            <p className="lead">ChatGPT や Claude に風土記をつなぐと、会話の中でまちの予算・決算・事業評価を調べられます。登録はいりません。</p>
            <Connect openSetup={() => setup.current?.showModal?.()} />
          </div>
          <Demo />
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

        <section className="wrap" aria-labelledby="cta-h">
          <div className="cta rv">
            <h2 id="cta-h">あなたのまちを、のぞいてみよう。</h2>
            <p>まちの名前を選ぶだけ。登録はいりません。</p>
            <Link className="btn wh" href={JURISDICTIONS}>
              自分のまちを見る
              <Icon id="arrow-right" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="wrap">
        <div className="cols">
          <div>
            <Link href="/" aria-label="風土記 ホーム">
              <svg className="logo" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${LOGO_WIDTH} 40`} role="img" aria-label="風土記" dangerouslySetInnerHTML={{ __html: `<title>風土記</title>${LOGO_G}` }} />
            </Link>
            <p>うちのまち、なにしてる？まちが何を決めて、何をしているかを、出典つきで誰でも見られる形に。</p>
          </div>
          <div>
            <h2>使う</h2>
            <ul>
              <li>
                <Link href="/">ホーム</Link>
              </li>
              <li>
                <Link href="/jurisdictions">自治体を探す</Link>
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
                <a href="mailto:support@fudoki.dev">お問い合わせ</a>
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
