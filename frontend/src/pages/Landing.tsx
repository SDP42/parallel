import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import gsap from 'gsap'
import { ArrowDown, ArrowRight, Bell, Brain, Clock, Flame, Layers, Plus, RefreshCcw, Smartphone, Zap } from 'lucide-react'
import { SiteFooter, SiteNav } from '@/components/SiteChrome'
import { ForkMark } from '@/components/Brand'
import Universes from '@/components/Universes'
import CountUp from '@/components/CountUp'
import Magnet from '@/components/Magnet'
import { api, CATEGORIES, fmtHour, type Sim } from '@/lib/api'
import { useSeo } from '@/lib/seo'
import { seg, smooth, story, useInView, useScrub, useSmoothScroll, useStoryDriver } from '@/landing/scroll'

const TwinWorld = lazy(() => import('@/landing/TwinWorld'))

const ease = [0.2, 0.8, 0.2, 1] as const
const glass = 'bg-[#111214]/70 backdrop-blur-md'
/** Readability panel on phones only (text sits over the 3D scene there); transparent on desktop. */
const phoneGlass = 'bg-[#111214]/70 backdrop-blur-md p-4 -mx-4 md:bg-transparent md:backdrop-blur-none md:p-0 md:mx-0'
/** Desktop: copy lives in the left ~40%, the 3D focal object on the right. */
const leftCol = 'md:max-w-[44vw] xl:max-w-[40vw]'
const H2 = { fontSize: 'clamp(2.3rem, 4.4vw, 4.6rem)' }

/* ------------------------------------------------------------ opening: wall break */
function WallBreak() {
  const [phase, setPhase] = useState<'count' | 'break' | 'done'>(() => {
    try { return sessionStorage.getItem('parallel.intro') ? 'done' : 'count' } catch { return 'done' }
  })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (phase !== 'count') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const v = Math.min(100, Math.round(((now - start) / (reduce ? 300 : 1700)) * 100))
      setN(v)
      if (v >= 100) { setPhase('break'); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const skip = () => setPhase('break')
    window.addEventListener('keydown', skip, { once: true })
    window.addEventListener('wheel', skip, { once: true })
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', skip); window.removeEventListener('wheel', skip) }
  }, [phase])
  useEffect(() => {
    if (phase === 'break') {
      try { sessionStorage.setItem('parallel.intro', '1') } catch { /* ignore */ }
      const t = setTimeout(() => setPhase('done'), 1300)
      return () => clearTimeout(t)
    }
  }, [phase])
  if (phase === 'done') return null
  const panels = [
    { cls: 'bg-chaos', to: { x: '-70vw', y: '-30vh', rotate: -18 } },
    { cls: 'bg-[#1b1c1f]', to: { x: '0vw', y: '110vh', rotate: 6 } },
    { cls: 'bg-calm', to: { x: '70vw', y: '-40vh', rotate: 16 } },
  ]
  return (
    <div className="fixed inset-0 z-[70] grid grid-cols-3 cursor-pointer" onClick={() => setPhase('break')} aria-label="Intro, click to skip" role="presentation">
      {panels.map((p, i) => (
        <motion.div key={i} className={`${p.cls} relative overflow-hidden`} initial={false}
          animate={phase === 'break' ? { ...p.to, opacity: 0.0 } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: 1.1, ease, delay: i * 0.06 }} style={{ clipPath: i === 0 ? 'polygon(0 0, 100% 0, 88% 100%, 0 100%)' : i === 2 ? 'polygon(12% 0, 100% 0, 100% 100%, 0 100%)' : undefined }}>
          {i === 1 && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <ForkMark size={72} className="mx-auto text-ink" />
                <p className="mt-6 font-semibold tabular-nums text-ink" style={{ fontSize: 'clamp(3.5rem, 9vw, 8rem)', lineHeight: 1 }}>{n}</p>
                <p className="mt-2 small text-muted">assembling your twin</p>
              </div>
            </div>
          )}
        </motion.div>
      ))}
      <span className="absolute bottom-6 left-1/2 -translate-x-1/2 small text-field-ink/70 sm:text-muted">click or scroll to skip</span>
    </div>
  )
}

