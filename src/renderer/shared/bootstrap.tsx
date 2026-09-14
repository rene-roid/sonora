import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { applyFluentTheme } from './theme'
import { initPlayerBridge } from './playerStore'
import { initSessionBridge } from './sessionStore'

/** Common boot sequence for every renderer window. */
export function bootstrap(node: ReactNode): void {
  applyFluentTheme()
  initPlayerBridge()
  initSessionBridge()
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>)
}
