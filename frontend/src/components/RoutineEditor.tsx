import { useEffect, useState } from 'react'
import { CalendarPlus, Moon, Plus, Sun, Sunrise, Trash2 } from 'lucide-react'
import { api, fmtHour } from '@/lib/api'

export type Block = { day: number; start: number; end: number; kind: string; label: string }
export type Deadline = { title: string; due: string; kind: string }
export type Profile = { wake: number; bed: number; chronotype: 'morning' | 'neutral' | 'evening'; blocks: Block[]; deadlines: Deadline[]; tools: string[]; nags: string[] }

export const EMPTY_PROFILE: Profile = { wake: 7.5, bed: 23.5, chronotype: 'neutral', blocks: [], deadlines: [], tools: [], nags: [] }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const KINDS = ['class', 'lab', 'exam', 'work', 'meeting', 'study', 'gym', 'commute', 'other']
const APPS = ['VS Code', 'Notion', 'Docs', 'Figma', 'Excel', 'Terminal', 'GitHub', 'Slack', 'Teams', 'Gmail', 'WhatsApp', 'Instagram', 'YouTube', 'Discord', 'X', 'LinkedIn', 'Reddit', 'Netflix', 'Spotify', 'Amazon']

type Section = 'day' | 'schedule' | 'deadlines' | 'apps'

const hourOptions = Array.from({ length: 48 }, (_, i) => i / 2)

