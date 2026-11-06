// fudoki.dev の入口の1枚。視覚の規範は repo root の DESIGN.md、CSS は landing.css（.landing の中に閉じる）。
// 見出しの明朝は /fonts/mincho.woff2（この頁で使う字だけの subset）。文言を変えたら `bun run --cwd apps/web build:font` で作り直す
// 動き（見出しの sweep・3つのステップの現在地・表の切り替え・録画の再生）はどれも無くても読める
import * as React from 'react'
import { flushSync } from 'react-dom'
import { Link } from '@void/react'
import { Hint } from '@/components/hint'
import { StartForm } from '../chat/start-form'
import { HOME } from '../home-data'
import { LOGO_G, LOGO_WIDTH } from '../logo'
import { ICON_SYMBOLS } from './icons'

const MCP = 'https://api.fudoki.dev/mcp'
const DOCS = 'https://docs.fudoki.dev'
const GITHUB = 'https://github.com/fudoki-hensansitu/fudoki'
const CHATGPT_PLUGIN = 'https://chatgpt.com/plugins/plugin_asdk_app_6ad87dc03a608191a13bba05310ea5d9'
/** 入力の placeholder に置く問いの例。幅390px の pill でも切れない長さにする */
const EXAMPLE = '例：中野区で一番お金を使った分野は？'
const UNAVAILABLE = '風土記の AI に聞く機能は準備中です。下の「自分の AI に接続する」から、お使いの AI で使えます。'

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

const { nakano, ledgers, origin, library } = HOME
const libraryMax = Math.max(...library.rows.map((r) => r.amount))

/** 入力。最初は hero の元の位置に置き、元の位置が画面の上へ出たら下に固定する。下に外れている（まだ読んでいない）間は動かさない */
function AskDock({ sitekey }: { sitekey: string }) {
  const root = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = root.current
    // 入力が出ない（鍵が無い）ときは固定する物が無いので、下余白も足さない
    if (!el || !sitekey) return
    let leave: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return
      const docked = !entry.isIntersecting && entry.boundingClientRect.top < 0
      const was = el.hasAttribute('data-docked')
      clearTimeout(leave)
      el.removeAttribute('data-leaving')
      el.toggleAttribute('data-docked', docked)
      document.body.classList.toggle('ask-docked', docked)
      // 元の位置へ戻るときは、固定のまま小さく消えてから流れに戻す（動きを減らす設定では即座に戻す）
      if (was && !docked && !reducedMotion()) {
        el.setAttribute('data-leaving', '')
        leave = setTimeout(() => el.removeAttribute('data-leaving'), 200)
      }
    })
    io.observe(el)
    return () => {
      io.disconnect()
      clearTimeout(leave)
      document.body.classList.remove('ask-docked')
    }
  }, [sitekey])
  return (
    <div id="chat-start" className="ask" ref={root}>
      <StartForm sitekey={sitekey} placeholder={EXAMPLE} unavailable={UNAVAILABLE} />
      <noscript>AI に聞くには JavaScript を有効にしてください。</noscript>
    </div>
  )
}

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

function LedgerRows({ l }: { l: (typeof ledgers)[number] }) {
  return (
    <>
      <tr className="k">
        <td>
          <span className="lv">大</span>
          {l.kan.name}
        </td>
        <td />
        <td className="n">{yen(l.kan.amount)}</td>
        <td className="n">{l.kan.page}頁</td>
      </tr>
      <tr className="ko">
        <td>
          <span className="lv">中</span>
          {l.kou.name}
        </td>
        <td />
        <td className="n">{yen(l.kou.amount)}</td>
        <td className="n">{l.kou.page}頁</td>
      </tr>
      {l.moku.map((m) => (
        <React.Fragment key={m.name}>
          <tr className="mo">
            <td>
              <span className="lv">小</span>
              {m.name}
            </td>
            <td>
              <span className="tag">{m.cofog}</span>
            </td>
            <td className="n">{yen(m.amount)}</td>
            <td className="n">{m.page}頁</td>
          </tr>
          {m.detail.map((d) => (
            <tr className="su" key={d.name}>
              <td>
                <span className="lv">{d.kind}</span>
                {d.name}
              </td>
              <td />
              <td className="n">{yen(d.amount)}</td>
              <td className="n">{d.page}頁</td>
            </tr>
          ))}
        </React.Fragment>
      ))}
    </>
  )
}

