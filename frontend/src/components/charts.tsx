/**
 * Small chart kit (SVG + HTML). Rules from the dataviz skill: thin marks, rounded data ends,
 * recessive axes, one y-axis, a hover tooltip on every mark, text in ink (never series colour),
 * sequential = one hue, and a table view for screen readers.
 */
import { useId, useRef, useState, type ReactNode } from 'react'
import { fmtHour } from '@/lib/api'

export const SERIES = { chaos: 'var(--color-chart-chaos)', calm: 'var(--color-chart-calm)' }

type Tip = { x: number; y: number; body: ReactNode } | null

function useTip() {
  const [tip, setTip] = useState<Tip>(null)
  const ref = useRef<HTMLDivElement>(null)
  const show = (e: React.PointerEvent | React.FocusEvent, body: ReactNode) => {
    const box = ref.current!.getBoundingClientRect()
    const src = 'clientX' in e ? { x: e.clientX, y: e.clientY } : (() => { const r = (e.target as Element).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top } })()
    setTip({ x: src.x - box.left, y: src.y - box.top, body })
  }
  const node = tip && (
    <div role="tooltip" className="pointer-events-none absolute z-20 bg-bg text-ink small px-3 py-2 shadow-xl border border-surface-2 whitespace-nowrap"
      style={{ left: Math.min(tip.x + 12, (ref.current?.clientWidth ?? 300) - 160), top: tip.y - 44 }}>
      {tip.body}
    </div>
  )
  return { ref, show, hide: () => setTip(null), node }
}

/** Sequential single-hue heatmap: weekday × hour. */
export function Heatmap({ data, label }: { data: number[][]; label: string }) {
  const tip = useTip()
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const max = Math.max(...data.flat(), 0.01)
  const hours = Array.from({ length: 18 }, (_, i) => i + 6)
  const color = (v: number) => (v <= 0 ? 'var(--color-surface-2)' : `color-mix(in oklab, var(--color-calm) ${Math.round(12 + (v / max) * 88)}%, var(--color-surface-2))`)
  return (
    <figure ref={tip.ref} className="relative" aria-label={label}>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `36px repeat(${hours.length}, minmax(0, 1fr))` }}>
        {days.map((d, wd) => (
          <div key={d} className="contents">
            <span className="small text-muted self-center">{d}</span>
            {hours.map((h) => {
              const v = data[wd][h]
              return (
                <button key={h} aria-label={`${d} ${fmtHour(h)}: focus quality ${Math.round(v * 100)}`}
                  onPointerMove={(e) => tip.show(e, <><strong className="text-ink">{Math.round(v * 100)}</strong> <span className="text-muted">focus quality · {d} {fmtHour(h)}</span></>)}
                  onFocus={(e) => tip.show(e, <><strong>{Math.round(v * 100)}</strong> <span className="text-muted">{d} {fmtHour(h)}</span></>)}
                  onPointerLeave={tip.hide} onBlur={tip.hide}
                  className="h-6 sm:h-7 rounded-[3px] hover:ring-2 hover:ring-ink focus:ring-2 focus:ring-ink outline-none" style={{ background: color(v) }} />
              )
            })}
          </div>
        ))}
        <span />
        {hours.map((h) => <span key={h} className="text-[11px] text-muted text-center">{h % 3 === 0 ? (h % 12 || 12) + (h < 12 ? 'a' : 'p') : ''}</span>)}
      </div>
      <figcaption className="mt-3 flex items-center gap-2 small text-muted">
        Low <span className="h-2 w-28 rounded-full" style={{ background: 'linear-gradient(90deg, var(--color-surface-2), var(--color-calm))' }} /> High focus quality
      </figcaption>
      {tip.node}
    </figure>
  )
}

