// 自治体の個別ページ（/tokyo/nakano）と一覧（/jurisdictions）の <head> と sitemap。本文は pages/ の React（page.tsx・index-page.tsx）を
// Void がサーバーで書き、同じ props で hydrate する。ここは頁ごとの title・説明・canonical・JSON-LD を組む
import type { CatalogEntry } from '../server/jurisdiction'
import { EMBLEMS } from './emblems'
import { jurisdictionPath } from './path'
import { assetPath } from './profiles'
import { formatYen, INDEX_PATH, pageYears, yearPath, type PageData } from './types'

const ORIGIN = 'https://fudoki.dev'
/** JSON を script の中に置くときに </script> や <!-- で抜けないようにする */
const inlineJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

/** Void の head()（HeadDescriptor）に渡す形 */
export type Head = {
  title: string
  meta: { name?: string; property?: string; content: string }[]
  link: { rel: string; href: string }[]
  script?: { src?: string; innerHTML?: string; [key: string]: string | undefined }[]
}

const head = (title: string, description: string, canonical: string, extra: Partial<Head> = {}): Head => ({
  title,
  meta: [
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonical },
    ...(extra.meta ?? []),
  ],
  link: [{ rel: 'canonical', href: canonical }],
  ...(extra.script ? { script: extra.script } : {}),
})

/** 検索で打たれる「令和6年度」の形。画面は R 表記（reiwa）だが、title・説明文だけは検索語に合わせる。2019年より前は西暦のまま */
export const reiwaFull = (year: number) => (year < 2019 ? `${year}年度` : year === 2019 ? '令和元年度' : `令和${year - 2018}年度`)

/** 決算より後の、金額のある当初予算のうちいちばん新しいもの */
/** 金額の欠けた予算と、目の行が無く 0 円になった予算（款だけの出典など）は使わない。自治体の歳出の総額が本当に 0 円になることは無い */
const latestBudget = (d: PageData) => d.budgets.filter((b) => !b.amountMissing && b.yen > 0).at(-1) ?? null

/** 個別ページの説明文。検索結果に出るので、金額は API の値だけで書く（人口や仮の値は入れない） */
export function pageDescription(d: PageData): string {
  const latest = d.years.at(-1)!
  const budget = latestBudget(d)
  // 分野は COFOG の大分類（cofogFlow は大きい順で「その他」が最後）
  const top = d.cofogFlow.find((f) => f.kan.id !== 'cofog-none')?.kan
  const topText = top ? `${top.name}（${formatYen(top.yen)}）` : '—'
  if (budget) {
    return `${d.name}の${reiwaFull(budget.year)}当初予算の歳出は約${formatYen(budget.yen)}、${reiwaFull(latest.year)}決算（一般会計）の歳出は約${formatYen(latest.yen)}。決算でいちばん大きい分野は${topText}。予算書・決算書の歳出を事業の単位まで、出典の頁と並べて見られます。`
  }
  return `${d.name}の${reiwaFull(latest.year)}決算（一般会計）の歳出は約${formatYen(latest.yen)}。いちばん大きい分野は${topText}。決算書の歳出を事業の単位まで、出典の頁と並べて見られます。`
}

/** 個別ページの title。検索語の「◯◯区 予算」「◯◯区 決算」「令和6年度」を入れる。予算があれば予算・決算の両方を年度つきで出す */
export function pageTitle(d: PageData): string {
  const latest = d.years.at(-1)!
  const budget = latestBudget(d)
  return budget
    ? `${d.name}の予算と決算｜${reiwaFull(budget.year)}予算・${reiwaFull(latest.year)}決算｜風土記`
    : `${d.name}の決算（${reiwaFull(latest.year)}）｜何にいくら使った？｜風土記`
}

/** 既定でない年度の頁（/tokyo/shinagawa/2024）の title・説明文。その年度に載っている決算か当初予算の金額で書く */
export function yearHead(d: PageData, year: number): { title: string; description: string; name: string } {
  const settlement = d.years.find((y) => y.year === year)
  const budget = d.budgets.find((b) => b.year === year && !b.amountMissing && b.yen > 0)
  const y = reiwaFull(year)
  if (settlement) {
    // cofogFlow は最新の決算の年度の分だけ持つ
    const top = settlement.year === d.years.at(-1)!.year ? d.cofogFlow.find((f) => f.kan.id !== 'cofog-none')?.kan : undefined
    return {
      title: `${d.name}の決算（${y}）｜何にいくら使った？｜風土記`,
      description: `${d.name}の${y}決算（一般会計）の歳出は約${formatYen(settlement.yen)}。${top ? `いちばん大きい分野は${top.name}（${formatYen(top.yen)}）。` : ''}決算書の歳出を事業の単位まで、出典の頁と並べて見られます。`,
      name: `${d.name}の歳出（${y}決算・一般会計）`,
    }
  }
  if (budget) {
    return {
      title: `${d.name}の予算（${y}）｜何にいくら使う？｜風土記`,
      description: `${d.name}の${y}当初予算（一般会計）の歳出は約${formatYen(budget.yen)}。予算書の歳出を事業の単位まで、出典の頁と並べて見られます。`,
      name: `${d.name}の歳出（${y}当初予算・一般会計）`,
    }
  }
  return {
    title: `${d.name}の事業（${y}）｜風土記`,
    description: `${d.name}の${y}の事業と、その振り返り。出典の資料と並べて見られます。`,
    name: `${d.name}の事業（${y}）`,
  }
}

