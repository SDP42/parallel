import { useState } from 'react'
import { Copy, FlaskConical, KeyRound, Users, Wallet } from 'lucide-react'
import { PageHead } from './AppShell'
import { HourLine, Panel, SERIES } from '@/components/charts'
import { api, CATEGORIES } from '@/lib/api'
import { toast, useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

type Debt = { week: { day: string; switches: number; away_min: number; recovery_min: number }[]; total_recovery_min: number; biggest: { day: string; at: string; app: string; cost: number; task: string }[]; caveat: string }
type Room = { code: string; name: string; goal: string; minutes_left: number; members: { name: string; done: boolean; you: boolean }[] }
type Habit = { id: number; title: string; day: number; days: number; adherence_events: number; minutes_saved: number; baseline_per_day: number; status: string }
type Team = { members: number; k_min: number; focus_by_hour: number[]; interruptions_per_person_day: number; meetings_per_person_day: number; suggestion: string; privacy: string }
type Caps = Record<string, { label: string; read_notifications: boolean | string; suppress_notifications: boolean | string; app_usage: boolean | string; how: string; limits: string }>

const TABS = [
  { k: 'debt', label: 'Attention debt', icon: Wallet },
  { k: 'rooms', label: 'Co-focus rooms', icon: Users },
  { k: 'habits', label: 'Habit experiments', icon: FlaskConical },
  { k: 'api', label: 'Developer API', icon: KeyRound },
  { k: 'team', label: 'Team health', icon: Users },
]

function DebtTab() {
  const d = useApi<Debt>('/debt').data
  if (!d) return null
  const max = Math.max(...d.week.map((w) => w.away_min + w.recovery_min), 1)
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Last 7 days" sub={`${d.total_recovery_min} minutes spent just getting back into flow. ${d.caveat}`}>
        <div className="flex gap-4 small text-muted mb-3"><span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-chaos" />Away</span><span className="flex items-center gap-1.5"><span className="w-3 h-3" style={{ background: SERIES.calm }} />Recovering</span></div>
        <div className="flex items-end gap-2 h-48">
          {d.week.map((w) => (
            <div key={w.day} className="flex-1 flex flex-col justify-end h-full gap-[2px]" title={`${w.day}: ${w.away_min} min away, ${w.recovery_min} min recovering, ${w.switches} switches`}>
              <div className="rounded-t-[4px]" style={{ height: `${(w.recovery_min / max) * 100}%`, background: SERIES.calm }} />
              <div className="bg-chaos" style={{ height: `${(w.away_min / max) * 100}%` }} />
              <span className="small text-muted text-center mt-1">{new Date(w.day).toLocaleDateString([], { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Most expensive interruptions" sub="The five single pings that cost you the most this week.">
        <ol className="flex flex-col gap-2">
          {d.biggest.map((b, i) => <li key={i} className="bg-surface-2 p-3 flex justify-between gap-3"><span><span className="font-medium">{b.app}</span> <span className="small text-muted">during {b.task.toLowerCase()} · {new Date(b.day).toLocaleDateString([], { weekday: 'short' })} {b.at}</span></span><span className="tabular-nums text-chaos font-semibold">{b.cost} min</span></li>)}
        </ol>
      </Panel>
    </div>
  )
}

function RoomsTab() {
  const rooms = useApi<Room[]>('/rooms')
  const [name, setName] = useState('DSA grind')
  const [goal, setGoal] = useState('Solve 3 problems')
  const [code, setCode] = useState('')
  async function create(e: React.FormEvent) { e.preventDefault(); const r = await api<Room>('/rooms', { body: { name, goal, minutes: 50 } }); toast(`Room ${r.code} created. Share the code.`); rooms.reload() }
  async function join(e: React.FormEvent) { e.preventDefault(); try { await api(`/rooms/${code}/join`, { method: 'POST' }); rooms.reload(); toast('Joined. Focus together.') } catch (ex) { toast((ex as Error).message, 'chaos') } }
  async function done(c: string) { await api(`/rooms/${c}/done`, { method: 'POST' }); rooms.reload(); toast('Goal done. Your room sees a tick, not a score.') }
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel title="Start a room" sub="Shared goal, shared timer. No rankings, no surveillance.">
        <form onSubmit={create} className="flex flex-col gap-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Room name" required />
          <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Shared goal" />
          <button className="btn btn-calm self-start !py-2">Create 50-minute room</button>
        </form>
        <form onSubmit={join} className="mt-5 flex gap-2">
          <input className="input" placeholder="Room code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Room code" required />
          <button className="btn !py-2">Join</button>
        </form>
      </Panel>
      <div className="lg:col-span-2 flex flex-col gap-3">
        {rooms.data?.length === 0 && <Panel title="No active rooms"><p className="text-muted small">Create one and share the code with a friend.</p></Panel>}
        {rooms.data?.map((r) => (
          <Panel key={r.code} title={`${r.name} · ${r.code}`} sub={`${r.goal} · ${r.minutes_left} min left`} action={<button onClick={() => navigator.clipboard?.writeText(r.code)} className="btn btn-ghost !py-1.5 !px-3 small"><Copy size={14} /> Code</button>}>
            <ul className="flex flex-wrap gap-2">{r.members.map((m) => <li key={m.name} className={`px-3 py-1.5 small ${m.done ? 'bg-calm text-field-ink' : 'bg-surface-2'}`}>{m.name}{m.you ? ' (you)' : ''}{m.done ? ' ✓' : ''}</li>)}</ul>
            {!r.members.find((m) => m.you)?.done && <button onClick={() => done(r.code)} className="btn mt-4 !py-2">Mark my goal done</button>}
          </Panel>
        ))}
      </div>
    </div>
  )
}

function HabitsTab() {
  const h = useApi<Habit[]>('/habits')
  const [cat, setCat] = useState('social_like')
  async function start(e: React.FormEvent) { e.preventDefault(); await api('/habits', { body: { category: cat, days: 7 } }); h.reload(); toast('Experiment started. Your baseline is locked in.') }
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel title="Test one change for a week" sub="Compared with your own baseline, not with generic advice.">
        <form onSubmit={start} className="flex flex-col gap-2">
          <label className="small text-muted">Hold back during focus
            <select className="input mt-1" value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.filter((c) => !['family', 'security', 'calendar'].includes(c.key)).map((c) => <option key={c.key} value={c.key}>{c.label} ({c.app})</option>)}</select>
          </label>
          <button className="btn btn-calm self-start !py-2">Start 7-day experiment</button>
        </form>
      </Panel>
      <div className="lg:col-span-2 flex flex-col gap-2">
        {h.data?.length === 0 && <p className="text-muted small panel p-5">No experiments yet.</p>}
        {h.data?.map((x) => (
          <div key={x.id} className="panel p-5">
            <p className="font-medium">{x.title}</p>
            <div className="mt-3 flex gap-1">{Array.from({ length: x.days }).map((_, i) => <div key={i} className={`h-2 flex-1 ${i < x.day ? 'bg-calm' : 'bg-surface-2'}`} />)}</div>
            <p className="small text-muted mt-2">Day {x.day} of {x.days} · baseline cost {x.baseline_per_day} min/day · {x.adherence_events} holds so far · {x.minutes_saved} min protected · {x.status}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ApiTab() {
  const keys = useApi<{ label: string; calls: number; quota: number; prefix: string }[]>('/developer/keys')
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('VS Code extension')
  const [answer, setAnswer] = useState<string>('')
  async function create() { const r = await api<{ key: string }>('/developer/keys', { body: { label } }); setKey(r.key); keys.reload() }
  async function test() {
    const res = await fetch('/api/v1/interrupt?category=social_like', { headers: { 'X-API-Key': key } })
    setAnswer(JSON.stringify(await res.json(), null, 2)); keys.reload()
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Attention Intelligence API" sub="Let other apps ask “is this a good moment to interrupt?” and respect your focus reservation.">
        <div className="flex gap-2"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Key label" /><button onClick={create} className="btn !py-2">Create key</button></div>
        {key && <p className="mt-3 bg-surface-2 p-3 small break-all">Your key (shown once): <span className="text-calm">{key}</span></p>}
        <ul className="mt-4 flex flex-col gap-1.5">{keys.data?.map((k) => <li key={k.prefix} className="small flex justify-between bg-surface-2 px-3 py-2"><span>{k.label}</span><span className="text-muted">{k.calls}/{k.quota} calls</span></li>)}</ul>
        {key && <button onClick={test} className="btn btn-calm mt-4 !py-2">Send a test request</button>}
        {answer && <pre className="mt-3 bg-bg p-3 small overflow-x-auto whitespace-pre-wrap">{answer}</pre>}
      </Panel>
      <Panel title="Integrate in 3 lines" sub="Drop-in SDK at sdk/parallel-sdk.js in the repo.">
        <pre className="bg-bg p-4 small overflow-x-auto whitespace-pre">{`import { Parallel } from './parallel-sdk.js'
const twin = new Parallel({ apiKey: 'pk_…', baseUrl: '${origin}' })
const { decision, reason } = await twin.shouldInterrupt('work_chat')
// decision: 'now' | 'defer' | 'digest'`}</pre>
        <p className="small text-muted mt-3">Every call is quota-limited, consent-checked and written to the audit chain.</p>
      </Panel>
    </div>
  )
}

function TeamTab() {
  const t = useApi<Team>('/team/health').data
  const caps = useApi<Caps>('/platform/capabilities').data
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {t && (
        <Panel title={`Team of ${t.members} · aggregate only`} sub={t.privacy}>
          <HourLine series={[{ name: 'Team focus quality', color: SERIES.calm, values: t.focus_by_hour, area: true }]} height={160} />
          <p className="mt-3">{t.interruptions_per_person_day} focus breaks and {t.meetings_per_person_day} meetings per person per day.</p>
          <p className="small text-calm mt-2">{t.suggestion}</p>
          <p className="small text-muted mt-2">Groups smaller than {t.k_min} are never shown.</p>
        </Panel>
      )}
      {caps && (
        <Panel title="What each platform allows" sub="The twin adapts to what the operating system really permits.">
          <ul className="flex flex-col gap-2">
            {Object.entries(caps).map(([k, c]) => (
              <li key={k} className="bg-surface-2 p-3">
                <p className="font-medium">{c.label} <span className="small text-muted">· read notifications: {String(c.read_notifications)} · suppress: {String(c.suppress_notifications)}</span></p>
                <p className="small text-muted">{c.how}. {c.limits}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

export default function Lab() {
  useSeo('Lab', 'Attention debt, co-focus rooms, habit experiments, developer API and team health.', '/app/lab', { noindex: true })
  const [tab, setTab] = useState('debt')
  return (
    <>
      <PageHead title="The Lab" crumbs="Lab" sub="Where the twin becomes a platform: experiments on yourself, focus with friends, and an API other apps can respect." />
      <div className="flex gap-1 overflow-x-auto no-scrollbar mb-4" role="tablist">
        {TABS.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}
            className={`shrink-0 px-4 py-2.5 flex items-center gap-2 ${tab === t.k ? 'bg-chaos text-field-ink' : 'bg-surface text-muted hover:text-ink'}`}><t.icon size={16} /> {t.label}</button>
        ))}
      </div>
      {tab === 'debt' && <DebtTab />}
      {tab === 'rooms' && <RoomsTab />}
      {tab === 'habits' && <HabitsTab />}
      {tab === 'api' && <ApiTab />}
      {tab === 'team' && <TeamTab />}
    </>
  )
}
