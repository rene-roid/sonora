import { webDarkTheme } from '@fluentui/tokens'

/**
 * Publish the Fluent 2 dark theme tokens as CSS custom properties (--colorNeutralBackground1 etc.)
 * so both Tailwind arbitrary values and plain CSS can consume them.
 */
export function applyFluentTheme(root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(webDarkTheme)) {
    root.style.setProperty(`--${key}`, String(value))
  }
  root.classList.add('dark')
}
