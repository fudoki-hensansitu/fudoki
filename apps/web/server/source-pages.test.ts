import { expect, test } from 'bun:test'
import { sourcePageTool, type SourcePagesRpc } from './source-pages'

const SECRET = '事業の目的と実績の本文'
const rpc: SourcePagesRpc = {
  readPage: async () => ({ status: 'ok', origin_sha256: 'a'.repeat(64), title: '評価シート', url: 'https://city.example.jp/a.pdf', page: 3, page_count: 9, text: SECRET, truncated: false }),
}

test('頁の文字は AI に渡す形にだけ入り、画面と会話の保存に流れる結果には入らない', async () => {
  const tool = sourcePageTool(rpc)
  const output = await tool.execute!({ origin: 'o1', page: 3 }, { toolCallId: 'c1', messages: [] } as never)
  expect(JSON.stringify(output)).not.toContain(SECRET)
  expect(JSON.stringify(output)).toContain('https://city.example.jp/a.pdf')
  const forModel = await tool.toModelOutput!({ toolCallId: 'c1', input: {}, output })
  expect(JSON.stringify(forModel)).toContain(SECRET)
})
