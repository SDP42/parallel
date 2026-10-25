import { api } from '@/lib/api'

/** The live demo twin, fetched once and shared by every landing chapter that shows it. */
export type PersonaSnap = {
  best_window: { start: number; end: number }
  fatigue_onset: number
  notifications_per_day: number
  breaker: { app: string; avg_cost_min: number } | null
  traits?: Record<string, number>
}

let inflight: Promise<PersonaSnap> | null = null
export function getPersona(): Promise<PersonaSnap> {
  if (!inflight) inflight = api<PersonaSnap>('/demo/persona/developer').catch((e) => { inflight = null; throw e })
  return inflight
}
