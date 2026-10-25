import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './lib/i18n'
import { AuthProvider } from './lib/auth'
import { initAnalytics } from './lib/analytics'
import { initNative } from './lib/native'
import App from './App'

initAnalytics()
initNative()

// Installable app: register the offline shell in production builds (never in dev, never inside the native shell)
if (import.meta.env.PROD && 'serviceWorker' in navigator && !(window as any).Capacitor) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
