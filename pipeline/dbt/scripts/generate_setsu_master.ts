// The code/name/period definitions remain owned by packages/fiscal/setsu-master.ts.
// The generated CSV is what dbt reads; regenerate after changing the master.
import { expenditureSetsuMaster } from '../../../packages/fiscal/setsu-master'

const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
const num = (value: number | null) => (value === null ? '' : String(value))
const rows = expenditureSetsuMaster()
await Bun.write(new URL('../seeds/fiscal/setsu_master.csv', import.meta.url),
  'expenditure_setsu_id,code,label,valid_from_fiscal_year,valid_to_fiscal_year,legal_basis\n' +
  rows.map((row) => [row.expenditure_setsu_id, row.code, row.label, num(row.valid_from_fiscal_year), num(row.valid_to_fiscal_year), row.legal_basis].map(cell).join(',') + '\n').join(''))
