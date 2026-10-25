import { useEffect, useRef, type RefObject } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * A tiny shared store between the DOM scroll story and the WebGL scene.
 * `morph` is the target shape index (0..5, fractional while morphing); the scene
 * eases towards it every frame and writes the eased value back into `m`.
 */
export const story = {
  morph: 0,
  m: 0, // eased morph, owned by the scene
  chapter: 0,
  progress: 0, // progress inside the current chapter, 0..1
  notif: 0, // 0..1 how visible the 3D notification card is
  velocity: 0, // smoothed scroll velocity, roughly -1..1
  pan: 0, // fork camera: -1 orange branch, +1 mint branch
  panW: 0, // 0..1 how strongly the fork pan applies
  pointer: { x: 0, y: 0 },
  pointerActive: 0, // 1 while the pointer moves, decays to 0
  reduced: false,
}

export const isReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One clock for everything: Lenis is driven by gsap.ticker, ScrollTrigger is
 * updated from Lenis, and the scroll velocity is exposed to the scene.
 */
export function useSmoothScroll() {
  useEffect(() => {
    const reduce = isReduced()
    story.reduced = reduce
    let lenis: Lenis | null = null
    let lastY = window.scrollY
    if (!reduce) {
      lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9, anchors: { offset: 0 } })
      lenis.on('scroll', ScrollTrigger.update)
    }
    const raf = (t: number) => {
      if (lenis) lenis.raf(t * 1000)
      const y = window.scrollY
      const raw = lenis ? lenis.velocity : y - lastY
      lastY = y
      const v = reduce ? 0 : Math.max(-1, Math.min(1, raw / 45))
      story.velocity += (v - story.velocity) * 0.12
      story.pointerActive *= 0.965
      document.documentElement.style.setProperty('--vel', story.velocity.toFixed(3))
    }
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    const onPointer = (e: PointerEvent) => {
      story.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      story.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
      if (e.pointerType === 'mouse') story.pointerActive = 1
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    return () => {
      gsap.ticker.remove(raf)
      lenis?.destroy()
      window.removeEventListener('pointermove', onPointer)
      document.documentElement.style.removeProperty('--vel')
    }
  }, [])
}

/**
 * Chapters: each DOM section carries `data-shape` (the 3D form it shows) and
 * optionally `data-notif`. While a section scrolls through, the scene holds its
 * shape for the first `data-hold` of it and morphs towards the next section's shape after.
 */
export function useStoryDriver() {
  useEffect(() => {
    let secs: HTMLElement[] = []
    const collect = () => { secs = Array.from(document.querySelectorAll<HTMLElement>('[data-shape]')) }
    collect()
    window.addEventListener('resize', collect)
    const tick = () => {
      if (!secs.length || !secs[0].isConnected) collect()
      const vh = window.innerHeight
      for (let i = 0; i < secs.length; i++) {
        const r = secs[i].getBoundingClientRect()
        if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) {
          const span = Math.max(r.height - vh * 0.5, 1)
          const p = Math.min(1, Math.max(0, (vh * 0.5 - r.top) / span))
          const here = Number(secs[i].dataset.shape)
          const next = i + 1 < secs.length ? Number(secs[i + 1].dataset.shape) : here
          const hold = Number(secs[i].dataset.hold ?? 0.55)
          const t = p < hold ? 0 : (p - hold) / (1 - hold)
          const ease = t * t * (3 - 2 * t)
          story.morph = here + (next - here) * ease
          story.chapter = i
          story.progress = p
          story.notif = secs[i].dataset.notif ? Math.min(1, p * 6, (1 - p) * 8) : 0
          break
        }
      }
    }
    gsap.ticker.add(tick)
    return () => { gsap.ticker.remove(tick); window.removeEventListener('resize', collect) }
  }, [])
}

/**
 * Scroll-scrubbed progress (0..1) of a tall section while its sticky stage is pinned.
 * Calls `onProgress` from the shared ticker, without React re-renders. The value is
 * also written to the element as the CSS variable `--p`.
 */
export function useScrub<T extends HTMLElement>(onProgress?: (p: number, el: T) => void): RefObject<T | null> {
  const ref = useRef<T>(null)
  const cb = useRef(onProgress)
  cb.current = onProgress
  useEffect(() => {
    let last = -1
    const tick = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.bottom < -200 || r.top > window.innerHeight + 200) {
        // off-screen: settle at the nearest end once, then idle
        const v = r.top > 0 ? 0 : 1
        if (v === last) return
        last = v
        el.style.setProperty('--p', String(v))
        cb.current?.(v, el)
        return
      }
      const span = Math.max(r.height - window.innerHeight, 1)
      const v = Math.min(1, Math.max(0, -r.top / span))
      if (Math.abs(v - last) < 0.0005) return
      last = v
      el.style.setProperty('--p', v.toFixed(4))
      cb.current?.(v, el)
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return ref
}

/** Adds `is-in` to the element the first time it enters the viewport (for masked reveals). */
export function useInView<T extends HTMLElement>(margin = '-10% 0px'): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect() } }), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [margin])
  return ref
}

/** Map progress p into a 0..1 window [a, b]. */
export const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)))
export const smooth = (t: number) => t * t * (3 - 2 * t)
