// 自治体の個別ページ（/tokyo/nakano）と一覧（/jurisdictions）の <head> と sitemap。本文は pages/ の React（page.tsx・index-page.tsx）を
// Void がサーバーで書き、同じ props で hydrate する。ここは頁ごとの title・説明・canonical・JSON-LD を組む
import type { CatalogEntry } from '../server/jurisdiction'
import { jurisdictionPath } from './path'
import { formatYen, INDEX_PATH, reiwa, type PageData } from './types'

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

/** 個別ページの説明文。検索結果に出るので、金額は API の値だけで書く（人口や仮の値は入れない） */
export function pageDescription(d: PageData): string {
  const latest = d.years.at(-1)!
  // 分野は COFOG の大分類（cofogFlow は大きい順で「その他」が最後）
  const top = d.cofogFlow.find((f) => f.kan.id !== 'cofog-none')?.kan
  return `${d.name}の${reiwa(latest.year)}決算（一般会計）の歳出は約${formatYen(latest.yen)}。いちばん大きい分野は${top ? `${top.name}（${formatYen(top.yen)}）` : '—'}。使い道ごとの金額を、出典の頁と照らして確かめられます。`
}

export function pageHead(d: PageData): Head {
  const latest = d.years.at(-1)!
  const title = `${d.name}の歳出｜${reiwa(latest.year)}決算｜風土記`
  const description = pageDescription(d)
  const canonical = `${ORIGIN}${jurisdictionPath(d.code)}`
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${d.name}の歳出（${reiwa(latest.year)}決算・一般会計）`,
    description,
    url: canonical,
    inLanguage: 'ja',
    spatialCoverage: { '@type': 'AdministrativeArea', name: `${d.prefecture}${d.name}` },
    creator: { '@type': 'Organization', name: '風土記', url: `${ORIGIN}/` },
    ...(d.originTitle ? { isBasedOn: d.originTitle } : {}),
  }
  return head(title, description, canonical, { script: [{ type: 'application/ld+json', innerHTML: inlineJson(ld) }] })
}

/** 収録がまだ無い自治体。検索の対象にはしない */
export const emptyHead = (e: CatalogEntry): Head =>
  head(`${e.name}｜風土記`, `${e.name}の歳出は風土記にまだ収録されていません。`, `${ORIGIN}${jurisdictionPath(e.code)}`, { meta: [{ name: 'robots', content: 'noindex' }] })

export function indexHead(count: number): Head {
  const description = count
    ? `決算を収録している自治体（${count}）を、地図と表で一覧にしています。人口・1人あたりの歳出・歳出の総額を見比べて、自治体ごとの款・項・目へ進めます。`
    : '風土記が決算を収録した自治体の一覧です。まだ収録した自治体がありません。'
  return head('自治体を探す｜風土記', description, `${ORIGIN}${INDEX_PATH}`)
}

export const sitemapXml = (entries: CatalogEntry[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}${INDEX_PATH}</loc></url><url><loc>${ORIGIN}/assistant</loc></url><url><loc>${ORIGIN}/about</loc></url>${entries
    .filter((e) => e.settlementYears.length > 0)
    .map((e) => `<url><loc>${ORIGIN}${jurisdictionPath(e.code)}</loc></url>`)
    .join('')}</urlset>\n`