/* ------------------------------------------------------------ chapter rail + HUD */
const CHAPTERS = [
  { id: 'twin', label: 'Twin' },
  { id: 'different', label: 'Inside' },
  { id: 'learns', label: 'Learns' },
  { id: 'fingerprint', label: 'Fingerprint' },
  { id: 'fork', label: 'Two futures' },
  { id: 'live', label: 'Try it' },
  { id: 'brain', label: 'Brain' },
  { id: 'meet', label: 'Meet' },
]
function ChapterRail() {
  const [active, setActive] = useState('twin')
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-45% 0px -50% 0px' })
    CHAPTERS.forEach((c) => { const el = document.getElementById(c.id); if (el) io.observe(el) })
    const tick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`
    }
    gsap.ticker.add(tick)
    return () => { io.disconnect(); gsap.ticker.remove(tick) }
  }, [])
  const idx = Math.max(0, CHAPTERS.findIndex((c) => c.id === active))
  return (
    <>
      <nav aria-label="Chapters" className="hidden lg:flex fixed right-3 top-1/2 -translate-y-1/2 z-30 flex-col gap-2.5">
        {CHAPTERS.map((c) => (
          <a key={c.id} href={`#${c.id}`} aria-label={c.label} aria-current={active === c.id ? 'step' : undefined} className="group relative grid place-items-center w-4 h-4">
            <span className="pointer-events-none absolute right-6 whitespace-nowrap small px-2 py-1 bg-[#111214]/90 text-ink opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">{c.label}</span>
            <span className={`block rounded-full transition-all ${active === c.id ? 'w-2 h-5 bg-chaos' : 'w-1.5 h-1.5 bg-muted/70'}`} />
          </a>
        ))}
      </nav>
      <div className="hidden lg:flex fixed left-10 bottom-6 z-30 items-center gap-4 small text-muted pointer-events-none" aria-hidden>
        <span className="tabular-nums text-ink">{String(idx + 1).padStart(2, '0')}</span>
        <span className="relative block w-24 h-px bg-white/15 overflow-hidden"><span ref={bar} className="absolute inset-0 bg-calm origin-left" style={{ transform: 'scaleX(0)' }} /></span>
        <AnimatePresence mode="wait">
          <motion.span key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>{CHAPTERS[idx].label}</motion.span>
        </AnimatePresence>
      </div>
    </>
  )
}

/* ------------------------------------------------------------ helpers */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }} whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-12% 0px' }} transition={{ duration: 0.9, ease, delay }}>
      {children}
    </motion.div>
  )
}

/** Headline whose lines rise out of a mask the first time it enters the viewport. */
function Mask({ lines, as = 'h2', id, className = '', style, delay = 0 }: { lines: ReactNode[]; as?: 'h1' | 'h2' | 'p'; id?: string; className?: string; style?: CSSProperties; delay?: number }) {
  const ref = useInView<HTMLHeadingElement>()
  const Tag = as as 'h2'
  return (
    <Tag ref={ref} id={id} className={`mask font-semibold ${className}`} style={{ ...style, ['--d' as string]: `${delay}s` }}>
      {lines.map((l, i) => <span key={i} className="mask-line"><span style={{ ['--i' as string]: i }}>{l}</span></span>)}
    </Tag>
  )
}

/* ------------------------------------------------------------ 0 · hero */
function Hero({ delay }: { delay: number }) {
  return (
    <section id="twin" data-shape="0" data-hold="0.9" className="relative h-[100svh]" aria-labelledby="hero-title">
      <div className="mx-auto max-w-[1500px] h-full px-4 sm:px-10 flex flex-col justify-end md:justify-center pb-24 md:pb-0">
        <div className={`${leftCol} ${phoneGlass}`}>
          <motion.p className="small text-muted flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.1 }}>
            <span className="inline-block w-2 h-2 rounded-full bg-calm animate-pulse" /> Attention digital twin
          </motion.p>
          <Mask as="h1" id="hero-title" delay={delay} className="mt-4 tracking-[-0.05em] leading-[0.92] vskew" style={{ fontSize: 'clamp(3rem, 5.6vw, 6.6rem)' }}
            lines={['Your attention', <span className="text-calm">has a twin.</span>]} />
          <motion.p className="lead mt-6 max-w-[26ch] text-muted" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease, delay: delay + 0.45 }}>
            It sees both futures of a notification, before you tap.
          </motion.p>
          <motion.div className="mt-8 flex flex-wrap gap-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: delay + 0.6 }}>
            <Magnet padding={50} magnetStrength={3.5}><Link to="/signup" className="btn">Meet your twin <ArrowRight size={18} /></Link></Magnet>
            <a href="#live" className="btn btn-ghost">Try a live fork</a>
          </motion.div>
        </div>
      </div>
      <motion.a href="#different" className="absolute bottom-7 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 small text-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 1 }}>
        Scroll
        <motion.span animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}><ArrowDown size={18} /></motion.span>
      </motion.a>
    </section>
  )
}

