import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { version } from './package.json'

/** The Capacitor (Android) build: one plain Vite page, same source tree as the Electron renderer. */
export default defineConfig({
  root: resolve(__dirname, 'src/mobile'),
  base: './',
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared'), '@renderer': resolve(__dirname, 'src/renderer') } },
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: resolve(__dirname, 'out/mobile'), emptyOutDir: true },
  server: { port: 5174 }
})
