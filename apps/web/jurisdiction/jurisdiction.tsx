// 自治体の個別ページの島。サーバーが page.tsx で書いた HTML に、同じデータで hydrate する
import { hydrateRoot } from 'react-dom/client'
import { Page } from './page'
import type { PageData } from './types'

const root = document.getElementById('j-app')
const raw = document.getElementById('j-data')?.textContent
if (root && raw) hydrateRoot(root, <Page data={JSON.parse(raw) as PageData} sitekey={root.dataset.turnstileSitekey ?? ''} />)
