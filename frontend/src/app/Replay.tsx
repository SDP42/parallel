import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { PageHead } from './AppShell'
import { Panel } from '@/components/charts'
import { fmtHour } from '@/lib/api'
import { useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

type Seg = { start: number; end: number; app: string; kind: string; task: string; quality: number }
type N = { id: string; hour: number; label?: string; category: string; app: string; action: string; opened: boolean; rabbit: boolean; cost_min: number; followed_app: string | null; task: string }
type Day = { day: string; days: string[]; segments: Seg[]; notifications: N[] }

const KIND: Record<string, { label: string; cls: string }> = {
  focus: { label: 'Focus', cls: 'bg-[var(--color-chart-calm)]' },
  recovering: { label: 'Recovering', cls: 'bg-[color-mix(in_oklab,var(--color-chart-calm)_45%,var(--color-surface-2))]' },
  distraction: { label: 'Distracted', cls: 'bg-chaos' },
  meeting: { label: 'Meeting', cls: 'bg-ink' },
  break: { label: 'Break', cls: 'bg-[#6b6d72]' },
}
const FROM = 7, TO = 24.5

export default function Replay() {
  useSeo('Attention replay', 'Replay any day minute by minute: focus blocks, interruptions and recovery.', '/app/replay', { noindex: true })
  const [day, setDay] = useState<string | null>(null)
  const r = useApi<Day>(`/attention/timeline${day ? `?day=${day}` : ''}`, [day])
  const [t, setT] = useState(9)
  const [playing, setPlaying] = useState(false)
  const raf = useRef<number>(0)

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (now: number) => {
      setT((v) => { const n = v + ((now - last) / 1000) * 0.6; if (n >= TO) { setPlaying(false); return TO } return n })
      last = now
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing])

  const d = r.data
  const pct = (h: number) => ((h - FROM) / (TO - FROM)) * 100
  const current = d?.segments.find((s) => s.start <= t && s.end > t)
  const recent = useMemo(() => (d?.notifications ?? []).filter((n) => n.hour <= t).slice(-5).reverse(), [d, t])
  const totals = useMemo(() => {
    const out: Record<string, number> = {}
    d?.segments.filter((s) => s.start < t).forEach((s) => { out[s.kind] = (out[s.kind] ?? 0) + (Math.min(s.end, t) - s.start) * 60 })
    return out
  }, [d, t])

  return (
    <>
      <PageHead title="Attention replay" crumbs="Replay" sub="Scrub through a day to see how single pings turned into lost blocks, and how long recovery took."
        action={d && (
          <label className="small text-muted flex items-center gap-2">Day
            <select className="input !py-2 !w-auto" value={day ?? d.day} onChange={(e) => setDay(e.target.value)}>
              {d.days.slice(0, -1).reverse().map((x) => <option key={x} value={x}>{new Date(x).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}
            </select>
          </label>
        )} />
      {!d && <p className="text-muted">Loading day…</p>}
      {d && (
        <>
          <Panel title={new Date(d.day).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} sub="Ticks above the strip are notifications: orange = opened, mint = held back, grey = ignored.">
            <div className="relative pt-6">
              {d.notifications.map((n) => (
                <span key={n.id} title={`${fmtHour(n.hour)} · ${n.app} · ${n.action === 'delay' ? 'held back' : n.opened ? `opened, cost ${n.cost_min} min` : 'ignored'}`}
                  className={`absolute top-0 w-[3px] h-4 rounded-full ${n.action === 'delay' ? 'bg-calm' : n.opened ? 'bg-chaos' : 'bg-muted'}`} style={{ left: `${pct(n.hour)}%` }} />
              ))}
              <div className="relative h-14 bg-bg overflow-hidden">
                {d.segments.map((s, i) => (
                  <div key={i} className={`absolute top-0 bottom-0 ${KIND[s.kind]?.cls ?? 'bg-surface-2'}`} style={{ left: `${pct(s.start)}%`, width: `${Math.max(0.15, pct(s.end) - pct(s.start))}%`, borderRight: '2px solid var(--color-bg)' }}
                    title={`${fmtHour(s.start)}–${fmtHour(s.end)} · ${s.app} · ${KIND[s.kind]?.label ?? s.kind}`} />
                ))}
                <div className="absolute top-0 bottom-0 w-[2px] bg-ink" style={{ left: `${pct(t)}%` }} aria-hidden />
              </div>
              <div className="flex justify-between small text-muted mt-1">{[8, 11, 14, 17, 20, 23].map((h) => <span key={h}>{fmtHour(h).replace(':00', '')}</span>)}</div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button onClick={() => { if (t >= TO) setT(FROM); setPlaying(!playing) }} className="btn !py-2" aria-label={playing ? 'Pause replay' : 'Play replay'}>{playing ? <Pause size={18} /> : <Play size={18} />} {playing ? 'Pause' : 'Play day'}</button>
              <input type="range" min={FROM} max={TO} step={0.01} value={t} onChange={(e) => { setPlaying(false); setT(+e.target.value) }} className="flex-1 accent-[var(--color-chaos)]" aria-label="Scrub time" />
              <span className="tabular-nums w-20 text-right">{fmtHour(t)}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 small text-muted">{Object.entries(KIND).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className={`w-3 h-3 ${v.cls}`} />{v.label}</span>)}</div>
          </Panel>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Panel title="At this moment">
              {current ? (
                <>
                  <p className="text-3xl font-semibold">{KIND[current.kind]?.label}</p>
                  <p className="text-muted mt-1">{current.app} · {current.task}</p>
                  <p className="small text-muted mt-3">Focus quality {Math.round(current.quality * 100)} · block {fmtHour(current.start)}–{fmtHour(current.end)}</p>
                </>
              ) : <p className="text-muted">Away from the screen.</p>}
            </Panel>
            <Panel title="So far today">
              <ul className="flex flex-col gap-2">
                {Object.entries(KIND).map(([k, v]) => (
                  <li key={k} className="flex justify-between"><span className="flex items-center gap-2"><span className={`w-3 h-3 ${v.cls}`} />{v.label}</span><span className="tabular-nums">{Math.round(totals[k] ?? 0)} min</span></li>
                ))}
              </ul>
            </Panel>
            <Panel title="Latest pings">
              <ul className="flex flex-col gap-2">
                {recent.length === 0 && <li className="text-muted small">No notifications yet.</li>}
                {recent.map((n) => (
                  <li key={n.id} className="bg-surface-2 p-2.5 small">
                    <span className="text-muted tabular-nums">{fmtHour(n.hour)}</span> · {n.app} · {n.action === 'delay' ? <span className="text-calm">held back</span> : n.opened ? <span className="text-chaos">opened{n.rabbit ? ', rabbit hole' : ''} · {n.cost_min} min</span> : 'ignored'}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </>
  )
}
