import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { BatteryFull, BatteryLow, BatteryMedium, Clock, Sparkles, ThumbsDown, ThumbsUp, Users } from 'lucide-react'
import { Panel, SERIES } from '@/components/charts'
import { api, CATEGORIES } from '@/lib/api'
import { toast, useApi } from '@/lib/hooks'
import { isNative, scheduleCheckReminders } from '@/lib/native'

type Knowledge = { score: number; next: string; data_source: string; parts: { key: string; label: string; got: boolean }[] }
type Moments = { pending: number; moments: { at: string; hour: number; reason: string }[] }
type Matter = { category: string; label: string; generic: number; learned: number | null }[]
type Machine = { days: number; keep: number[]; follow: number[]; extra_focus_hours: number; headline: string; equivalent: string; actions: string[]; caveat: string }
type Dopp = { match: { handle: string; persona: string; chronotype: string; occupation: string }; similarity: number; what_worked: { label: string; saved_per_hold: number }[]; line: string }

const ENERGY = [
  { v: 1, label: 'Empty', icon: BatteryLow }, { v: 2, label: 'Low', icon: BatteryLow }, { v: 3, label: 'Okay', icon: BatteryMedium },
  { v: 4, label: 'Good', icon: BatteryFull }, { v: 5, label: 'Peak', icon: BatteryFull },
]

