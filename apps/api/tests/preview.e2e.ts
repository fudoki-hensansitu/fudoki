import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { openOrigin } from './origin-helper'
import { utimes } from 'node:fs/promises'

if (process.env.UI_PREVIEW_QA === '1') {
  test('開発プレビューで各パターン・テーマ・幅・PDFを操作できる', async ({
    app,
    browser,
    screen,
  }) => {
    await app.open('/preview?ui=jurisdictions')
    const ui = browser.frameLocator('iframe')
    await expect(ui.getByRole('row', /^試験市 /)).toBeVisible()
    await screen
      .getByRole('combobox', 'プレビューのテーマ')
      .selectOption({ value: 'claude-dark' })
    await screen
      .getByRole('combobox', 'iframeの幅')
      .selectOption({ value: '320' })
    await expect(browser).toHaveURL(/theme=claude-dark&width=320/)
    expect((await browser.locator('iframe').boundingBox())!.width).toBe(320)
    const patterns = [
      ['一団体の収録範囲', '2024年度 決算'],
      ['歳出の検索結果', '12,345円'],
      ['明細・軸ごとの内訳', '節'],
      ['末端の明細', '内訳はありません'],
      ['検索0件', '該当する歳出明細はありません'],
      ['団体0件', '団体はありません'],
      ['読み込み中', '読み込み中…'],
      ['初回取得の失敗', '試験の初回取得失敗'],
    ]
    for (const [name, text] of patterns) {
      await screen.getByRole('link', name!, { exact: true }).tap()
      await expect(ui.getByText(text!, { exact: true })).toBeVisible()
      await expect(
        screen.getByRole('combobox', 'プレビューのテーマ'),
      ).toHaveValue('claude-dark')
    }
    await screen.getByRole('link', 'PDF・原典の各ケース').tap()
    await openOrigin(ui, '別頁の金額')
    await expect(ui.getByRole('status')).toContainText('1・2 / 2ページ')
    await expect(ui.locator('.pdf-guide')).toHaveCount(4)
    await expect(ui.getByRole('img', /^原典 PDF/)).toHaveCount(2)
    await ui.getByRole('button', '閉じる').tap()
    await screen
      .getByRole('combobox', 'iframeの幅')
      .selectOption({ value: 'full' })
    await app.screenshot('interactive-preview')
  })

  test('プレビューの待機・別結果・再試行・リセットを操作できる', async ({
    app,
    browser,
    screen,
  }) => {
    await app.open('/preview?ui=retry')
    const ui = browser.frameLocator('iframe')
    await ui.getByRole('button', 'さらに表示').tap()
    await expect(ui.getByRole('alert')).toContainText('試験の取得失敗')
    await ui.getByRole('button', 'さらに表示').tap()
    await expect(ui.getByRole('button', '内訳: 追加された明細')).toBeVisible()
    await screen.getByRole('button', '最初から').tap()
    await expect(ui.getByRole('button', 'さらに表示')).toBeVisible()
    await screen.getByRole('link', '遅い応答').tap()
    await ui.getByRole('button', '内訳: 総務管理').tap()
    await expect(ui.getByRole('status')).toContainText('読み込み中')
    await screen.getByRole('button', '別の結果へ切替').tap()
    await expect(ui.getByText('該当する歳出明細はありません')).toBeVisible()
    await screen.getByRole('button', '待機中の応答を返す').tap()
    await expect(ui.getByRole('columnheader', '節', { exact: true })).not.toBeVisible()
    await screen.getByRole('button', '最初から').tap()
    await ui.getByRole('button', '内訳: 総務管理').tap()
    await screen.getByRole('button', '待機中の応答を返す').tap()
    await expect(ui.getByRole('columnheader', '節', { exact: true })).toBeVisible()
  })
  test('共有部品の保存で同じパターンを再生成する', async ({ app, browser }) => {
    await app.open('/preview?ui=search&theme=chatgpt-dark&width=375')
    const ui = browser.frameLocator('iframe')
    await ui.getByRole('button', 'さらに表示').tap()
    await expect(ui.getByRole('button', '内訳: 追加された明細')).toBeVisible()
    const now = new Date()
    await utimes(
      new URL(
        '../../../packages/ui/src/components/button.tsx',
        import.meta.url,
      ),
      now,
      now,
    )
    await expect(ui.getByRole('button', 'さらに表示')).toBeVisible({
      timeout: 10_000,
    })
    await expect(ui.getByRole('button', '内訳: 追加された明細')).toHaveCount(0)
    await expect(browser).toHaveURL(/theme=chatgpt-dark&width=375/)
  })
}
