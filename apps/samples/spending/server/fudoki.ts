// 風土記の本体（fudoki.dev の Worker `fudoki`）を呼ぶ口。本番と preview は Service Binding（void.config.ts の FUDOKI）で Worker どうしで呼び、
// binding の無い手元の開発だけ公開の fudoki.dev に繋ぐ。このサイトはデータ（D1・KV）を持たず、読むだけにする
import type { Snapshot } from '../lib/fudoki'

export interface Fetcher {
  fetch(request: Request): Promise<Response>
}
export interface Env {
  /** 風土記の本体の Worker（Service Binding）。無ければ公開の fudoki.dev に繋ぐ */
  FUDOKI?: Fetcher
}

const ORIGIN = 'https://fudoki.dev'

/** 中継してよい path。自治体の検索・1年度のデータ（/api/jurisdictions*）と、紋章・レシートの OG 画像（/jurisdictions/<code>/*）、全頁共通の OG 画像（/og.png）・favicon */
export const relayed = (path: string) => path === '/api/jurisdictions' || /^\/api\/jurisdictions\/\d{6}$/.test(path) || /^\/jurisdictions\/\d{6}\/(emblem\.svg|receipt\.png)$/.test(path) || path === '/og.png' || path === '/favicon.svg'

/** fudoki.dev へ GET で聞く（target は path と query）。利用者の IP（本体の流量の制限が使う）などの header はそのまま渡し、cookie は渡さない */
export function fudokiFetch(env: Env, from: Headers, target: string): Promise<Response> {
  const headers = new Headers(from)
  headers.delete('cookie')
  headers.delete('host')
  const req = new Request(`${ORIGIN}${target}`, { method: 'GET', headers })
  // 手元の開発（vite dev）では binding の先の Worker が手元に無いので、公開の fudoki.dev に繋ぐ
  return env.FUDOKI && !import.meta.env.DEV ? env.FUDOKI.fetch(req) : fetch(req)
}

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
