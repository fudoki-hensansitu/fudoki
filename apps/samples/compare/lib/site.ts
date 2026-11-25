// まち比べの頁の置き場と、本体への繋ぎ先
/** 風土記の本体。まちの頁はそこへ繋ぐ */
export const FUDOKI_ORIGIN = 'https://fudoki.dev'
/** このサイトの頁を置く path（pages/compare/ と同じ。本体の apps/web の middleware が中継する path とも揃える） */
export const BASE = '/compare'

/** class 名を空白で繋ぐ（偽の値は落とす） */
export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

/** 見出しの大きさ（fudoki の DESIGN.md の Typography の段） */
const SIZE = {
  h1: 'text-[28px] leading-[1.35] tracking-[0.02em] sm:text-[32px]',
  h3: 'text-xl leading-snug',
  headline: 'text-base',
} as const
export const titleClass = (size: keyof typeof SIZE) => `font-semibold ${SIZE[size]}`

/** 西暦の会計年度を令和の R 表記にする（2025 → R7年度）。2019年より前は西暦のまま */
export const reiwa = (year: number) => (year >= 2019 ? `R${year - 2018}年度` : `${year}年度`)
