import { Link } from 'react-router-dom'
import { SiteFooter, SiteNav } from '@/components/SiteChrome'
import { Breadcrumbs } from '@/components/Brand'
import { useSeo } from '@/lib/seo'

const SECTIONS = [
  { h: 'What we collect', p: 'App names and durations, notification categories and arrival times, how long you were away from a task, your choices (allow, hold back, digest) and any outcomes you report. If you connect ActivityWatch, we import app activity only; window titles are discarded.' },
  { h: 'What we never collect', p: 'Message text, notification bodies, keystrokes, screenshots, microphone recordings or precise location. The voice assistant uses your browser’s speech recognition; audio is not sent to Parallel.' },
  { h: 'How we use it', p: 'Only to train your personal attention twin: predicting what happens if a notification is allowed or held back, finding your focus windows and estimating fatigue. We do not sell data or use it for advertising.' },
  { h: 'Experiments', p: 'With your consent, the twin may randomly hold back a small share of low-importance alerts so it can measure their true effect. Important categories and your always-allowed list are never part of experiments.' },
  { h: 'Your controls', p: 'Pause learning, set a retention window (raw events older than it are deleted automatically), export everything as JSON, export a portable attention profile, or delete your account and all data instantly from Rules & privacy.' },
  { h: 'Teams', p: 'Team views show aggregates only and are withheld for groups smaller than five people. Managers never see individual scores.' },
  { h: 'Analytics and cookies', p: 'We use Google Analytics only if you accept it in the consent banner, with IP anonymisation. Essential storage keeps you signed in and remembers your language.' },
  { h: 'Audit trail', p: 'Predictions, interventions and consent changes are written to a tamper-evident, hash-chained audit log you can inspect.' },
  { h: 'Contact', p: 'Questions or deletion requests: use the contact form. We respond within two working days.' },
]

export default function Privacy() {
  useSeo('Privacy policy', 'How Parallel handles your attention data: what we collect, what we never collect, and the controls you have.', '/privacy')
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-10 pt-32 pb-20">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Privacy policy' }]} />
        <h1 className="head mt-6">Privacy policy</h1>
        <p className="mt-4 lead text-muted">Attention data is personal. Parallel is built so you own it.</p>
        <p className="mt-2 small text-muted">Last updated 25 October 2026</p>
        {SECTIONS.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="text-2xl">{s.h}</h2>
            <p className="mt-3 text-muted">{s.p}</p>
          </section>
        ))}
        <p className="mt-12"><Link to="/contact" className="btn">Contact us</Link></p>
      </main>
      <SiteFooter />
    </>
  )
}