/** 自治体の頁の head。year は既定でない年度の頁のときだけ渡す */
export function pageHead(d: PageData, year?: number): Head {
  const latest = d.years.at(-1)!
  const budget = latestBudget(d)
  const base = jurisdictionPath(d.code)
  const past = year !== undefined && year !== pageYears(d)[0] ? yearHead(d, year) : null
  const title = past?.title ?? pageTitle(d)
  const description = past?.description ?? pageDescription(d)
  const canonical = `${ORIGIN}${past ? `${base}/${year}` : base}`
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: past?.name ?? (budget ? `${d.name}の歳出（${reiwaFull(budget.year)}当初予算・${reiwaFull(latest.year)}決算・一般会計）` : `${d.name}の歳出（${reiwaFull(latest.year)}決算・一般会計）`),
    keywords: [`${d.name} 決算`, ...(budget ? [`${d.name} 予算`] : []), '歳出', '一般会計'],
    temporalCoverage: past ? `${year}-04-01/${year! + 1}-03-31` : `${d.years[0]!.year}-04-01/${(budget?.year ?? latest.year) + 1}-03-31`,
    description,
    url: canonical,
    inLanguage: 'ja',
    spatialCoverage: { '@type': 'AdministrativeArea', name: `${d.prefecture}${d.name}` },
    creator: { '@type': 'Organization', name: '風土記', url: `${ORIGIN}/` },
    ...(d.originTitle ? { isBasedOn: d.originTitle } : {}),
  }
  // 検索結果にパンくず（風土記 › 東京都 › 品川区）を出す。都道府県の頁が無ければ一覧を挟む
  const parent = d.prefecturePath === INDEX_PATH ? { name: '自治体を探す', path: INDEX_PATH } : { name: d.prefecture, path: d.prefecturePath }
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: '風土記', path: '/' }, parent, { name: d.name, path: jurisdictionPath(d.code) }].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
  }
  // 紋章のある自治体は、紋章と名前の OG 画像（build:og が public/jurisdictions/<code>/og.png に作る）に差し替える
  const meta = EMBLEMS[d.code] ? [{ property: 'og:image', content: `${ORIGIN}${assetPath(d.code, 'og.png')}` }] : []
  return head(title, description, canonical, { meta, script: [{ type: 'application/ld+json', innerHTML: inlineJson([ld, breadcrumb]) }] })
}

/** 収録がまだ無い自治体。検索の対象にはしない */
export const emptyHead = (e: CatalogEntry): Head =>
  head(`${e.name}｜風土記`, `${e.name}の歳出は風土記にまだ収録されていません。`, `${ORIGIN}${jurisdictionPath(e.code)}`, { meta: [{ name: 'robots', content: 'noindex' }] })

export function indexHead(count: number): Head {
  const description = count
    ? `決算を収録している自治体（${count}）を、地図と表で一覧にしています。人口・1人あたりの歳出・歳出の総額を見比べて、自治体ごとのお金の使い道へ進めます。`
    : '風土記が決算を収録した自治体の一覧です。まだ収録した自治体がありません。'
  return head('自治体を探す｜風土記', description, `${ORIGIN}${INDEX_PATH}`)
}

/** sitemap。自治体の頁に加え、既定でない年度の頁（/tokyo/shinagawa/2024）も載せる。years は頁で選べる年度（新しい順） */
export const sitemapXml = (entries: CatalogEntry[], yearsOf: (e: CatalogEntry) => number[] = (e) => [...e.settlementYears].sort((a, b) => b - a)) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}${INDEX_PATH}</loc></url><url><loc>${ORIGIN}/assistant</loc></url><url><loc>${ORIGIN}/about</loc></url>${entries
    .filter((e) => e.settlementYears.length > 0)
    .flatMap((e) => {
      const base = jurisdictionPath(e.code)
      const [latest, ...past] = yearsOf(e)
      return [base, ...past.map((y) => yearPath(base, y, latest!))]
    })
    .map((path) => `<url><loc>${ORIGIN}${path}</loc></url>`)
    .join('')}</urlset>\n`