/** Line/area chart over hours with a crosshair tooltip listing every series. */
export function HourLine({ series, height = 180, from = 6, to = 24, yLabel = '' }: {
  series: { name: string; color: string; values: (number | null)[]; area?: boolean }[]; height?: number; from?: number; to?: number; yLabel?: string
}) {
  const tip = useTip()
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = 600, H = height, pad = { l: 30, r: 10, t: 10, b: 22 }
  const n = to - from
  const max = Math.max(...series.flatMap((s) => s.values.slice(from, to).map((v) => v ?? 0)), 0.01)
  const x = (h: number) => pad.l + ((h - from) / (n - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b)
  const path = (vals: (number | null)[]) => {
    let d = ''
    for (let h = from; h < to; h++) { const v = vals[h]; if (v == null) continue; d += `${d ? 'L' : 'M'}${x(h).toFixed(1)},${y(v).toFixed(1)}` }
    return d
  }
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    const h = Math.round(from + ((e.clientX - r.left) / r.width) * (n - 1))
    setHover(h)
    tip.show(e, <div className="flex flex-col gap-0.5"><span className="text-muted">{fmtHour(h)}</span>{series.map((s) => (
      <span key={s.name} className="flex items-center gap-2"><span className="inline-block w-3 h-[2px]" style={{ background: s.color }} /><strong>{s.values[h] == null ? '–' : Math.round((s.values[h] as number) * 100)}</strong> {s.name}</span>
    ))}</div>)
  }
  return (
    <figure ref={tip.ref} className="relative">
      {series.length > 1 && (
        <div className="flex gap-4 small text-muted mb-2">{series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="w-4 h-[2px]" style={{ background: s.color }} />{s.name}</span>)}</div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${series.map((s) => s.name).join(' and ')} by hour`}>
        <defs>{series.map((s, i) => <linearGradient key={i} id={`${id}-g${i}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity="0.28" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
        {[0, 0.5, 1].map((t) => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t * max)} y2={y(t * max)} stroke="var(--color-surface-2)" strokeWidth="1" /><text x={pad.l - 6} y={y(t * max) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{Math.round(t * max * 100)}</text></g>)}
        {Array.from({ length: n }, (_, i) => from + i).filter((h) => h % 3 === 0).map((h) => <text key={h} x={x(h)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{fmtHour(h).replace(':00', '')}</text>)}
        {series.map((s, i) => s.area && <path key={`a${i}`} d={`${path(s.values)}L${x(to - 1)},${y(0)}L${x(from)},${y(0)}Z`} fill={`url(#${id}-g${i})`} />)}
        {series.map((s, i) => <path key={i} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-muted)" strokeWidth="1" strokeDasharray="3 3" />}
        {hover != null && series.map((s, i) => s.values[hover] != null && <circle key={i} cx={x(hover)} cy={y(s.values[hover] as number)} r="4.5" fill={s.color} stroke="var(--color-surface)" strokeWidth="2" />)}
        <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} fill="transparent" onPointerMove={onMove} onPointerLeave={() => { setHover(null); tip.hide() }} />
      </svg>
      {yLabel && <figcaption className="small text-muted">{yLabel}</figcaption>}
      <table className="sr-only"><caption>{series.map((s) => s.name).join(', ')}</caption><tbody>{Array.from({ length: n }, (_, i) => from + i).map((h) => <tr key={h}><th>{fmtHour(h)}</th>{series.map((s) => <td key={s.name}>{s.values[h] == null ? '' : Math.round((s.values[h] as number) * 100)}</td>)}</tr>)}</tbody></table>
      {tip.node}
    </figure>
  )
}

/** Column histogram (e.g. distribution of simulated focus cost). */
export function Histogram({ bins, binWidth, color = SERIES.chaos, unit = 'min', marks = [] }: { bins: number[]; binWidth: number; color?: string; unit?: string; marks?: { at: number; label: string }[] }) {
  const tip = useTip()
  const total = bins.reduce((a, b) => a + b, 0) || 1
  const max = Math.max(...bins, 1)
  const span = bins.length * binWidth
  return (
    <figure ref={tip.ref} className="relative">
      <div className="relative flex items-end gap-[2px] h-32">
        {bins.map((b, i) => (
          <div key={i} className="flex-1 h-full flex items-end" onPointerMove={(e) => tip.show(e, <><strong>{Math.round((b / total) * 100)}%</strong> <span className="text-muted">of futures cost {i * binWidth}–{(i + 1) * binWidth} {unit}</span></>)} onPointerLeave={tip.hide}>
            <div className="w-full rounded-t-[4px] hover:opacity-80" style={{ height: `${Math.max(b ? 3 : 0, (b / max) * 100)}%`, background: color }} />
          </div>
        ))}
        {marks.map((m) => (
          <div key={m.label} className="absolute top-0 bottom-0 border-l border-dashed border-ink/70" style={{ left: `${Math.min(99, (m.at / span) * 100)}%` }}>
            <span className="absolute -top-5 -translate-x-1/2 small text-ink whitespace-nowrap">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between small text-muted mt-1"><span>0 {unit}</span><span>{span / 2}</span><span>{span}+ {unit}</span></div>
      {tip.node}
    </figure>
  )
}

/** Horizontal bars with direct value labels. */
export function HBars({ rows, color = SERIES.chaos, unit = '' }: { rows: { label: string; value: number; sub?: string }[]; color?: string; unit?: string }) {
  const tip = useTip()
  const max = Math.max(...rows.map((r) => r.value), 0.01)
  return (
    <figure ref={tip.ref} className="relative flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(110px,150px)_1fr_56px] items-center gap-3" onPointerMove={(e) => tip.show(e, <><strong>{r.value}{unit}</strong> <span className="text-muted">{r.label}{r.sub ? ` · ${r.sub}` : ''}</span></>)} onPointerLeave={tip.hide}>
          <span className="small truncate">{r.label}</span>
          <div className="h-3 bg-surface-2 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></div>
          <span className="small text-right tabular-nums">{r.value}{unit}</span>
        </div>
      ))}
      {tip.node}
    </figure>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'chaos' | 'calm' }) {
  return (
    <div className="panel p-5">
      <p className="small text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${tone === 'chaos' ? 'text-chaos' : tone === 'calm' ? 'text-calm' : ''}`}>{value}</p>
      {sub && <p className="small text-muted mt-1">{sub}</p>}
    </div>
  )
}

export function Panel({ title, sub, action, children, className = '' }: { title: string; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl !tracking-tight">{title}</h2>
          {sub && <p className="small text-muted mt-1">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
