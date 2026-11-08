declare module '*.svg?raw' {
  const content: string
  export default content
}

// Workers の runtime が持つ module。使う部分だけの型（@cloudflare/workers-types は入れていない）
declare module 'cloudflare:workers' {
  export abstract class WorkerEntrypoint<Env = unknown> {
    protected readonly ctx: unknown
    protected readonly env: Env
    constructor(ctx: unknown, env: Env)
  }
}
