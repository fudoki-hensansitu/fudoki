import { test, beforeEach } from '@e2e-dev/web'
import { expect } from 'e2e'

beforeEach(async ({ app }) => {
  await fetch(new URL('/__reset', app.baseUrl), { method: 'POST' })
})

test('款・項・目を選択し、先の階層を残して兄弟へ切り替える', async ({ app, browser }) => {
  await app.open('/?ui=chart')
  const ui = browser.frameLocator('iframe')
  const kan = ui.getByRole('region', '款の金額')
  await expect(kan.getByRole('heading', '款別の金額')).toBeVisible()
  await expect(ui.locator('.expenditure-label').nth(0)).toHaveText('1')
  await expect(ui.locator('.expenditure-label').nth(1)).toHaveText('2')
  await expect(ui.locator('.expenditure-marker').nth(0)).toHaveText('1')
  await expect(ui.locator('.expenditure-marker').nth(1)).toHaveText('2')
  await expect(kan.getByRole('cell', '6,000円', { exact: true })).toBeVisible()
  await expect(kan.getByRole('cell', '4,000円', { exact: true })).toBeVisible()
  await expect(ui.locator('section[aria-label="款の金額"] .recharts-sector')).toHaveCount(2)
  await expect(ui.getByRole('columnheader', '原典')).toHaveCount(0)
  await kan.getByRole('button', '内訳: 総務費').tap()
  const kou = ui.getByRole('region', '項の金額')
  await expect(ui.locator('section[aria-label="項の金額"] .recharts-sector')).toHaveCount(2)
  await expect(kan.getByRole('button', '内訳: 総務費')).toHaveAttribute('aria-pressed', 'true')
  await kou.getByRole('button', '内訳: 総務管理費').press('Enter')
  const moku = ui.getByRole('region', '目の金額')
  await expect(moku.getByRole('cell', '2,500円', { exact: true })).toBeVisible()
  await expect(moku.getByRole('cell', '1,500円', { exact: true })).toBeVisible()
  await expect(kan).toBeVisible()
  await expect(kou).toBeVisible()
  await app.screenshot('kan-kou-moku')
  // 既に選んだ款の別の項から、目の表示を置き換える。
  await kou.getByRole('button', '内訳: 徴税費').tap()
  await expect(moku.getByRole('button', '内訳: 税務総務費')).toBeVisible()
  await expect(moku.getByRole('button', '内訳: 一般管理費')).toHaveCount(0)
  await kan.getByRole('button', '内訳: 民生費').tap()
  await expect(ui.getByRole('region', '目の金額')).toHaveCount(0)
  await expect(kou.getByRole('button', '内訳: 社会福祉費')).toBeVisible()
  expect(await browser.evaluate('() => window.uiQA.calls().length')).toBe(4)
  await ui.getByRole('button', '← 戻る').tap()
  await expect(ui.locator('section[aria-label="款の金額"] .recharts-sector')).toHaveCount(2)
})

test('款で絞った結果は項の印字額を描き、取得途中は範囲を示す', async ({ app, browser }) => {
  await app.open('/?ui=chart-kan')
  const ui = browser.frameLocator('iframe')
  await expect(ui.locator('section[aria-label="項の金額"] .recharts-sector')).toHaveCount(2)
  await expect(ui.getByRole('cell', '4,000円', { exact: true })).toBeVisible()
  await expect(ui.getByRole('cell', '2,000円', { exact: true })).toBeVisible()
  await app.open('/?ui=chart-partial')
  await expect(ui.getByText('取得済みの明細内の割合です。続きを取得すると変わります。')).toBeVisible()
  await ui.getByRole('button', 'さらに表示').tap()
  await expect(ui.locator('section[aria-label="款の金額"] .recharts-sector')).toHaveCount(2)
  await expect(ui.getByText('取得済みの明細内の割合です。続きを取得すると変わります。')).toHaveCount(0)
  const slice = ui.locator('section[aria-label="款の金額"] .recharts-sector').last()
  const box = (await slice.boundingBox())!
  await slice.tap({ position: { x: box.width * .7, y: box.height * .7 } })
  await expect(ui.getByRole('region', '項の金額')).toBeVisible()
  expect(await browser.evaluate('() => window.uiQA.calls().length')).toBe(2)
})

test('団体・年・会計・親・階層を混ぜず、欠損額を0円にしない', async ({ app, browser }) => {
  await app.open('/?ui=chart-mixed')
  const ui = browser.frameLocator('iframe')
  const range = ui.getByRole('combobox', '金額の表示範囲')
  await expect(range).toBeVisible()
  await expect(ui.locator('.recharts-sector')).toHaveCount(2)
  await range.selectOption({ index: 2 })
  await expect(ui.locator('.recharts-sector')).toHaveCount(1)
  await expect(ui.getByRole('cell', '6,000円', { exact: true })).toBeVisible()
  await app.open('/?ui=chart-invalid')
  await expect(ui.locator('.recharts-sector')).toHaveCount(0)
  await expect(ui.getByRole('cell', '—', { exact: true })).toBeVisible()
  await expect(ui.getByText('金額が不明、負数、または正確に扱えない明細を含むため、表で表示します。')).toBeVisible()
})

test('各hostテーマと狭いiframeでチャートと選択操作が収まる', async ({ app, browser }) => {
  await app.open('/?ui=chart')
  const ui = browser.frameLocator('iframe')
  for (const width of [320, 375, 414, 768]) {
    await browser.setViewport({ width, height: 900 })
    for (const host of ['chatgpt', 'claude']) for (const theme of ['light', 'dark']) {
      await browser.evaluate(`() => window.uiQA.theme('${theme}', '${host}')`)
      await expect(ui.locator('.recharts-sector')).toHaveCount(2)
      expect(await browser.evaluate('() => document.documentElement.scrollWidth <= innerWidth')).toBe(true)
    }
    await app.screenshot(`expenditure-chart-${width}`)
  }
  await ui.getByRole('button', '内訳: 総務費').tap()
  await expect(ui.getByRole('region', '項の金額')).toBeVisible()
})
