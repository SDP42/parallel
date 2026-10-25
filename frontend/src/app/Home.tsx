import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Check, Flame, Lock, MapPin, Shield, Sparkles, Timer, Trophy } from 'lucide-react'
import { PageHead } from './AppShell'
import { HourLine, Panel, SERIES, Stat } from '@/components/charts'
import { ForkMark } from '@/components/Brand'
import CountUp from '@/components/CountUp'
import { api, fmtHour } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { toast, useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

const TwinMini = lazy(() => import('@/landing/TwinMini'))

type Overview = {
  fingerprint: { hourly: number[]; fatigue_curve: (number | null)[]; best_window: { start: number; end: number; quality: number }; fatigue_onset: number; focus_hours_per_day: number; interruptions_per_day: number; notifications_per_day: number; avg_session_min: number; days_learned: number; events_learned: number }
  insights: { kind: string; title: string; text: string }[]
  now: { hour: number; focus_capacity: number; fatigue: number; task: string }
  stats: { decisions: number; minutes_saved: number; xp: number; level: number }
}
type Rec = { id: string; type: string; title: string; detail: string; impact_min: number; evidence: string; confidence: number }
type Quest = { id: string; title: string; detail: string; xp: number; status: string }
type Game = { xp: number; level: number; next_level_xp: number; world: { current: { name: string; desc: string }; next: { name: string; at: number } | null; places: { name: string; unlocked: boolean; at: number }[] }; streak: { current: number; rule: string }; achievements: { id: string; title: string; desc: string; got: boolean }[] }
type Budget = { daily_min: number; spent_min: number; remaining_min: number; projected_end_of_day: number; on_track: boolean }
type Plan = { plan: { hour: number; label: string; kind: string; suggestion: string }[] }

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const PLAN_STYLE: Record<string, string> = { deep: 'bg-calm text-field-ink', routine: 'bg-surface-2', light: 'bg-surface', break: 'bg-chaos text-field-ink', rest: 'bg-bg text-muted' }

export default function Home() {
  useSeo('Today', 'Your attention today: state, budget, plan and what your twin recommends.', '/app', { noindex: true })
  const { user, setUser } = useAuth()
  const ov = useApi<Overview>('/twin/overview')
  const recs = useApi<Rec[]>('/recommendations')
  const quests = useApi<Quest[]>('/quests')
  const game = useApi<Game>('/gamification/profile')
  const comp = useApi<{ mood: string; line: string }>('/companion')
  const budget = useApi<Budget>('/budget')
  const plan = useApi<Plan>('/planner')
  const focus = useApi<{ reserved: boolean; intent?: string; minutes_left?: number }>('/focus/status')
  const session = useApi<{ task: string; next_step: string; started: number } | null>('/sessions/current')
  const [task, setTask] = useState('')
  const [step, setStep] = useState('')
  const [applied, setApplied] = useState<string[]>([])

  const refreshXp = (xp?: number) => { if (user && xp != null) setUser({ ...user, xp }) }

  async function applyRec(r: Rec) {
    if (r.type === 'rule') {
      await api('/rules', { method: 'PUT', body: { category: r.id.split(':')[1], mode: 'digest' } })
      toast('Rule saved. These now go to your digest.')
    } else if (r.type === 'schedule') {
      await api('/focus/reserve', { body: { minutes: 90, intent: 'Golden-hours deep work' } })
      focus.reload(); toast('90-minute focus window reserved.')
    } else toast('Noted. Your twin will nudge you at the right moment.')
    setApplied((a) => [...a, r.id])
  }
  async function completeQuest(q: Quest) {
    try {
      const r = await api<{ xp_gained: number }>(`/quests/${q.id}/complete`, { method: 'POST' })
      toast(`Quest complete · +${r.xp_gained} XP`); quests.reload(); game.reload(); refreshXp((user?.xp ?? 0) + r.xp_gained)
    } catch (e) { toast((e as Error).message, 'chaos') }
  }
  async function startSession(e: React.FormEvent) {
    e.preventDefault()
    await api('/sessions', { body: { task, next_step: step } })
    session.reload(); setTask(''); setStep(''); toast('Checkpoint saved. Go deep.')
  }
  async function endSession() { await api('/sessions/end', { body: {} }); session.reload(); toast('Session closed. Nice work.') }
  async function toggleFocus() {
    if (focus.data?.reserved) await api('/focus/reserve', { method: 'DELETE' })
    else await api('/focus/reserve', { body: { minutes: 50, intent: 'Deep work' } })
    focus.reload()
  }

  const o = ov.data
  if (ov.error) return <p className="text-chaos">{ov.error}</p>
  if (!o) return <p className="text-muted" role="status">Loading your twin…</p>
  const fp = o.fingerprint
  const b = budget.data

  return (
    <>
      <PageHead title={`${greet()}, ${user?.name.split(' ')[0]}`} crumbs="Today"
        sub={`Learned from ${fp.days_learned} days and ${fp.events_learned.toLocaleString()} events. Right now it’s ${fmtHour(o.now.hour)} and you’re probably ${o.now.task.toLowerCase()}.`}
        action={<Link to="/app/multiverse" className="btn">Run a fork <ArrowRight size={18} /></Link>} />

      {/* Companion + state */}
      <div className="grid gap-3 lg:grid-cols-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-5 fork-cut bg-chaos text-field-ink p-6 flex gap-5 items-center">
          <div className="shrink-0 w-28 h-28 rounded-full bg-field-ink overflow-hidden" aria-hidden>
            <Suspense fallback={<ForkMark size={44} className="text-ink m-auto mt-8" />}>
              <TwinMini mood={(comp.data?.mood as 'curious' | 'proud' | 'sleepy' | 'cheerful') ?? 'curious'} size={112} />
            </Suspense>
          </div>
          <div>
            <p className="small font-medium">Echo · your twin · feeling {comp.data?.mood ?? '…'}</p>
            <p className="mt-1 text-xl font-semibold leading-snug">{comp.data?.line ?? '…'}</p>
          </div>
        </motion.div>
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Focus capacity now" value={`${Math.round(o.now.focus_capacity * 100)}`} sub="out of 100" tone="calm" />
          <Stat label="Estimated fatigue" value={`${Math.round(o.now.fatigue * 100)}%`} sub={`usually rises after ${fmtHour(fp.fatigue_onset)}`} tone={o.now.fatigue > 0.55 ? 'chaos' : undefined} />
          <Stat label="Golden hours" value={fmtHour(fp.best_window.start).replace(':00', '')} sub={`until ${fmtHour(fp.best_window.end)}`} />
          <Stat label="Minutes protected" value={<CountUp to={o.stats.minutes_saved} decimals={0} duration={1.2} />} sub={`${o.stats.decisions} decisions with your twin`} tone="calm" />
        </div>
      </div>

      {/* Budget, reservation, checkpoint */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Panel title="Attention budget" sub="Interruption minutes you choose to spend today. Not a screen-time limit.">
          {b && (
            <>
              <p className="text-4xl font-semibold tabular-nums">{b.remaining_min}<span className="text-lg text-muted font-normal"> / {b.daily_min} min left</span></p>
              <div className="mt-3 h-3 bg-surface-2 rounded-full overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={b.daily_min} aria-valuenow={b.spent_min} aria-label="Budget spent">
                <motion.div className={`h-full rounded-full ${b.on_track ? 'bg-calm' : 'bg-chaos'}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (b.spent_min / b.daily_min) * 100)}%` }} transition={{ duration: 1 }} />
              </div>
              <p className="mt-2 small text-muted">{b.spent_min} min spent · on pace for {b.projected_end_of_day} min by tonight {b.on_track ? '· on track' : '· over budget'}</p>
            </>
          )}
        </Panel>
        <Panel title="Focus reservation" sub="One intention every connected app can respect via the Parallel API.">
          {focus.data?.reserved
            ? <p className="text-2xl font-semibold flex items-center gap-2"><Lock size={22} className="text-calm" /> {focus.data.intent} · {focus.data.minutes_left} min left</p>
            : <p className="text-muted">No focus window reserved. Family, bank and calendar alerts always pass.</p>}
          <button onClick={toggleFocus} className={`btn mt-4 ${focus.data?.reserved ? 'btn-ghost' : 'btn-calm'}`}><Shield size={18} /> {focus.data?.reserved ? 'End reservation' : 'Reserve 50 minutes'}</button>
        </Panel>
        <Panel title="Context checkpoint" sub="Save your next step before you switch. It’s waiting when you return.">
          {session.data ? (
            <div>
              <p className="small text-muted">Working on</p>
              <p className="text-xl font-semibold">{session.data.task}</p>
              {session.data.next_step && <p className="mt-2 bg-surface-2 px-3 py-2"><span className="small text-muted">Next:</span> {session.data.next_step}</p>}
              <p className="small text-muted mt-2"><Timer size={14} className="inline" /> started {new Date(session.data.started * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
              <button onClick={endSession} className="btn btn-ghost mt-3 !py-2">End session</button>
            </div>
          ) : (
            <form onSubmit={startSession} className="flex flex-col gap-2">
              <input className="input" required placeholder="What are you working on?" value={task} onChange={(e) => setTask(e.target.value)} aria-label="Task" />
              <input className="input" placeholder="Next step, e.g. fix the token expiry check" value={step} onChange={(e) => setStep(e.target.value)} aria-label="Next step" />
              <button className="btn btn-calm self-start !py-2">Start focus session</button>
            </form>
          )}
        </Panel>
      </div>

      {/* Day plan + curve */}
      <div className="mt-3 grid gap-3 lg:grid-cols-12">
        <Panel className="lg:col-span-7" title="Your attention through the day" sub="Typical focus quality vs. estimated fatigue, learned from your history. Hover for values.">
          <HourLine series={[
            { name: 'Focus quality', color: SERIES.calm, values: fp.hourly, area: true },
            { name: 'Fatigue', color: SERIES.chaos, values: fp.fatigue_curve },
          ]} />
        </Panel>
        <Panel className="lg:col-span-5" title="Planner: next hours" sub="Focus forecast × interruption risk × fatigue.">
          <ol className="flex flex-col gap-1">
            {plan.data?.plan.slice(0, 9).map((p) => (
              <li key={p.hour} className={`grid grid-cols-[72px_96px_1fr] items-center gap-3 px-3 py-2 ${PLAN_STYLE[p.kind]}`}>
                <span className="small tabular-nums">{p.label}</span><span className="small font-semibold capitalize">{p.kind}</span><span className="small truncate">{p.suggestion}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {/* Recommendations */}
      <Panel className="mt-3" title="What your twin recommends" sub="Ranked by minutes saved per day × confidence. Rules come from randomized holdouts, not guesses.">
        <div className="grid gap-2 md:grid-cols-2">
          {recs.data?.slice(0, 6).map((r) => (
            <div key={r.id} className="bg-surface-2 p-4 flex gap-4">
              <div className="flex-1">
                <p className="font-medium">{r.title}</p>
                <p className="small text-muted mt-1">{r.detail}</p>
                <p className="small text-muted mt-2">Evidence: {r.evidence} · {Math.round(r.confidence * 100)}% confidence</p>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end justify-between">
                <p className="text-2xl font-semibold text-calm tabular-nums">~{Math.round(r.impact_min)}<span className="small text-muted"> min/day</span></p>
                <button disabled={applied.includes(r.id)} onClick={() => applyRec(r)} className="btn !py-1.5 !px-3 small">{applied.includes(r.id) ? <><Check size={14} /> Applied</> : 'Apply'}</button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Insights + quests + world */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Panel title="What your twin learned" sub="Grounded in your own events.">
          <ul className="flex flex-col gap-3">
            {o.insights.map((i) => (
              <li key={i.title} className="border-l-2 border-chaos pl-3"><p className="font-medium">{i.title}</p><p className="small text-muted">{i.text}</p></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Today’s quests" sub="Optional. Validated against real activity, so they can’t be farmed.">
          <ul className="flex flex-col gap-2">
            {quests.data?.map((q) => (
              <li key={q.id} className={`p-3 flex items-center gap-3 ${q.status === 'done' ? 'bg-bg opacity-70' : 'bg-surface-2'}`}>
                <div className="flex-1"><p className="font-medium text-[1rem]">{q.title}</p><p className="small text-muted">{q.detail}</p></div>
                {q.status === 'done' ? <Check className="text-calm" aria-label="Done" /> : <button onClick={() => completeQuest(q)} className="btn !py-1.5 !px-3 small">+{q.xp} XP</button>}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Your world" sub="Grows with intentional choices, not with blocking everything.">
          {game.data && (
            <>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-xl font-semibold"><MapPin size={20} className="text-calm" /> {game.data.world.current.name}</p>
                <p className="small flex items-center gap-1"><Flame size={16} className="text-chaos" /> {game.data.streak.current}-day streak</p>
              </div>
              <p className="small text-muted mt-1">{game.data.world.current.desc}</p>
              <div className="mt-4 flex gap-1" aria-label="World progression">
                {game.data.world.places.map((p) => <div key={p.name} title={`${p.name} · ${p.at} XP`} className={`h-2 flex-1 ${p.unlocked ? 'bg-calm' : 'bg-surface-2'}`} />)}
              </div>
              <p className="small text-muted mt-2">Level {game.data.level} · {game.data.xp} XP{game.data.world.next ? ` · ${game.data.world.next.at - game.data.xp} XP to ${game.data.world.next.name}` : ''}</p>
              <ul className="mt-4 grid grid-cols-2 gap-2">
                {game.data.achievements.map((a) => (
                  <li key={a.id} title={a.desc} className={`p-2.5 small flex items-start gap-2 ${a.got ? 'bg-surface-2' : 'bg-bg text-muted'}`}>
                    {a.got ? <Trophy size={16} className="text-chaos shrink-0" /> : <Sparkles size={16} className="shrink-0" />} {a.title}
                  </li>
                ))}
              </ul>
              <p className="small text-muted mt-3">{game.data.streak.rule}</p>
            </>
          )}
        </Panel>
      </div>
    </>
  )
}
