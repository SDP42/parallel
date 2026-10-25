import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { LangSwitch, Wordmark } from './Brand'

export function SiteNav() {
  const { t } = useTranslation()
  const { user } = useAuth()
  return (
    <header className="fixed top-0 inset-x-0 z-40">
      <div className="h-1 bg-chaos" aria-hidden />
      <nav className="mx-auto max-w-[1400px] px-4 sm:px-10 h-16 flex items-center justify-between backdrop-blur-md bg-bg/60">
        <Wordmark />
        <div className="hidden md:flex items-center gap-7 small text-muted">
          <a href="/#how" className="hover:text-ink">{t('nav.how')}</a>
          <a href="/#personas" className="hover:text-ink">{t('nav.personas')}</a>
          <a href="/#research" className="hover:text-ink">{t('nav.research')}</a>
          <a href="/#faq" className="hover:text-ink">{t('nav.faq')}</a>
        </div>
        <div className="flex items-center gap-4">
          <LangSwitch compact />
          {user ? (
            <Link to="/app" className="btn !py-2 !px-4">{t('nav.app')}</Link>
          ) : (
            <>
              <Link to="/signin" className="hidden sm:inline small text-ink hover:text-calm">{t('nav.signin')}</Link>
              <Link to="/signup" className="btn !py-2 !px-4">{t('nav.start')}</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

const BLOCKS = [
  { ch: 'P', h: '100%', c: 'bg-chaos text-field-ink' },
  { ch: 'A', h: '78%', c: 'bg-field text-field-ink' },
  { ch: 'R', h: '90%', c: 'bg-surface-2 text-ink' },
  { ch: 'A', h: '66%', c: 'bg-calm text-field-ink' },
  { ch: 'L', h: '94%', c: 'bg-field text-field-ink' },
  { ch: 'L', h: '72%', c: 'bg-surface-2 text-ink' },
  { ch: 'E', h: '84%', c: 'bg-chaos text-field-ink' },
  { ch: 'L', h: '62%', c: 'bg-calm text-field-ink' },
]

export function SiteFooter() {
  return (
    <footer className="bg-bg pt-24 pb-10">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-10">
        <div className="flex items-end gap-1 h-[22svh] sm:h-[34svh]" aria-label="Parallel" role="img">
          {BLOCKS.map((b, i) => (
            <div key={i} className={`flex-1 ${b.c} grid place-items-end justify-center pb-[2%] font-semibold leading-none`} style={{ height: b.h, fontSize: 'clamp(2.5rem, 11vw, 11rem)' }}>
              <span aria-hidden>{b.ch}</span>
            </div>
          ))}
        </div>
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-8 small">
          <div className="flex flex-col gap-2">
            <span className="text-muted">Product</span>
            <Link to="/#how">How it works</Link>
            <Link to="/app/multiverse">Multiverse simulator</Link>
            <Link to="/signup">Create your twin</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-muted">Company</span>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy policy</Link>
            <a href="/sitemap.xml">Sitemap</a>
          </div>
          <div className="flex flex-col gap-2 col-span-2">
            <span className="text-muted">Built for CASCADE ’26 · Theme 3 · Problem 3</span>
            <p className="text-muted">Your attention data is processed locally and never sold. Predictions are estimates with uncertainty, not facts.</p>
          </div>
        </div>
        <p className="mt-10 small text-muted">© {new Date().getFullYear()} Parallel. Made with care in Nagpur.</p>
      </div>
    </footer>
  )
}
