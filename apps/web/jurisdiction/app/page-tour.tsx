// 自治体の頁の側のオンボーディング（home/tour.tsx の続き）。ホームで「まちの頁を開く」を押すか、「はじめにやること」の「オンボ開始」で続きから来たときだけ出す。
// 分野を押す → 分野の頁でその分野の事業を押す（詳細の中に吹き出し）→ 事業の名前を選んでアシスタントに質問 → 答えが返ったら終わり。
// 進むのは利用者の操作（分野を押す・事業を押す・文字を選ぶ・送る）だけで、吹き出しから代わりに進めるボタンは置かない。続きから再開したときは、頁をその歩を始める形にする
import * as React from 'react'
import { useRouter } from '@void/react'
import { FloatSpot, InlineSpot, PointAt, SpotTour, STEPS, TOTAL, stepAt, useTour, type Spot } from '../../home/tour'
import { DoneMark, Typing } from '../../home/tour-visuals'
import type { AskControl } from '../ask-dock'
import type { YearView } from './data'

/** 詳細の頭の吹き出しに渡す事業 */
type CoachProject = { name: string }

export type TourCtl = {
  name: string
  v?: YearView
  fieldPage: string | null
  tab: string
  /** 開いている事業の id */
  project: string | null
  openField: (id: string) => void
  toOverview: () => void
  selectProject: (id: string | null) => void
  ask: React.RefObject<AskControl | null>
}

/** 質問の例。選んだ文（多くは事業の名前）を添えて聞く */
export const TOUR_QUESTIONS = ['この事業は何をしているの？', '前の年度からどう変わった？']

