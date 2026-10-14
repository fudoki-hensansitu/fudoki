import { test, beforeEach } from '@e2e-dev/web'
import { expect } from 'e2e'

beforeEach(async ({ app }) => {
  await fetch(new URL('/__reset', app.baseUrl), { method: 'POST' })
})

test('団体の年度と種類・絞込み・追加取得', async ({
  app,
  browser,
}) => {
  await app.open('/?ui=jurisdictions')
  const ui = browser.frameLocator('iframe')
  const row = ui.getByRole('row', /^試験市 /)
  await expect(row).toBeVisible()
  await expect(ui.getByText('収録なし', { exact: true })).toBeVisible()
  await expect(ui.getByRole('link', '試験原典 ok')).toHaveCount(0)
  await expect(row).not.toHaveAttribute('aria-expanded')
  await expect(row).toContainText('2024年度 決算')
  await expect(row).not.toContainText('一般会計')
  await app.screenshot('jurisdictions')
  await ui.getByRole('searchbox', '団体名・団体コードで絞る').fill('不存在')
  await expect(ui.getByText('絞り込みに一致する団体はありません')).toBeVisible()
  await ui
    .getByRole('searchbox', '団体名・団体コードで絞る')
    .fill('０００００３')
  await ui.getByRole('button', 'さらに表示').tap()
  await expect(ui.getByRole('row', /^追加市 /)).toBeVisible()
  await expect(ui.getByRole('status')).toHaveText('1団体')
  await ui.getByRole('searchbox', '団体名・団体コードで絞る').clear()
  await expect(ui.getByRole('row', /^試験市 /)).toContainText('2024年度 決算')
  await expect(ui.getByRole('button', 'さらに表示')).toHaveCount(0)
  const calls = (await browser.evaluate('() => window.uiQA.calls()')) as {
    name: string
    arguments: Record<string, unknown>
  }[]
  expect(
    calls.map(({ name, arguments: input }) => ({ name, arguments: input })),
  ).toEqual([
    {
      name: 'list_jurisdictions',
      arguments: {
        page_size: 1,
        page_token: 'jurisdictions-next',
      },
    },
  ])
})

test('一団体の収録範囲も操作なしで表示する', async ({ app, browser }) => {
  await app.open('/?ui=single')
  await expect(
    browser.frameLocator('iframe').getByText('2024年度 決算', { exact: true }),
  ).toBeVisible()
})

test('検索表の追加・軸ごとの内訳・末端・戻る履歴と追加済み行', async ({
  app,
  browser,
}) => {
  await app.open('/?ui=search')
  const ui = browser.frameLocator('iframe')
  await expect(ui.getByText('12,345円', { exact: true })).toBeVisible()
  await app.screenshot('expenditure-search')
  await ui.getByRole('button', 'さらに表示').tap()
  await expect(ui.getByRole('button', '内訳: 追加された明細')).toBeVisible()
  await ui.getByRole('button', '内訳: 総務管理', { exact: true }).tap()
  await expect(ui.getByRole('columnheader', '節', { exact: true })).toBeVisible()
  await expect(ui.getByRole('columnheader', '事業', { exact: true })).toBeVisible()
  await expect(ui.getByRole('cell', '—', { exact: true })).toBeVisible()
  await ui.getByRole('button', 'さらに表示').tap()
  await expect(ui.getByRole('button', '内訳: 備品購入費')).toBeVisible()
  await app.screenshot('expenditure-detail-axes')
  await ui.getByRole('button', '内訳: 委託料').tap()
  await expect(ui.getByText('内訳はありません', { exact: true })).toBeVisible()
  await app.screenshot('expenditure-leaf')
  await ui.getByRole('button', '← 戻る').tap()
  await expect(ui.getByRole('button', '内訳: 備品購入費')).toBeVisible()
  await ui.getByRole('button', '← 戻る').tap()
  await expect(ui.getByRole('button', '内訳: 追加された明細')).toBeVisible()
  await expect(ui.getByRole('button', '← 戻る')).toHaveCount(0)
  const calls = (await browser.evaluate('() => window.uiQA.calls()')) as {
    name: string
    arguments: Record<string, unknown>
  }[]
  expect(calls).toHaveLength(4)
  expect(calls[0]!.arguments.page_size).toBe(1)
  expect(calls[2]!.arguments).toEqual({
    document_kind: 'settlement',
    node_id: 'ui-parent',
    page_token: 'detail-next',
  })
})

