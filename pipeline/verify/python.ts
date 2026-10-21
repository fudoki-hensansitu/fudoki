import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO } from '../runtime_paths'

// uv の workspace は requires-python を全 member の積で決める。root が 3.13 を宣言して
// いる状態で member 側だけを緩めても workspace の範囲は変わらず、`uv lock --check` も
// 通ってしまう（黙って効かなくなる）。Dependabot は root の値を読むので、root と member
// の値を同じに保つことをここで検査する。
const paths = ['pyproject.toml', 'pipeline/pyproject.toml']
const declared = await Promise.all(
  paths.map(async (path) => {
    const text = await readFile(join(REPO, path), 'utf8')
    const table = Bun.TOML.parse(text) as Record<string, unknown>
    const project = table.project
    const range =
      project && typeof project === 'object'
        ? (project as Record<string, unknown>)['requires-python']
        : undefined
    if (typeof range !== 'string')
      throw new Error(`${path}: project.requires-python is missing`)
    return { path, range }
  })
)
const [root] = declared
if (!root) throw new Error('no pyproject.toml to check')
for (const other of declared.slice(1)) {
  if (other.range !== root.range)
    throw new Error(
      `project.requires-python differs: ${root.path} is ${root.range}, ${other.path} is ${other.range}`
    )
}
console.log(JSON.stringify({ requiresPythonMatches: true, range: root.range }))
