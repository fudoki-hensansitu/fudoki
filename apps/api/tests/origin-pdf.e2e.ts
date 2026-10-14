import { test, beforeEach } from '@e2e-dev/web'
import { expect } from 'e2e'
import { openOrigin } from './origin-helper'

beforeEach(async ({ app }) => {
  await fetch(new URL('/__reset', app.baseUrl), { method: 'POST' })
  await app.open('/')
})

test('見開きの頁送り・中心の縦横ガイド・文字の外側の枠', async ({ app, browser }) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '頁送り')
  await expect(ui.getByRole('status')).toContainText('1・2 / 6ページ')
  await expect(ui.getByRole('button', '前の頁')).toBeDisabled()
  const frame = await ui.getByRole('img', '項目の印字枠').boundingBox()
  const horizontal = await ui.locator('.pdf-guide-x.source').boundingBox()
  const vertical = await ui.locator('.pdf-guide-y.source').boundingBox()
  expect(Math.abs(horizontal!.y - (frame!.y + frame!.height / 2))).toBeLessThan(1)
  expect(Math.abs(vertical!.x - (frame!.x + frame!.width / 2))).toBeLessThan(1)
  // 枠のinner edgeは文字領域から2px外側。クリック・頁送りを妨げない。
  await ui.getByRole('button', '次の頁').tap()
  await expect(ui.getByRole('status')).toContainText('3・4 / 6ページ')
  await expect(ui.locator('.pdf-guide')).toHaveCount(0)
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(2)
  await ui.getByRole('button', '次の頁').tap()
  await expect(ui.getByRole('status')).toContainText('5・6 / 6ページ')
  await expect(ui.getByRole('button', '次の頁')).toBeDisabled()
  await ui.getByRole('button', '前の頁').tap()
  await expect(ui.getByRole('status')).toContainText('3・4 / 6ページ')
  await ui.getByRole('button', '前の頁').tap()
  await expect(ui.getByRole('img', '項目の印字枠')).toBeVisible()
  await app.screenshot('pdf-preview-guides')
  const stats = await (await fetch(new URL('/__stats', app.baseUrl))).json()
  expect(stats['/navigation.pdf']).toBe(1)
})

test('該当頁・項目と金額の枠・取得情報・再利用', async ({ browser, app }) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '枠あり', '項目')
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  await expect(ui.getByRole('img', '項目の印字枠')).toBeVisible()
  await expect(ui.getByRole('img', '金額の印字枠')).toBeVisible()
  await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(2)
  await ui.getByText('取得情報', { exact: true }).tap()
  await expect(ui.getByText('取得日時:', { exact: false })).toBeVisible()
  await expect(
    ui.getByRole('link', 'https://city.fudoki.dev/ok.pdf'),
  ).toBeVisible()
  await expect(
    ui.getByText('取り込み時の原典と内容が異なる可能性', { exact: false }),
  ).toBeVisible()
  await ui.getByRole('button', '閉じる').tap()
  await openOrigin(ui, '枠あり', '項目')
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  const stats = await (await fetch(new URL('/__stats', app.baseUrl))).json()
  expect(stats['/ok.pdf']).toBe(1)
})

test('別頁の項目と金額を左右に同時表示し、各頁の枠を保持する', async ({
  browser,
  app,
}) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '別頁の金額', '項目')
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
  await expect(ui.getByRole('img', '原典 PDF 2ページ')).toBeVisible()
  await expect(
    ui.getByRole('region', '項目 1ページ').getByRole('img', '項目の印字枠'),
  ).toBeVisible()
  await expect(
    ui.getByRole('region', '金額 2ページ').getByRole('img', '金額の印字枠'),
  ).toBeVisible()
  await expect(
    ui.getByRole('region', '項目 1ページ').getByRole('img', '金額の印字枠'),
  ).toHaveCount(0)
  await expect(
    ui.getByRole('region', '金額 2ページ').getByRole('img', '項目の印字枠'),
  ).toHaveCount(0)
  const item = await ui.getByRole('img', '原典 PDF 1ページ').boundingBox()
  const amount = await ui.getByRole('img', '原典 PDF 2ページ').boundingBox()
  expect(amount!.x).toBeGreaterThan(item!.x + item!.width)
  expect(amount!.y).toBe(item!.y)
  await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
  await app.screenshot('origin-pdf-spread')
  await ui.getByRole('button', '閉じる').tap()
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(0)
  await openOrigin(ui, '別頁の金額', '金額')
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(2)
})

