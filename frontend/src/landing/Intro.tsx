import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ForkMark } from '@/components/Brand'
import { INTRO_CUT, seg, smooth, story } from './scroll'
import VelText from './VelText'

/**
 * The opening chapter: the particle brain floats in the dark (TwinWorld draws it). Scrolling
 * dollies the camera through it; the flash at INTRO_CUT hides the cut to the twin's head, and
 * the camera pulls back out of it into the hero. This section only carries the copy, the load
 * indicator and the scroll length; the camera is keyed off `story.intro` in TwinWorld's Rig.
 */
export default function Intro() {
  const copy = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const pct = useRef<HTMLSpanElement>(null)
  const status = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let ready = false
    let last = -1
    const start = performance.now()
    const tick = () => {
      const out = smooth(seg(story.intro, 0.015, 0.14))
      const c = copy.current
      if (c) {
        c.style.opacity = String(1 - out)
        c.style.transform = out > 0.001 ? `translate3d(0, ${-out * 7}vh, 0) scale(${1 + out * 0.12})` : 'none'
        c.style.filter = out > 0.01 ? `blur(${(out * 10).toFixed(2)}px)` : 'none'
        c.style.visibility = out >= 1 ? 'hidden' : 'visible'
      }
      const p = Math.round(story.load * 100)
      if (p !== last) {
        last = p
        if (pct.current) pct.current.textContent = `${p}%`
        if (bar.current) bar.current.style.transform = `scaleX(${story.load})`
      }
      // never hold the scroll cue back for long, even if WebGL is slow or unavailable
      if (!ready && (story.load >= 1 || performance.now() - start > 4500)) {
        ready = true
        status.current?.setAttribute('data-ready', '1')
      }
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return (
    <section id="intro" data-shape="1" data-cut={INTRO_CUT} className="relative h-[200vh]" aria-labelledby="intro-title"
      onClick={() => { story.burst++ }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div ref={copy} className="absolute inset-x-0 bottom-0 px-4 pb-[7svh] flex flex-col items-center text-center">
          <p className="small uppercase tracking-[0.34em] text-muted flex items-center gap-3">
            <ForkMark size={18} className="text-ink" /> Parallel
          </p>
          <p id="intro-title" className="mt-4 font-semibold tracking-[-0.045em] leading-[0.98]" style={{ fontSize: 'clamp(2.4rem, 4.4vw, 4.6rem)' }}>
            <span className="block sm:inline"><VelText text="Every thought" /></span> <span className="block sm:inline text-calm"><VelText text="has a twin." /></span>
          </p>
          <div ref={status} className="intro-status mt-7 relative h-16 w-60" data-ready="0">
            <div className="intro-load absolute inset-0 flex flex-col items-center gap-2.5" role="status">
              <span className="small text-muted">Waking the brain <span ref={pct} className="tabular-nums text-ink">0%</span></span>
              <span className="block w-32 h-px bg-white/15 overflow-hidden"><span ref={bar} className="block h-full bg-calm origin-left" style={{ transform: 'scaleX(0)' }} /></span>
            </div>
            <a href="#twin" className="intro-cue absolute inset-0 flex flex-col items-center gap-2.5 small text-muted hover:text-ink">
              Scroll to dive in
              <span className="cue-line" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

/** The whiteout as the camera passes through the brain (a dark crossfade with reduced motion). */
export function IntroFlash() {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let last = ''
    const tick = () => {
      const f = story.intro >= 1 ? 0 : story.reduced ? Math.min(1, story.flash * 1.6) : story.flash
      const v = f < 0.004 ? '0' : f.toFixed(3)
      if (v === last || !el.current) return
      last = v
      el.current.style.opacity = v
      el.current.style.visibility = v === '0' ? 'hidden' : 'visible'
      el.current.dataset.reduced = story.reduced ? '1' : '0'
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return <div ref={el} className="intro-flash fixed inset-0 z-[35] pointer-events-none" style={{ opacity: 0, visibility: 'hidden' }} aria-hidden />
}