/* ------------------------------------------------------------ 1 · everyone is different → dive into the head */
const DIFF = 'A like costs one person 2 minutes. Another, 40.'.split(' ')
function Different() {
  const words = useRef<(HTMLSpanElement | null)[]>([])
  const block = useRef<HTMLDivElement>(null)
  const tag = useRef<HTMLParagraphElement>(null)
  const ref = useScrub<HTMLElement>((p) => {
    const w = seg(p, 0.02, 0.27)
    DIFF.forEach((word, i) => {
      const el = words.current[i]
      if (!el) return
      const a = seg(w, (i / DIFF.length) * 0.85, (i / DIFF.length) * 0.85 + 0.15)
      const hot = /2|40/.test(word)
      el.style.color = hot ? `rgba(255,74,31,${a})` : `rgba(239,240,241,${a})`
    })
    // the camera dives into the head: the words fly past you
    const out = smooth(seg(p, 0.3, 0.46))
    if (block.current) {
      block.current.style.opacity = String(1 - out)
      block.current.style.transform = `translate3d(0, ${-out * 8}vh, 0) scale(${1 + out * 0.35})`
      block.current.style.filter = out > 0.01 ? `blur(${out * 12}px)` : 'none'
    }
    if (tag.current) {
      const inn = seg(p, 0.55, 0.68) * (1 - seg(p, 0.86, 0.96))
      tag.current.style.opacity = String(inn)
      tag.current.style.transform = `translate3d(0, ${(1 - inn) * 20}px, 0)`
    }
  })
  return (
    <section id="different" ref={ref} data-shape="0" data-hold="0.45" className="relative h-[300vh]" aria-labelledby="diff-title">
      <div className="sticky top-0 h-[100svh] flex items-end md:items-center pb-20 md:pb-0 overflow-hidden">
        <div className="mx-auto max-w-[1500px] w-full px-4 sm:px-10">
          <div ref={block} className={`${leftCol} ${phoneGlass} will-change-transform`} style={{ transformOrigin: '20% 50%' }}>
            <h2 id="diff-title" className="small text-muted mb-5 !tracking-normal !font-normal">Everyone’s attention is different.</h2>
            <p className="outline-words font-semibold tracking-[-0.04em] leading-[1.02] max-w-[12ch]" style={{ fontSize: 'clamp(2.4rem, 5vw, 5.4rem)' }}>
              {DIFF.map((w, i) => <span key={i} ref={(el) => { words.current[i] = el }}>{w} </span>)}
            </p>
          </div>
          <p ref={tag} className="absolute left-1/2 top-[18%] md:top-auto md:bottom-[12%] -translate-x-1/2 small text-ink tracking-[0.3em] uppercase whitespace-nowrap" style={{ opacity: 0 }}>
            Entering your twin
          </p>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ 2 · six things it learns (3D cylinder carousel) */
const LEARNS = [
  { icon: Clock, t: 'When you focus best', m: 'Golden hours 10:00–12:30' },
  { icon: Zap, t: 'What interrupts you', m: 'Slack breaks you 8.7× a day' },
  { icon: Flame, t: 'What drags you in', m: '92% of Instagram checks become rabbit holes' },
  { icon: Bell, t: 'Which pings matter', m: 'Family: always. Likes: digest.' },
  { icon: Brain, t: 'When you’re fatigued', m: 'Usually from 4:30 PM' },
  { icon: Layers, t: 'Which apps fragment you', m: 'YouTube: 37 min per break' },
]
function Learns() {
  const cyl = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLElement | null)[]>([])
  const ref = useScrub<HTMLElement>((p) => {
    const x = smooth(seg(p, 0.06, 0.94))
    const raw = x * (LEARNS.length - 1)
    // hold each card at the front for a beat, then glide to the next
    const k = Math.min(LEARNS.length - 1, Math.floor(raw) + smooth(seg(raw - Math.floor(raw), 0.2, 0.8)))
    cyl.current?.style.setProperty('--k', k.toFixed(4))
    if (bar.current) bar.current.style.transform = `scaleX(${x})`
    cards.current.forEach((c, i) => {
      if (!c) return
      const near = Math.max(0, 1 - Math.abs(k - i) / 1.6)
      c.style.opacity = String(0.18 + near * 0.82)
      c.dataset.on = Math.abs(k - i) < 0.5 ? '1' : '0'
    })
  })
  return (
    <section id="learns" ref={ref} data-shape="1" data-hold="0.82" className="relative h-[420vh]" aria-labelledby="learns-title">
      <span id="how" className="absolute top-0" aria-hidden />
      <div className="sticky top-0 h-[100svh] overflow-hidden flex flex-col pt-24 md:pt-28">
        <div className="mx-auto max-w-[1500px] w-full px-4 sm:px-10">
          <Mask id="learns-title" className="tracking-[-0.04em] leading-[0.98]" style={H2} lines={['Six things', 'it learns about you.']} />
          <div className="mt-4 h-[3px] w-56 bg-surface-2 overflow-hidden"><div ref={bar} className="h-full bg-calm origin-left" style={{ transform: 'scaleX(0)' }} /></div>
        </div>
        <div className="cyl-stage vskew-x flex-1 relative">
          <div ref={cyl} className="cyl">
            {LEARNS.map((l, i) => (
              <article key={l.t} ref={(el) => { cards.current[i] = el }} className={`cyl-card fork-cut p-6 sm:p-7 ${glass} border border-white/10`} style={{ ['--i' as string]: i }}>
                <div className="flex items-center justify-between">
                  <l.icon size={26} className="cyl-icon" />
                  <span className="small text-muted tabular-nums">0{i + 1} / 06</span>
                </div>
                <h3 className="mt-10 text-[1.75rem] leading-[1.05]">{l.t}</h3>
                <p className="mt-5 text-lg font-medium text-ink border-l-2 border-chaos pl-3">{l.m}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ 3 · fingerprint ring */
type Snap = { best_window: { start: number; end: number }; fatigue_onset: number; notifications_per_day: number; breaker: { app: string; avg_cost_min: number } | null }
function FingerprintChapter() {
  const [snap, setSnap] = useState<Snap | null>(null)
  useEffect(() => { api<Snap>('/demo/persona/developer').then(setSnap).catch(() => setSnap(null)) }, [])
  const h = (x: number) => fmtHour(x).replace(':00', '')
  return (
    <section id="fingerprint" data-shape="2" data-hold="0.6" className="relative h-[200vh]" aria-labelledby="fp-title">
      <div className="sticky top-0 h-[100svh] flex items-end md:items-center pb-16 md:pb-0">
        <div className="mx-auto max-w-[1500px] w-full px-4 sm:px-10">
          <div className={`${leftCol} md:max-w-[34rem] ${phoneGlass}`}>
            <Mask id="fp-title" className="tracking-[-0.04em] leading-[0.98]" style={H2} lines={['Your attention', 'fingerprint.']} />
            <Reveal delay={0.15}><p className="mt-5 text-muted">Seven days. Twenty-four hours. Uniquely yours.</p></Reveal>
            {snap && (
              <Reveal delay={0.25}>
                <dl className="mt-7 grid grid-cols-2 gap-x-8 gap-y-5">
                  <div><dt className="small text-muted">Golden hours</dt><dd className="text-2xl sm:text-3xl font-semibold text-calm">{h(snap.best_window.start)}–{h(snap.best_window.end)}</dd></div>
                  <div><dt className="small text-muted">Fatigue from</dt><dd className="text-2xl sm:text-3xl font-semibold">{h(snap.fatigue_onset)}</dd></div>
                  <div><dt className="small text-muted">Pings a day</dt><dd className="text-2xl sm:text-3xl font-semibold tabular-nums"><CountUp to={snap.notifications_per_day} decimals={0} duration={1.4} /></dd></div>
                  <div><dt className="small text-muted">Costliest app</dt><dd className="text-2xl sm:text-3xl font-semibold text-chaos">{snap.breaker?.app}</dd></div>
                </dl>
                <p className="mt-4 small text-muted">Live demo twin · 14 days of behaviour</p>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ 4 · two universes (horizontal divider sweep) */
const CHAIN = [
  { at: [0.24, 0.29], n: 2, label: 'interruption' },
  { at: [0.31, 0.37], n: 17, label: 'browsing' },
  { at: [0.39, 0.44], n: 8, label: 'to refocus' },
] as const
function Fork() {
  const stage = useRef<HTMLDivElement>(null)
  const q = useRef<HTMLDivElement>(null)
  const aBox = useRef<HTMLDivElement>(null)
  const bBox = useRef<HTMLDivElement>(null)
  const counter = useRef<HTMLSpanElement>(null)
  const chips = useRef<(HTMLLIElement | null)[]>([])
  const total = useRef<HTMLParagraphElement>(null)
  const cf = useRef<HTMLParagraphElement>(null)
  const ref = useScrub<HTMLElement>((p) => {
    // camera: overview → orange branch → mint branch → back to overview
    story.panW = smooth(seg(p, 0.12, 0.22)) * (1 - smooth(seg(p, 0.9, 1)))
    story.pan = -1 + 2 * smooth(seg(p, 0.55, 0.8))
    const d = smooth(seg(p, 0.52, 0.8))
    stage.current?.style.setProperty('--dp', `${(d * 100).toFixed(2)}%`)
    stage.current?.style.setProperty('--dv', d > 0.001 && d < 0.999 ? '1' : '0')
    if (q.current) {
      const out = seg(p, 0.13, 0.21)
      q.current.style.opacity = String(1 - out)
      q.current.style.transform = `translate3d(0, ${-out * 60}px, 0)`
      q.current.style.visibility = out >= 1 ? 'hidden' : 'visible'
    }
    if (aBox.current) {
      const inn = seg(p, 0.17, 0.24)
      aBox.current.style.opacity = String(inn)
      aBox.current.style.transform = `translate3d(0, ${(1 - inn) * 40}px, 0)`
    }
    let sum = 0
    CHAIN.forEach((c, i) => {
      const f = seg(p, c.at[0], c.at[1])
      sum += c.n * f
      const el = chips.current[i]
      if (el) { el.style.opacity = String(0.22 + f * 0.78); el.style.transform = `translate3d(${(1 - f) * -14}px,0,0)` }
    })
    if (counter.current) counter.current.textContent = String(Math.round(sum))
    if (total.current) total.current.style.opacity = String(seg(p, 0.44, 0.48))
    if (bBox.current) {
      const inn = seg(p, 0.62, 0.72)
      bBox.current.style.transform = `translate3d(0, ${(1 - inn) * 30}px, 0)`
    }
    if (cf.current) cf.current.style.opacity = String(seg(p, 0.82, 0.88))
  })
  return (
    <section id="fork" ref={ref} data-shape="3" data-notif="1" data-hold="0.97" className="relative h-[560vh]" aria-labelledby="fork-title">
      <div ref={stage} className="sticky top-0 h-[100svh] overflow-hidden fork-stage">
        {/* the question */}
        <div ref={q} className="absolute inset-x-0 top-0 pt-24 md:pt-0 md:inset-y-0 md:flex md:items-center">
          <div className="mx-auto max-w-[1500px] w-full px-4 sm:px-10">
            <div className={`${leftCol} ${phoneGlass}`}>
              <p className="small text-muted">You’re coding. A ping arrives.</p>
              <Mask id="fork-title" className="mt-3 tracking-[-0.04em] leading-[1]" style={{ fontSize: 'clamp(2.2rem, 4.2vw, 4.4rem)' }}
                lines={['If I allow it now,', <span className="text-chaos">what happens?</span>]} />
            </div>
          </div>
        </div>
        {/* universe A */}
        <div className="uni uni-a" aria-hidden={false}>
          <div className="uni-inner mx-auto max-w-[1500px] w-full h-full px-4 sm:px-10">
            <div ref={aBox} className={`${leftCol} uni-copy ${phoneGlass}`} style={{ opacity: 0 }}>
              <p className="small font-medium text-chaos">Universe A · you allow it</p>
              <p className="mt-2 font-semibold tabular-nums leading-[0.85] tracking-[-0.05em] text-chaos" style={{ fontSize: 'clamp(5rem, 12vw, 12rem)' }}>
                <span ref={counter}>0</span><span className="text-[0.3em] tracking-normal text-ink ml-2">min</span>
              </p>
              <ol className="mt-5 flex flex-wrap gap-2">
                {CHAIN.map((c, i) => (
                  <li key={c.label} ref={(el) => { chips.current[i] = el }} className="fork-cut bg-chaos/15 border border-chaos/40 px-3 py-2 small" style={{ opacity: 0.22 }}>
                    <span className="font-semibold text-chaos tabular-nums">+{c.n}</span> {c.label}
                  </li>
                ))}
              </ol>
              <p ref={total} className="mt-4 text-muted" style={{ opacity: 0 }}>2 + 17 + 8 = 27 focus-minutes gone.</p>
            </div>
          </div>
        </div>
        {/* universe B */}
        <div className="uni uni-b">
          <div className="uni-inner mx-auto max-w-[1500px] w-full h-full px-4 sm:px-10">
            <div ref={bBox} className={`${leftCol} uni-copy ${phoneGlass}`}>
              <p className="small font-medium text-calm">Universe B · your twin holds it</p>
              <p className="mt-2 font-semibold tabular-nums leading-[0.85] tracking-[-0.05em] text-calm" style={{ fontSize: 'clamp(5rem, 12vw, 12rem)' }}>
                0.7<span className="text-[0.3em] tracking-normal text-ink ml-2">min</span>
              </p>
              <p className="mt-5 text-lg">Same like. Read later, in your digest.</p>
              <p ref={cf} className="mt-3 small text-muted border-t border-white/10 pt-3" style={{ opacity: 0 }}>Counterfactual: 27 min allowed vs ≈0.7 held. 26 minutes of flow kept.</p>
            </div>
          </div>
        </div>
        <div className="uni-divider" aria-hidden><span>you tap · twin holds</span></div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ 5 · live fork (real model) */
function LiveFork() {
  const [cat, setCat] = useState('social_like')
  const [persona, setPersona] = useState('developer')
  const [sim, setSim] = useState<Sim | null>(null)
  const [err, setErr] = useState('')
  const [play, setPlay] = useState(0)
  useEffect(() => {
    setErr('')
    api<Sim>(`/demo/simulate?category=${cat}&persona=${persona}`).then((s) => { setSim(s); setPlay((x) => x + 1) }).catch(() => setErr('The twin is offline. Start the backend to see live predictions.'))
  }, [cat, persona])
  const meta = CATEGORIES.find((c) => c.key === cat)!
  const rec = sim ? { delay: 'Hold it back', summarize: 'Add to digest', ask: 'Your call', allow: 'Let it through' }[sim.recommendation] : ''
  return (
    <section id="live" data-shape="3" data-hold="0.9" className="relative py-28" aria-labelledby="live-title">
      <span id="personas" className="absolute top-0" aria-hidden />
      <div className="mx-auto max-w-[1500px] px-4 sm:px-10">
        <div className="grid lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-7">
            <Mask id="live-title" className="tracking-[-0.04em] leading-[0.98]" style={H2} lines={['Now fork one', 'yourself.']} />
            <Reveal delay={0.1}><p className="mt-4 text-muted">A real model. 1,500 simulated futures per ping.</p></Reveal>
          </div>
          <Reveal className="lg:col-span-5">
            <div className="flex flex-wrap gap-2 lg:justify-end" role="radiogroup" aria-label="Persona">
              {['student', 'developer', 'creator', 'professional'].map((x) => (
                <button key={x} role="radio" aria-checked={persona === x} onClick={() => setPersona(x)} className={`px-3.5 py-2 small font-medium capitalize ${persona === x ? 'bg-ink text-field-ink' : `${glass} text-muted hover:text-ink`}`}>{x}</button>
              ))}
            </div>
          </Reveal>
        </div>
        <div className="mt-8 flex gap-2 overflow-x-auto no-scrollbar pb-2" role="radiogroup" aria-label="Notification">
          {CATEGORIES.slice(0, 8).map((c) => (
            <button key={c.key} role="radio" aria-checked={cat === c.key} onClick={() => setCat(c.key)} className={`shrink-0 fork-cut px-4 py-3 text-left ${cat === c.key ? 'bg-chaos text-field-ink' : `${glass} hover:bg-surface-2`}`}>
              <span className="block small font-semibold">{c.app}</span><span className="block small opacity-80 max-w-[22ch] truncate">{c.text}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 grid lg:grid-cols-12 gap-3">
          <div className={`lg:col-span-4 p-6 flex flex-col gap-5 ${glass} border border-white/5`}>
            <div className="flex items-center gap-3">
              <span className="grid place-items-center w-11 h-11 bg-chaos text-field-ink fork-cut shrink-0"><Smartphone size={20} /></span>
              <div><p className="font-medium">{meta.text}</p><p className="small text-muted">{meta.app} · while {sim?.context.task.toLowerCase() ?? 'working'}</p></div>
            </div>
            {err && <p className="small text-chaos">{err}</p>}
            {sim && (
              <>
                <dl className="grid grid-cols-2 gap-4">
                  <div><dt className="small text-muted">You open it</dt><dd className="text-3xl font-semibold">{Math.round(sim.allow.p_open * 100)}%</dd></div>
                  <div><dt className="small text-muted">Saved by holding</dt><dd className="text-3xl font-semibold text-calm">{Math.max(0, sim.saved_minutes).toFixed(1)}m</dd></div>
                  <div><dt className="small text-muted">Rabbit hole</dt><dd className="text-3xl font-semibold">{Math.round(sim.allow.p_rabbit_hole * 100)}%</dd></div>
                  <div><dt className="small text-muted">Confidence</dt><dd className="text-3xl font-semibold">{Math.round(sim.confidence * 100)}%</dd></div>
                </dl>
                <div className="mt-auto">
                  <p className="small text-muted">Twin’s call</p>
                  <p className="text-2xl font-semibold">{rec}</p>
                  <p className="small text-muted mt-1">{sim.why}</p>
                </div>
                <button onClick={() => setPlay((x) => x + 1)} className="btn btn-ghost self-start !py-2"><RefreshCcw size={16} /> Replay</button>
              </>
            )}
          </div>
          <div className="lg:col-span-8">{sim ? <Universes sim={sim} playKey={play} /> : <div className={`h-full min-h-80 grid place-items-center text-muted ${glass}`}>Simulating…</div>}</div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ 6 · twin brain + research */
const PILLARS = [
  ['Numbers, not vibes.', 'Every prediction has a range.'],
  ['Causal, not correlated.', 'Randomized holdouts measure the cost.'],
  ['Your rules win.', 'Family and bank always pass.'],
]
const RESEARCH = [
  { n: '47 s', d: 'on one screen before switching', s: 'Mark, 2016–20' },
  { n: '~25 min', d: 'to return to interrupted work', s: 'Mark et al., CHI 2005' },
  { n: '237', d: 'people: batching pings helped', s: 'Fitz et al., 2019' },
  { n: '10,372', d: 'notifications: it depends on you', s: 'Mehrotra et al., CHI 2016' },
]
function BrainChapter() {
  return (
    <section id="brain" data-shape="4" data-hold="0.7" className="relative min-h-[170vh] py-32" aria-labelledby="brain-title">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-10">
        <div className={`${leftCol} md:max-w-[34rem] ${phoneGlass}`}>
          <Mask id="brain-title" className="tracking-[-0.04em] leading-[0.98]" style={H2} lines={['Everything it learns,', 'connected.']} />
          <ul className="mt-9 flex flex-col gap-5">
            {PILLARS.map(([t, d], i) => (
              <Reveal key={t} delay={0.1 + i * 0.08}>
                <li className="border-l-2 border-calm pl-4"><p className="text-xl font-semibold">{t}</p><p className="text-muted">{d}</p></li>
              </Reveal>
            ))}
          </ul>
        </div>
        <div id="research" className="mt-40 grid grid-cols-2 lg:grid-cols-4 gap-2 [perspective:1000px]">
          {RESEARCH.map((r, i) => (
            <motion.div key={r.n} initial={{ opacity: 0, rotateX: -40, y: 60 }} whileInView={{ opacity: 1, rotateX: 0, y: 0 }} viewport={{ once: true, margin: '-10% 0px' }}
              transition={{ duration: 1, ease, delay: i * 0.08 }} style={{ transformOrigin: '50% 100%' }}
              className={`h-full p-5 sm:p-6 ${glass} border border-white/5 fork-cut`}>
              <p className="font-semibold tracking-tight" style={{ fontSize: 'clamp(2rem, 4vw, 3.4rem)', lineHeight: 1 }}>{r.n}</p>
              <p className="mt-4">{r.d}</p>
              <p className="mt-1 small text-muted">{r.s}</p>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 small text-muted">Context, not promises. Parallel measures your own numbers.</p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ FAQ */
const FAQ = [
  { q: 'Does Parallel read my messages?', a: 'No. It learns from metadata: which app, which kind of notification, when it arrived and how long you were away. Message text and window titles are dropped before storage.' },
  { q: 'Is the funny universe a real prediction?', a: 'The comedy is fiction. The minutes, probabilities and ranges come from your personal models (logistic regression, empirical-Bayes dwell times and Monte Carlo rollouts).' },
  { q: 'How do you know what would have happened?', a: 'A small share of low-importance alerts are held back at random. Comparing those with alerts that went through gives an honest estimate of the effect, with a confidence interval.' },
  { q: 'Does it work on my phone?', a: 'Android allows notification access with your permission. iOS does not let apps read other apps’ notifications, so iPhone support uses Focus filters. On desktop, app activity comes from ActivityWatch, which runs locally.' },
]
function Faq() {
  const [open, setOpen] = useState(-1)
  return (
    <section id="faq" data-shape="4" data-hold="0.4" className="relative py-24" aria-labelledby="faq-title">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-10 grid lg:grid-cols-12 gap-8">
        <Mask id="faq-title" className="lg:col-span-4 tracking-[-0.04em]" style={{ fontSize: 'clamp(2.2rem, 4vw, 4rem)' }} lines={['Questions']} />
        <div className="lg:col-span-8 flex flex-col gap-2">
          {FAQ.map((f, i) => (
            <div key={i} className={`fork-cut transition-colors ${open === i ? 'bg-chaos text-field-ink' : `${glass}`}`}>
              <h3 className="!tracking-normal !leading-normal">
                <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)} className="w-full text-left flex items-center justify-between gap-4 px-5 sm:px-6 min-h-[72px] text-lg font-medium">
                  {f.q}<Plus size={22} className={`shrink-0 transition-transform ${open === i ? 'rotate-45' : ''}`} aria-hidden />
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <p className="px-5 sm:px-6 pb-6 max-w-[64ch]">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ 7 · meet your twin */
function Meet() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  return (
    <section id="meet" data-shape="5" data-hold="1" className="relative h-[170vh]" aria-labelledby="meet-title">
      <div className="sticky top-0 h-[100svh] flex flex-col justify-end pb-14 md:pb-16">
        <div className="mx-auto max-w-[1500px] w-full px-4 sm:px-10 text-center">
          <div className="mx-auto max-w-2xl bg-[#111214]/60 backdrop-blur-md p-5 -mx-1 md:bg-transparent md:backdrop-blur-none md:p-0">
            <Reveal><p className="small text-muted">You, and the you that’s seen what happens next.</p></Reveal>
            <Mask id="meet-title" className="mt-3 tracking-[-0.05em] leading-[0.95]" style={{ fontSize: 'clamp(2.8rem, 6vw, 6rem)' }} lines={['Meet your twin.']} />
            <Reveal delay={0.2}>
              <form className="mt-8 mx-auto max-w-xl flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); nav(`/signup?email=${encodeURIComponent(email)}`) }}>
                <label htmlFor="meet-email" className="sr-only">Email</label>
                <input id="meet-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" className={`input flex-1 ${glass}`} />
                <Magnet padding={60} magnetStrength={3}><button className="btn justify-center w-full">Create my twin <ArrowRight size={18} /></button></Magnet>
              </form>
              <p className="mt-4 small text-muted">Or <Link to="/signin" className="underline text-ink">step into a demo twin</Link>.</p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Landing() {
  useSeo('Parallel · Your attention digital twin', 'Parallel is a digital twin of your attention. It predicts what happens if you allow a notification right now, shows both futures, and learns from what really happens.', '/')
  useSmoothScroll()
  useStoryDriver()
  const [introDelay] = useState(() => { try { return sessionStorage.getItem('parallel.intro') ? 0.25 : 1.9 } catch { return 0.25 } })
  return (
    <>
      <WallBreak />
      <div className="fixed inset-0 z-0">
        <Suspense fallback={<div className="w-full h-full bg-[#111214]" />}><TwinWorld /></Suspense>
      </div>
      <SiteNav />
      <ChapterRail />
      <main className="relative z-10 overflow-x-clip">
        <Hero delay={introDelay} />
        <Different />
        <Learns />
        <FingerprintChapter />
        <Fork />
        <LiveFork />
        <BrainChapter />
        <Faq />
        <Meet />
      </main>
      <div className="relative z-10 bg-bg"><SiteFooter /></div>
    </>
  )
}