export function usePageTour(c: TourCtl) {
  const { saved, go, pause, finish } = useTour()
  const { visit } = useRouter()
  const on = saved?.state === 'on' && saved.at >= 1 && saved.at < TOTAL
  const at = on ? saved!.at : -1
  const step = on ? STEPS[at] : null
  const [answered, setAnswered] = React.useState<'waiting' | 'done' | 'failed'>('waiting')
  const quote = React.useRef('')
  const started = React.useRef(false)
  const lastProject = React.useRef<string | null>(null)
  const ready = !!c.v
  const cur = React.useRef(c)
  cur.current = c

  // 歩に入ったら、頁をその歩を始める形にする（続きから再開したとき）
  React.useEffect(() => {
    const c = cur.current
    const v = c.v
    if (!v || !step) return
    if (step === 'fields') {
      c.selectProject(null)
      if (c.fieldPage || c.tab !== 'overview') c.toOverview()
    } else if (step === 'field') {
      c.selectProject(null)
      if (!c.fieldPage && v.fields[0]) c.openField(v.fields[0].id)
    } else if (step === 'detail') {
      // 事業を開かずに再開したら、分野の頁で事業を押すところへ戻す
      if (!c.project) go(stepAt('field'))
    } else if (step === 'ask') {
      c.selectProject(null)
      const q = quote.current || v.top.find((p) => p.id === lastProject.current)?.name || v.top[0]?.name || c.name
      // 詳細を閉じて頁が落ち着いてから開く（閉じたときの選択の外れで、付けた文が消えないよう外から付ける）
      const t = setTimeout(() => c.ask.current?.open(q), 380)
      return () => clearTimeout(t)
    } else if (step === 'answer' && !started.current) {
      // 会話を始めずに再開したら、質問の歩へ戻す
      go(stepAt('ask'))
    }
  }, [ready, step, go])

  // 分野の札を押したら（分野の頁が開いたら）次へ
  const prevField = React.useRef(c.fieldPage)
  React.useEffect(() => {
    const was = prevField.current
    prevField.current = c.fieldPage
    if (step === 'fields' && !was && c.fieldPage) go(stepAt('field'))
  }, [c.fieldPage, step, go])

  // 分野の頁で事業を押したら（詳細が開いたら）次へ。詳細の歩で詳細を閉じたら、分野の頁の歩へ戻す
  const prevProject = React.useRef(c.project)
  React.useEffect(() => {
    const was = prevProject.current
    prevProject.current = c.project
    if (c.project) lastProject.current = c.project
    if (step === 'field' && c.project && c.project !== was) go(stepAt('detail'))
    else if (step === 'detail' && was && !c.project) go(stepAt('field'))
  }, [c.project, step, go])

  const skip = React.useCallback(() => pause(), [pause])
  const back = (k: (typeof STEPS)[number]) => () => go(stepAt(k))

  const v = c.v
  let overlay: React.ReactNode = null
  let coach: ((p: CoachProject) => React.ReactNode) | null = null
  if (v && step) {
    if (step === 'fields') {
      const spot: Spot = {
        target: 'fields',
        first: true,
        title: 'お金は分野ごとに分かれています',
        body: `${c.name}の予算を、福祉・教育のような分野に分けて、それぞれにいくら使っているかを並べています。分野を1つ押してみてください。`,
      }
      overlay = <SpotTour spot={spot} at={at} onSkip={skip} onBack={() => (go(0), visit('/'))} />
    } else if (step === 'field') {
      const f = v.fields.find((x) => x.id === c.fieldPage) ?? v.fields[0]
      if (f) {
        const spot: Spot = {
          target: 'field-projects',
          first: true,
          title: `${f.name}にいくら使っているか`,
          body: 'この分野の金額と内訳、この分野の事業が並びます。下の事業を1つ押してみてください。',
        }
        overlay = <SpotTour spot={spot} at={at} onSkip={skip} onBack={back('fields')} />
      }
    } else if (step === 'detail') {
      overlay = <PointAt target="detail-name" gesture="select" />
      coach = (p: CoachProject) => (
        <InlineSpot
          at={at}
          onSkip={skip}
          onBack={() => c.selectProject(null)}
          spot={{
            title: '文字を選んでアシスタントに質問',
            body: '事業の名前をなぞって選ぶと、その文を添えてアシスタントに質問できます。',
          }}
        />
      )
    } else if (step === 'ask') {
      const spot: Spot = {
        target: 'ask-suggest',
        first: true,
        title: 'アシスタントに質問する',
        body: '選んだ文が入力欄の上に付いています。下の例を押すか、聞きたいことを書いて送ってください。',
      }
      overlay = <SpotTour spot={spot} at={at} onSkip={skip} onBack={back('field')} />
    } else if (step === 'answer') {
      overlay = (
        <FloatSpot>
          {answered === 'done' ? (
            <div className="flex items-start gap-3">
              <DoneMark />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">これでひととおりです</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">分野から事業へ、事業からアシスタントへ。ほかの年度やまちでも同じように見られます。</p>
              </div>
              <button type="button" onClick={finish} className="shrink-0 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none">
                終える
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card">
                <Typing />
              </span>
              <p className="min-w-0 flex-1 text-[14px]">{answered === 'failed' ? '答えを受け取れませんでした。会話の欄からもう一度送ってください。' : 'アシスタントが答えています…'}</p>
              <button type="button" onClick={skip} className="shrink-0 whitespace-nowrap text-[13px] text-muted-foreground hover:text-foreground">
                スキップ
              </button>
            </div>
          )}
        </FloatSpot>
      )
    }
  }

  return {
    on,
    step,
    overlay,
    coach,
    /** 聞く欄に渡すもの */
    askProps: {
      keepOpen: step === 'ask',
      suggest: step === 'ask' ? TOUR_QUESTIONS : undefined,
      onReveal: (q: string) => {
        if (step !== 'detail') return
        quote.current = q
        go(stepAt('ask'))
      },
      onChat: (e: 'started' | 'answered' | 'failed') => {
        if (e === 'started' && step === 'ask') {
          started.current = true
          setAnswered('waiting')
          go(stepAt('answer'))
        }
        if (e !== 'started' && step === 'answer') setAnswered(e === 'answered' ? 'done' : 'failed')
      },
    },
  }
}
