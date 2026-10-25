/**
 * Text-to-speech that doesn't hang.
 *
 * Chrome's speechSynthesis stalls or cuts out on long utterances (~15 s) and sometimes drops a
 * speak() issued right after cancel(). So replies are split into short sentence chunks and queued,
 * voices are loaded once (they arrive asynchronously), and stop() cancels everything immediately.
 */

type Listener = (speaking: boolean) => void

let voices: SpeechSynthesisVoice[] = []
let queue: string[] = []
let generation = 0
let speakingNow = false
const listeners = new Set<Listener>()

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function loadVoices() {
  if (!supported()) return
  voices = window.speechSynthesis.getVoices()
}
if (supported()) {
  loadVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
}

function setSpeaking(v: boolean) {
  if (v === speakingNow) return
  speakingNow = v
  listeners.forEach((l) => l(v))
}

export function onSpeakingChange(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export const isSpeaking = () => speakingNow

/** Split into sentence-sized chunks of at most ~160 characters (works for Latin and Devanagari). */
export function chunk(text: string, max = 160): string[] {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?।]+[.!?।]?/g) ?? [text]
  const out: string[] = []
  for (let p of parts.map((s) => s.trim()).filter(Boolean)) {
    while (p.length > max) {
      const cut = p.lastIndexOf(' ', max)
      out.push(p.slice(0, cut > 40 ? cut : max))
      p = p.slice(cut > 40 ? cut + 1 : max)
    }
    if (p) out.push(p)
  }
  return out
}

function pickVoice(lang: string) {
  if (!voices.length) loadVoices()
  const base = lang.slice(0, 2)
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.replace('_', '-').startsWith(base)) ?? null
}

export function stop() {
  generation++
  queue = []
  if (supported()) window.speechSynthesis.cancel()
  setSpeaking(false)
}

export function speak(text: string, lang: string, rate = 1.05) {
  if (!supported() || !text.trim()) return
  stop()
  const gen = generation
  queue = chunk(text)
  const voice = pickVoice(lang)
  const next = () => {
    if (gen !== generation) return
    const part = queue.shift()
    if (!part) { setSpeaking(false); return }
    const u = new SpeechSynthesisUtterance(part)
    u.lang = lang
    if (voice) u.voice = voice
    u.rate = rate
    u.onend = () => next()
    u.onerror = () => { if (gen === generation) setSpeaking(false) }
    window.speechSynthesis.speak(u)
  }
  setSpeaking(true)
  // Chrome drops a speak() issued in the same tick as cancel(); give it a moment.
  window.setTimeout(next, 60)
}
