import * as React from 'react'

/** ブラウザに置いた風土記の保存（fudoki: で始まる鍵。住んでいるまち・最近見たまち・チェックリスト）を全部消し、ホームを読み直す */
export default function Reset() {
  React.useEffect(() => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('fudoki:')) localStorage.removeItem(k)
    } catch {
      // 消せなくてもホームへは戻す
    }
    window.location.replace('/')
  }, [])
  return <main className="px-4 pt-10 text-sm text-muted-foreground">リセットしています…</main>
}
