// 自治体の頁の側のオンボーディング（home/tour.tsx の続き）。ホームで「まちの頁を開く」を押すか、「はじめにやること」の「オンボ開始」で続きから来たときだけ出す。
// 分野の説明 → 分野の頁 → 事業のタブ → 事業を選ぶ（詳細の中に吹き出し）→ 文を添えてアシスタントに質問 → 答えが返ったら終わり。
// 各歩は入ったときに頁をその歩の形にする（続きから再開したときも同じ所から始まる）。進むのは利用者の操作（札を押す・事業を押す・文字を選ぶ・送る）か、吹き出しのボタン
import * as React from 'react'
import { useRouter } from '@void/react'
import { FloatSpot, InlineSpot, SpotTour, STEPS, TOTAL, stepAt, useTour, type Spot } from '../../home/tour'
import { AskVisual, DoneMark, FieldsVisual, FieldVisual, ProjectsVisual, SelectVisual, Typing } from '../../home/tour-visuals'
import type { AskControl } from '../ask-dock'
import type { Proj, YearView } from './data'

export type TourCtl = {
  name: string
  v?: YearView
  fieldPage: string | null
  tab: string
  /** 開いている事業の id */
  project: string | null
  openField: (id: string) => void
  toOverview: () => void
  toProjects: () => void
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

  // 歩に入ったら、頁をその歩の形にする
  React.useEffect(() => {
    const c = cur.current
    const v = c.v
    if (!v || !step) return
    const first = v.current[0]
    if (step === 'fields') {
      c.selectProject(null)
      if (c.fieldPage || c.tab !== 'overview') c.toOverview()
    } else if (step === 'field') {
      if (!c.fieldPage && v.fields[0]) c.openField(v.fields[0].id)
    } else if (step === 'projects') {
      c.selectProject(null)
      if (c.fieldPage || c.tab !== 'projects') c.toProjects()
    } else if (step === 'detail') {
      if (c.fieldPage || c.tab !== 'projects') c.toProjects()
      if (!c.project) {
        const id = lastProject.current ?? first?.id
        if (id) c.selectProject(id)
        else go(stepAt('ask'))
      }
    } else if (step === 'ask') {
      c.selectProject(null)
      const q = quote.current || v.current.find((p) => p.id === lastProject.current)?.name || first?.name || ''
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

  // 事業を押したら（詳細が開いたら）次へ。詳細の歩で詳細を閉じたら、一覧の歩へ戻す
  const prevProject = React.useRef(c.project)
  React.useEffect(() => {
    const was = prevProject.current
    prevProject.current = c.project
    if (c.project) lastProject.current = c.project
    if (step === 'projects' && c.project && c.project !== was) go(stepAt('detail'))
    else if (step === 'detail' && was && !c.project) go(stepAt('projects'))
  }, [c.project, step, go])

  const skip = React.useCallback(() => pause(), [pause])
  const back = (k: (typeof STEPS)[number]) => () => go(stepAt(k))

  const v = c.v
  let overlay: React.ReactNode = null
  let coach: ((p: Proj) => React.ReactNode) | null = null
  if (v && step) {
    const first = v.current[0]
    if (step === 'fields') {
      const top = v.fields[0]
      const spot: Spot = {
        target: 'fields',
        maxH: 0.5,
        open: true,
        title: 'お金は分野ごとに分かれています',
        body: `${c.name}の予算を、福祉・教育のような分野に分けて、それぞれにいくら使っているかを並べています。札を押すと、その分野の中身が開きます。`,
        visual: <FieldsVisual items={v.fields.map((f) => ({ id: f.id, name: f.name, pct: (f.yen / v.total) * 100 }))} />,
        action: top ? { label: '開く', run: () => c.openField(top.id) } : undefined,
      }
      overlay = <SpotTour spot={spot} at={at} onSkip={skip} onBack={() => (go(0), visit('/'))} />
    } else if (step === 'field') {
      const f = v.fields.find((x) => x.id === c.fieldPage) ?? v.fields[0]
      if (f) {
        const ps = v.current.filter((p) => p.field === f.id)
        const spot: Spot = {
          target: 'field',
          title: `${f.name}にいくら使っているか`,
          body: 'この分野の金額と、何に使っているかの内訳、この分野の事業が並びます。次は、分野をまたいで事業を一覧で見ます。',
          visual: <FieldVisual id={f.id} name={f.name} yen={f.yen} projects={ps.slice(0, 3).map((p) => ({ name: p.name, yen: v.amount(p) ?? null }))} />,
          action: { label: '事業へ', run: () => (c.toProjects(), go(stepAt('projects'))) },
        }
        overlay = <SpotTour spot={spot} at={at} onSkip={skip} onBack={back('fields')} />
      }
    } else if (step === 'projects') {
      const spot: Spot = {
        target: 'projects',
        maxH: 0.5,
        open: true,
        title: '事業の一覧',
        body: first
          ? `${c.name}がお金を使っている事業を、金額の多い順に並べています。分野や「新しく始める」で絞り込めます。気になる事業を押してみてください。`
          : `${c.name}は事業ごとの金額をまだ収録していないので、予算書の目を事業の代わりに並べています。`,
        visual: first ? <ProjectsVisual items={v.current.slice(0, 3).map((p) => ({ name: p.name, yen: v.amount(p) ?? null }))} /> : undefined,
        action: first ? { label: '開く', run: () => c.selectProject(first.id) } : { label: '次へ', run: () => go(stepAt('ask')) },
      }
      overlay = <SpotTour spot={spot} at={at} onSkip={skip} onBack={back('field')} />
    } else if (step === 'detail') {
      coach = (p: Proj) => (
        <InlineSpot
          at={at}
          onSkip={skip}
          onBack={() => c.selectProject(null)}
          spot={{
            title: '文字を選んでアシスタントに質問',
            body: '事業の名前や金額の文字をなぞって選ぶと、その文を添えてアシスタントに質問できます。どこか文字を選んでみてください。',
            visual: <SelectVisual path={p.dept ?? undefined} name={p.name} yen={v.amount(p) ?? null} />,
            action: { label: '質問する', run: () => ((quote.current = p.name), go(stepAt('ask'))) },
          }}
        />
      )
    } else if (step === 'ask') {
      const q = quote.current || v.current.find((p) => p.id === lastProject.current)?.name || first?.name || c.name
      const spot: Spot = {
        target: 'ask',
        open: true,
        title: 'アシスタントに質問する',
        body: '選んだ文が入力欄の上に付いています。聞きたいことを書いて送るか、下の例を押してください。',
        visual: <AskVisual quote={q} question={TOUR_QUESTIONS[0]!} />,
      }
      overlay = <SpotTour spot={spot} at={at} onSkip={skip} onBack={back(first ? 'detail' : 'projects')} />
    } else if (step === 'answer') {
      overlay = (
        <FloatSpot>
          {answered === 'done' ? (
            <div className="flex items-start gap-3">
              <DoneMark />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold">これでひととおりです</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">分野から事業へ、事業からアシスタントへ。ほかの年度やまちでも同じように見られます。</p>
              </div>
              <button type="button" onClick={finish} className="shrink-0 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none">
                終える
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card">
                <Typing />
              </span>
              <p className="min-w-0 flex-1 text-[14px]">{answered === 'failed' ? '答えを受け取れませんでした。会話の欄からもう一度送ってください。' : 'アシスタントが答えています…'}</p>
              <span className="text-[12px] text-muted-foreground tabular-nums">
                {at + 1} / {TOTAL}
              </span>
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
