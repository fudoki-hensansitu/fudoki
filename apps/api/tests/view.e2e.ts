import { test, beforeEach } from '@e2e-dev/web'
import { expect } from 'e2e'

beforeEach(async ({ app }) => {
  await fetch(new URL('/__reset', app.baseUrl), { method: 'POST' })
})

test('款の一覧から掘り下げ、出典の PDF を開いて戻る', async ({ app, browser }) => {
  await app.open('/?ui=chart')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('heading', '一般会計')).toBeVisible()
  await ui.getByRole('button', '総務費 6,000,000,000円 の内訳を見る').tap()
  await ui.getByRole('button', '総務管理費 4,000,000,000円 の内訳を見る').tap()
  await ui.getByRole('button', '出典（PDF）: 総務管理費').tap()
  await expect(ui.getByRole('img', '出典 PDF 1ページ')).toBeVisible()
  await ui.getByRole('button', '戻る').tap()
  await expect(ui.getByRole('region', '目ごとの内訳')).toBeVisible()
})

test('自治体をまたぐ一覧を自治体ごとに出す', async ({ app, browser }) => {
  await app.open('/?ui=chart-cities')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('region', '試験市')).toBeVisible()
  await expect(ui.getByRole('region', '比較市')).toBeVisible()
})
