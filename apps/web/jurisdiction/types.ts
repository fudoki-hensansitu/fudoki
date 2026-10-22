// 自治体の個別ページ（/jurisdictions/:名称）のデータの型と、金額・年度の表記。server（SSR・API）と画面（島）で同じものを使う

/** 款・項・目・節など、出典の1行。金額は API が返した円（画面で足し引きしない） */
export interface Line {
  /** apps/api の node_id。子を引くときに使う */
  id: string
  name: string
  yen: number
  /** 出典の頁（金額の印字の頁） */
  page: number | null
}

export interface Setsu {
  name: string
  yen: number
}

export interface Moku extends Line {
  setsu: Setsu[]
}

export interface Kou extends Line {
  /** 一番大きい項だけ、目と節まで引く */
  moku: Moku[]
}

/** 款を選んだときのお金の流れ（款 → 項 → 目 → 節） */
export interface Drill {
  kan: Line
  kou: Kou[]
}

export interface Project extends Line {
  kanName: string
  kouName: string | null
  /** 前の年度の同じ目（款・項・名前が一致したもの）。無ければ null */
  prevYen: number | null
}

export interface YearTotal {
  year: number
  /** 一般会計の款の支出済額の和（api の sum_rules: 同じ軸・同じ段の兄弟の和） */
  yen: number
  /** 前年度の款ごとの金額（款の名前で引く） */
  kan: Line[]
}

export interface PageData {
  code: string
  name: string
  prefecture: string
  originTitle: string | null
  /** 西暦、古い順 */
  years: YearTotal[]
  /** 最新年度の款のうち一番大きいものの流れ */
  flow: Drill
  projects: Project[]
}

/** 西暦の会計年度を令和にする（2025 → 令和7年度） */
export const reiwa = (year: number) => (year >= 2019 ? `令和${year - 2018 === 1 ? '元' : year - 2018}年度` : `${year}年度`)

/** 1億円以上は億円、それ未満は万円。3桁ごとに区切る。円の細かい数字は出典の頁で確かめてもらう */
export function formatYen(yen: number): string {
  if (yen >= 1e8) return `${(yen / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: yen >= 1e10 ? 0 : 1 })}億円`
  return `${Math.round(yen / 1e4).toLocaleString('ja-JP')}万円`
}

/** 前の年度との増減（%）。前が 0 や無いときは null */
export const changePct = (now: number, prev: number | null | undefined) => (prev ? ((now - prev) / prev) * 100 : null)

export const jurisdictionPath = (name: string) => `/jurisdictions/${encodeURIComponent(name)}`