for (const name of ['枠欠損', '次頁継続'])
  test(`${name}は頁のみ`, async ({ browser }) => {
    const ui = browser.frameLocator('iframe')
    await openOrigin(ui, name)
    await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
    await expect(ui.getByRole('img', '項目の印字枠')).toHaveCount(0)
    await expect(ui.locator('.pdf-guide')).toHaveCount(0)
  })

test('取得失敗は原典 URL と項目・金額の頁番号を残す', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '取得失敗', '項目')
  await expect(ui.getByRole('status')).toContainText(
    '表示できません。項目: 1ページ / 金額: 2ページ',
  )
  await expect(
    ui.getByRole('link', 'https://city.fudoki.dev/missing.pdf'),
  ).toBeVisible()
  await expect(ui.getByRole('img', '原典 PDF 1ページ')).toHaveCount(0)
})

test('頁数が変わったPDFは失敗としてURL・頁番号を残す', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '頁が変わった', '項目')
  await expect(ui.getByRole('status')).toContainText('項目: 3ページ')
  await expect(ui.getByRole('status')).toContainText('原典の頁数')
})

test('CSVは原典リンク・行番号、320/375/414/768pxでも表示領域は収まる', async ({
  browser,
  app,
}) => {
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('button', '項目の原典を表示: CSV原典')).toHaveCount(
    0,
  )
  await ui.getByRole('button', '内訳: CSV原典').tap()
  await expect(ui.getByRole('link', '原典')).toBeVisible()
  await expect(ui.getByText('8行目', { exact: false })).toBeVisible()
  for (const width of [320, 375, 414, 768]) {
    await browser.setViewport({ width, height: 900 })
    await openOrigin(ui, '別頁の金額', '項目')
    await expect(ui.getByRole('img', '原典 PDF 2ページ')).toBeVisible()
    await expect(ui.getByRole('img', '項目の印字枠')).toBeVisible()
    await expect(ui.getByRole('img', '金額の印字枠')).toBeVisible()
    const after = await ui.getByRole('img', '原典 PDF 2ページ').boundingBox()
    expect(after!.width).toBeGreaterThanOrEqual(280)
    await app.screenshot(`origin-pdf-narrow-${width}`)
    const scroll = ui.getByRole(
      'region',
      '原典 PDF のページ（見開き・スクロール可能）',
    )
    if (width < 640) {
    await scroll.swipe({ direction: 'right', momentum: 'none' })
    await expect
      .poll(
        async () =>
          (await ui.getByRole('img', '原典 PDF 2ページ').boundingBox())!.x,
      )
      .toBeLessThan(after!.x)
    }
    expect(
      await browser.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await ui.getByRole('button', '閉じる').tap()
    await openOrigin(ui, '別頁の金額', '金額')
    await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
    const amount = await ui.getByRole('img', '金額の印字枠').boundingBox()
    expect(amount!.x).toBeGreaterThanOrEqual(0)
    expect(amount!.x + amount!.width).toBeLessThanOrEqual(width)
    await app.screenshot(`origin-pdf-narrow-amount-${width}`)
    await ui.getByRole('button', '閉じる').tap()
  }
})

if (process.env.REAL_PDF_QA === '1')
  test('自治体の公開PDFと提供済み明細で日本語・項目金額の枠を表示', async ({
    app,
    browser,
  }) => {
    await app.open('/?real')
    const ui = browser.frameLocator('iframe')
    await openOrigin(ui, '備品購入費', '項目')
    await expect(ui.getByRole('img', '原典 PDF 1ページ')).toBeVisible()
    await expect(ui.getByRole('img', '項目の印字枠')).toBeVisible()
    await expect(ui.getByRole('img', '金額の印字枠')).toBeVisible()
    const frame = await ui.getByRole('img', '項目の印字枠').boundingBox()
    expect(frame!.y).toBeLessThan(700)
    await app.screenshot('real-origin-pdf')
  })

