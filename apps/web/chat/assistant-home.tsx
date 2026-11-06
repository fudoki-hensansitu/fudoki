// アシスタントの頁（/assistant）。マーク・問い・入力と、押すとその質問で会話を始める例のカードを中央に置く。送ると /s/:id へ移る
import * as React from 'react'
import { ChartBarIcon, ScalesIcon } from '@phosphor-icons/react'
import { Mark } from '../nav/site-nav'
import { StartForm } from './start-form'

/** 入力欄の placeholder に打っては消して見せる問いの例。収録のある自治体で答えられるものにする */
const TYPED_EXAMPLES = [
  '品川区で一番大きな金額の事業は？',
  '町田市の歳出は前の年からどう変わった？',
  '世田谷区は子育てにいくら使っている？',
  '中野区の歳出で一番多い分野は？',
  '八王子市と町田市の1人あたりの歳出を比べて',
]
const TYPE_MS = 90
const ERASE_MS = 35
const HOLD_MS = 1800

/** 例を1字ずつ打ち、少し止めてから1字ずつ消し、次の例へ移る。動きを減らす設定では最初の例を出したままにする */
function useTypedPlaceholder(examples: string[]) {
  const [text, setText] = React.useState(examples[0] ?? '')
  React.useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let i = 0
    let n = 0
    let erasing = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const target = examples[i % examples.length] ?? ''
      if (!erasing) {
        n += 1
        if (n >= target.length) erasing = true
        setText(target.slice(0, n))
        timer = setTimeout(tick, erasing ? HOLD_MS : TYPE_MS)
        return
      }
      n -= 1
      setText(target.slice(0, n))
      if (n <= 0) {
        erasing = false
        i += 1
      }
      timer = setTimeout(tick, n <= 0 ? 400 : ERASE_MS)
    }
    setText('')
    timer = setTimeout(tick, 400)
    return () => clearTimeout(timer)
  }, [examples])
  return text
}
const EXAMPLES = [
  { title: '支出を見る', icon: <ChartBarIcon />, question: '品川区は何にいくら使っている？' },
  { title: '比べる', icon: <ScalesIcon />, question: '中野区と品川区の歳出を比べて' },
]

export function AssistantHome({ sitekey }: { sitekey: string }) {
  const placeholder = useTypedPlaceholder(TYPED_EXAMPLES)
  return (
    <main id="assistant" className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center px-4 pt-[16vh] pb-24 sm:px-6">
      <div className="flex size-20 items-center justify-center rounded-full bg-accent">
        <Mark className="size-10 text-primary" />
      </div>
      <h1 className="mt-6 mb-8 text-center font-[family-name:var(--font-display)] text-[28px] leading-[1.4] font-normal tracking-[0.02em] sm:text-4xl">
        まちの何が知りたいですか？
      </h1>
      <div className="w-full">
        <StartForm
          sitekey={sitekey}
          placeholder={placeholder}
          after={(start, pending) => (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
              {EXAMPLES.map((e) => (
                <li key={e.title}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void start(e.question)}
                    className="flex h-full w-full flex-col gap-2 rounded-[var(--radius-card)] border bg-background p-4 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 sm:p-5"
                  >
                    <span className="flex items-center gap-2 text-base font-medium [&_svg]:size-5 [&_svg]:text-muted-foreground">
                      {e.icon}
                      {e.title}
                    </span>
                    <span className="text-sm leading-relaxed text-muted-foreground">「{e.question}」</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        />
        <noscript>AI に聞くには JavaScript を有効にしてください。</noscript>
      </div>
    </main>
  )
}
