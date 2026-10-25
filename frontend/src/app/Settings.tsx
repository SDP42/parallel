import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Trash2, Upload } from 'lucide-react'
import { PageHead } from './AppShell'
import { Panel } from '@/components/charts'
import { LangSwitch } from '@/components/Brand'
import RoutineEditor, { EMPTY_PROFILE, type Profile } from '@/components/RoutineEditor'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { toast, useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

type Rule = { category: string; label: string; importance: number; mode: string }
type Prefs = { pause_learning: boolean; retention_days: number; platform: string }
const MODES = [
  { k: 'auto', label: 'Twin decides' },
  { k: 'always', label: 'Always' },
  { k: 'digest', label: 'Digest' },
  { k: 'never', label: 'Mute' },
]

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}

export default function Settings() {
  useSeo('Rules & privacy', 'Notification rules, attention budget, learning controls, export and deletion.', '/app/settings', { noindex: true })
  const { signOut } = useAuth()
  const nav = useNavigate()
  const rules = useApi<Rule[]>('/rules')
  const prof = useApi<{ declared: boolean; profile: Profile; note: string }>('/me/profile')
  const [routine, setRoutine] = useState<Profile>(EMPTY_PROFILE)
  const [savingRoutine, setSavingRoutine] = useState(false)
  useEffect(() => { if (prof.data) setRoutine(prof.data.profile) }, [prof.data])
  async function saveRoutine() {
    setSavingRoutine(true)
    try { await api('/me/profile', { method: 'PUT', body: routine }); toast('Routine saved. Your twin re-learned your day.') }
    catch (e) { toast((e as Error).message, 'chaos') } finally { setSavingRoutine(false) }
  }
  const prefs = useApi<Prefs>('/me/settings')
  const budget = useApi<{ daily_min: number }>('/budget')
  const [p, setP] = useState<Prefs | null>(null)
  const [daily, setDaily] = useState(45)
  const [confirm, setConfirm] = useState('')
  useEffect(() => { if (prefs.data) setP(prefs.data) }, [prefs.data])
  useEffect(() => { if (budget.data) setDaily(budget.data.daily_min) }, [budget.data])

  async function setRule(category: string, mode: string) {
    const r = await api<Rule[]>('/rules', { method: 'PUT', body: { category, mode } }); rules.setData(r)
  }
  async function savePrefs(next: Prefs) { setP(next); await api('/me/settings', { method: 'PUT', body: next }); toast('Saved') }
  async function saveBudget() { await api('/budget', { method: 'PUT', body: { daily_min: daily } }); toast('Budget updated') }
  async function importProfile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    try { const r = await api<{ imported_rules: number }>('/profile/portable', { body: JSON.parse(await f.text()) }); toast(`Imported ${r.imported_rules} rules`); rules.reload() }
    catch (ex) { toast((ex as Error).message, 'chaos') }
  }
  async function del() { await api('/me', { method: 'DELETE' }); signOut(); nav('/') }

  return (
    <>
      <PageHead title="Rules & privacy" crumbs="Settings" sub="Your rules always beat the model. Your data is yours to export, move or delete." />
      <Panel className="mb-3" title="Your routine" sub={prof.data?.note ?? 'Wake and bed time, weekly schedule, deadlines and which apps are tools.'}
        action={<button onClick={saveRoutine} disabled={savingRoutine} className="btn btn-calm !py-2">{savingRoutine ? 'Saving…' : 'Save routine'}</button>}>
        <RoutineEditor value={routine} onChange={setRoutine} />
        <p className="mt-6 small text-muted border-l-2 border-chaos pl-3">Honest note: until real activity arrives, your first days of history are generated from this routine. They follow your schedule but are not observed behaviour. Connect ActivityWatch (desktop) to replace them with real data.</p>
      </Panel>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Notification rules" sub="“Always” bypasses holds and experiments. “Twin decides” uses your personal model, and asks when unsure.">
          <ul className="flex flex-col gap-1.5">
            {rules.data?.map((r) => (
              <li key={r.category} className="flex flex-wrap items-center justify-between gap-3 bg-surface-2 px-4 py-3">
                <span>{r.label} <span className="small text-muted">· importance {Math.round(r.importance * 100)}</span></span>
                <div className="flex" role="radiogroup" aria-label={`${r.label} rule`}>
                  {MODES.map((m) => (
                    <button key={m.k} role="radio" aria-checked={r.mode === m.k} onClick={() => setRule(r.category, m.k)}
                      className={`px-3 py-1.5 small ${r.mode === m.k ? (m.k === 'always' ? 'bg-calm text-field-ink' : m.k === 'never' ? 'bg-chaos text-field-ink' : 'bg-ink text-field-ink') : 'bg-bg text-muted hover:text-ink'}`}>{m.label}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="xl:col-span-5 flex flex-col gap-3">
          <Panel title="Attention budget" sub="Interruption minutes per day you’re happy to spend.">
            <div className="flex items-center gap-3">
              <input type="range" min={10} max={180} step={5} value={daily} onChange={(e) => setDaily(+e.target.value)} className="flex-1 accent-[var(--color-calm)]" aria-label="Daily budget minutes" />
              <span className="tabular-nums w-16">{daily} min</span>
              <button onClick={saveBudget} className="btn !py-1.5 !px-3 small">Save</button>
            </div>
          </Panel>
          {p && (
            <Panel title="Learning & retention">
              <label className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-3 cursor-pointer">
                <span>Pause learning<br /><span className="small text-muted">New events are dropped until you resume.</span></span>
                <input type="checkbox" checked={p.pause_learning} onChange={(e) => savePrefs({ ...p, pause_learning: e.target.checked })} className="w-5 h-5 accent-[var(--color-chaos)]" />
              </label>
              <label className="mt-2 flex items-center justify-between gap-3 bg-surface-2 px-4 py-3">
                <span>Keep raw events for</span>
                <select className="input !w-auto !py-1.5" value={p.retention_days} onChange={(e) => savePrefs({ ...p, retention_days: +e.target.value })}>{[7, 14, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
              </label>
              <label className="mt-2 flex items-center justify-between gap-3 bg-surface-2 px-4 py-3">
                <span>Main device</span>
                <select className="input !w-auto !py-1.5" value={p.platform} onChange={(e) => savePrefs({ ...p, platform: e.target.value })}>{['web', 'android', 'ios', 'macos', 'windows'].map((d) => <option key={d} value={d}>{d}</option>)}</select>
              </label>
              <div className="mt-2 flex items-center justify-between bg-surface-2 px-4 py-3"><span>Language</span><LangSwitch /></div>
            </Panel>
          )}
          <Panel title="Your data vault">
            <div className="flex flex-wrap gap-2">
              <button onClick={async () => download('parallel-export.json', await api('/me/export'))} className="btn btn-ghost !py-2"><Download size={16} /> Export everything</button>
              <button onClick={async () => download('attention-profile.json', await api('/profile/portable'))} className="btn btn-ghost !py-2"><Download size={16} /> Portable profile</button>
              <label className="btn btn-ghost !py-2 cursor-pointer"><Upload size={16} /> Import profile<input type="file" accept="application/json" className="sr-only" onChange={importProfile} /></label>
            </div>
            <p className="small text-muted mt-3">The portable profile holds your focus windows, traits and rules (no raw events), so other tools can respect them.</p>
          </Panel>
          <Panel title="Delete account" sub="Removes your account, history, predictions and conversations immediately. Audit entries keep only anonymous hashes. This can’t be undone.">
            <div className="flex gap-2">
              <input className="input" placeholder='Type "delete" to confirm' value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm deletion" />
              <button onClick={del} disabled={confirm !== 'delete'} className="btn !py-2 disabled:opacity-40"><Trash2 size={16} /> Delete</button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
