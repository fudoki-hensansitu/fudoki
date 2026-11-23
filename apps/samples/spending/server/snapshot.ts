// spending の頁の loader が本体から読む、自治体の1年度のデータ
import { fudokiFetch, type Env } from '../../server/fudoki'
import type { Snapshot } from '../lib/fudoki'

/** 自治体の1年度のデータ。年度が無ければ最新。収録の無い自治体・頁に無い年度は null */
export async function loadSnapshot(env: Env, from: Headers, code: string, year?: number): Promise<Snapshot | null> {
  const r = await fudokiFetch(env, from, `/api/jurisdictions/${code}${year === undefined ? '' : `?year=${year}`}`)
  if (r.status === 404 || r.status === 400) return null
  if (!r.ok) throw new Error(`風土記に繋がりませんでした（${r.status}）`)
  return pickSnapshot((await r.json()) as Snapshot)
}

/** 本体の応答から、レシートと年度の切り替えが読む項目だけを残す（頁の props に載せる量を減らす）。開いた年度の款・項・目は、分野の行を目まで開くのに使う */
export function pickSnapshot(d: Snapshot): Snapshot {
  const y = d.years[String(d.year)]
  const moku = (m: Snapshot['years'][string]['looseMoku'][number]) => ({ id: m.id, name: m.name, yen: m.yen, field: m.field })
  return {
    code: d.code,
    name: d.name,
    pop: d.pop,
    year: d.year,
    kinds: d.kinds,
    years: y
      ? {
          [d.year]: {
            kind: y.kind,
            total: y.total,
            fields: y.fields,
            kan: y.kan.map((k) => ({ name: k.name, yen: k.yen, kou: k.kou.map((o) => ({ name: o.name, yen: o.yen, moku: o.moku.map(moku) })) })),
            looseMoku: y.looseMoku.map(moku),
          },
        }
      : {},
  }
}
