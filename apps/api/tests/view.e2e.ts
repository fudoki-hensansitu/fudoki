import { test, beforeEach } from '@e2e-dev/web'
import { expect } from 'e2e'

beforeEach(async ({ app }) => {
  await fetch(new URL('/__reset', app.baseUrl), { method: 'POST' })
})

test('款の一覧から掘り下げ、参照の PDF を開いて戻る', async ({ app, browser }) => {
  await app.open('/?ui=chart')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('heading', '一般会計')).toBeVisible()
  await ui.getByRole('button', '総務費 6,000,000,000円 の内訳を見る').tap()
  await ui.getByRole('button', '総務管理費 4,000,000,000円 の内訳を見る').tap()
  await ui.getByRole('button', '参照（PDF）: 総務管理費').tap()
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  await ui.getByRole('button', '戻る').tap()
  await expect(ui.getByRole('region', '目ごとの内訳')).toBeVisible()
})

test('団体をまたぐ一覧を団体ごとに出す', async ({ app, browser }) => {
  await app.open('/?ui=chart-cities')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('region', '試験市')).toBeVisible()
  await expect(ui.getByRole('region', '比較市')).toBeVisible()
})

test('団体一覧の資料を押すとチャットに問いを送る', async ({ app, browser }) => {
  await app.open('/?ui=jurisdictions')
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '試験市 2024年度 決算の一般会計をチャットで聞く').tap()
  expect(await browser.evaluate('() => window.uiQA.messages().length')).toBe(1)
})
