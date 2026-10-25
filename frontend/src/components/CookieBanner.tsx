import { useState } from 'react'
import { Link } from 'react-router-dom'
import { setConsent } from '@/lib/analytics'

export default function CookieBanner() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem('parallel.consent') } catch { return false }
  })
  if (!open) return null
  const pick = (yes: boolean) => { setConsent(yes); setOpen(false) }
  return (
    <div role="dialog" aria-label="Analytics consent" className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-50 panel p-5 shadow-2xl">
      <p className="small text-ink">
        We use privacy-friendly analytics only if you say yes. Your attention data never leaves your twin. <Link to="/privacy" className="underline">Privacy policy</Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-ghost !py-2" onClick={() => pick(false)}>Decline</button>
        <button className="btn btn-calm !py-2" onClick={() => pick(true)}>Allow analytics</button>
      </div>
    </div>
  )
}
