import { createApp } from '../src/app'
import { OriginPdfRelay as Relay, type RelayNamespace } from '../src/origin-pdf'

// 時間を進める操作・storage削除は試験用Workerにだけ存在する。
export class OriginPdfRelay extends Relay {
  constructor(private readonly testState: ConstructorParameters<typeof Relay>[0]) { super(testState) }
  async fetch(request: Request) {
    const path = new URL(request.url).pathname
    if (path === '/reset') {
      await (this.testState.storage as unknown as { deleteAll(): Promise<void> }).deleteAll()
      Date.now = realNow
      return new Response('reset')
    }
    if (path === '/advance') {
      const offset = Number(await request.text())
      Date.now = () => realNow() + offset
      return new Response('advanced')
    }
    return super.fetch(request)
  }
}
const realNow = Date.now
const app = createApp()
export default {
  async fetch(request: Request, env: { ORIGIN_PDF: RelayNamespace }) {
    const path = new URL(request.url).pathname
    if (path === '/__reset' || path === '/__advance') return env.ORIGIN_PDF.get(env.ORIGIN_PDF.idFromName('origin-pdf-v1')).fetch(new Request(`https://relay.internal/${path.slice(3)}`, { method: 'POST', body: await request.text() }))
    return app.fetch(request, env as never)
  },
}
