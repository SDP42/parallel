import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Activity, Brain, Database, FlaskConical, Fingerprint, GitFork, Inbox, LayoutDashboard, LogOut, MessageCircle, PlayCircle, Settings, Target } from 'lucide-react'
import { LangSwitch, Wordmark } from '@/components/Brand'
import VoiceCoachFab from '@/components/VoiceCoach'
import { useAuth } from '@/lib/auth'
import { useToasts } from '@/lib/hooks'

export const NAV = [
  { to: '/app', key: 'home', icon: LayoutDashboard, end: true },
  { to: '/app/multiverse', key: 'simulator', icon: GitFork },
  { to: '/app/inbox', key: 'inbox', icon: Inbox },
  { to: '/app/fingerprint', key: 'fingerprint', icon: Fingerprint },
  { to: '/app/replay', key: 'replay', icon: PlayCircle },
  { to: '/app/brain', key: 'brain', icon: Brain },
  { to: '/app/lab', key: 'lab', icon: FlaskConical },
  { to: '/app/accuracy', key: 'accuracy', icon: Target },
  { to: '/app/models', key: 'models', icon: Database },
  { to: '/app/coach', key: 'coach', icon: MessageCircle },
  { to: '/app/settings', key: 'settings', icon: Settings },
]

const PERSONA_LABEL: Record<string, string> = { student: 'Student', developer: 'Developer', creator: 'Creator', professional: 'Professional' }

function Toasts() {
  const list = useToasts()
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            className={`fork-cut px-4 py-3 max-w-xs font-medium shadow-xl ${t.tone === 'chaos' ? 'bg-chaos' : 'bg-calm'} text-field-ink`}>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default function AppShell() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const level = 1 + Math.floor((user?.xp ?? 0) / 100)
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden lg:flex flex-col sticky top-0 h-screen bg-surface px-4 py-6">
        <div className="px-2"><Wordmark /></div>
        <nav className="mt-8 flex flex-col gap-0.5" aria-label="App">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 transition-colors ${isActive ? 'bg-bg text-ink font-medium border-l-2 border-chaos' : 'text-muted hover:text-ink border-l-2 border-transparent'}`}>
              <n.icon size={18} aria-hidden /> {n.key === 'lab' ? 'Lab' : n.key === 'models' ? 'Data & models' : t(`app.${n.key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-2">
          <div className="bg-bg p-3">
            <p className="small text-muted">{user?.name}</p>
            <p className="small">{PERSONA_LABEL[user?.persona ?? ''] ?? ''} twin · Level {level}</p>
            <div className="mt-2 h-1.5 bg-surface-2"><div className="h-full bg-calm" style={{ width: `${(user?.xp ?? 0) % 100}%` }} /></div>
          </div>
          <div className="flex items-center justify-between">
            <LangSwitch />
            <button onClick={() => { signOut(); nav('/') }} className="small text-muted hover:text-chaos flex items-center gap-1.5"><LogOut size={15} /> {t('app.signout')}</button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="lg:hidden sticky top-0 z-30 bg-bg/90 backdrop-blur flex items-center justify-between px-4 h-14">
          <Wordmark />
          <div className="flex items-center gap-3"><LangSwitch compact /><Link to="/app/settings" aria-label="Settings"><Settings size={20} /></Link></div>
        </header>
        <main className="px-4 sm:px-8 py-6 sm:py-8 pb-28 lg:pb-10 max-w-[1500px]">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface grid grid-cols-5" aria-label="App">
        {[NAV[0], NAV[1], NAV[2], NAV[3], NAV[8]].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 small ${isActive ? 'text-chaos' : 'text-muted'}`}>
            <n.icon size={20} aria-hidden /> <span className="text-[11px]">{t(`app.${n.key}`)}</span>
          </NavLink>
        ))}
      </nav>
      <VoiceCoachFab />
      <Toasts />
      <span className="sr-only"><Activity /></span>
    </div>
  )
}

export function PageHead({ title, sub, crumbs, action }: { title: string; sub?: string; crumbs?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 sm:mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <nav aria-label="Breadcrumb" className="small text-muted"><Link to="/app" className="hover:text-ink">Parallel</Link> / <span className="text-ink">{crumbs ?? title}</span></nav>
        <h1 className="mt-2 text-[clamp(1.9rem,1.4rem+2vw,2.9rem)]">{title}</h1>
        {sub && <p className="mt-2 text-muted max-w-[70ch]">{sub}</p>}
      </div>
      {action}
    </div>
  )
}
