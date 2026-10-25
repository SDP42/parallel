import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, BookOpen, Briefcase, Check, Clapperboard, Code2 } from 'lucide-react'
import { Wordmark } from '@/components/Brand'
import { AppsSection, DaySection, DeadlineSection, EMPTY_PROFILE, ScheduleSection, type Profile } from '@/components/RoutineEditor'
import { api } from '@/lib/api'
import { useAuth, type User } from '@/lib/auth'
import { useSeo } from '@/lib/seo'

const PERSONAS = [
  { key: 'student', label: 'Student', icon: BookOpen, line: 'Exams, assignments and a phone that never sleeps.' },
  { key: 'developer', label: 'Developer', icon: Code2, line: 'Deep work, flow state and Slack pings mid-debug.' },
  { key: 'creator', label: 'Creator', icon: Clapperboard, line: 'Where your work tool is also your biggest distraction.' },
  { key: 'professional', label: 'Professional', icon: Briefcase, line: 'Back-to-back meetings and an inbox with opinions.' },
]
const GOALS = ['Ship deep work', 'Less doomscrolling', 'Ace my exams', 'Protect my evenings', 'Fewer context switches', 'Better breaks']
const VIP = [
  { key: 'family', label: 'Family & close friends' },
  { key: 'security', label: 'Bank & security alerts' },
  { key: 'calendar', label: 'Calendar & meetings' },
  { key: 'work_chat', label: 'Work chat' },
]
const DEFAULT_APPS: Record<string, Pick<Profile, 'tools' | 'nags'>> = {
  student: { tools: ['Notion', 'Docs'], nags: ['Instagram', 'YouTube'] },
  developer: { tools: ['VS Code', 'Terminal', 'GitHub'], nags: ['X', 'YouTube'] },
  creator: { tools: ['Figma', 'Docs'], nags: ['Instagram', 'Reddit'] },
  professional: { tools: ['Excel', 'Docs'], nags: ['LinkedIn', 'Amazon'] },
}

type Step = { title: string; sub: string; skippable?: boolean }
const STEPS: Step[] = [
  { title: 'Which kind of busy are you?', sub: 'Your twin starts from this persona’s patterns, then learns your own.' },
  { title: 'What should your twin protect?', sub: 'Pick any. Rewards follow your goals, not screen-time totals.' },
  { title: 'What does your day look like?', sub: 'Your focus curve shifts to when you wake, sleep and peak.' },
  { title: 'Your weekly schedule', sub: 'During a class or work block, low-value pings are held and the reason names the block.', skippable: true },
  { title: 'Deadlines and exams', sub: 'A close deadline makes your twin stricter and guards your golden hours.', skippable: true },
  { title: 'Which apps are tools, which nag you?', sub: 'Tools count as focus. Nags get less benefit of the doubt.' },
  { title: 'Who always gets through?', sub: 'These bypass every rule. Your rules beat the model, always.' },
]

export default function Onboarding() {
  useSeo('Set up your twin', 'Seven quick steps: persona, goals, routine, schedule, deadlines, apps and who always gets through.', '/onboarding', { noindex: true })
  const { user, setUser } = useAuth()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [persona, setPersona] = useState(user?.persona ?? '')
  const [goals, setGoals] = useState<string[]>(['Ship deep work'])
  const [vip, setVip] = useState<string[]>(['family', 'security', 'calendar'])
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [busy, setBusy] = useState(false)
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  function pickPersona(k: string) {
    setPersona(k)
    if (!profile.tools.length && !profile.nags.length) setProfile({ ...profile, ...DEFAULT_APPS[k] })
  }

  async function finish() {
    setBusy(true)
    const u = await api<User>('/me/persona', { method: 'PUT', body: { persona, goals, vip } })
    await api('/me/profile', { method: 'PUT', body: profile })
    setUser(u)
    nav('/app', { replace: true })
  }

  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const body = [
    <div key="0" className="grid sm:grid-cols-2 gap-2" role="radiogroup">
      {PERSONAS.map((p) => (
        <button key={p.key} role="radio" aria-checked={persona === p.key} onClick={() => pickPersona(p.key)}
          className={`fork-cut p-5 text-left transition-colors ${persona === p.key ? 'bg-chaos text-field-ink' : 'bg-surface hover:bg-surface-2'}`}>
          <p.icon size={24} aria-hidden />
          <span className="block mt-3 text-xl font-semibold">{p.label}</span>
          <span className={`block small mt-1 ${persona === p.key ? '' : 'text-muted'}`}>{p.line}</span>
        </button>
      ))}
    </div>,
    <div key="1" className="flex flex-wrap gap-2">
      {GOALS.map((g) => (
        <button key={g} aria-pressed={goals.includes(g)} onClick={() => setGoals(toggle(goals, g))}
          className={`px-4 py-3 fork-cut flex items-center gap-2 transition-colors ${goals.includes(g) ? 'bg-calm text-field-ink' : 'bg-surface hover:bg-surface-2'}`}>
          {goals.includes(g) && <Check size={16} />} {g}
        </button>
      ))}
    </div>,
    <DaySection key="2" p={profile} set={setProfile} />,
    <ScheduleSection key="3" p={profile} set={setProfile} />,
    <DeadlineSection key="4" p={profile} set={setProfile} />,
    <AppsSection key="5" p={profile} set={setProfile} />,
    <div key="6">
      <div className="flex flex-col gap-2">
        {VIP.map((v) => (
          <label key={v.key} className="flex items-center justify-between bg-surface px-5 py-4 cursor-pointer">
            <span>{v.label}</span>
            <input type="checkbox" checked={vip.includes(v.key)} onChange={() => setVip(toggle(vip, v.key))} className="w-5 h-5 accent-[var(--color-calm)]" />
          </label>
        ))}
      </div>
      <p className="mt-6 small text-muted">Parallel stores app names and notification categories, never message text. Your first days of history are generated from the routine you just described; real data replaces them as it arrives.</p>
    </div>,
  ]

  return (
    <div className="min-h-screen px-4 sm:px-12 py-8 flex flex-col" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center justify-between"><Wordmark /><span className="small text-muted">Step {step + 1} of {STEPS.length}</span></div>
      <div className="mt-6 grid gap-1" style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }} aria-hidden>
        {STEPS.map((_, i) => <div key={i} className={`h-1 transition-colors ${i <= step ? 'bg-chaos' : 'bg-surface'}`} />)}
      </div>
      <main className="w-full max-w-2xl mx-auto my-auto py-10">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
            <h1 className="head">{s.title}</h1>
            <p className="mt-3 mb-8 text-muted">{s.sub}</p>
            {body[step]}
          </motion.div>
        </AnimatePresence>
        <div className="mt-10 flex items-center justify-between gap-3">
          <button className="btn btn-ghost" onClick={() => setStep(step - 1)} style={{ visibility: step === 0 ? 'hidden' : 'visible' }}><ArrowLeft size={18} /> Back</button>
          <div className="flex items-center gap-3">
            {s.skippable && !last && <button className="small text-muted hover:text-ink underline" onClick={() => setStep(step + 1)}>Skip for now</button>}
            {!last
              ? <button className="btn" disabled={step === 0 && !persona} onClick={() => setStep(step + 1)}>Continue <ArrowRight size={18} /></button>
              : <button className="btn btn-calm" disabled={busy} onClick={finish}>{busy ? 'Training your twin…' : 'Meet my twin'} <ArrowRight size={18} /></button>}
          </div>
        </div>
      </main>
    </div>
  )
}
