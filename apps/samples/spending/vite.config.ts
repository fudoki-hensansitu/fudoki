import tailwindcss from '@tailwindcss/vite'
import { voidReact } from '@void/react/plugin'
import { voidPlugin } from 'void'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [voidPlugin(), voidReact(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
})