export function EnergyCheckin({ onDone }: { onDone?: () => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  async function pick(v: number) {
    setPicked(v)
    const r = await api<{ message: string }>('/checkins', { body: { energy: v } })
    setMsg(r.message); onDone?.()
  }
  return (
    <Panel title="10-second check-in" sub="How’s your energy right now? It beats any behavioural guess for the next 3 hours.">
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Energy">
        {ENERGY.map((e) => (
          <motion.button key={e.v} whileTap={{ scale: 0.92 }} role="radio" aria-checked={picked === e.v} onClick={() => pick(e.v)}
            className={`flex flex-col items-center gap-1 py-3 small transition-colors ${picked === e.v ? (e.v <= 2 ? 'bg-chaos text-field-ink' : 'bg-calm text-field-ink') : 'bg-surface-2 hover:bg-bg'}`}>
            <e.icon size={20} aria-hidden /> {e.label}
          </motion.button>
        ))}
      </div>
      {msg && <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 small">{msg}</motion.p>}
    </Panel>
  )
}

export function DidItMatter() {
  const m = useApi<Matter>('/feedback/matter')
  const [done, setDone] = useState<Record<string, boolean>>({})
  const recent = ['social_like', 'work_chat', 'email', 'social_dm', 'news'].map((k) => CATEGORIES.find((c) => c.key === k)!)
  async function tap(cat: string, mattered: boolean) {
    const r = await api<{ generic: number; learned: number }>('/feedback/matter', { body: { category: cat, mattered } })
    setDone((d) => ({ ...d, [cat]: mattered }))
    toast(`Importance ${Math.round(r.generic * 100)} → ${Math.round(r.learned * 100)}. Your twin listened.`)
    m.reload()
  }
  return (
    <Panel title="Did this matter?" sub="Your taps replace the generic importance of each alert type.">
      <ul className="flex flex-col gap-1.5">
        {recent.map((c) => {
          const row = m.data?.find((x) => x.category === c.key)
          const imp = row?.learned ?? row?.generic
          return (
            <li key={c.key} className="flex items-center gap-3 bg-surface-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="small font-medium truncate">{c.app} · {c.text}</p>
                <p className="text-[12px] text-muted">importance {imp != null ? Math.round(imp * 100) : '–'}{row?.learned != null ? ' (learned from you)' : ' (generic)'}</p>
              </div>
              <button aria-label={`${c.label} mattered`} onClick={() => tap(c.key, true)} className={`p-2 ${done[c.key] === true ? 'bg-calm text-field-ink' : 'hover:text-calm'}`}><ThumbsUp size={16} /></button>
              <button aria-label={`${c.label} did not matter`} onClick={() => tap(c.key, false)} className={`p-2 ${done[c.key] === false ? 'bg-chaos text-field-ink' : 'hover:text-chaos'}`}><ThumbsDown size={16} /></button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export function KnowledgeMeter({ k }: { k: Knowledge | null }) {
  const r = 46, C = 2 * Math.PI * r
  return (
    <Panel title="How well your twin knows you" sub={k ? `Data: ${k.data_source}` : ''}>
      {k && (
        <div className="flex gap-5 items-center">
          <svg viewBox="0 0 110 110" className="w-28 h-28 shrink-0" role="img" aria-label={`${k.score} out of 100`}>
            <circle cx="55" cy="55" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="9" />
            <motion.circle cx="55" cy="55" r={r} fill="none" stroke={SERIES.calm} strokeWidth="9" strokeLinecap="round" transform="rotate(-90 55 55)"
              initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - k.score / 100) }} strokeDasharray={C} transition={{ duration: 1.2 }} />
            <text x="55" y="61" textAnchor="middle" fontSize="26" fontWeight="600" fill="var(--color-ink)">{k.score}</text>
          </svg>
          <div className="min-w-0">
            <p className="small text-muted">Add next</p>
            <p className="font-medium">{k.next}</p>
            <ul className="mt-2 flex flex-wrap gap-1">
              {k.parts.map((p) => <li key={p.key} className={`text-[12px] px-2 py-0.5 ${p.got ? 'bg-calm/20 text-calm' : 'bg-surface-2 text-muted'}`}>{p.label}</li>)}
            </ul>
          </div>
        </div>
      )}
      <Link to="/app/settings" className="mt-4 inline-block small underline text-muted hover:text-ink">Edit routine & schedule</Link>
    </Panel>
  )
}

export function CheckMoments() {
  const m = useApi<Moments>('/check-moments')
  return (
    <Panel title="Best moments to check held pings" sub={m.data ? `${m.data.pending} waiting in your queue` : ''}>
      <ol className="flex flex-col gap-2">
        {m.data?.moments.map((x, i) => (
          <li key={i} className={`flex items-center gap-3 px-3 py-2 ${i === 0 ? 'bg-calm text-field-ink' : 'bg-surface-2'}`}>
            <Clock size={16} aria-hidden /><span className="font-semibold tabular-nums w-20">{x.at}</span><span className="small">{x.reason}</span>
          </li>
        ))}
      </ol>
      {isNative() && m.data && (
        <button onClick={async () => toast((await scheduleCheckReminders(m.data!.moments)) ? 'Reminders set for these moments' : 'Notifications are off for Parallel', 'calm')}
          className="btn btn-calm !py-2 mt-3">Remind me at these moments</button>
      )}
    </Panel>
  )
}

export function TimeMachine() {
  const t = useApi<Machine>('/twin/timemachine')
  const d = t.data
  if (!d) return <Panel title="Time machine"><p className="small text-muted">Simulating two futures…</p></Panel>
  const W = 520, H = 170, max = Math.max(...d.follow, 1)
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${(i / (arr.length - 1)) * W},${H - (v / max) * (H - 10)}`).join('')
  return (
    <Panel title="Time machine" sub={d.caveat}>
      <p className="text-2xl font-semibold leading-tight">{d.headline}</p>
      <p className="small text-muted mt-1">{d.equivalent}</p>
      <div className="flex gap-4 small text-muted mt-4 mb-1"><span className="flex items-center gap-1.5"><span className="w-4 h-[2px]" style={{ background: SERIES.calm }} />Follow your twin</span><span className="flex items-center gap-1.5"><span className="w-4 h-[2px]" style={{ background: SERIES.chaos }} />Keep today’s habits</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cumulative deep-work hours over the next 30 days in both futures">
        <motion.path d={path(d.keep)} fill="none" stroke={SERIES.chaos} strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4 }} />
        <motion.path d={path(d.follow)} fill="none" stroke={SERIES.calm} strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6 }} />
      </svg>
      <div className="flex justify-between small text-muted"><span>Today</span><span>Day {d.days}</span></div>
      <ul className="mt-3 flex flex-col gap-1 small">{d.actions.map((a) => <li key={a} className="flex gap-2"><Sparkles size={14} className="text-calm shrink-0 mt-0.5" />{a}</li>)}</ul>
    </Panel>
  )
}

export function Doppelganger() {
  const d = useApi<Dopp>('/population/doppelganger').data
  return (
    <Panel title="Your attention doppelgänger" sub="The person in our 60-user population whose attention behaves most like yours.">
      {d ? (
        <>
          <div className="flex items-center gap-4">
            <span className="grid place-items-center w-14 h-14 rounded-full bg-chaos text-field-ink"><Users size={24} /></span>
            <div><p className="text-xl font-semibold">{d.match.handle}</p><p className="small text-muted capitalize">{d.match.chronotype}-type {d.match.occupation} · {d.similarity}% similar</p></div>
          </div>
          <p className="mt-3 small">{d.line}</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {d.what_worked.map((w) => <li key={w.label} className="flex justify-between bg-surface-2 px-3 py-2 small"><span>Held {w.label.toLowerCase()}s</span><span className="text-calm tabular-nums">−{w.saved_per_hold} min each</span></li>)}
          </ul>
        </>
      ) : <p className="small text-muted">Finding your match…</p>}
    </Panel>
  )
}
