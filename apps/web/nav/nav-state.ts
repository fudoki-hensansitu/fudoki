// サイドバーの開閉。ブラウザの localStorage に残し、サーバーは開閉で HTML を書き分けない（どの人にも同じ HTML を返し、CDN に置けるようにする）。
// 閉じた人は <head> の NAV_SCRIPT が html に data-nav-closed を付け、hydrate するまでの見た目を styles/app.css が閉じた幅に揃える。
// hydrate したら nav/site-nav.tsx が状態を読み、html に data-nav-ready を付けて CSS の仮の見た目を外す

/** localStorage の key。前は同じ名前の cookie に置いていた（shadcn の SidebarProvider が書く名前）ので、NAV_SCRIPT が cookie を見つけたら移して消す */
export const NAV_KEY = 'sidebar_state'

export const NAV_SCRIPT = [
  `(function(){var d=document,v;try{v=localStorage.getItem('${NAV_KEY}');`,
  `if(v===null){var m=/(?:^|;\\s*)${NAV_KEY}=(true|false)(?:;|$)/.exec(d.cookie);if(m){v=m[1];localStorage.setItem('${NAV_KEY}',v);d.cookie='${NAV_KEY}=; path=/; max-age=0'}}}catch(e){}`,
  `if(v==='false')d.documentElement.setAttribute('data-nav-closed','')})()`,
].join('')

/** 開いて出すか（ブラウザでだけ呼ぶ。NAV_SCRIPT が付けた印を読む） */
export const readNavOpen = () => !document.documentElement.hasAttribute('data-nav-closed')

export function saveNavOpen(open: boolean) {
  document.documentElement.toggleAttribute('data-nav-closed', !open)
  try {
    localStorage.setItem(NAV_KEY, String(open))
  } catch {
    // 保存できない（プライベートブラウズなど）ときは、この頁の間だけ替える
  }
}
