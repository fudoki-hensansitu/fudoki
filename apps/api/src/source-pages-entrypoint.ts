// web の Worker だけが Service Binding（entrypoint: SourcePages）で呼ぶ内部の RPC。HTTP の route を持たないので、インターネットからは呼べない。
// bun の試験は cloudflare:workers を読めないので、処理は source-pages.ts に置く
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Env } from './db'
import { readSourcePage, type SourcePageResult } from './source-pages'

export class SourcePages extends WorkerEntrypoint<Env> {
  /** 出典の1頁の文字。入力は { origin: sha256 か origin_id, page: 物理頁 } */
  async readPage(input: unknown): Promise<SourcePageResult> {
    return readSourcePage(this.env.DB, input)
  }
}
