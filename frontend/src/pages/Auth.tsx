import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { BookOpen, Code2, Clapperboard, Briefcase, ArrowRight } from 'lucide-react'
import { ForkMark, LangSwitch, Wordmark } from '@/components/Brand'
import { useAuth } from '@/lib/auth'
import { useSeo } from '@/lib/seo'

const DEMOS = [
  { key: 'student', label: 'Student', icon: BookOpen, line: 'Exams vs. Instagram' },
  { key: 'developer', label: 'Developer', icon: Code2, line: 'Flow vs. Slack pings' },
  { key: 'creator', label: 'Creator', icon: Clapperboard, line: 'Editing vs. the feed' },
  { key: 'professional', label: 'Professional', icon: Briefcase, line: 'Analysis vs. inbox' },
]

export default function Auth({ mode }: { mode: 'signin' | 'signup' }) {
  const signup = mode === 'signup'
  useSeo(signup ? 'Create your twin' : 'Sign in', signup ? 'Create your Parallel account and start training your attention digital twin.' : 'Sign in to Parallel to see your attention twin.', signup ? '/signup' : '/signin')
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { signIn, signUp, demo } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const next = params.get('next') || '/app'

  const go = (u: { persona: string | null }) => nav(u.persona ? next : '/onboarding', { replace: true })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy('form')
    try { go(signup ? await signUp(name, email, password) : await signIn(email, password)) }
    catch (ex) { setErr((ex as Error).message) } finally { setBusy(null) }
  }
  async function tryDemo(p: string) {
    setErr(''); setBusy(p)
    try { go(await demo(p)) } catch (ex) { setErr((ex as Error).message) } finally { setBusy(null) }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between bg-chaos text-field-ink p-12 overflow-hidden">
        <Wordmark />
        <div>
          <p className="head max-w-[12ch]">Two futures. You pick.</p>
          <p className="mt-4 max-w-[40ch]">Your twin learns how you focus, what pulls you away and how long it takes you to come back. Then it shows you both futures of every ping.</p>
        </div>
        <ForkMark size={520} className="absolute -right-40 -bottom-24 opacity-20 text-field-ink" />
      </div>
      <main className="flex flex-col px-4 sm:px-12 py-8">
        <div className="flex justify-between items-center lg:justify-end gap-4">
          <span className="lg:hidden"><Wordmark /></span>
          <LangSwitch />
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto my-auto py-10">
          <h1 className="head">{signup ? 'Create your twin' : 'Welcome back'}</h1>
          <p className="mt-3 text-muted">{signup ? 'Two minutes to set up. Your data stays yours.' : 'Sign in, or step into a demo twin below.'}</p>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-3" noValidate={false}>
            {signup && (
              <label className="flex flex-col gap-1.5 small text-muted">Name
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </label>
            )}
            <label className="flex flex-col gap-1.5 small text-muted">Email
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label className="flex flex-col gap-1.5 small text-muted">Password
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} />
            </label>
            {err && <p role="alert" className="small text-chaos">{err}</p>}
            <button className="btn justify-center mt-2" disabled={!!busy}>{busy === 'form' ? 'One moment…' : signup ? 'Create account' : 'Sign in'} <ArrowRight size={18} /></button>
          </form>
          <p className="mt-4 small text-muted">
            {signup ? <>Already have a twin? <Link to="/signin" className="text-ink underline">Sign in</Link></> : <>New here? <Link to="/signup" className="text-ink underline">Create your twin</Link></>}
          </p>

          <div className="mt-10">
            <p className="small text-muted">Or explore a ready-made demo twin (14 days of history)</p>
            <p className="mt-2 small text-ink bg-surface px-3 py-2">
              Demo login: <button type="button" className="underline" onClick={() => { setEmail('student@parallel.app'); setPassword('parallel123') }}>student@parallel.app</button> · password <span className="text-calm">parallel123</span>
              <span className="block text-muted">Also developer@, creator@ and professional@parallel.app</span>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMOS.map((d) => (
                <button key={d.key} onClick={() => tryDemo(d.key)} disabled={!!busy}
                  className="fork-cut bg-surface hover:bg-surface-2 p-4 text-left transition-colors disabled:opacity-60">
                  <d.icon size={20} className="text-calm" aria-hidden />
                  <span className="block mt-2 font-medium">{busy === d.key ? 'Loading…' : d.label}</span>
                  <span className="block small text-muted">{d.line}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-8 small text-muted">By continuing you agree to our <Link to="/privacy" className="underline">privacy policy</Link>.</p>
        </motion.div>
      </main>
    </div>
  )
}