function TimeSelect({ value, onChange, label, min = 0, max = 24 }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number }) {
  return (
    <label className="flex flex-col gap-1 small text-muted">{label}
      <select className="input !py-2" value={value} onChange={(e) => onChange(+e.target.value)}>
        {hourOptions.filter((h) => h >= min && h <= max).map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
      </select>
    </label>
  )
}

export function DaySection({ p, set }: { p: Profile; set: (p: Profile) => void }) {
  const chrono = [
    { k: 'morning', label: 'Morning person', icon: Sunrise, d: 'Sharpest before lunch' },
    { k: 'neutral', label: 'Somewhere between', icon: Sun, d: 'Steady through the day' },
    { k: 'evening', label: 'Night owl', icon: Moon, d: 'Comes alive after dark' },
  ] as const
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <TimeSelect label="I usually wake up at" value={p.wake} min={4} max={12} onChange={(wake) => set({ ...p, wake })} />
        <TimeSelect label="I usually sleep at" value={p.bed >= 24 ? p.bed - 24 : p.bed} min={0} max={23.5} onChange={(bed) => set({ ...p, bed: bed < 6 ? bed + 24 : bed })} />
      </div>
      <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Chronotype">
        {chrono.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={p.chronotype === c.k} onClick={() => set({ ...p, chronotype: c.k })}
            className={`fork-cut p-4 text-left transition-colors ${p.chronotype === c.k ? 'bg-chaos text-field-ink' : 'bg-surface-2 hover:bg-bg'}`}>
            <c.icon size={22} aria-hidden /><span className="block mt-2 font-semibold">{c.label}</span><span className={`small ${p.chronotype === c.k ? '' : 'text-muted'}`}>{c.d}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ScheduleSection({ p, set }: { p: Profile; set: (p: Profile) => void }) {
  const [templates, setTemplates] = useState<Record<string, { label: string; blocks: Block[] }>>({})
  const [day, setDay] = useState(0)
  const [draft, setDraft] = useState<Block>({ day: 0, start: 9, end: 11, kind: 'class', label: 'Lecture' })
  useEffect(() => { api<Record<string, { label: string; blocks: Block[] }>>('/routine/templates').then(setTemplates).catch(() => setTemplates({})) }, [])
  const dayBlocks = p.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.day === day).sort((a, b) => a.b.start - b.b.start)
  const add = () => { if (draft.end > draft.start) set({ ...p, blocks: [...p.blocks, { ...draft, day }] }) }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="small text-muted mb-2">Start from a template</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(templates).map(([k, t]) => (
            <button key={k} type="button" onClick={() => set({ ...p, blocks: t.blocks })} className="px-3 py-2 small bg-surface-2 hover:bg-bg">{t.label}</button>
          ))}
          {p.blocks.length > 0 && <button type="button" onClick={() => set({ ...p, blocks: [] })} className="px-3 py-2 small text-muted hover:text-chaos">Clear all</button>}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Day">
        {DAYS.map((d, i) => {
          const n = p.blocks.filter((b) => b.day === i).length
          return (
            <button key={d} type="button" role="tab" aria-selected={day === i} onClick={() => setDay(i)}
              className={`shrink-0 px-3 py-2 small ${day === i ? 'bg-ink text-field-ink' : 'bg-surface-2 text-muted hover:text-ink'}`}>{d}{n ? ` · ${n}` : ''}</button>
          )
        })}
      </div>
      {/* day strip */}
      <div className="relative h-10 bg-bg" aria-hidden>
        {dayBlocks.map(({ b, i }) => (
          <div key={i} className={`absolute top-1 bottom-1 ${['class', 'lab', 'exam', 'meeting'].includes(b.kind) ? 'bg-chaos/80' : 'bg-calm/80'} text-field-ink text-[11px] px-1 overflow-hidden whitespace-nowrap`}
            style={{ left: `${((b.start - 6) / 18) * 100}%`, width: `${((b.end - b.start) / 18) * 100}%` }}>{b.label}</div>
        ))}
        <div className="absolute -bottom-5 inset-x-0 flex justify-between text-[11px] text-muted"><span>6 AM</span><span>noon</span><span>6 PM</span><span>midnight</span></div>
      </div>
      <ul className="mt-4 flex flex-col gap-1.5">
        {dayBlocks.length === 0 && <li className="small text-muted">Nothing on {DAYS[day]} yet.</li>}
        {dayBlocks.map(({ b, i }) => (
          <li key={i} className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2 small">
            <span><span className="font-medium">{b.label}</span> <span className="text-muted">· {b.kind} · {fmtHour(b.start)}–{fmtHour(b.end)}</span></span>
            <button type="button" aria-label={`Remove ${b.label}`} onClick={() => set({ ...p, blocks: p.blocks.filter((_, j) => j !== i) })} className="text-muted hover:text-chaos"><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
        <label className="flex flex-col gap-1 small text-muted col-span-2 sm:col-span-1">Label<input className="input !py-2" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
        <label className="flex flex-col gap-1 small text-muted">Type
          <select className="input !py-2" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        </label>
        <TimeSelect label="From" value={draft.start} min={5} max={23.5} onChange={(start) => setDraft({ ...draft, start })} />
        <TimeSelect label="To" value={draft.end} min={5.5} max={24} onChange={(end) => setDraft({ ...draft, end })} />
        <button type="button" onClick={add} className="btn btn-calm !py-2 justify-center col-span-2 sm:col-span-1"><Plus size={16} /> Add to {DAYS[day]}</button>
      </div>
    </div>
  )
}

export function DeadlineSection({ p, set }: { p: Profile; set: (p: Profile) => void }) {
  const [d, setD] = useState<Deadline>({ title: '', due: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), kind: 'exam' })
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {p.deadlines.length === 0 && <li className="small text-muted">No deadlines yet. Add your next exam or submission.</li>}
        {p.deadlines.map((x, i) => {
          const left = Math.round((new Date(x.due).getTime() - Date.now()) / 864e5)
          return (
            <li key={i} className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2 small">
              <span><span className="font-medium">{x.title}</span> <span className="text-muted">· {x.kind} · {x.due} · {left >= 0 ? `${left} days left` : 'past'}</span></span>
              <button type="button" aria-label={`Remove ${x.title}`} onClick={() => set({ ...p, deadlines: p.deadlines.filter((_, j) => j !== i) })} className="text-muted hover:text-chaos"><Trash2 size={16} /></button>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <label className="flex flex-col gap-1 small text-muted col-span-2">What<input className="input !py-2" placeholder="e.g. DBMS mid-sem" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="flex flex-col gap-1 small text-muted">When<input type="date" className="input !py-2" value={d.due} onChange={(e) => setD({ ...d, due: e.target.value })} /></label>
        <button type="button" disabled={!d.title.trim()} onClick={() => { set({ ...p, deadlines: [...p.deadlines, d] }); setD({ ...d, title: '' }) }} className="btn btn-calm !py-2 justify-center"><CalendarPlus size={16} /> Add</button>
      </div>
      <div className="flex gap-2 small">{['exam', 'deadline', 'interview'].map((k) => <button key={k} type="button" onClick={() => setD({ ...d, kind: k })} className={`px-3 py-1.5 ${d.kind === k ? 'bg-ink text-field-ink' : 'bg-surface-2 text-muted'}`}>{k}</button>)}</div>
    </div>
  )
}

export function AppsSection({ p, set }: { p: Profile; set: (p: Profile) => void }) {
  const [custom, setCustom] = useState('')
  const all = Array.from(new Set([...APPS, ...p.tools, ...p.nags]))
  const cycle = (a: string) => {
    if (p.tools.includes(a)) set({ ...p, tools: p.tools.filter((x) => x !== a), nags: [...p.nags, a] })
    else if (p.nags.includes(a)) set({ ...p, nags: p.nags.filter((x) => x !== a) })
    else set({ ...p, tools: [...p.tools, a] })
  }
  return (
    <div>
      <p className="small text-muted">Tap once: <span className="text-calm">tool</span> · twice: <span className="text-chaos">nags me</span> · three times: neutral.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {all.map((a) => {
          const role = p.tools.includes(a) ? 'tool' : p.nags.includes(a) ? 'nag' : 'none'
          return (
            <button key={a} type="button" onClick={() => cycle(a)} aria-label={`${a}: ${role === 'tool' ? 'tool' : role === 'nag' ? 'nags me' : 'neutral'}`}
              className={`px-3 py-2 small font-medium transition-colors ${role === 'tool' ? 'bg-calm text-field-ink' : role === 'nag' ? 'bg-chaos text-field-ink' : 'bg-surface-2 text-muted hover:text-ink'}`}>
              {a}{role === 'tool' ? ' · tool' : role === 'nag' ? ' · nags' : ''}
            </button>
          )
        })}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { set({ ...p, tools: [...p.tools, custom.trim()] }); setCustom('') } }}>
        <input className="input !py-2 max-w-xs" placeholder="Another app" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Add another app" />
        <button className="btn btn-ghost !py-2">Add</button>
      </form>
    </div>
  )
}

export default function RoutineEditor({ value, onChange, sections = ['day', 'schedule', 'deadlines', 'apps'] }: { value: Profile; onChange: (p: Profile) => void; sections?: Section[] }) {
  const titles: Record<Section, string> = { day: 'Your day', schedule: 'Weekly schedule', deadlines: 'Deadlines & exams', apps: 'Tools vs nags' }
  return (
    <div className="flex flex-col gap-8">
      {sections.map((s) => (
        <section key={s}>
          <h3 className="text-lg !tracking-tight mb-3">{titles[s]}</h3>
          {s === 'day' && <DaySection p={value} set={onChange} />}
          {s === 'schedule' && <ScheduleSection p={value} set={onChange} />}
          {s === 'deadlines' && <DeadlineSection p={value} set={onChange} />}
          {s === 'apps' && <AppsSection p={value} set={onChange} />}
        </section>
      ))}
    </div>
  )
}
