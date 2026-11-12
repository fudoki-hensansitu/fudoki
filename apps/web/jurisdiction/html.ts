// 自治体の個別ページ（/tokyo/nakano）の <head> と sitemap。本文は pages/ の React（jurisdiction/app/app-page.tsx）を
// Void がサーバーで書き、同じ props で hydrate する。ここは頁ごとの title・説明・canonical・JSON-LD を組む
import type { CatalogEntry } from '../server/jurisdiction'
import { assetPath } from './assets'
import { jurisdictionPath } from './path'
import { appPageYears, formatYen, TAB_SLUGS, type PageData, type PageTab } from './types'
import { DOMAIN_FRAMES, OTHER_FRAME } from './domains'

const ORIGIN = 'https://fudoki.dev'
/** 風土記のデータを配る条件（利用規約）。構造化データの Dataset の license に書く */
const LICENSE_URL = 'https://docs.fudoki.dev/terms'
const FIELDS = [...DOMAIN_FRAMES, OTHER_FRAME]
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

/** 頁の区分。まとめ（無し）・タブの頁・分野の頁 */
export type Section = { tab: Exclude<PageTab, 'overview'> } | { field: string }

/** その年度の当初予算と決算（一般会計）の歳出の総額。金額の欠けたものは無いことにする */
const amountsOf = (d: PageData, year: number) => ({
  budget: d.budgets.find((b) => b.year === year && !b.amountMissing && b.yen > 0)?.yen ?? null,
  settlement: d.years.find((y) => y.year === year)?.yen ?? null,
})

/** 頁の title。「◯◯区の予算と決算（令和8年度）｜風土記」のように、何の頁か・年度・サイト名だけにする。検索語の「◯◯区 予算」「◯◯区 決算」「令和8年度」を入れる */
export function pageTitle(d: PageData, year: number, section?: Section): string {
  const y = reiwaFull(year)
  const subject = (() => {
    if (!section) {
      // 入口（最新の年度）は予算と決算の両方を説明文に書くので両方を入れる。過去の年度はその年度にある金額で決める
      if (year === defaultYear(d)) return latestBudget(d) ? 'の予算と決算' : 'の決算'
      const { budget, settlement } = amountsOf(d, year)
      return budget && settlement ? 'の予算と決算' : budget ? 'の予算' : 'の決算'
    }
    if ('tab' in section) return section.tab === 'projects' ? 'の事業一覧' : section.tab === 'money' ? 'の当初予算' : 'の決算'
    return `の${FIELDS.find((f) => f.id === section.field)?.name ?? '分野'}`
  })()
  return `${d.name}${subject}（${y}）｜風土記`
}

/** 頁の説明文。検索結果に出るので、金額は API の値だけで書く（人口や仮の値は入れない）。タブ・分野の頁はその頁に何があるかを書く */
export function pageDescriptionOf(d: PageData, year: number, section?: Section): string {
  const y = reiwaFull(year)
  const { budget, settlement } = amountsOf(d, year)
  if (!section) return year === appPageYears(d)[0] || year === defaultYear(d) ? pageDescription(d) : yearHead(d, year).description
  if ('tab' in section) {
    if (section.tab === 'projects')
      return `${d.name}の${y}の事業を、金額の大きい順に並べています。新しく始める事業・やめた事業や事業評価も、出典の資料と並べて見られます。`
    if (section.tab === 'money')
      return `${d.name}の${y}当初予算（一般会計）の歳出${budget ? `は約${formatYen(budget)}。その` : 'の'}お金の流れを、分野ごと・款項目ごとに図で見られます。予算書の頁と並べて確かめられます。`
    return `${d.name}の${y}決算（一般会計）の歳出${settlement ? `は約${formatYen(settlement)}。` : '。'}何にいくら使ったかを、分野ごと・款項目ごとに図で見られます。決算書の頁と並べて確かめられます。`
  }
  const field = FIELDS.find((f) => f.id === section.field)
  return `${d.name}の${y}の${field?.name ?? 'この分野'}の分野にかけるお金と、その事業。出典の資料と並べて見られます。`
}

/** 既定でない年度の頁（/tokyo/shinagawa/2024）の説明文と Dataset の名前。その年度に載っている決算か当初予算の金額で書く */
export function yearHead(d: PageData, year: number): { description: string; name: string } {
  const settlement = d.years.find((y) => y.year === year)
  const budget = d.budgets.find((b) => b.year === year && !b.amountMissing && b.yen > 0)
  const y = reiwaFull(year)
  if (settlement) {
    // cofogFlow は最新の決算の年度の分だけ持つ
    const top = settlement.year === d.years.at(-1)!.year ? d.cofogFlow.find((f) => f.kan.id !== 'cofog-none')?.kan : undefined
    return {
      description: `${d.name}の${y}決算（一般会計）の歳出は約${formatYen(settlement.yen)}。${top ? `いちばん大きい分野は${top.name}（${formatYen(top.yen)}）。` : ''}決算書の歳出を事業の単位まで、出典の頁と並べて見られます。`,
      name: `${d.name}の歳出（${y}決算・一般会計）`,
    }
  }
  if (budget) {
    return {
      description: `${d.name}の${y}当初予算（一般会計）の歳出は約${formatYen(budget.yen)}。予算書の歳出を事業の単位まで、出典の頁と並べて見られます。`,
      name: `${d.name}の歳出（${y}当初予算・一般会計）`,
    }
  }
  return {
    description: `${d.name}の${y}の事業と、その振り返り。出典の資料と並べて見られます。`,
    name: `${d.name}の事業（${y}）`,
  }
}

