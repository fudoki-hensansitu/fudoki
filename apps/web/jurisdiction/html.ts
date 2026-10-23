// 自治体の個別ページ（/:都道府県/:名称）と一覧（/jurisdictions）の HTML。検索エンジンが読めるよう、金額と款・事業はサーバーで書き出す。
// グラフと会話への導線は島（jurisdiction/jurisdiction.tsx）が同じデータで描き直す
import { logo, TOKENS_CSS, TURNSTILE_SCRIPT } from '../landing'
import { PWA_HEAD, PWA_REGISTER } from '../pwa'
import type { CatalogEntry } from '../server/jurisdiction'
import { formatYen, jurisdictionPath, reiwa, type PageData } from './types'

const ORIGIN = 'https://fudoki.dev'
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
/** JSON を script の中に置くときに </script> や <!-- で抜けないようにする */
const inlineJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

const head = (title: string, description: string, canonical: string, extra = '') => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b1916" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${PWA_HEAD}
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>${TOKENS_CSS}</style>
<link rel="stylesheet" href="/_app/jurisdiction.css">
${extra}`

export const INDEX_PATH = '/' + encodeURIComponent('自治体')
const header = `<header class="j-top"><a class="j-brand" href="/" aria-label="風土記 ホーム">${logo('j-logo')}</a><nav><a href="/自治体">自治体を探す</a><a href="https://docs.fudoki.dev/">使い方</a></nav></header>`

/** 個別ページの説明文。検索結果に出るので、金額は API の値だけで書く（人口や仮の値は入れない） */
export function pageDescription(d: PageData): string {
  const latest = d.years.at(-1)!
  const top = latest.kan[0]
  return `${d.name}の${reiwa(latest.year)}決算（一般会計）の歳出は約${formatYen(latest.yen)}。最も大きい款は${top ? `${top.name}（${formatYen(top.yen)}）` : '—'}。款・項・目の金額を、出典の頁と照らして確かめられます。`
}

export function renderPage(d: PageData, siteKey: string): string {
  const latest = d.years.at(-1)!
  const title = `${d.name}の歳出｜${reiwa(latest.year)}決算｜風土記`
  const description = pageDescription(d)
  const canonical = `${ORIGIN}${jurisdictionPath(d.prefecture, d.name)}`
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
  const rows = latest.kan.map((k) => `<tr><th scope="row">${esc(k.name)}</th><td>${formatYen(k.yen)}</td></tr>`).join('')
  const projects = d.projects.map((p) => `<li><b>${esc(p.name)}</b>（${esc(p.kanName)}）${formatYen(p.yen)}</li>`).join('')
  return `<!doctype html>
<html lang="ja">
<head>
${head(title, description, canonical, `${siteKey ? `${TURNSTILE_SCRIPT}\n` : ''}<script type="application/ld+json">${inlineJson(ld)}</script>\n<script type="module" src="/_app/jurisdiction.js"></script>`)}
</head>
<body>
${header}
<div id="j-app" data-turnstile-sitekey="${esc(siteKey)}">
<main class="j-static">
<p class="j-crumb"><a href="/自治体">自治体</a> › ${esc(d.prefecture)} › ${esc(d.name)}</p>
<h1>${esc(d.name)}</h1>
<p>${esc(description)}</p>
<h2>${reiwa(latest.year)}決算の歳出（款別）</h2>
<table><tbody>${rows}</tbody></table>
<h2>金額の大きい事業</h2>
<ul>${projects}</ul>
${d.originTitle ? `<p>出典: ${esc(d.originTitle)}</p>` : ''}
</main>
</div>
<script type="application/json" id="j-data">${inlineJson(d)}</script>
${PWA_REGISTER}
</body>
</html>
`
}

/** 収録がまだ無い自治体。検索の対象にはしない */
export function renderEmpty(e: CatalogEntry): string {
  const title = `${e.name}｜風土記`
  return `<!doctype html>
<html lang="ja">
<head>
${head(title, `${e.name}の歳出は風土記にまだ収録されていません。`, `${ORIGIN}${jurisdictionPath(e.prefecture, e.name)}`, '<meta name="robots" content="noindex">')}
</head>
<body>
${header}
<main class="j-static"><h1>${esc(e.name)}</h1><p>この自治体の決算は、風土記にまだ収録されていません。</p><p><a href="/自治体">収録している自治体を見る</a></p></main>
${PWA_REGISTER}
</body>
</html>
`
}

export function renderIndex(entries: CatalogEntry[]): string {
  const have = entries.filter((e) => e.settlementYears.length > 0)
  const canonical = `${ORIGIN}${INDEX_PATH}`
  const description = `決算を収録している自治体（${have.length}）の一覧。自治体ごとに歳出の款・項・目と、金額の推移を確かめられます。`
  const byPref = new Map<string, CatalogEntry[]>()
  for (const e of have) byPref.set(e.prefecture, [...(byPref.get(e.prefecture) ?? []), e])
  const sections = [...byPref].map(([pref, list]) => `<h2>${esc(pref)}</h2><ul class="j-list">${list.map((e) => `<li><a href="${jurisdictionPath(e.prefecture, e.name)}">${esc(e.name)}</a></li>`).join('')}</ul>`).join('')
  return `<!doctype html>
<html lang="ja">
<head>
${head('自治体を探す｜風土記', description, canonical)}
</head>
<body>
${header}
<main class="j-static"><h1>自治体を探す</h1><p>${esc(description)}</p>${sections}</main>
${PWA_REGISTER}
</body>
</html>
`
}

export const sitemapXml = (entries: CatalogEntry[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}${INDEX_PATH}</loc></url>${entries
    .filter((e) => e.settlementYears.length > 0)
    .map((e) => `<url><loc>${ORIGIN}${jurisdictionPath(e.prefecture, e.name)}</loc></url>`)
    .join('')}</urlset>\n`
