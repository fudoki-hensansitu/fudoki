// サンプルが風土記の本体（fudoki.dev の Worker `fudoki`）を呼ぶ口。本番と preview は Service Binding（void.config.ts の FUDOKI）で Worker どうしで呼び、
// binding の無い手元の開発だけ公開の fudoki.dev に繋ぐ。サンプルはデータ（D1・KV）を持たず、読むだけにする
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
