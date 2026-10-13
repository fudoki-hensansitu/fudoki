// 文書は Blume が書き出した静的ファイル（assets）。assets に無いパスだけがここに来る。
export default {
  fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) {
    return env.ASSETS.fetch(request)
  },
}
