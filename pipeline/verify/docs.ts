import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO } from '../runtime_paths'

// ADR は並行する PR が同じ次の番号を取り合う。番号の重複はファイル名の検査で防ぐ。
// H1 に番号を書かない ADR（0009）があるため、タイトルの番号はあるときだけ照合する。
const directory = join(REPO, 'docs/adr')
const numbers = new Map<string, string>()
let checked = 0
for (const name of (await readdir(directory)).sort()) {
  if (!name.endsWith('.md')) continue
  const match = /^(\d{4})-[a-z0-9-]+\.md$/.exec(name)
  if (!match) throw new Error(`ADR filename is not NNNN-slug.md: ${name}`)
  const number = match[1]!
  checked += 1
  const previous = numbers.get(number)
  if (previous)
    throw new Error(`Duplicate ADR number ${number}: ${previous} and ${name}`)
  numbers.set(number, name)
  const title = (await readFile(join(directory, name), 'utf8')).match(
    /^# ADR (\d{4}):/m
  )
  if (title && title[1] !== number)
    throw new Error(`ADR title number ${title[1]} does not match filename ${name}`)
}
console.log(JSON.stringify({ adrNumbersUnique: true, adrs: checked }))
