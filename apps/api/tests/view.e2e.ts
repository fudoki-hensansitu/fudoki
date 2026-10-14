import { test, beforeEach } from '@e2e-dev/web'
import { expect } from 'e2e'

beforeEach(async ({ app }) => {
  await fetch(new URL('/__reset', app.baseUrl), { method: 'POST' })
})

test('款を金額の棒で並べ、掘り下げた先で原典を全画面に開いて戻る', async ({ app, browser }) => {
  await app.open('/?ui=chart')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('heading', '一般会計')).toBeVisible()
  await expect(ui.getByText('試験市 · 2024年度 決算')).toBeVisible()
  await expect(ui.getByText('60%')).toBeVisible()
  await ui.getByRole('button', '総務費 6,000,000,000円 の内訳を見る').tap()
  await expect(ui.getByRole('heading', '款 総務費')).toBeVisible()
  await expect(ui.getByText('60.0億円')).toBeVisible()
  await ui.getByRole('button', '総務管理費 4,000,000,000円 の内訳を見る').tap()
  await expect(ui.getByRole('region', '目ごとの内訳')).toBeVisible()
  expect(String(await browser.evaluate('() => window.uiQA.contexts().at(-1)'))).toContain('【款】総務費 › 【項】総務管理費')
  await app.screenshot('drill')
  await ui.getByRole('button', '参照: 総務管理費').tap()
  await expect(ui.getByRole('img', '項目の印字枠')).toBeVisible()
  expect(await browser.evaluate('() => window.uiQA.displayMode()')).toBe('fullscreen')
  // View が報告する高さで iframe が決まるので、PDF の頁が潰れずに見えていること
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  expect(Number(await browser.evaluate("() => document.querySelector('iframe').getBoundingClientRect().height"))).toBeGreaterThan(400)
  await ui.getByRole('button', '← 戻る').tap()
  expect(await browser.evaluate('() => window.uiQA.displayMode()')).toBe('inline')
  // 経路の段を押すと、その画面に戻る
  await ui.getByRole('button', '一般会計に戻る').tap()
  await expect(ui.getByRole('heading', '一般会計')).toBeVisible()
})

test('件数が多いと上位10件だけを出し、残りは割合を添えて畳む', async ({ app, browser }) => {
  await app.open('/?ui=chart-many')
  const ui = browser.frameLocator('iframe')
  const bars = ui.getByRole('list', '一般会計').getByRole('listitem')
  await expect(bars).toHaveCount(10)
  await ui.getByRole('button', 'ほか4件（0.2%）').tap()
  await expect(bars).toHaveCount(14)
})

test('団体や年度が混ざる結果は割合を出さず、行ごとに団体と年度を添える', async ({ app, browser }) => {
  await app.open('/?ui=chart-compare')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('heading', '3件の明細')).toBeVisible()
  await expect(ui.getByText('比較市 · 2024年度 決算 · 一般会計')).toBeVisible()
  await expect(ui.getByText('%')).toHaveCount(0)
})

test('団体と年度の表に収録した資料の区分を置く', async ({ app, browser }) => {
  await app.open('/?ui=jurisdictions')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('heading', '2団体の収録範囲')).toBeVisible()
  await expect(ui.getByRole('columnheader', '2025年度')).toBeVisible()
  await expect(ui.getByText('当初予算')).toBeVisible()
  // 収録した資料を押すと、View の中では移らず、チャットに問いを送って AI に呼び直させる
  await ui.getByRole('button', '試験市 2024年度 決算の一般会計をチャットで聞く').tap()
  expect(await browser.evaluate('() => window.uiQA.messages().at(-1)')).toBe('試験市（団体コード 000001）の2024年度 決算・一般会計の歳出を款ごとに見せて')
  expect(await browser.evaluate('() => window.uiQA.calls().length')).toBe(0)
  await expect(ui.getByRole('heading', '2団体の収録範囲')).toBeVisible()
})

test('取得の失敗と0件は、それぞれ短い文で知らせる', async ({ app, browser }) => {
  await app.open('/?ui=error')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByText('試験の初回取得失敗')).toBeVisible()
  await app.open('/?ui=empty')
  await expect(ui.getByText('該当する歳出明細はありません。')).toBeVisible()
})
