// The code/name definitions remain owned by packages/fiscal/cofog-master.ts (ADR 0016).
import { COFOG_NAMES } from '../../../packages/fiscal/cofog-master'

const names = Object.assign({}, ...Object.values(COFOG_NAMES)) as Record<string, string>
const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
const rows = Object.entries(names).sort(([a], [b]) => a.localeCompare(b))
await Bun.write(new URL('../seeds/fiscal/cofog_master.csv', import.meta.url),
  'cofog_code,name\n' + rows.map(([code, name]) => `${cell(code)},${cell(name)}\n`).join(''))
