import { Glob } from 'bun'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO } from '../runtime_paths'

// uv の workspace は requires-python を全 member の積で決める。root が 3.13 を宣言して
// いる状態で member 側だけを緩めても workspace の範囲は変わらず、`uv lock --check` も
// 通ってしまう（黙って効かなくなる）。Dependabot は root の値を読むので、root と全 member
// の値を同じに保つことをここで検査する。対象は [tool.uv.workspace].members から取る。
type Table = Record<string, unknown>

const asTable = (value: unknown): Table | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Table)
    : undefined

const readToml = async (path: string): Promise<Table> =>
  asTable(Bun.TOML.parse(await readFile(join(REPO, path), 'utf8'))) ?? {}

const requiresPython = (path: string, parsed: Table): string => {
  const range = asTable(parsed.project)?.['requires-python']
  if (typeof range !== 'string')
    throw new Error(`${path}: project.requires-python is missing`)
  return range
}

const root = await readToml('pyproject.toml')
const members = asTable(asTable(asTable(root.tool)?.uv)?.workspace)?.members
if (!Array.isArray(members) || members.length === 0)
  throw new Error('pyproject.toml: [tool.uv.workspace].members is missing')

const manifests = ['pyproject.toml']
for (const member of members) {
  if (typeof member !== 'string')
    throw new Error(`pyproject.toml: workspace member is not a string: ${member}`)
  const pattern = join(member, 'pyproject.toml')
  if (!/[*?[{]/.test(member)) {
    manifests.push(pattern)
    continue
  }
  for await (const path of new Glob(pattern).scan(REPO)) manifests.push(path)
}

const rootRange = requiresPython('pyproject.toml', root)
const checked: string[] = []
for (const path of manifests.slice(1)) {
  const range = requiresPython(path, await readToml(path))
  if (range !== rootRange)
    throw new Error(
      `project.requires-python differs: pyproject.toml is ${rootRange}, ${path} is ${range}`
    )
  checked.push(path)
}
console.log(
  JSON.stringify({
    requiresPythonMatches: true,
    range: rootRange,
    manifests: checked,
  })
)