for (const [scenario, text] of [
  ['empty', '該当する歳出明細はありません'],
  ['empty-jurisdictions', '団体はありません'],
  ['error', '試験の初回取得失敗'],
  ['loading', '読み込み中…'],
])
  test(`${scenario}の状態を表示`, async ({ app, browser }) => {
    await app.open(`/?ui=${scenario}`)
    await expect(
      browser
        .frameLocator('iframe')
        .getByText(text!, { exact: scenario !== 'error' }),
    ).toBeVisible()
    await app.screenshot(`state-${scenario}`)
  })

test('追加取得失敗は既存結果を保持し再試行できる', async ({ app, browser }) => {
  await app.open('/?ui=retry')
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', 'さらに表示').tap()
  await expect(ui.getByRole('alert')).toContainText('試験の取得失敗')
  await expect(ui.getByRole('button', '内訳: 総務管理')).toBeVisible()
  await expect(ui.getByRole('button', 'さらに表示')).toBeEnabled()
  await app.screenshot('state-append-error')
  await ui.getByRole('button', 'さらに表示').tap()
  await expect(ui.getByRole('button', '内訳: 追加された明細')).toBeVisible()
  await expect(ui.getByRole('alert')).toHaveCount(0)
  expect(await browser.evaluate('() => window.uiQA.calls().length')).toBe(2)
})

test('取得中は操作を無効化し、遅いtool応答は新しいhost結果を上書きしない', async ({
  app,
  browser,
}) => {
  await app.open('/?ui=race')
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '内訳: 総務管理').tap()
  await expect(ui.getByRole('button', '内訳: 総務管理')).toBeDisabled()
  await expect(ui.getByRole('status')).toContainText('読み込み中')
  expect(await browser.evaluate('() => window.uiQA.calls().length')).toBe(1)
  await browser.evaluate('() => window.uiQA.send("empty")')
  await expect(ui.getByText('該当する歳出明細はありません')).toBeVisible()
  await browser.evaluate('() => window.uiQA.release()')
  await expect(ui.getByRole('columnheader', '節', { exact: true })).not.toBeVisible()
  expect(await browser.evaluate('() => window.uiQA.calls().length')).toBe(1)
})

test('hostのテーマ・変数・フォントを更新し、PDF紙面と枠を保持する', async ({
  app,
  browser,
}) => {
  await app.open('/?ui=detail')
  const ui = browser.frameLocator('iframe')
  await ui.getByRole('button', '項目の原典を表示: 総務管理').tap()
  await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
  for (const host of ['chatgpt', 'claude'])
    for (const theme of ['light', 'dark']) {
      await browser.evaluate(`() => window.uiQA.theme('${theme}', '${host}')`)
      await expect(ui.getByRole('img', '項目の印字枠')).toBeVisible()
      await expect(ui.getByRole('img', '金額の印字枠')).toBeVisible()
      await expect(ui.getByRole('button', '次の頁')).toBeVisible()
      await app.screenshot(`theme-${host}-${theme}`)
    }
  await ui.getByRole('button', '閉じる').tap()
  await expect(
    ui.getByRole('button', '項目の原典を表示: 総務管理'),
  ).toBeFocused()
  await ui.getByRole('button', '項目の原典を表示: 総務管理').tap()
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(2)
  await browser.evaluate('() => window.uiQA.teardown()')
  await expect(ui.getByRole('main')).toHaveCount(0)
  await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(0)
})
