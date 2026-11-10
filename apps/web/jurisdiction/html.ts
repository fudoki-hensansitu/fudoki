// 自治体の個別ページ（/tokyo/nakano）と一覧（/jurisdictions）の <head> と sitemap。本文は pages/ の React（page.tsx・index-page.tsx）を
// Void がサーバーで書き、同じ props で hydrate する。ここは頁ごとの title・説明・canonical・JSON-LD を組む
import type { CatalogEntry } from '../server/jurisdiction'
import { jurisdictionPath } from './path'
import { formatYen, INDEX_PATH, type PageData } from './types'

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

export function pageHead(d: PageData): Head {
  const latest = d.years.at(-1)!
  const budget = latestBudget(d)
  const title = pageTitle(d)
  const description = pageDescription(d)
  const canonical = `${ORIGIN}${jurisdictionPath(d.code)}`
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: budget ? `${d.name}の歳出（${reiwaFull(budget.year)}当初予算・${reiwaFull(latest.year)}決算・一般会計）` : `${d.name}の歳出（${reiwaFull(latest.year)}決算・一般会計）`,
    keywords: [`${d.name} 決算`, ...(budget ? [`${d.name} 予算`] : []), '歳出', '一般会計'],
    temporalCoverage: `${d.years[0]!.year}-04-01/${(budget?.year ?? latest.year) + 1}-03-31`,
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
  return head(title, description, canonical, { script: [{ type: 'application/ld+json', innerHTML: inlineJson([ld, breadcrumb]) }] })
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

export const sitemapXml = (entries: CatalogEntry[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}${INDEX_PATH}</loc></url><url><loc>${ORIGIN}/assistant</loc></url><url><loc>${ORIGIN}/about</loc></url>${entries
    .filter((e) => e.settlementYears.length > 0)
    .map((e) => `<url><loc>${ORIGIN}${jurisdictionPath(e.code)}</loc></url>`)
    .join('')}</urlset>\n`