test('取得サイズ上限を超えた場合もURLと頁番号を案内', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, 'サイズ上限', '項目')
  await expect(ui.getByRole('status')).toContainText('32 MiB')
  await expect(ui.getByRole('status')).toContainText('項目: 1ページ')
  await expect(
    ui.getByRole('link', 'https://city.fudoki.dev/big-header.pdf'),
  ).toBeVisible()
})

test('取得頻度の上限を超えた場合もURLと頁番号を案内', async ({
  browser,
  app,
}) => {
  for (let i = 0; i < 6; i++)
    await fetch(new URL(`/v1/origins/extra-${i}/pdf`, app.baseUrl))
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '頻度上限', '項目')
  await expect(ui.getByRole('status')).toContainText('取得頻度の上限')
  await expect(ui.getByRole('status')).toContainText('項目: 1ページ')
  await expect(
    ui.getByRole('link', 'https://city.fudoki.dev/extra-6.pdf'),
  ).toBeVisible()
})

test('回転頁の表示後の左上原点ptに枠を対応させる', async ({ browser, app }) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '回転頁', '項目')
  const canvas = ui.getByRole('img', '原典 PDF 1ページ')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('width', '1600')
  await expect(canvas).toHaveAttribute('height', '1200')
  await expect(ui.getByRole('img', '項目の印字枠')).toHaveAttribute(
    'style',
    /left: 91.25%/,
  )
  await app.screenshot('rotated-origin-pdf')
})

test('金額頁だけ・不正な項目頁は既知の1頁だけを表示し、頁不明はリンクにする', async ({
  browser,
  app,
}) => {
  await app.open('/?ui=pdf-locations')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByRole('button', '項目の原典を表示: 頁不明')).toHaveCount(
    0,
  )
  await openOrigin(ui, '金額頁だけ', '金額')
  await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(2)
  await expect(ui.getByRole('img', '金額の印字枠')).toBeVisible()
  await expect(ui.getByRole('img', '項目の印字枠')).toHaveCount(0)
  await ui.getByRole('button', '閉じる').tap()
  await openOrigin(ui, '不正な項目頁', '金額')
  await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(2)
})

test('頁外の枠は描かない', async ({ browser }) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '頁内に収まらない枠', '項目')
  await expect(ui.locator('.pdf-guide')).toHaveCount(0)
  await expect(ui.getByRole('img', '項目の印字枠')).toHaveCount(0)
})

test('取得中に閉じた後の応答は次のPDFを上書きしない', async ({
  app,
  browser,
}) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '取得待ち', '項目')
  await expect(ui.getByRole('status')).toContainText('PDF を取得中')
  await expect
    .poll(
      async () =>
        (await (await fetch(new URL('/__stats', app.baseUrl))).json())[
          '/pending.pdf'
        ],
    )
    .toBe(1)
  await ui.getByRole('button', '閉じる').tap()
  await expect(
    ui.getByRole('button', '項目の原典を表示: 取得待ち'),
  ).toBeFocused()
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(0)
  await fetch(new URL('/__release-pdf', app.baseUrl), { method: 'POST' })
  await openOrigin(ui, '枠あり', '項目')
  await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
  await expect(ui.getByRole('heading', '試験原典 ok')).toBeVisible()
  await expect(ui.getByRole('heading', '試験原典 pending')).toHaveCount(0)
})

test('極端な縦横比のPDFでもcanvasの容量・寸法上限を守る', async ({
  browser,
}) => {
  const ui = browser.frameLocator('iframe')
  await openOrigin(ui, '極端な用紙寸法', '項目')
  await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
  const canvas = ui.getByRole('img', '原典 PDF 1ページ')
  const width = Number(await canvas.getAttribute('width'))
  const height = Number(await canvas.getAttribute('height'))
  expect(width * height).toBeLessThanOrEqual(4_000_000)
  expect(Math.max(width, height)).toBeLessThanOrEqual(8192)
  expect(Math.min(width, height)).toBeGreaterThanOrEqual(1)
})
