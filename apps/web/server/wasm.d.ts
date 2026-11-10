// Cloudflare の Vite plugin は .wasm の import を WebAssembly.Module として渡す（server/og-render.ts）
declare module '*.wasm' {
  const module: WebAssembly.Module
  export default module
}
