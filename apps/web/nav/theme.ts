// 画面のテーマ（ライト・ダーク・端末に合わせる）。サイドバーで選び、ブラウザの localStorage に残す。
// サーバーはテーマで HTML を書き分けない（どの人にも同じ HTML を返し、CDN に置けるようにする）。<head> の THEME_SCRIPT が描く前に html の data-theme を付け、
// styles/tokens.css が data-theme（無ければ端末の設定）で色を切り替える。選んでいなければライト
import { BACKGROUND_DARK, BACKGROUND_LIGHT } from '../tokens'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
/** localStorage の key。前は同じ名前の cookie に置いていたので、THEME_SCRIPT が cookie を見つけたら移して消す */
export const THEME_KEY = 'theme'
/** テーマが替わったときに window へ流す event（会話の表など、色を JS で渡すものが聞く） */
export const THEME_EVENT = 'fudoki:theme'

export const DEFAULT_THEME: Theme = 'light'

/** <head> に入れる theme-color。端末に合わせるときはライト・ダークの両方を media で出す */
export const themeColorMeta = (theme: Theme) =>
  theme === 'system'
    ? `<meta name="theme-color" content="${BACKGROUND_LIGHT}" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="${BACKGROUND_DARK}" media="(prefers-color-scheme: dark)">`
    : `<meta name="theme-color" content="${theme === 'dark' ? BACKGROUND_DARK : BACKGROUND_LIGHT}">`

/**
 * 描く前にテーマを当てる inline の script（void.config.ts の head、CSP は hash で許す）。選んだテーマは html の data-theme-choice にも置き、サイドバーが読む。
 * theme-color は既定（ライト）の meta が middleware で head の末尾に入るので、HTML を読み終えてから選んだテーマのものに差し替える
 */
export const THEME_SCRIPT = [
  '(function(){var d=document,r=d.documentElement,t;',
  // 前は cookie に置いていた。見つけたら localStorage へ移し、cookie は消す（cookie の付いた要求は CDN の cache を通らない）
  `try{t=localStorage.getItem('${THEME_KEY}');if(!t){var m=/(?:^|;\\s*)${THEME_KEY}=(system|light|dark)(?:;|$)/.exec(d.cookie);if(m){t=m[1];localStorage.setItem('${THEME_KEY}',t);d.cookie='${THEME_KEY}=; path=/; max-age=0'}}}catch(e){}`,
  `if(t!=='system'&&t!=='dark')t='${DEFAULT_THEME}';if(t!=='system')r.dataset.theme=t;r.dataset.themeChoice=t;`,
  `if(t!=='${DEFAULT_THEME}')d.addEventListener('DOMContentLoaded',function(){d.querySelectorAll('meta[name="theme-color"]').forEach(function(x){x.remove()});d.head.insertAdjacentHTML('beforeend',t==='dark'?${JSON.stringify(themeColorMeta('dark'))}:${JSON.stringify(themeColorMeta('system'))})})`,
  '})()',
].join('')

/** 今選んでいるテーマ（ブラウザでだけ呼ぶ。THEME_SCRIPT が付けた印を読む） */
export const currentTheme = (): Theme => {
  const t = document.documentElement.dataset.themeChoice
  return (THEMES as readonly string[]).includes(t ?? '') ? (t as Theme) : DEFAULT_THEME
}

/** いま暗い色で描いているか（ブラウザでだけ呼ぶ） */
export const isDark = () => {
  const t = document.documentElement.dataset.theme
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}

/** テーマを替える。html の data-theme・theme-color・localStorage を書き換え、THEME_EVENT を流す */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  root.dataset.themeChoice = theme
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  document.head.insertAdjacentHTML('beforeend', themeColorMeta(theme))
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // 保存できない（プライベートブラウズなど）ときは、この頁の間だけ替える
  }
  window.dispatchEvent(new Event(THEME_EVENT))
}