/** 自治体を順に切り替える表。見えている間だけ2秒ごとに次へ送り、題の自治体名を縦に回す（最後の次は先頭の写しへ回し、着いたら動きなしで先頭へ戻す） */
function Ledger() {
  const n = ledgers.length
  const [r, setR] = React.useState(0)
  const [animated, setAnimated] = React.useState(false)
  const roll = React.useRef<HTMLSpanElement>(null)
  const fit = React.useCallback(() => {
    const el = roll.current
    const name = el?.children[r] as HTMLElement | undefined
    if (el?.parentElement && name) el.parentElement.style.width = `${name.offsetWidth}px`
  }, [r])
  React.useLayoutEffect(() => {
    if (animated) fit()
  }, [animated, fit])
  React.useEffect(() => {
    if (!animated) return
    void document.fonts?.ready.then(fit)
  }, [animated, fit])
  const stage = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = stage.current
    if (!el || reducedMotion()) return
    setAnimated(true)
    let id: ReturnType<typeof setInterval> | undefined
    const io = new IntersectionObserver(([e]) => {
      clearInterval(id)
      if (e?.isIntersecting) id = setInterval(() => setR((x) => Math.min(x + 1, n)), 2000)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      clearInterval(id)
    }
  }, [n])
  const onRolled = (e: React.TransitionEvent<HTMLSpanElement>) => {
    const el = e.currentTarget
    if (e.target !== el || r !== n) return
    el.style.transition = 'none'
    flushSync(() => setR(0))
    void el.offsetWidth
    el.style.transition = ''
  }
  return (
    <div className="win ledger" ref={stage}>
      <p className="ttl" aria-hidden="true">
        <span className="roll">
          <span className="roll-in" ref={roll} style={{ '--r': r } as React.CSSProperties} onTransitionEnd={onRolled}>
            {[...ledgers, ledgers[0]!].map((l, i) => (
              <span key={i}>{l.jurisdiction}</span>
            ))}
          </span>
        </span>
        <span>· {nakano.period} · 一般会計</span>
      </p>
      <div className="tbls">
        {ledgers.map((l, i) => (
          <table className="tbl" key={l.jurisdiction} data-pos={i === r % n ? 'cur' : undefined}>
            <caption>
              {l.jurisdiction} · {nakano.period} · 一般会計
            </caption>
            <thead>
              <tr>
                <th scope="col">項目</th>
                <th scope="col">共通分類</th>
                <th scope="col" className="n">
                  使った額
                </th>
                <th scope="col" className="n">
                  出典
                </th>
              </tr>
            </thead>
            <tbody>
              <LedgerRows l={l} />
            </tbody>
          </table>
        ))}
      </div>
    </div>
  )
}

const STEPS = [
  { id: 'see', n: '一', title: '見る', note: '大きな分類から、細かい事業まで' },
  { id: 'compare', n: '二', title: '比べる', note: '共通の分類で、街をまたいで並べる' },
  { id: 'check', n: '三', title: '確かめる', note: '出典の頁と、印字の位置で' },
]

// 出典の切り抜きの上に、印字の位置を % で重ねる（3pt の余白を付ける）
const [cx0, cy0, cx1, cy1] = origin.crop
const [mx0, my0, mx1, my1] = origin.mark
const pct = (v: number, w: number) => `${((v / w) * 100).toFixed(2)}%`
const markStyle = { left: pct(mx0 - 3 - cx0, cx1 - cx0), top: pct(my0 - 3 - cy0, cy1 - cy0), width: pct(mx1 - mx0 + 6, cx1 - cx0), height: pct(my1 - my0 + 6, cy1 - cy0) }

