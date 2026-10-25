/** Google Analytics 4, loaded only when VITE_GA_ID is set and the visitor has accepted analytics. */
export function initAnalytics() {
  const id = import.meta.env.VITE_GA_ID
  let consent = false
  try { consent = localStorage.getItem('parallel.consent') === 'yes' } catch { /* ignore */ }
  if (!id || !consent) return
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
  document.head.appendChild(s)
  const w = window as any
  w.dataLayer = w.dataLayer || []
  w.gtag = function gtag() { w.dataLayer.push(arguments) }
  w.gtag('js', new Date())
  w.gtag('config', id, { anonymize_ip: true, send_page_view: false })
}

export function setConsent(yes: boolean) {
  try { localStorage.setItem('parallel.consent', yes ? 'yes' : 'no') } catch { /* ignore */ }
  if (yes) initAnalytics()
}
