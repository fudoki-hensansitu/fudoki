import type { FrameScreen } from '@e2e-dev/web'

/** 検索結果から明細を開いて原典を確認する。閉じた後は明細のリンクを再利用する。 */
export async function openOrigin(ui: FrameScreen, name: string, prefix = '項目') {
  const origin = ui.getByRole('button', `${prefix}の原典を表示: ${name}`)
  if (await origin.count() === 0) {
    const back = ui.getByRole('button', '戻る')
    if (await back.count() > 0) await back.tap()
    await ui.getByRole('button', `内訳: ${name}`, { exact: true }).tap()
  }
  await origin.tap()
}
