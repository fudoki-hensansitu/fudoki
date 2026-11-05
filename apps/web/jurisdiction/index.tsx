// 自治体一覧（/jurisdictions）の島。サーバーが書いた同じ本文（index-page.tsx）を hydrate し、地図の選択と表の操作を動かす
import { hydrateRoot } from 'react-dom/client'
import { IndexPage } from './index-page'
import type { IndexEntry } from './types'

const root = document.getElementById('j-index')
const raw = document.getElementById('j-index-data')?.textContent
if (root && raw) hydrateRoot(root, <IndexPage entries={JSON.parse(raw) as IndexEntry[]} />)
