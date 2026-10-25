import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { api } from '@/lib/api'
import { LANGS } from '@/lib/i18n'
import { ForkMark } from './Brand'

type Msg = { role: 'user' | 'twin'; text: string; card?: { type: string; category?: string } | null }

const CARD_LINKS: Record<string, { to: string; label: string }> = {
  simulate: { to: '/app/multiverse', label: 'Open in Multiverse' },
  fingerprint: { to: '/app/fingerprint', label: 'See your fingerprint' },
  apps: { to: '/app/fingerprint#apps', label: 'See app fragmentation' },
  recommendations: { to: '/app', label: 'See all recommendations' },
  accuracy: { to: '/app/accuracy', label: 'See accuracy report' },
}

const SUGGEST: Record<string, string[]> = {
  en: ['Should I open this Instagram like?', 'When do I focus best?', 'Which app distracts me most?', 'Am I tired?', 'What do you recommend?'],
  hi: ['क्या मैं यह इंस्टा लाइक खोलूं?', 'मैं कब सबसे अच्छा फोकस करता हूँ?', 'कौन सा ऐप ध्यान भटकाता है?', 'क्या मैं थक गया हूँ?'],
  mr: ['ही इन्स्टा सूचना उघडू का?', 'माझा फोकस कधी सर्वोत्तम असतो?', 'कोणते ॲप लक्ष विचलित करते?', 'मी थकलो आहे का?'],
  es: ['¿Debería abrir este me gusta de Instagram?', '¿Cuándo me concentro mejor?', '¿Qué app me distrae más?', '¿Estoy cansado?'],
}

function getRecognition(): any {
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  return SR ? new SR() : null
}

export function useCoach() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'hi' | 'mr' | 'es'
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [speak, setSpeak] = useState(true)
  const recRef = useRef<any>(null)
  const supported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  const speechLang = LANGS.find((l) => l.code === lang)?.speech ?? 'en-IN'

  function say(text: string) {
    if (!speak || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = speechLang
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === speechLang) ?? window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang))
    if (voice) u.voice = voice
    u.rate = 1.02
    window.speechSynthesis.speak(u)
  }

  async function ask(text: string) {
    if (!text.trim()) return
    setMsgs((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const r = await api<{ reply: string; card: Msg['card'] }>('/assistant', { body: { text, lang } })
      setMsgs((m) => [...m, { role: 'twin', text: r.reply, card: r.card }])
      say(r.reply)
    } catch (e) {
      setMsgs((m) => [...m, { role: 'twin', text: (e as Error).message }])
    } finally { setBusy(false) }
  }

  function listen() {
    if (listening) { recRef.current?.stop(); return }
    const rec = getRecognition()
    if (!rec) return
    rec.lang = speechLang
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e: any) => ask(e.results[0][0].transcript)
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  useEffect(() => () => { recRef.current?.stop(); if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])

  return { msgs, busy, ask, listen, listening, supported, speak, setSpeak, lang }
}

export function CoachChat({ coach, tall = false }: { coach: ReturnType<typeof useCoach>; tall?: boolean }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [coach.msgs.length, coach.busy])
  return (
    <div className={`flex flex-col ${tall ? 'h-[calc(100svh-220px)] min-h-[420px]' : 'h-[460px]'}`}>
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1" aria-live="polite">
        {coach.msgs.length === 0 && (
          <div className="text-muted small">
            <p>{t('coach.hint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(SUGGEST[coach.lang] ?? SUGGEST.en).map((s) => (
                <button key={s} onClick={() => coach.ask(s)} className="bg-surface-2 hover:bg-bg text-ink px-3 py-2 text-left">{s}</button>
              ))}
            </div>
          </div>
        )}
        {coach.msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className={`max-w-[88%] px-4 py-3 ${m.role === 'user' ? 'self-end bg-chaos text-field-ink' : 'self-start bg-surface-2'}`}>
            <p className="text-[1rem] leading-snug">{m.text}</p>
            {m.card && CARD_LINKS[m.card.type] && (
              <Link to={CARD_LINKS[m.card.type].to + (m.card.category ? `?category=${m.card.category}` : '')} className="mt-2 inline-block small underline text-calm">{CARD_LINKS[m.card.type].label}</Link>
            )}
          </motion.div>
        ))}
        {coach.busy && <div className="self-start bg-surface-2 px-4 py-3 small text-muted">Thinking with your data…</div>}
        <div ref={end} />
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); coach.ask(text); setText('') }}>
        {coach.supported && (
          <button type="button" onClick={coach.listen} aria-pressed={coach.listening} aria-label={coach.listening ? t('coach.listen') : t('coach.speak')}
            className={`shrink-0 w-12 grid place-items-center transition-colors ${coach.listening ? 'bg-chaos text-field-ink animate-pulse' : 'bg-surface-2 hover:bg-bg'}`}>
            {coach.listening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        )}
        <label className="sr-only" htmlFor="coach-input">{t('coach.placeholder')}</label>
        <input id="coach-input" className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={coach.listening ? t('coach.listen') : t('coach.placeholder')} />
        <button className="btn !px-4" aria-label="Send" disabled={!text.trim()}><Send size={18} /></button>
      </form>
      <div className="mt-2 flex items-center justify-between small text-muted">
        <button onClick={() => coach.setSpeak(!coach.speak)} className="flex items-center gap-1.5 hover:text-ink">
          {coach.speak ? <Volume2 size={15} /> : <VolumeX size={15} />} Voice replies {coach.speak ? 'on' : 'off'}
        </button>
        {!coach.supported && <span>Voice input needs Chrome or Edge</span>}
      </div>
    </div>
  )
}

export default function VoiceCoachFab() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const coach = useCoach()
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label={t('coach.title')} initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="fixed z-50 bottom-24 right-4 left-4 sm:left-auto sm:w-[400px] panel p-4 shadow-2xl border border-surface-2">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-2 font-medium"><ForkMark size={22} /> {t('coach.title')}</p>
              <button onClick={() => setOpen(false)} aria-label="Close coach" className="p-1 hover:text-chaos"><X size={20} /></button>
            </div>
            <CoachChat coach={coach} />
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t('coach.title')}
        className="fixed z-50 bottom-20 lg:bottom-6 right-4 h-14 pl-4 pr-5 bg-calm text-field-ink fork-cut flex items-center gap-2 font-medium shadow-xl hover:-translate-y-0.5 transition-transform">
        <Sparkles size={20} /> <span className="hidden sm:inline">{t('coach.title')}</span>
      </button>
    </>
  )
}
