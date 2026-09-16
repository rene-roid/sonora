import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.sonora.app',
  appName: 'Sonora',
  webDir: 'out/mobile',
  server: {
    // A plain-http LAN Navidrome is mixed content from an https:// origin, so the page is served as http://localhost.
    androidScheme: 'http',
    cleartext: true
  }
}

export default config
