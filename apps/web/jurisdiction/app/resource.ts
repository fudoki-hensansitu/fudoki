// React の use() で読むデータの置き場。頁ごとに1つ作り、サーバーが props で渡した分は読み終えた状態で入れておく（サーバーでもそのまま描ける）。
// 読む時は use(res.get(key, load)) を ClientSuspense の中で呼び、切り替えは startTransition で包んで、読み終えるまで前の画面を出したままにする。useEffect で取りに行かない
import * as React from 'react'

type Thenable<T> = Promise<T> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: T; reason?: unknown }

/** 読めなかったときの値。use() から投げずに、画面が「読み込めませんでした」を出す */
export const FAILED = Symbol('failed')
export type Loaded<T> = T | typeof FAILED

function settled<T>(value: T): Thenable<T> {
  const p = Promise.resolve(value) as Thenable<T>
  p.status = 'fulfilled'
  p.value = value
  return p
}

export class Resources {
  private map = new Map<string, Thenable<unknown>>()

  constructor(seed: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(seed)) this.map.set(k, settled(v))
  }

  /** 読み終えた値を置く（サーバーが渡した分・続きの頁を足した一覧） */
  set<T>(key: string, value: T) {
    this.map.set(key, settled(value))
  }

  /** 読み終えていれば値、まだなら undefined（描画の外で読む） */
  peek<T>(key: string): T | undefined {
    const p = this.map.get(key) as Thenable<T> | undefined
    return p?.status === 'fulfilled' ? p.value : undefined
  }

  /** key の値を読む promise。まだ無ければ load で読む。サーバーが渡さない値を読む部品は ClientSuspense の中に置く（サーバーでは描かない） */
  get<T>(key: string, load: () => Promise<T>): Promise<Loaded<T>> {
    const hit = this.map.get(key) as Thenable<Loaded<T>> | undefined
    if (hit) return hit
    const p = load().then(
      (v) => Object.assign(p, { status: 'fulfilled', value: v }).value as Loaded<T>,
      () => {
        // 次に開いたときに読み直せるよう置き場から外す
        this.map.delete(key)
        return Object.assign(p, { status: 'fulfilled', value: FAILED }).value as Loaded<T>
      },
    ) as Thenable<Loaded<T>>
    this.map.set(key, p)
    return p
  }
}

const noop = () => () => {}
/** ブラウザで描き終えた後なら true。サーバーの描画と hydration のあいだは false */
export const useHydrated = () => React.useSyncExternalStore(noop, () => true, () => false)

/** サーバーが渡さない値を読む部品の Suspense。サーバーの描画と hydration のあいだは fallback だけを描き、
 * ブラウザで描き終えてから中身を描いて読みに行く（サーバーで読みに行くと、応答の stream が読み終えるまで閉じない） */
export function ClientSuspense({ fallback, ready, children }: { fallback: React.ReactNode; /** サーバーが渡した値だけで描けるなら true（サーバーでも描く） */ ready?: boolean; children: React.ReactNode }) {
  const hydrated = useHydrated()
  return hydrated || ready ? React.createElement(React.Suspense, { fallback }, children) : fallback
}
