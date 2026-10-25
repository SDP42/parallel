import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { PageHead } from './AppShell'
import { Panel, SERIES, Stat } from '@/components/charts'
import { useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

type Acc = { test_events: number; brier_twin: number; brier_generic: number; improvement: number; mae_twin: number; mae_generic: number; interval_coverage: number; calibration: { predicted: number; observed: number; n: number }[]; samples: { id: string; label: string; predicted: number; p10: number; p90: number; actual: number; hit: boolean }[] }
type Models = { model_version: string; trained_at: string; train_events: number; features: { feature: string; psi: number; status: string }[]; action: string; components: { name: string; kind: string }[] }
type DQ = { events: number; days: number; quality_score: number; issues: { kind: string; count: number; fix: string }[] }
type Audit = { chain_valid: boolean; total_entries: number; entries: { id: number; ts: number; kind: string; payload: string; hash: string }[] }
type Outcome = { id: number; category: string; cost_allow: number; cost_p10: number; cost_p90: number; actual_cost: number | null; choice: string | null }

function Calibration({ bins }: { bins: Acc['calibration'] }) {
  const S = 260, p = 30
  const xy = (v: number) => p + v * (S - 2 * p)
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[320px]" role="img" aria-label="Calibration: predicted probability against observed frequency">
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={xy(t)} x2={xy(t)} y1={p} y2={S - p} stroke="var(--color-surface-2)" /><line y1={S - xy(t)} y2={S - xy(t)} x1={p} x2={S - p} stroke="var(--color-surface-2)" /><text x={xy(t)} y={S - 10} fontSize="11" fill="var(--color-muted)" textAnchor="middle">{t * 100}%</text><text x={12} y={S - xy(t) + 4} fontSize="11" fill="var(--color-muted)">{t * 100}</text></g>)}
      <line x1={xy(0)} y1={S - xy(0)} x2={xy(1)} y2={S - xy(1)} stroke="var(--color-muted)" strokeDasharray="4 4" />
      <polyline fill="none" stroke={SERIES.calm} strokeWidth="2" points={bins.map((b) => `${xy(b.predicted)},${S - xy(b.observed)}`).join(' ')} />
      {bins.map((b) => <circle key={b.predicted} cx={xy(b.predicted)} cy={S - xy(b.observed)} r={4 + Math.sqrt(b.n) / 2} fill={SERIES.calm} stroke="var(--color-surface)" strokeWidth="2"><title>{`Predicted ${Math.round(b.predicted * 100)}%, observed ${Math.round(b.observed * 100)}% (n=${b.n})`}</title></circle>)}
    </svg>
  )
}

