import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'

// 無限ループを構造で避ける: 本番コードに条件だけで回るループを書かない。
// 残るループは配列の for...of と、長さで回数が決まる for だけ。生成物（bundle した外部のコード）は対象外。
test('api/src の本番コードに while・do・for (;...) が無い', () => {
  const dir = new URL('.', import.meta.url).pathname
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts') && f !== 'testing.ts')
  expect(files).toContain('search.ts')
  for (const f of files) {
    const code = readFileSync(dir + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code, f).not.toMatch(/\bwhile\s*\(/)
    expect(code, f).not.toMatch(/\bdo\s*\{/)
    expect(code, f).not.toMatch(/\bfor\s*\(\s*;/)
  }
})