/** 年度の段の無い入口の頁の年度。説明文（pageDescription）と同じく、金額のある最新の当初予算か、無ければ最新の決算の年度 */
const defaultYear = (d: PageData) => latestBudget(d)?.year ?? d.years.at(-1)!.year

/** 頁の path の、年度の段より後ろ（/projects、/fields/fukushi） */
const sectionPath = (section?: Section) => (!section ? '' : 'tab' in section ? `/${TAB_SLUGS[section.tab]}` : `/fields/${section.field}`)

/** 自治体の頁の head。year は年度の段のある頁のときだけ渡す。section は分野・タブの頁 */
export function pageHead(d: PageData, year?: number, section?: Section): Head {
  const latest = d.years.at(-1)!
  const budget = latestBudget(d)
  const base = jurisdictionPath(d.code)
  const shown = year ?? defaultYear(d)
  const past = year !== undefined && year !== appPageYears(d)[0] ? yearHead(d, shown) : null
  const title = pageTitle(d, shown, section)
  const description = pageDescriptionOf(d, shown, section)
  // 最新の年度の頁（/tokyo/nakano/2026）は入口（/tokyo/nakano）と同じ中身なので、canonical を入口にする。
  // 分野・タブの頁は年度の段の無い URL が 301 なので、最新の年度でも年度の段つきにする
  const canonical = `${ORIGIN}${past || section ? `${base}/${shown}` : base}${sectionPath(section)}`
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: past?.name ?? (budget ? `${d.name}の歳出（${reiwaFull(budget.year)}当初予算・${reiwaFull(latest.year)}決算・一般会計）` : `${d.name}の歳出（${reiwaFull(latest.year)}決算・一般会計）`),
    keywords: [`${d.name} 決算`, ...(budget ? [`${d.name} 予算`] : []), '歳出', '一般会計'],
    temporalCoverage: past ? `${shown}-04-01/${shown + 1}-03-31` : `${d.years[0]!.year}-04-01/${(budget?.year ?? latest.year) + 1}-03-31`,
    description,
    url: canonical,
    inLanguage: 'ja',
    // 配る条件（docs.fudoki.dev の利用規約）。Google のデータセット検索は license の無い Dataset に警告を出す
    license: LICENSE_URL,
    isAccessibleForFree: true,
    // spatialCoverage は Place を求める。AdministrativeArea は Place の下位の型だが、警告が出るので Place に名前と住所の国・地域を書く
    spatialCoverage: { '@type': 'Place', name: `${d.prefecture === d.name ? '' : d.prefecture}${d.name}`, address: { '@type': 'PostalAddress', addressCountry: 'JP', addressRegion: d.prefecture } },
    creator: { '@type': 'Organization', name: '風土記', url: `${ORIGIN}/` },
    ...(d.originTitle ? { isBasedOn: d.originTitle } : {}),
  }
  // 検索結果にパンくず（風土記 › 東京都 › 品川区）を出す。都道府県の頁が無ければ都道府県を挟まない
  const parent = d.prefecturePath ? [{ name: d.prefecture, path: d.prefecturePath }] : []
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: '風土記', path: '/' }, ...parent, { name: d.name, path: jurisdictionPath(d.code) }].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
  }
  // 紋章と決算のある自治体の最新の頁は、OG 画像を自治体のもの（routes/jurisdictions/[code]/og.png.ts が最新の決算の総額・分野から描く）に差し替える。
  // 画像の金額は最新の決算なので、過去の年度の頁は全頁共通の画像のまま。
  const own = !past && d.emblem && d.cofogFlow.some((f) => f.kan.yen > 0)
  const meta = own ? [{ property: 'og:image', content: `${ORIGIN}${assetPath(d.code, 'og.png')}` }] : []
  return head(title, description, canonical, { meta, script: [{ type: 'application/ld+json', innerHTML: inlineJson([ld, breadcrumb]) }] })
}

/** 収録がまだ無い自治体。検索の対象にはしない */
export const emptyHead = (e: CatalogEntry): Head =>
  head(`${e.name}｜風土記`, `${e.name}の歳出は風土記にまだ収録されていません。`, `${ORIGIN}${jurisdictionPath(e.code)}`, { meta: [{ name: 'robots', content: 'noindex' }] })

/** sitemap。自治体の頁（最新の年度の入口）に加え、過去の年度の頁（/tokyo/shinagawa/2024）と各年度のタブの頁を載せる。
 * 最新の年度の頁（/tokyo/shinagawa/2026）は canonical が入口なので載せない。years は頁で選べる年度（新しい順） */
export const sitemapXml = (entries: CatalogEntry[], yearsOf: (e: CatalogEntry) => number[] = (e) => [...e.settlementYears].sort((a, b) => b - a)) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/assistant</loc></url><url><loc>${ORIGIN}/about</loc></url>${entries
    .filter((e) => e.settlementYears.length > 0)
    .flatMap((e) => {
      const base = jurisdictionPath(e.code)
      const years = yearsOf(e)
      // 年度ごとの頁と、そのタブの頁（事業・予算・決算）
      return [base, ...years.flatMap((y, i) => {
        const page = `${base}/${y}`
        return [...(i === 0 ? [] : [page]), `${page}/${TAB_SLUGS.projects}`, ...(e.initialYears.includes(y) ? [`${page}/${TAB_SLUGS.money}`] : []), ...(e.settlementYears.includes(y) ? [`${page}/${TAB_SLUGS.settled}`] : [])]
      })]
    })
    .map((path) => `<url><loc>${ORIGIN}${path}</loc></url>`)
    .join('')}</urlset>\n`
