import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO } from '../runtime_paths'

// CSV の歳出は、目の下の事業（事項・細目）を見出し「科目」として入れる（int_fiscal__csv_expenditure_nodes）。
// その見出しの分け方（事業）は seed fiscal_detail_breakdown に宣言が要る。宣言が無いと dbt の検査で
// 本番同期が止まるので、PR の段階で CSV の歳出の管理 JSON ごとに宣言があるかを確かめる。
const jurisdictions = join(REPO, 'pipeline/ingestion/fiscal/jurisdictions')
const seed = await readFile(join(REPO, 'pipeline/dbt/seeds/fiscal/fiscal_detail_breakdown.csv'), 'utf8')
const declared = new Set(
  seed
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => line.split(',').slice(0, 4).join(','))
)

const { readdir } = await import('node:fs/promises')
let checked = 0
const missing: string[] = []
for (const code of await readdir(jurisdictions)) {
  if (!/^\d{6}$/.test(code)) continue
  for (const year of await readdir(join(jurisdictions, code))) {
    if (!/^\d{4}$/.test(year)) continue
    for (const kind of ['initial', 'settlement']) {
      const path = join(jurisdictions, code, year, kind, 'expenditure.json')
      let manifest: { conversions?: { converter?: string }[] }
      try {
        manifest = JSON.parse(await readFile(path, 'utf8'))
      } catch {
        continue
      }
      if (!manifest.conversions?.some((c) => c.converter === 'fiscal/layouts/csv/convert.py')) continue
      checked += 1
      const key = [code, year, kind, '科目'].join(',')
      if (!declared.has(key)) missing.push(key)
    }
  }
}
if (missing.length)
  throw new Error(
    `CSV の歳出に科目（事業）の宣言が無い: ${missing.join(' / ')}。seed fiscal_detail_breakdown に 見出し「科目」・分け方「事業」を足す`
  )
console.log(JSON.stringify({ csvBreakdownDeclared: true, csvExpenditures: checked }))