/** 3つのステップ。幅の広い画面では左の rail が今読んでいるステップを指し、この節を読んでいる間だけ縦の scroll snap を効かせる */
function Steps() {
  const [at, setAt] = React.useState(0)
  const root = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = root.current
    if (!el) return
    const html = document.documentElement
    const snap = () => {
      const b = el.getBoundingClientRect()
      html.toggleAttribute('data-snap', b.top <= 1 && b.bottom >= innerHeight - 1)
    }
    addEventListener('scroll', snap, { passive: true })
    snap()
    const steps = [...el.querySelectorAll('.step')]
    const io = new IntersectionObserver((l) => l.forEach((e) => e.isIntersecting && setAt(steps.indexOf(e.target))), { rootMargin: '-45% 0px -45% 0px' })
    steps.forEach((s) => io.observe(s))
    return () => {
      removeEventListener('scroll', snap)
      html.removeAttribute('data-snap')
      io.disconnect()
    }
  }, [])
  return (
    <div className="steps" ref={root}>
      <nav className="rail" aria-label="3つのステップ" style={{ '--at': at } as React.CSSProperties}>
        <div className="rail-n" aria-hidden="true">
          <span className="win-n">
            {STEPS.map((s) => (
              <span key={s.id}>{s.n}</span>
            ))}
          </span>
          <small>／ 三</small>
        </div>
        <span className="gauge" aria-hidden="true">
          <i />
        </span>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} aria-current={i === at ? 'step' : undefined}>
                <b>{s.n}</b>
                <span>
                  <strong>{s.title}</strong>
                  <small>{s.note}</small>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div>
        <article className="step" id="see">
          <span className="k">ステップ一　見る</span>
          <h3>一つの街の支出を、事業の単位で</h3>
          <p>大きな分類から、その内訳、さらに細かい事業まで、出典の並びのまま引けます。予算案・当初予算・途中で組み替えた予算・決算（実際に使った額）は、別々の金額として持ちます。</p>
          <div className="stage">
            <div className="art paper" aria-hidden="true">
              <i style={{ right: -20, top: -30 }}>見</i>
              <s />
            </div>
            <div className="win">
              <h4 className="win-h">
                {nakano.jurisdiction}の大きな分類 · {nakano.period}
              </h4>
              <div className="lines">
                {nakano.kanList.map((k) => (
                  <div className="r" key={k.name}>
                    <span>{k.name}</span>
                    <Hint label={yen(k.amount)}>
                      <span className="num">{oku(k.amount)}</span>
                    </Hint>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
        <article className="step" id="compare">
          <span className="k">ステップ二　比べる</span>
          <h3>別の街と、同じ物差しで</h3>
          <p>大きな分類の名前は街ごとに違います。中野区には「民生費」という分類がありません。だから細かい分類ごとに、目的別の共通分類（国際基準 COFOG）を割り当て、街をまたいで並べられるようにしています。</p>
          <div className="stage">
            <div className="art burst" aria-hidden="true" />
            <div className="win">
              <h4 className="win-h">
                「{library.name}」 · 共通分類 {library.cofog}
              </h4>
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
              <p className="muted" style={{ fontSize: 12 }}>
                {library.period}。人口あたりの額ではありません。
              </p>
            </div>
          </div>
        </article>
        <article className="step" id="check">
          <span className="k">ステップ三　確かめる</span>
          <h3>怪しい数字は、出典の頁で</h3>
          <p>明細ごとに出典の頁と印字の位置を持ち、分類が確かか・仮か・できないかも返します。数字に引っかかったら、その頁を開けば確かめられます。</p>
          <div className="stage pdf">
            <div className="art oats" aria-hidden="true">
              <i style={{ left: -30, top: -40 }}>確</i>
            </div>
            <figure className="sheet">
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
                <small>囲みは、API が返す印字の位置</small>
              </p>
            </figure>
          </div>
        </article>
      </div>
    </div>
  )
}

const SETUP_PROMPT = [
  `風土記（自治体のデータ）の MCP サーバーを、私が使っているこの AI クライアントに追加したいです。`,
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

const FAQ: [string, React.ReactNode][] = [
  ['数字はどこから来ていますか', '自治体が公開した予算書・決算書（PDF または CSV）です。表に読み込んだあと、出典の中で重ねて印字された合計どうしが一致するかを確かめています。明細ごとに、出典の頁と印字された位置を持っています。'],
  ['予備費が 0 円なのは、使わなかったからですか', 'いいえ。決算の予備費は、他の費目へ補ったあとの使った額なので 0 円になります。どこへ補ったかは出典の備考にあり、風土記では注記の金額として、費目の金額とは別に持ちます。'],
  ['共通分類（COFOG）は正しいのですか', '分類は出典にない、風土記の判断です。確かなもの・仮のもの・分類できないものを区別して返し、分類できない明細も合計から落としません。'],
  [
    'どの自治体・年度が入っていますか',
    <>
      収録する自治体と年度は、順次広げています。いま入っている範囲は、AI に聞くか<a href={DOCS}>ドキュメント</a>で確かめられます。収録していないことは、支出がゼロであることを意味しません。
    </>,
  ],
  [
    '使うのにお金や登録は要りますか',
    <>
      要りません。このサイトのチャットに質問を入力すれば、登録なしでそのまま調べられます。ChatGPT や Claude など、いつも使っている AI につないで使うこともできます。詳しくは<a href={`${DOCS}/terms`}>利用規約</a>をご覧ください。
    </>,
  ],
]

export function Landing({ sitekey }: { sitekey: string }) {
  const setup = React.useRef<HTMLDialogElement>(null)
  return (
    <div className="landing">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_SYMBOLS }} />
      <SetupDialog dialog={setup} />
      <main>
        <header className="hero wrap">
          <p className="eyebrow">風土記 — まちを、ひらく</p>
          <Sweep>あなたの街は、何にいくら使ったか</Sweep>
          <p className="sub">自治体の予算書と決算書を、事業ごとの表にしました。AI に聞けば、他の街や他の年と同じ物差しで比べ、出典の頁まで返します。</p>
          <AskDock sitekey={sitekey} />
          <div className="acts">
            <a className="btn ol" href="#mcp">
              自分の AI に接続する
              <Icon id="arrow-right" />
            </a>
            <a className="btn ol" href={DOCS}>
              ドキュメント
            </a>
          </div>
        </header>
        <div className="wrap">
          <div className="ledger-stage">
            <div className="art oats" aria-hidden="true">
              <i style={{ left: -40, top: -40 }}>帳</i>
            </div>
            <Ledger />
          </div>
        </div>

        <section className="sec wrap" id="how" aria-label="3つのステップ">
          <Steps />
        </section>

        <section className="mcp wrap" id="mcp" aria-labelledby="mcp-h">
          <div>
            <p className="eyebrow">AI から使う</p>
            <h2 id="mcp-h">いつもの AI からも使えます</h2>
            <p className="lead">ChatGPT や Claude に風土記をつなぐと、会話の中で街の支出を調べられます。登録はいりません。</p>
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
      </main>

      <footer className="wrap">
        <div className="cols">
          <div>
            <Link href="/" aria-label="風土記 ホーム">
              <svg className="logo" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${LOGO_WIDTH} 40`} role="img" aria-label="風土記" dangerouslySetInnerHTML={{ __html: `<title>風土記</title>${LOGO_G}` }} />
            </Link>
            <p>まちを、ひらく。自治体のことを、誰でも見られて、書き足せる形に。</p>
          </div>
          <div>
            <h2>使う</h2>
            <ul>
              <li>
                <Link href="/jurisdictions">自治体を探す</Link>
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
