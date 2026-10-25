const BASE = import.meta.env.VITE_API_URL ?? ''

export function getToken() {
  try { return localStorage.getItem('parallel.token') } catch { return null }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem('parallel.token', t) : localStorage.removeItem('parallel.token') } catch { /* private mode */ }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const tok = getToken()
  if (tok) headers.Authorization = `Bearer ${tok}`
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? data.detail[0]?.msg : 'Something went wrong'
    throw Object.assign(new Error(msg), { status: res.status })
  }
  return res.json()
}

export type Sim = {
  category: string; label: string; app: string
  context: { hour: number; depth: number; minutes_in: number; fatigue: number; task: string }
  allow: { p_open: number; p_rabbit_hole: number; away_p50: number; away_if_rabbit: number; resume_p50: number
    cost_expected: number; cost_p10: number; cost_p50: number; cost_p90: number; histogram: number[] }
  delay: { cost_expected: number; n_holdouts: number; missed_risk: number }
  saved_minutes: number; recommendation: 'allow' | 'delay' | 'summarize' | 'ask'; why: string
  confidence: number; similar_events: number; factors: { factor: string; effect: number }[]
  chain_allow: { t: number; label: string; detail: string }[]
  chain_delay: { t: number; label: string; detail: string }[]
  rollouts: number
}

export const CATEGORIES: { key: string; label: string; app: string; text: string }[] = [
  { key: 'social_like', label: 'Social like', app: 'Instagram', text: 'Someone liked your post' },
  { key: 'video_reco', label: 'Video suggestion', app: 'YouTube', text: "New video: 'I coded for 24h straight'" },
  { key: 'social_dm', label: 'Direct message', app: 'Discord', text: 'Riya: bro did you see this' },
  { key: 'work_chat', label: 'Work chat', app: 'Slack', text: 'Can you review my PR when free?' },
  { key: 'news', label: 'News alert', app: 'X', text: 'Breaking: markets react to…' },
  { key: 'promo', label: 'Promotion', app: 'Amazon', text: 'FLASH SALE 70% off ends tonight' },
  { key: 'email', label: 'Email', app: 'Gmail', text: 'Newsletter: 10 productivity hacks' },
  { key: 'family', label: 'Family', app: 'WhatsApp', text: 'Mom: call me when free' },
  { key: 'calendar', label: 'Calendar', app: 'Calendar', text: 'Standup in 10 minutes' },
  { key: 'security', label: 'Security', app: 'Bank', text: 'New sign-in to your bank account' },
]

export function fmtHour(h: number) {
  h = ((h % 24) + 24) % 24
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`
}
