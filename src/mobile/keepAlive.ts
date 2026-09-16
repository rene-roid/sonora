import { registerPlugin } from '@capacitor/core'

/**
 * Foreground service that keeps the WebView's process alive while audio plays. Implemented in
 * android/app/src/main/java/dev/sonora/app/KeepAlivePlugin.kt; the lockscreen controls themselves
 * come from navigator.mediaSession, not from here.
 */
interface KeepAlivePlugin {
  start(): Promise<void>
  stop(): Promise<void>
}

const plugin = registerPlugin<KeepAlivePlugin>('KeepAlive')

/** Best effort: in a plain browser (mobile:dev) the native side does not exist. */
export const keepAlive = {
  start: (): void => void plugin.start().catch(() => undefined),
  stop: (): void => void plugin.stop().catch(() => undefined)
}
