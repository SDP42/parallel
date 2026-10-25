/**
 * Parallel SDK — ask a user's attention twin whether now is a good moment to interrupt.
 *
 *   import { Parallel } from './parallel-sdk.js'
 *   const twin = new Parallel({ apiKey: 'pk_…', baseUrl: 'http://localhost:5173' })
 *   const { decision, reason, deliver_after } = await twin.shouldInterrupt('work_chat')
 *   if (decision === 'now') notify(); else queueUntil(deliver_after)
 *
 * decision: 'now' | 'defer' | 'digest'. Categories: social_like, social_dm, video_reco, work_chat,
 * email, calendar, family, promo, news, security.
 */
export class Parallel {
  constructor({ apiKey, baseUrl = 'http://127.0.0.1:8787' }) {
    if (!apiKey) throw new Error('Parallel: apiKey is required')
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async shouldInterrupt(category) {
    const res = await fetch(`${this.baseUrl}/api/v1/interrupt?category=${encodeURIComponent(category)}`, {
      headers: { 'X-API-Key': this.apiKey },
    })
    if (res.status === 429) return { decision: 'now', reason: 'Quota exceeded; failing open so nothing important is lost.' }
    if (!res.ok) throw new Error(`Parallel: ${res.status} ${await res.text()}`)
    return res.json()
  }
}
