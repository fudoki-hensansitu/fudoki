// 試作: 追っている事業。ブラウザ（localStorage）にだけ置き、変えたら window に知らせる
import * as React from 'react'

const KEY = 'fudoki:proto-saved-projects'
const EVENT = 'fudoki:proto-saved-projects'

export type Saved = { projectId: string; code: string; town: string; name: string }

function read(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Saved[]
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function write(list: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // 保存できなくても、その場の表示は変える
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useSaved() {
  const [list, setList] = React.useState<Saved[]>([])
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    const sync = () => {
      setList(read())
      setReady(true)
    }
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  const has = (id: string) => list.some((s) => s.projectId === id)
  const toggle = (s: Saved) => write(has(s.projectId) ? read().filter((x) => x.projectId !== s.projectId) : [s, ...read()])
  return { ready, list, has, toggle }
}
