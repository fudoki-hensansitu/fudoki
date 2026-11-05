// サーバーが書いたサイドバー（render.tsx）を動かす。build で /_app/nav.js になり、withSiteNav が全頁に読み込ませる
import { hydrateRoot } from 'react-dom/client'
import { NAV_SECTIONS, SiteNav, type NavSection } from './site-nav'

const root = document.getElementById('site-nav')
if (root) {
  const active = NAV_SECTIONS.find((s) => s === root.dataset.active) as NavSection | undefined
  // 開閉はサーバーが書いた状態に合わせる（cookie を読み直すと、キャッシュされた HTML と食い違ったときに hydrate が崩れる）
  const open = root.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state') !== 'collapsed'
  hydrateRoot(root, <SiteNav active={active} open={open} />)
}
