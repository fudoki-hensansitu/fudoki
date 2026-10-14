import { test, beforeEach } from '@e2e-dev/web'
import { expect } from 'e2e'

beforeEach(async ({ app }) => { await fetch(new URL('/__reset', app.baseUrl), { method: 'POST' }); await app.open('/') })

test('該当頁・項目と金額の枠・取得情報・再利用', async ({ browser, app }) => {
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: 枠あり').tap()
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  await expect(ui.getByRole('img', '項目の印字枠')).toBeVisible()
  await expect(ui.getByRole('img', '金額の印字枠')).toBeVisible()
  await expect(ui.getByRole('status')).toContainText('1 / 2ページ')
  await expect(ui.getByText('取得日時:', { exact: false })).toBeVisible()
  await expect(ui.getByRole('link', '取得 URL: https://city.fudoki.dev/ok.pdf')).toBeVisible()
  await expect(ui.getByText('取り込み時の原典と内容が異なる可能性', { exact: false })).toBeVisible()
  await ui.getByRole('button', '閉じる').tap()
  await ui.getByRole('button', '項目の原典を表示: 枠あり').tap()
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  const stats = await (await fetch(new URL('/__stats', app.baseUrl))).json()
  expect(stats['/ok.pdf']).toBe(1)
})

test('金額が別頁なら該当頁に切替・項目の枠を残さない', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: 別頁の金額').tap()
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  await expect(ui.getByRole('img', '金額の印字枠')).toHaveCount(0)
  await ui.getByRole('button', '金額 2ページ').tap()
  await expect(ui.getByRole('img', '原典 PDF 2ページ')).toBeVisible()
  await expect(ui.getByRole('img', '金額の印字枠')).toBeVisible()
  await expect(ui.getByRole('img', '項目の印字枠')).toHaveCount(0)
})

for (const name of ['枠欠損', '次頁継続']) test(`${name}は頁のみ`, async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', `項目の原典を表示: ${name}`).tap()
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  await expect(ui.getByRole('img', '項目の印字枠')).toHaveCount(0)
  await expect(ui.getByRole('status')).toContainText('強調できる単一頁の枠はありません')
})

test('取得失敗は原典 URL と項目・金額の頁番号を残す', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: 取得失敗').tap()
  await expect(ui.getByRole('status')).toContainText('表示できません。項目: 1ページ / 金額: 2ページ')
  await expect(ui.getByRole('link', 'https://city.fudoki.dev/missing.pdf')).toBeVisible()
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toHaveCount(0)
})

test('頁数が変わったPDFは失敗としてURL・頁番号を残す', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: 頁が変わった').tap()
  await expect(ui.getByRole('status')).toContainText('項目: 3ページ')
  await expect(ui.getByRole('status')).toContainText('原典の頁数')
})

test('CSVは原典リンク・行番号、320/375/414/768pxでも表示領域は収まる', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('button', '項目の原典を表示: CSV原典')).toHaveCount(0)
  await expect(ui.getByRole('link', '原典')).toBeVisible()
  for (const width of [320, 375, 414, 768]) {
    await browser.setViewport({ width, height: 900 })
    await ui.getByRole('button', '項目の原典を表示: 枠あり').tap()
    await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await ui.getByRole('button', '閉じる').tap()
  }
})

if (process.env.REAL_PDF_QA === '1') test('自治体の公開PDFと提供済み明細で日本語・項目金額の枠を表示', async ({ app, browser }) => {
  await app.open('/?real')
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: 備品購入費').tap()
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  await expect(ui.getByRole('img', '項目の印字枠')).toBeVisible()
  await expect(ui.getByRole('img', '金額の印字枠')).toBeVisible()
  const frame = await ui.getByRole('img', '項目の印字枠').boundingBox()
  expect(frame!.y).toBeLessThan(700)
  await app.screenshot('real-origin-pdf')
})

test('取得サイズ上限を超えた場合もURLと頁番号を案内', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: サイズ上限').tap()
  await expect(ui.getByRole('status')).toContainText('32 MiB')
  await expect(ui.getByRole('status')).toContainText('項目: 1ページ')
  await expect(ui.getByRole('link', 'https://city.fudoki.dev/big-header.pdf')).toBeVisible()
})

test('取得頻度の上限を超えた場合もURLと頁番号を案内', async ({ browser, app }) => {
  for (let i = 0; i < 6; i++) await fetch(new URL(`/v1/origins/extra-${i}/pdf`, app.baseUrl))
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: 頻度上限').tap()
  await expect(ui.getByRole('status')).toContainText('取得頻度の上限')
  await expect(ui.getByRole('status')).toContainText('項目: 1ページ')
  await expect(ui.getByRole('link', 'https://city.fudoki.dev/extra-6.pdf')).toBeVisible()
})

test('回転頁の表示後の左上原点ptに枠を対応させる', async ({ browser, app }) => {
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: 回転頁').tap()
  const canvas = ui.getByRole('img', '原典 PDF 1ページ')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('width', '1600')
  await expect(canvas).toHaveAttribute('height', '1200')
  await expect(ui.getByRole('img', '項目の印字枠')).toHaveAttribute('style', /left: 91.25%/)
  await app.screenshot('rotated-origin-pdf')
})
