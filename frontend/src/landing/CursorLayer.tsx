import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { isReduced, story } from './scroll'
import { getPersona } from './persona'

const FALLBACK = { focus: 78, fatigue: 21, rabbit: 31 }
const INTERACTIVE = 'a, button, [role="radio"], select, input, textarea, summary, label[for]'

/**
 * Desktop only (fine pointer + hover):
 *  - an elastic follower ring that stretches with speed, gets pulled towards controls and
 *    morphs into the fork mark over them (skipped with reduced motion);
 *  - a HUD that follows the cursor over the twin's head with live values from the demo twin.
 */
export default function CursorLayer() {
  const [fine] = useState(() => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  const [reduced] = useState(() => isReduced())
  const [vals, setVals] = useState(FALLBACK)
  const root = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const hud = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!fine) return
    getPersona().then((s) => {
      const t = s.traits
      if (!t) return
      const pct = (x: number | undefined, d: number) => (typeof x === 'number' ? Math.round(x * 100) : d)
      setVals({
        focus: pct(t['Deep focus'], FALLBACK.focus),
        fatigue: typeof t['Fatigue resilience'] === 'number' ? Math.round((1 - t['Fatigue resilience']) * 100) : FALLBACK.fatigue,
        rabbit: pct(t['Rabbit-hole risk'], FALLBACK.rabbit),
      })
    }).catch(() => { /* keep the fallback */ })
  }, [fine])

  useEffect(() => {
    if (!fine) return
    const tgt = { x: -100, y: -100 }
    const pos = { x: -100, y: -100, vx: 0, vy: 0 }
    const hp = { x: -100, y: -100 }
    let over: Element | null = null
    let mode = ''
    let seen = false
    let hudA = 0
    let lastIn = ''
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      tgt.x = e.clientX; tgt.y = e.clientY
      if (!seen) { seen = true; pos.x = hp.x = tgt.x; pos.y = hp.y = tgt.y }
    }
    const onOver = (e: PointerEvent) => { over = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null }
    const onDown = () => root.current?.classList.add('is-down')
    const onUp = () => root.current?.classList.remove('is-down')
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerover', onOver, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })

    const tick = () => {
      const inside = seen && story.pointerIn
      // over the twin's head (hero only): show the HUD, the ring becomes a focus reticle
      const h = story.head
      const dx = (tgt.x - h.x) / Math.max(1, h.r), dy = (tgt.y - h.y) / Math.max(1, h.r * 1.35)
      const onHead = inside && !over && story.heroVis > 0.6 && dx * dx + dy * dy < 1
      const r = root.current
      if (r) {
        let tx = tgt.x, ty = tgt.y
        if (over && over.isConnected) {
          const b = over.getBoundingClientRect()
          tx += (b.left + b.width / 2 - tx) * 0.18
          ty += (b.top + b.height / 2 - ty) * 0.18
        }
        // slightly under-damped spring: it overshoots a little, so it feels elastic
        pos.vx = (pos.vx + (tx - pos.x) * 0.2) * 0.6
        pos.vy = (pos.vy + (ty - pos.y) * 0.2) * 0.6
        pos.x += pos.vx; pos.y += pos.vy
        const m = over ? 'fork' : onHead ? 'focus' : 'ring'
        if (m !== mode) { mode = m; r.dataset.mode = m }
        const vis = inside ? '1' : '0'
        if (vis !== lastIn) { lastIn = vis; r.style.opacity = vis }
        r.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`
        const sp = Math.hypot(pos.vx, pos.vy)
        if (ring.current) ring.current.style.transform = `rotate(${Math.atan2(pos.vy, pos.vx).toFixed(3)}rad) scale(${(1 + Math.min(sp / 28, 0.75)).toFixed(3)}, ${(1 - Math.min(sp / 70, 0.35)).toFixed(3)})`
      }
      const el = hud.current
      if (el) {
        hudA += ((onHead ? 1 : 0) - hudA) * 0.14
        const flip = tgt.x > window.innerWidth - 260
        const ox = flip ? -232 : 26, oy = 22
        const k = reduced ? 1 : 0.22
        hp.x += (tgt.x + ox - hp.x) * k
        hp.y += (tgt.y + oy - hp.y) * k
        el.style.opacity = hudA < 0.01 ? '0' : hudA.toFixed(3)
        el.style.transform = `translate3d(${hp.x.toFixed(1)}px, ${hp.y.toFixed(1)}px, 0)`
      }
    }
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', onOver)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [fine, reduced])

  if (!fine) return null
  return (
    <>
      {!reduced && (
        <div ref={root} className="cursor" data-mode="ring" style={{ opacity: 0 }} aria-hidden>
          <div className="cursor-ring"><div ref={ring} className="cursor-ring-in" /></div>
          <svg className="cursor-fork" viewBox="0 0 32 32">
            <path d="M3 16 H13" pathLength={1} stroke="var(--color-ink)" />
            <path d="M13 16 C18 16 19 7 29 7" pathLength={1} stroke="var(--color-chaos)" />
            <path d="M13 16 C18 16 19 25 29 25" pathLength={1} stroke="var(--color-calm)" />
            <circle cx="13" cy="16" r="2.6" fill="var(--color-ink)" />
          </svg>
        </div>
      )}
      <div ref={hud} className="twin-hud" style={{ opacity: 0 }} aria-hidden>
        <p className="flex items-center gap-2 whitespace-nowrap">
          <span className="twin-hud-dot" />
          <span>focus <b className="tabular-nums">{vals.focus}%</b></span>
          <span className="text-muted">·</span>
          <span>fatigue <b className="tabular-nums">{vals.fatigue}%</b></span>
        </p>
        <p className="mt-1 text-muted whitespace-nowrap">rabbit-hole risk {vals.rabbit}% · click to send a ping</p>
      </div>
    </>
  )
}
