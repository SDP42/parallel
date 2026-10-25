import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Bell, CheckCircle2, CircleHelp, GitFork, Inbox, Pause, Play, Send, Sparkles } from 'lucide-react'
import { PageHead } from './AppShell'
import Universes from '@/components/Universes'
import { Histogram, Panel, SERIES } from '@/components/charts'
import { api, CATEGORIES, fmtHour, type Sim } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { toast, useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

type SimX = Sim & { prediction_id: number; model_version: string; abstained: boolean; universes: { a: { name: string; line: string }; b: { name: string; line: string } }
  population?: { version: string; p_open: number; cost_p50: number; cost_p10: number; cost_p90: number; counterfactual_effect_min: number }
  blend?: { personal_weight: number; p_open: number; cost_p50: number } }
type Verdict = { predicted: number; actual: number; within_range: boolean; message: string } | null

const TASK_DEPTH = [
  { v: 0.3, label: 'Light (email, admin)' },
  { v: 0.6, label: 'Medium (reading, planning)' },
  { v: 1.0, label: 'Deep (coding, studying)' },
]

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between small"><span className="text-muted">{label}</span><span className="tabular-nums">{fmt(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="accent-[var(--color-chaos)]" />
    </label>
  )
}

function Chain({ steps, tone }: { steps: Sim['chain_allow']; tone: 'chaos' | 'calm' }) {
  return (
    <ol className="relative flex flex-col gap-4 pl-6">
      <span className={`absolute left-[7px] top-2 bottom-2 w-[2px] ${tone === 'chaos' ? 'bg-chaos' : 'bg-calm'}`} aria-hidden />
      {steps.map((s, i) => (
        <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="relative">
          <span className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-surface ${tone === 'chaos' ? 'bg-chaos' : 'bg-calm'}`} aria-hidden />
          <p className="font-medium text-[1rem]"><span className="tabular-nums text-muted small mr-2">{s.t} min</span>{s.label}</p>
          <p className="small text-muted">{s.detail}</p>
        </motion.li>
      ))}
    </ol>
  )
}

export default function Simulator() {
  useSeo('Multiverse simulator', 'Simulate both futures of a notification with your personal attention model.', '/app/multiverse', { noindex: true })
  const [params] = useSearchParams()
  const { user, setUser } = useAuth()
  const now = new Date()
  const [cat, setCat] = useState(params.get('category') ?? 'social_like')
  const [hour, setHour] = useState(Math.round((now.getHours() + now.getMinutes() / 60) * 4) / 4)
  const [depth, setDepth] = useState(1.0)
  const [fatigue, setFatigue] = useState(0.35)
  const [minutesIn, setMinutesIn] = useState(35)
  const [sim, setSim] = useState<SimX | null>(null)
  const [busy, setBusy] = useState(false)
  const [play, setPlay] = useState(0)
  const [decided, setDecided] = useState<{ choice: string; decision_id: number } | null>(null)
  const [actual, setActual] = useState('')
  const [verdict, setVerdict] = useState<Verdict>(null)
  const ov = useApi<{ now: { fatigue: number; hour: number } }>('/twin/overview')
  useEffect(() => { if (ov.data) setFatigue(Math.round(ov.data.now.fatigue * 100) / 100) }, [ov.data])

  async function run() {
    setBusy(true); setDecided(null); setVerdict(null); setActual('')
    try {
      const s = await api<SimX>('/simulations', { body: { category: cat, hour, depth, fatigue, minutes_in: minutesIn } })
      setSim(s); setPlay((p) => p + 1)
    } catch (e) { toast((e as Error).message, 'chaos') } finally { setBusy(false) }
  }
  useEffect(() => { run() }, [cat]) // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(choice: 'allow' | 'delay' | 'summarize') {
    if (!sim) return
    const meta = CATEGORIES.find((c) => c.key === cat)
    const r = await api<{ decision_id: number; xp_gained: number; reasons: string[]; stats: { xp: number } }>('/interventions', {
      body: { prediction_id: sim.prediction_id, category: cat, choice, predicted_cost: sim.allow.cost_expected, saved: choice === 'allow' ? 0 : sim.saved_minutes, text: meta?.text },
    })
    setDecided({ choice, decision_id: r.decision_id })
    if (user) setUser({ ...user, xp: r.stats.xp })
    toast(`+${r.xp_gained} XP · ${r.reasons[r.reasons.length - 1].replace(/^\+\d+ /, '')}`)
  }

  async function reveal(e: React.FormEvent) {
    e.preventDefault()
    if (!sim || !decided) return
    const r = await api<{ verdict: Verdict; stats: { xp: number } }>('/outcomes', { body: { prediction_id: sim.prediction_id, decision_id: decided.decision_id, actual_cost: +actual } })
    setVerdict(r.verdict ?? { predicted: sim.delay.cost_expected, actual: +actual, within_range: true, message: 'Logged. Held-back outcomes sharpen the counterfactual estimate.' })
    if (user) setUser({ ...user, xp: r.stats.xp })
    toast('+15 XP · thanks for the reality check')
  }

  const meta = CATEGORIES.find((c) => c.key === cat)!
  const recLabel = { allow: 'Let it through', delay: 'Hold it until your checkpoint', summarize: 'Add it to your digest', ask: 'Your call' }

  return (
    <>
      <PageHead title="The Multiverse" crumbs="Multiverse" sub="One notification, two futures. Numbers come from your personal models; the stories are comedy layered on top." />

      <div className="grid gap-3 xl:grid-cols-12">
        {/* Controls */}
        <Panel className="xl:col-span-4" title="Incoming ping" sub="Pick a notification, then tune the moment it arrives.">
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Notification">
            {CATEGORIES.map((c) => (
              <button key={c.key} role="radio" aria-checked={cat === c.key} onClick={() => setCat(c.key)}
                className={`px-3 py-2.5 text-left transition-colors ${cat === c.key ? 'bg-chaos text-field-ink' : 'bg-surface-2 hover:bg-bg'}`}>
                <span className="block small font-semibold">{c.app}</span>
                <span className="block text-[13px] opacity-80 truncate">{c.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-4">
            <Slider label="Arrives at" value={hour} min={6} max={23.75} step={0.25} onChange={setHour} fmt={fmtHour} />
            <Slider label="Minutes into your focus block" value={minutesIn} min={0} max={120} step={5} onChange={setMinutesIn} fmt={(v) => `${v} min`} />
            <Slider label="Your fatigue" value={fatigue} min={0} max={1} step={0.05} onChange={setFatigue} fmt={(v) => `${Math.round(v * 100)}%`} />
            <fieldset>
              <legend className="small text-muted mb-1.5">What you’re doing</legend>
              <div className="flex flex-col gap-1">
                {TASK_DEPTH.map((d) => (
                  <label key={d.v} className={`px-3 py-2 cursor-pointer small ${depth === d.v ? 'bg-bg text-ink border-l-2 border-chaos' : 'bg-surface-2 text-muted border-l-2 border-transparent'}`}>
                    <input type="radio" name="depth" className="sr-only" checked={depth === d.v} onChange={() => setDepth(d.v)} /> {d.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button onClick={run} disabled={busy} className="btn justify-center"><GitFork size={18} /> {busy ? 'Simulating 2,000 futures…' : 'Fork the future'}</button>
          </div>
        </Panel>

        {/* Result */}
        <div className="xl:col-span-8 flex flex-col gap-3">
          {sim && (
            <>
              <div className="panel p-5 flex flex-wrap items-center gap-5">
                <span className="grid place-items-center w-12 h-12 bg-chaos text-field-ink fork-cut"><Bell size={22} /></span>
                <div className="flex-1 min-w-[220px]">
                  <p className="font-medium">{meta.text}</p>
                  <p className="small text-muted">{meta.app} · {fmtHour(sim.context.hour)} · {sim.context.task.toLowerCase()} · model {sim.model_version}</p>
                </div>
                <div className="text-right">
                  <p className="small text-muted">Twin’s call</p>
                  <p className={`text-xl font-semibold ${sim.recommendation === 'allow' ? 'text-calm' : sim.recommendation === 'ask' ? 'text-ink' : 'text-chaos'}`}>
                    {sim.recommendation === 'ask' && <CircleHelp size={18} className="inline mr-1" />}{recLabel[sim.recommendation as keyof typeof recLabel]}
                  </p>
                  <p className="small text-muted">{Math.round(sim.confidence * 100)}% confidence · {sim.similar_events} similar moments</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-surface p-4"><p className="small text-muted">Universe A archetype</p><p className="text-lg font-semibold text-chaos">{sim.universes.a.name}</p><p className="small text-muted">{sim.universes.a.line}</p></div>
                <div className="bg-surface p-4"><p className="small text-muted">Universe B archetype</p><p className="text-lg font-semibold text-calm">{sim.universes.b.name}</p><p className="small text-muted">{sim.universes.b.line}</p></div>
              </div>
              <Universes sim={sim} playKey={play} />
            </>
          )}
          {!sim && <div className="panel min-h-[400px] grid place-items-center text-muted">Forking…</div>}
        </div>
      </div>

      {sim && (
        <>
          {/* Decision + reality check */}
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Panel title="Choose your universe" sub={sim.abstained ? 'Low evidence for this exact moment, so your twin is not deciding for you.' : sim.why}>
              <div className="grid sm:grid-cols-3 gap-2">
                <button disabled={!!decided} onClick={() => decide('allow')} className="btn btn-ghost justify-center"><Play size={16} /> Allow now</button>
                <button disabled={!!decided} onClick={() => decide('delay')} className="btn justify-center"><Pause size={16} /> Hold back</button>
                <button disabled={!!decided} onClick={() => decide('summarize')} className="btn btn-calm justify-center"><Inbox size={16} /> Digest</button>
              </div>
              <p className="small text-muted mt-3">XP rewards intentional choices and honest feedback. Allowing a ping on purpose is a valid choice; holding back urgent things earns nothing.</p>
              <AnimatePresence>
                {decided && (
                  <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} onSubmit={reveal} className="mt-5 border-t border-surface-2 pt-5">
                    <p className="font-medium">Reality check: how many minutes did it actually cost you?</p>
                    <div className="mt-3 flex gap-2">
                      <input className="input max-w-[140px]" type="number" min={0} max={600} step={0.5} required value={actual} onChange={(e) => setActual(e.target.value)} aria-label="Actual minutes" placeholder="e.g. 4" />
                      <button className="btn !py-2" disabled={!!verdict}><Send size={16} /> Reveal</button>
                    </div>
                    {verdict && (
                      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`mt-4 p-4 fork-cut ${verdict.within_range ? 'bg-calm' : 'bg-chaos'} text-field-ink`}>
                        <p className="flex items-center gap-2 font-semibold">{verdict.within_range ? <CheckCircle2 size={18} /> : <Sparkles size={18} />} {verdict.message}</p>
                        <p className="small mt-1">Predicted {verdict.predicted} min · actual {verdict.actual} min. Your twin will use this.</p>
                      </motion.div>
                    )}
                  </motion.form>
                )}
              </AnimatePresence>
            </Panel>
            <Panel title="2,000 possible futures" sub={`If you allow it: median ${sim.allow.cost_p50} min, 80% of futures between ${sim.allow.cost_p10} and ${sim.allow.cost_p90} min.`}>
              <Histogram bins={sim.allow.histogram} binWidth={3} color={SERIES.chaos} marks={[{ at: sim.allow.cost_expected, label: `mean ${sim.allow.cost_expected}` }]} />
              <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                <div className="bg-surface-2 p-3"><dt className="small text-muted">Opens it</dt><dd className="text-xl font-semibold">{Math.round(sim.allow.p_open * 100)}%</dd></div>
                <div className="bg-surface-2 p-3"><dt className="small text-muted">Rabbit hole</dt><dd className="text-xl font-semibold">{Math.round(sim.allow.p_rabbit_hole * 100)}%</dd></div>
                <div className="bg-surface-2 p-3"><dt className="small text-muted">If hooked</dt><dd className="text-xl font-semibold">{sim.allow.away_if_rabbit} min</dd></div>
              </dl>
            </Panel>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Panel title="Universe A, step by step" sub="Most likely chain if you allow it."><Chain steps={sim.chain_allow} tone="chaos" /></Panel>
            <Panel title="Universe B, step by step" sub={`Counterfactual from ${sim.delay.n_holdouts} randomized holdouts.`}><Chain steps={sim.chain_delay} tone="calm" /></Panel>
            <Panel title="Why your twin thinks this" sub="How much each factor pushes the chance you open it, versus an average moment.">
              <ul className="flex flex-col gap-3">
                {sim.factors.map((f) => {
                  const w = Math.min(100, Math.abs(f.effect) * 60)
                  return (
                    <li key={f.factor}>
                      <p className="flex justify-between small"><span className="capitalize">{f.factor}</span><span className="text-muted">{f.effect > 0 ? 'more likely to open' : 'less likely'}</span></p>
                      <div className="mt-1 h-2 bg-surface-2 relative">
                        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-muted" aria-hidden />
                        <div className="absolute top-0 bottom-0 rounded-[3px]" style={{ background: f.effect > 0 ? SERIES.chaos : SERIES.calm, width: `${w / 2}%`, left: f.effect > 0 ? '50%' : `${50 - w / 2}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
              {sim.population && sim.blend && (
                <div className="mt-5 border-t border-surface-2 pt-4">
                  <p className="small text-muted">Personal twin vs population model ({sim.population.version})</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center small">
                    <div className="bg-surface-2 p-2"><dt className="text-muted">You</dt><dd className="text-lg font-semibold">{Math.round(sim.allow.p_open * 100)}%</dd></div>
                    <div className="bg-surface-2 p-2"><dt className="text-muted">Population</dt><dd className="text-lg font-semibold">{Math.round(sim.population.p_open * 100)}%</dd></div>
                    <div className="bg-surface-2 p-2"><dt className="text-muted">Blended</dt><dd className="text-lg font-semibold text-calm">{Math.round(sim.blend.p_open * 100)}%</dd></div>
                  </dl>
                  <p className="small text-muted mt-2">Your own history carries {Math.round(sim.blend.personal_weight * 100)}% of the weight; it grows as your twin sees more moments like this.</p>
                </div>
              )}
              <p className="small text-muted mt-4">Prediction logged as #{sim.prediction_id} in your tamper-evident audit trail.</p>
            </Panel>
          </div>
        </>
      )}
    </>
  )
}
