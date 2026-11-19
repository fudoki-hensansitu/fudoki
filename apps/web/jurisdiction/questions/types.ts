// 自治体の頁の「気になる」のフィード。住民が気になりそうな問いと、作り置きの答え。押すと AI との会話がその問いと答えから始まる

/** 1つの問い */
export interface Question {
  id: string
  /** 分野（jurisdiction/domains.ts の id）。分野をまたぐ問いは無し（「まち全体」と出す） */
  field?: string
  /** 分野のフィードの先頭に置く問い（「〇〇に、1人いくら使ってる？」） */
  lead?: boolean
  q: string
  /** 札に大きく出す答えの数字と、その数字が何か */
  big?: { value: string; note: string }
  /** 作り置きの答え（Markdown）。事業へのリンクは頁の path（/tokyo/shinagawa/projects/<id>） */
  answer: string
  /** 答えの元にした資料 */
  source: string
  /** 答えのあとに出す続きの候補。問いの id なら作り置きの答えで続け、それ以外の文は AI に聞く */
  follow: string[]
}

export interface QuestionFeed {
  /** 「すべて」のフィードの並び（問いの id） */
  order: string[]
  questions: Question[]
}
