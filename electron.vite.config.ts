import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const shared = resolve(__dirname, 'src/shared')
const renderer = resolve(__dirname, 'src/renderer')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    root: renderer,
    resolve: { alias: { '@shared': shared, '@renderer': renderer } },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(renderer, 'main/index.html'),
          host: resolve(renderer, 'host/index.html'),
          toast: resolve(renderer, 'toast/index.html'),
          mini: resolve(renderer, 'mini/index.html'),
          widget: resolve(renderer, 'widget/index.html')
        }
      }
    }
  }
})
