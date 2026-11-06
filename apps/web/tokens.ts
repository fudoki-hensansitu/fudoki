// 画面の背景色の正本。styles/tokens.css の --background（試験が照合する）、<meta name="theme-color">、PWA の manifest はここを参照する（値は DESIGN.md と揃える）
export const BACKGROUND_LIGHT = '#ffffff'
export const BACKGROUND_DARK = '#1b1916'

/** 各頁の <head> に入れる theme-color（ライト・ダーク）。middleware/01.site.ts が入れる */
export const THEME_COLOR_META = `<meta name="theme-color" content="${BACKGROUND_LIGHT}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${BACKGROUND_DARK}" media="(prefers-color-scheme: dark)">`
