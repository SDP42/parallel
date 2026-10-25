import { Database, FlaskConical, Users } from 'lucide-react'
import { PageHead } from './AppShell'
import { HBars, Panel, SERIES, Stat } from '@/components/charts'
import { useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

type Clf = { model: string; auc: number; brier: number; log_loss: number }
type Metrics = {
  version: string; trained_at: string; train_seconds: number
  split: { train_users: number; test_users: number; method: string }
  dataset: { rows: number; columns: number; users: number; days: number; exploration_rate: number }
  open: { models: Clf[]; calibration: { predicted: number; observed: number; n: number }[]; n_test: number }
  rabbit: { models: Clf[] }
  cost: { mae_p50: number; mae_baseline_category_median: number; interval_coverage_p10_p90: number; mean_interval_width: number }
  counterfactual: { method: string; by_category: { category: string; t_learner_effect: number; randomized_diff_in_means: number; n_hold: number }[]; mean_abs_gap_vs_randomized: number; policy: string; share_held: number }
  open_feature_importance: { feature: string; importance: number }[]
}
type Dataset = { rows: number; columns: string[]; users: number; sessions: number; date_from: string; date_to: string; by_persona: { persona: string; users: number; events: number; open_rate: number; rabbit_rate: number; avg_cost: number }[]; sample: Record<string, string | number | null>[]; app_users_with_history: number; app_live_events: number; note: string }
type Reg = { version: string; created: string; status: string; rows_train: number; rows_test: number; auc_open: number; mae_cost: number }[]
type Compare = { population: number; metrics: { key: string; label: string; you: number; population_median: number; percentile: number }[] }

const SAMPLE_COLS = ['ts', 'persona', 'category', 'task', 'fatigue', 'recent_switches_15m', 'environment', 'policy_action', 'opened', 'rabbit_hole', 'cost_min']

export default function Models() {
  useSeo('Data & models', 'The dataset, the trained models, their accuracy on unseen users and how you compare.', '/app/models', { noindex: true })
  const m = useApi<Metrics>('/ml/model')
  const ds = useApi<Dataset>('/ml/dataset?sample=10')
  const reg = useApi<Reg>('/ml/registry')
  const cmp = useApi<Compare>('/population/compare')
  const x = m.data
  const best = x?.open.models[x.open.models.length - 1]

  return (
    <>
      <PageHead title="Data & models" crumbs="Data & models" sub="What the twin learned from, how it was trained, and how well it predicts people it has never seen." />
      {(m.error || ds.error) && <p className="panel p-5 text-chaos">{m.error || ds.error}</p>}

      {ds.data && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Notification events" value={ds.data.rows.toLocaleString()} sub={`${ds.data.columns.length} columns`} />
          <Stat label="App sessions" value={ds.data.sessions.toLocaleString()} />
          <Stat label="Population users" value={ds.data.users} sub={`${ds.data.date_from} → ${ds.data.date_to}`} />
          <Stat label="App accounts with history" value={ds.data.app_users_with_history} sub={`${ds.data.app_live_events} live events recorded`} tone="calm" />
          <Stat label="Randomized holdouts" value={x ? `${Math.round(x.dataset.exploration_rate * 100)}%` : '…'} sub="what makes counterfactuals possible" />
        </div>
      )}

      {x && best && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Panel title="Will they open it?" sub={`AUC on ${x.split.test_users} unseen users (higher is better).`}>
            <HBars rows={x.open.models.map((r) => ({ label: r.model.replace(' (calibrated)', ''), value: r.auc, sub: `Brier ${r.brier}` }))} color={SERIES.calm} />
            <p className="small text-muted mt-3">Calibrated gradient boosting beats the category-rate prior by {Math.round((best.auc - x.open.models[0].auc) * 100)} AUC points.</p>
          </Panel>
          <Panel title="Will it become a rabbit hole?" sub="Same split, opened pings only.">
            <HBars rows={x.rabbit.models.map((r) => ({ label: r.model.replace(' (calibrated)', ''), value: r.auc, sub: `Brier ${r.brier}` }))} color={SERIES.chaos} />
          </Panel>
          <Panel title="How many minutes will it cost?" sub="Quantile regression (p10 / p50 / p90).">
            <dl className="grid grid-cols-2 gap-3">
              <div className="bg-surface-2 p-3"><dt className="small text-muted">Median error</dt><dd className="text-2xl font-semibold">{x.cost.mae_p50} min</dd><dd className="small text-muted">baseline {x.cost.mae_baseline_category_median}</dd></div>
              <div className="bg-surface-2 p-3"><dt className="small text-muted">Range coverage</dt><dd className="text-2xl font-semibold text-calm">{Math.round(x.cost.interval_coverage_p10_p90 * 100)}%</dd><dd className="small text-muted">target ≈ 80%</dd></div>
            </dl>
          </Panel>
        </div>
      )}

      {x && (
        <div className="mt-3 grid gap-3 lg:grid-cols-12">
          <Panel className="lg:col-span-7" title="Counterfactual check" sub={`${x.counterfactual.method}, validated against randomized holdouts. Mean gap: ${x.counterfactual.mean_abs_gap_vs_randomized} min.`}>
            <div className="overflow-x-auto">
              <table className="w-full small">
                <thead className="text-muted text-left"><tr><th className="py-2 pr-3 font-normal">Notification</th><th className="font-normal">Model effect</th><th className="font-normal">Randomized truth</th><th className="font-normal">Holdouts</th></tr></thead>
                <tbody>{x.counterfactual.by_category.map((r) => (
                  <tr key={r.category} className="border-t border-surface-2"><td className="py-2 pr-3">{r.category.replace('_', ' ')}</td><td className="tabular-nums">+{r.t_learner_effect} min</td><td className="tabular-nums">+{r.randomized_diff_in_means} min</td><td className="tabular-nums text-muted">{r.n_hold}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>
          <Panel className="lg:col-span-5" title="What drives opening" sub="Permutation importance on unseen users.">
            <HBars rows={x.open_feature_importance.slice(0, 8).map((f) => ({ label: f.feature.replace(/_/g, ' '), value: +(f.importance * 100).toFixed(1) }))} color={SERIES.calm} />
          </Panel>
        </div>
      )}

      {cmp.data && (
        <Panel className="mt-3" title={`You vs ${cmp.data.population} people`} sub="Your percentile within the population dataset. 50 means right in the middle.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {cmp.data.metrics.map((r) => (
              <div key={r.key} className="bg-surface-2 p-4">
                <p className="small text-muted">{r.label}</p>
                <p className="text-3xl font-semibold tabular-nums">{r.percentile}<span className="text-base text-muted font-normal">th pct</span></p>
                <div className="mt-2 relative h-2 bg-bg rounded-full"><div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-chaos border-2 border-surface" style={{ left: `calc(${r.percentile}% - 6px)` }} /></div>
                <p className="small text-muted mt-2">You {r.key.includes('rate') ? `${Math.round(r.you * 100)}%` : r.you} · median {r.key.includes('rate') ? `${Math.round(r.population_median * 100)}%` : r.population_median}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {ds.data && (
        <Panel className="mt-3" title="A peek at the data" sub={ds.data.note}>
          <div className="overflow-x-auto">
            <table className="w-full small whitespace-nowrap">
              <thead className="text-muted text-left"><tr>{SAMPLE_COLS.map((c) => <th key={c} className="py-2 pr-4 font-normal">{c}</th>)}</tr></thead>
              <tbody>{ds.data.sample.map((r, i) => <tr key={i} className="border-t border-surface-2">{SAMPLE_COLS.map((c) => <td key={c} className="py-2 pr-4 tabular-nums">{String(r[c] ?? '')}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {ds.data.by_persona.map((p) => (
              <div key={p.persona} className="bg-surface-2 p-3 small"><p className="font-medium capitalize text-base">{p.persona}</p><p className="text-muted">{p.users} users · {p.events.toLocaleString()} events</p><p>Opens {Math.round(p.open_rate * 100)}% · rabbit holes {Math.round(p.rabbit_rate * 100)}% · {p.avg_cost} min/ping</p></div>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="mt-3" title="Model registry" sub="Every training run is versioned. The active model serves cold-start predictions for new users.">
        <ul className="flex flex-col gap-2">
          {reg.data?.map((r) => (
            <li key={r.version} className="bg-surface-2 px-4 py-3 flex flex-wrap items-center justify-between gap-3 small">
              <span className="flex items-center gap-2 font-medium"><FlaskConical size={16} className="text-calm" /> {r.version}</span>
              <span className="text-muted">{r.created.replace('T', ' ')} · train {r.rows_train.toLocaleString()} · test {r.rows_test.toLocaleString()}</span>
              <span>AUC {r.auc_open} · MAE {r.mae_cost} min</span>
              <span className={`px-2 py-0.5 ${r.status === 'active' ? 'bg-calm text-field-ink' : 'bg-bg text-muted'}`}>{r.status}</span>
            </li>
          ))}
        </ul>
        <p className="small text-muted mt-3 flex items-center gap-2"><Database size={14} /> Retrain any time: <code className="text-ink">python -m ml.train</code> · <Users size={14} /> regenerate data: <code className="text-ink">python -m ml.dataset --users 60 --days 30</code></p>
      </Panel>
    </>
  )
}
