import type { SonoraApi } from './index'

declare global {
  interface Window {
    sonora: SonoraApi
  }
}

export {}
