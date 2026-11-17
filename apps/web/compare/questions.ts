// まち比べの問い。どの問いも、まちごとに1つの値を持ち、地図の濃淡で塗る。並びと言葉は風土記の判断（yuito と決めた順）。
// slug は URL（/compare/<slug>）とコードで使う英語の名前。値はサーバー（server/compare-map.ts）が問いの id ごとに組む
import { DOMAIN_FRAMES } from '../jurisdiction/domains'

/** 値の単位。yen は円、percent は割合（%） */
export type Unit = 'yen' | 'percent'
/** 値の出どころ。finance は総務省「市町村別決算状況調」、fiscal は風土記の決算（一般会計） */
export type Source = 'finance' | 'fiscal'

export type Question = {
  slug: string
  /** 見出しにする問い */
  title: string
  /** チップ・札の行に出す短い名前 */
  short: string
  unit: Unit
  source: Source
  /** 詳細の見出しの下に出す、何を数えたかの説明 */
  note: string
  /** 一覧のカードの末尾に「※」で出す、見出しだけだと誤解しそうな点 */
  caveat: string
}

const FINANCE: Question[] = [
  {
    slug: 'spending-per-person',
    title: '1人あたり、いくら使った？',
    short: '1人あたりの歳出',
    unit: 'yen',
    source: 'finance',
    note: '1年間に使ったお金を、住んでいる人の数で割った額です。',
    caveat: '普通会計（一般会計など）の歳出総額を、住民基本台帳の人口で割った額です',
  },
  {
    slug: 'debt-per-person',
    title: '1人あたりの借金は？',
    short: '1人あたりの借金',
    unit: 'yen',
    source: 'finance',
    note: 'まちが借りて、まだ返していないお金（地方債の残高）を、住んでいる人の数で割った額です。',
    caveat: '地方債（まちの借金）の残高です。水道など公営企業の借金は含みません',
  },
  {
    slug: 'savings-per-person',
    title: '1人あたりの貯金は？',
    short: '1人あたりの貯金',
    unit: 'yen',
    source: 'finance',
    note: 'まちが積み立てている基金の残高を、住んでいる人の数で割った額です。',
    caveat: '基金（積立金）の残高です。使い道の決まった基金も含みます',
  },
  {
    slug: 'fixed-cost-ratio',
    title: '固定費の割合は？',
    short: '固定費の割合',
    unit: 'percent',
    source: 'finance',
    note: '人件費・扶助費・借金の返済など毎年決まって出るお金（固定費）に、毎年入るお金のどれだけが回っているかです。',
    caveat: '経常収支比率です。毎年入るお金のうち、固定費に回る割合です',
  },
  {
    slug: 'surplus-per-person',
    title: '1人あたりの黒字は？',
    short: '1人あたりの黒字',
    unit: 'yen',
    source: 'finance',
    note: '入ったお金から、使ったお金と翌年度に回す分を引いた残り（実質収支）を、住んでいる人の数で割った額です。',
    caveat: '実質収支です。入ったお金から使ったお金と翌年度に回す分を引いた残りです',
  },
]

/** 分野（COFOG の大分類）ごとの slug。防衛は自治体が受け持たないので問いにしない */
const FIELD_SLUGS: Record<string, string> = {
  bosai: 'safety',
  fukushi: 'welfare',
  kyoiku: 'education',
  iryo: 'health',
  kurashi: 'housing',
  sangyo: 'industry',
  kankyo: 'environment',
  bunka: 'culture',
  gyosei: 'administration',
}

const FIELDS: Question[] = DOMAIN_FRAMES.filter((f) => FIELD_SLUGS[f.id]).map((f) => ({
  slug: `${FIELD_SLUGS[f.id]}-share`,
  title: `${f.name}に使う割合は？`,
  short: `${f.name}の割合`,
  unit: 'percent',
  source: 'fiscal',
  note: `一般会計の歳出のうち、${f.name}の分野（${f.examples}など）に使ったお金の割合です。`,
  caveat: f.id === 'fukushi' ? '一般会計の歳出に占める割合です。国民健康保険などの特別会計は含みません' : '一般会計の歳出に占める割合です。特別会計は含みません',
}))

/** 分野の問いの slug から、分野（DOMAIN_FRAMES の id）を引く */
export const FIELD_OF_QUESTION: Record<string, string> = Object.fromEntries(Object.entries(FIELD_SLUGS).map(([id, slug]) => [`${slug}-share`, id]))

export const QUESTIONS: Question[] = [...FINANCE, ...FIELDS]

export const questionOf = (slug: string | undefined) => QUESTIONS.find((q) => q.slug === slug)