export default function Accuracy() {
  useSeo('Accuracy center', 'How well your twin predicts you: calibration, error versus a generic rule, drift and audit.', '/app/accuracy', { noindex: true })
  const acc = useApi<Acc>('/twin/accuracy')
  const models = useApi<Models>('/models')
  const dq = useApi<DQ>('/data-quality')
  const audit = useApi<Audit>('/audit')
  const mine = useApi<Outcome[]>('/outcomes')
  const a = acc.data
  const maxCost = Math.max(...(a?.samples.map((s) => Math.max(s.p90, s.actual)) ?? [1]), 1)

  return (
    <>
      <PageHead title="Accuracy center" crumbs="Accuracy" sub="A twin is only useful if it’s right. Here it is graded on the last 3 days it never saw during training, against a generic notification rule." />
      {!a && <p className="text-muted">Backtesting…</p>}
      {a && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Better than a generic rule" value={`${Math.round(a.improvement * 100)}%`} sub={`Brier ${a.brier_twin} vs ${a.brier_generic} (lower is better)`} tone="calm" />
            <Stat label="Typical error on focus cost" value={`${a.mae_twin} min`} sub={`generic rule: ${a.mae_generic} min`} />
            <Stat label="Actual inside predicted range" value={`${Math.round(a.interval_coverage * 100)}%`} sub="p10–p90 interval coverage" />
            <Stat label="Held-out events graded" value={a.test_events} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-12">
            <Panel className="lg:col-span-4" title="Calibration" sub="When the twin says 60%, it should happen about 60% of the time. Dashed line = perfect.">
              <Calibration bins={a.calibration} />
            </Panel>
            <Panel className="lg:col-span-8" title="Predicted range vs what happened" sub="Bars = the twin’s p10–p90 range for each held-out ping. Dot = actual minutes lost. Mint dots landed inside.">
              <ul className="flex flex-col gap-1.5 max-h-[340px] overflow-y-auto pr-2">
                {a.samples.slice(0, 24).map((s) => (
                  <li key={s.id} className="grid grid-cols-[120px_1fr_64px] items-center gap-3">
                    <span className="small truncate text-muted">{s.label}</span>
                    <div className="relative h-4">
                      <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-surface-2" style={{ left: `${(s.p10 / maxCost) * 100}%`, width: `${Math.max(1, ((s.p90 - s.p10) / maxCost) * 100)}%` }} />
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-surface" style={{ left: `${(s.actual / maxCost) * 100}%`, background: s.hit ? SERIES.calm : SERIES.chaos }} />
                    </div>
                    <span className="small tabular-nums text-right">{s.actual} min</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Panel title="Model registry & drift" sub={models.data ? `${models.data.model_version} · trained ${models.data.trained_at.replace('T', ' ')} on ${models.data.train_events} events` : ''}>
          <ul className="flex flex-col gap-2">
            {models.data?.features.map((f) => (
              <li key={f.feature} className="flex justify-between small"><span>{f.feature}</span><span className={f.status === 'stable' ? 'text-calm' : 'text-chaos'}>PSI {f.psi} · {f.status}</span></li>
            ))}
          </ul>
          <p className="small text-muted mt-3">Action: {models.data?.action}. Population Stability Index compares the last 3 days with earlier history.</p>
          <ul className="mt-4 flex flex-col gap-1 small text-muted">{models.data?.components.map((c) => <li key={c.name}><span className="text-ink">{c.name}</span> · {c.kind}</li>)}</ul>
        </Panel>
        <Panel title="Data quality" sub={dq.data ? `${dq.data.events.toLocaleString()} events across ${dq.data.days} days` : ''}>
          {dq.data && (
            <>
              <p className="text-4xl font-semibold text-calm">{Math.round(dq.data.quality_score * 100)}<span className="text-lg text-muted font-normal"> / 100</span></p>
              <ul className="mt-3 flex flex-col gap-2">
                {dq.data.issues.length === 0 && <li className="small text-muted">No issues found.</li>}
                {dq.data.issues.map((i) => <li key={i.kind} className="bg-surface-2 p-2.5 small"><span className="font-medium">{i.count}× {i.kind}</span><br /><span className="text-muted">{i.fix}</span></li>)}
              </ul>
            </>
          )}
        </Panel>
        <Panel title="Tamper-evident audit" sub="Every prediction, decision and consent change is hash-chained.">
          {audit.data && (
            <>
              <p className={`flex items-center gap-2 text-lg font-semibold ${audit.data.chain_valid ? 'text-calm' : 'text-chaos'}`}>{audit.data.chain_valid ? <ShieldCheck /> : <ShieldAlert />} Chain {audit.data.chain_valid ? 'verified' : 'broken'} · {audit.data.total_entries} entries</p>
              <ul className="mt-3 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                {audit.data.entries.slice(0, 12).map((e) => (
                  <li key={e.id} className="small bg-surface-2 px-2.5 py-1.5 flex justify-between gap-2"><span>{e.kind.replaceAll('_', ' ')}</span><span className="text-muted tabular-nums">{e.hash.slice(0, 10)}…</span></li>
                ))}
                {audit.data.entries.length === 0 && <li className="small text-muted">Run a fork in the Multiverse to create entries.</li>}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <Panel className="mt-3" title="Your predictions vs reality" sub="Every fork you ran, and what you reported afterwards.">
        {mine.data && mine.data.length === 0 && <p className="small text-muted">No forks yet. Your reality checks will appear here.</p>}
        <ul className="grid md:grid-cols-2 gap-2">
          {mine.data?.map((o) => (
            <li key={o.id} className="bg-surface-2 p-3 small flex justify-between gap-3">
              <span>#{o.id} · {o.category.replace('_', ' ')} · {o.choice ?? 'no choice'}</span>
              <span className="tabular-nums">predicted {o.cost_allow} min{o.actual_cost != null ? <> · actual {o.actual_cost} {o.actual_cost >= o.cost_p10 && o.actual_cost <= o.cost_p90 && <CheckCircle2 size={14} className="inline text-calm" />}</> : ''}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
