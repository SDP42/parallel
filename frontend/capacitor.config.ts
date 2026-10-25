import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell for Parallel (Android + iOS) around the same React build.
 * Build: npm run build && npx cap sync, then open android/ in Android Studio (or ios/ in Xcode).
 * The app talks to the API at VITE_API_URL (set it to your machine's LAN IP or a deployed URL before building).
 */
const config: CapacitorConfig = {
  appId: 'app.parallel.twin',
  appName: 'Parallel',
  webDir: 'dist',
  backgroundColor: '#18191b',
  server: {
    androidScheme: 'https',
    // Allow talking to a plain-http dev API on your LAN. Remove for production (use https).
    cleartext: true,
    // Live reload during development: uncomment and set to your machine's LAN IP.
    // url: 'http://192.168.1.10:5180',
  },
  plugins: {
    StatusBar: { style: 'DARK', backgroundColor: '#18191b', overlaysWebView: false },
    LocalNotifications: { smallIcon: 'ic_stat_icon', iconColor: '#3ee6b5' },
  },
}

export default config
