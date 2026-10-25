import { PageHead } from './AppShell'
import { HBars, Heatmap, HourLine, Panel, SERIES, Stat } from '@/components/charts'
import { fmtHour } from '@/lib/api'
import { useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

type FP = { heatmap: number[][]; hourly: number[]; fatigue_curve: (number | null)[]; best_window: { start: number; end: number; quality: number }; fatigue_onset: number; avg_session_min: number; focus_hours_per_day: number; interruptions_per_day: number; notifications_per_day: number; traits: Record<string, number> }
type App = { app: string; minutes_per_day: number; opens_per_day: number; focus_breaks_per_day: number; rabbit_rate: number; avg_cost_min: number; fragmentation: number }
type Arch = { name: string; description: string; days: string[]; focus_min: number; distraction_min: number; quality: number; switches: number; fatigue: number }
type Exp = { policy: string; method: string; arms: { category: string; label: string; n_allow: number; n_delay: number; ate_min: number; ci_low: number; ci_high: number; significant: boolean }[] }

export default function Fingerprint() {
  useSeo('Attention fingerprint', 'When you focus best, what fragments it, and what kinds of days you have.', '/app/fingerprint', { noindex: true })
  const fp = useApi<FP>('/attention/profile')
  const ov = useApi<{ apps: App[] }>('/twin/overview')
  const arch = useApi<Arch[]>('/twin/archetypes')
  const exp = useApi<Exp>('/experiments')
  const f = fp.data
  const appList = ov.data?.apps ?? []
  if (!f) return <p className="text-muted" role="status">Reading your fingerprint…</p>
  const maxCi = Math.max(...(exp.data?.arms.map((a) => a.ci_high) ?? [1]), 1)

  return (
    <>
      <PageHead title="Attention fingerprint" crumbs="Fingerprint" sub="How your attention behaves, learned from your own history. Every number has a hover with the evidence behind it." />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Golden hours" value={`${fmtHour(f.best_window.start).replace(':00', '')}–${fmtHour(f.best_window.end).replace(':00', '')}`} tone="calm" />
        <Stat label="Fatigue onset" value={fmtHour(f.fatigue_onset).replace(':00', '')} />
        <Stat label="Median focus block" value={`${f.avg_session_min} min`} />
        <Stat label="Focus breaks a day" value={f.interruptions_per_day} tone="chaos" />
        <Stat label="Notifications a day" value={f.notifications_per_day} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="Focus quality heatmap" sub="Weekday × hour. Brighter = better focus. Hover any cell.">
          <Heatmap data={f.heatmap} label="Focus quality by weekday and hour" />
        </Panel>
        <Panel className="xl:col-span-4" title="Your six traits" sub="0–100, relative to a healthy baseline, not to other people.">
          <ul className="flex flex-col gap-3.5">
            {Object.entries(f.traits).map(([k, v]) => (
              <li key={k}>
                <p className="flex justify-between small"><span>{k}</span><span className="tabular-nums">{Math.round(v * 100)}</span></p>
                <div className="mt-1 h-2.5 bg-surface-2 rounded-full overflow-hidden"><div className="h-full rounded-full bg-calm" style={{ width: `${v * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel title="Focus and fatigue through the day" sub="Average across your history.">
          <HourLine series={[{ name: 'Focus quality', color: SERIES.calm, values: f.hourly, area: true }, { name: 'Fatigue', color: SERIES.chaos, values: f.fatigue_curve }]} />
        </Panel>
        <Panel title="Which apps fragment you" sub="Fragmentation = focus breaks a day × average cost of each break." className="scroll-mt-20">
          <div id="apps" />
          <HBars rows={appList.filter((a) => a.focus_breaks_per_day > 0).slice(0, 7).map((a) => ({ label: a.app, value: a.fragmentation, sub: `${a.focus_breaks_per_day} breaks/day · ${a.avg_cost_min} min each · ${Math.round(a.rabbit_rate * 100)}% rabbit holes` }))} />
        </Panel>
      </div>

      <Panel className="mt-3" title="Your day archetypes" sub="KMeans clustering of your days on focus time, distraction time, quality, switches and fatigue.">
        <div className="grid md:grid-cols-3 gap-2">
          {arch.data?.map((a, i) => (
            <div key={a.name} className={`p-5 ${i === 0 ? 'bg-calm text-field-ink' : i === 2 ? 'bg-chaos text-field-ink' : 'bg-surface-2'}`}>
              <p className="text-2xl font-semibold">{a.name}</p>
              <p className="small mt-1 opacity-90">{a.description}</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 small">
                <div><dt className="opacity-75">Days like this</dt><dd className="text-lg font-semibold">{a.days.length}</dd></div>
                <div><dt className="opacity-75">Focus</dt><dd className="text-lg font-semibold">{Math.round(a.focus_min / 60 * 10) / 10} h</dd></div>
                <div><dt className="opacity-75">Distracted</dt><dd className="text-lg font-semibold">{Math.round(a.distraction_min)} min</dd></div>
                <div><dt className="opacity-75">Escapes</dt><dd className="text-lg font-semibold">{a.switches}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </Panel>

      {exp.data && (
        <Panel className="mt-3" title="What actually causes lost focus" sub={`${exp.data.policy} ${exp.data.method}.`}>
          <ul className="flex flex-col gap-3">
            {exp.data.arms.map((a) => (
              <li key={a.category} className="grid grid-cols-[130px_1fr_110px] items-center gap-3">
                <span className="small">{a.label}</span>
                <div className="relative h-5" aria-label={`${a.label}: ${a.ate_min} minutes, 95% CI ${a.ci_low} to ${a.ci_high}`}>
                  <div className="absolute top-1/2 h-px w-full bg-surface-2" />
                  <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full" style={{ left: `${Math.max(0, a.ci_low) / maxCi * 100}%`, width: `${(a.ci_high - Math.max(0, a.ci_low)) / maxCi * 100}%`, background: a.significant ? SERIES.chaos : 'var(--color-muted)' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-ink border-2 border-surface" style={{ left: `${Math.max(0, a.ate_min) / maxCi * 100}%` }} />
                </div>
                <span className="small text-right tabular-nums">+{a.ate_min} min <span className="text-muted">({a.n_delay} holdouts)</span></span>
              </li>
            ))}
          </ul>
          <p className="small text-muted mt-4">Each row: extra focus-minutes lost when that kind of ping is shown instead of held, with a 95% bootstrap confidence interval. Orange intervals exclude zero.</p>
        </Panel>
      )}
    </>
  )
}
