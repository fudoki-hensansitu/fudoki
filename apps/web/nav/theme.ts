// 画面のテーマ（ライト・ダーク・端末に合わせる）。サイドバーで選び、cookie に残す。middleware/01.site.ts が cookie を読んで html に data-theme を付け、
// styles/tokens.css が data-theme（無ければ端末の設定）で色を切り替える
import { BACKGROUND_DARK, BACKGROUND_LIGHT } from '../tokens'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
export const THEME_COOKIE = 'theme'
/** テーマが替わったときに window へ流す event（会話の表など、色を JS で渡すものが聞く） */
export const THEME_EVENT = 'fudoki:theme'

export const themeFromCookie = (cookie: string | undefined): Theme => {
  const v = new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=(light|dark)(?:;|$)`).exec(cookie ?? '')?.[1]
  return v === 'light' || v === 'dark' ? v : 'system'
}

/** <head> に入れる theme-color。端末に合わせるときはライト・ダークの両方を media で出す */
export const themeColorMeta = (theme: Theme) =>
  theme === 'system'
    ? `<meta name="theme-color" content="${BACKGROUND_LIGHT}" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="${BACKGROUND_DARK}" media="(prefers-color-scheme: dark)">`
    : `<meta name="theme-color" content="${theme === 'dark' ? BACKGROUND_DARK : BACKGROUND_LIGHT}">`

/** いま暗い色で描いているか（ブラウザでだけ呼ぶ） */
export const isDark = () => {
  const t = document.documentElement.dataset.theme
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}

/** テーマを替える。html の data-theme・theme-color・cookie を書き換え、THEME_EVENT を流す */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  document.head.insertAdjacentHTML('beforeend', themeColorMeta(theme))
  document.cookie = theme === 'system' ? `${THEME_COOKIE}=; path=/; max-age=0` : `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  window.dispatchEvent(new Event(THEME_EVENT))
}
