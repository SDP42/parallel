import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const LANGS = [
  { code: 'en', label: 'English', speech: 'en-IN' },
  { code: 'hi', label: 'हिन्दी', speech: 'hi-IN' },
  { code: 'mr', label: 'मराठी', speech: 'mr-IN' },
  { code: 'es', label: 'Español', speech: 'es-ES' },
] as const

const en = {
  nav: { how: 'How it works', personas: 'Personas', research: 'Research', faq: 'FAQ', signin: 'Sign in', start: 'Meet your twin', app: 'Open app' },
  hero: {
    title1: 'Every ping', title2: 'forks your day.',
    sub: 'Parallel is a digital twin of your attention. It predicts both futures of a notification before you tap.',
    cta: 'Meet your twin', demo: 'Try a live fork',
  },
  live: {
    title: 'Pick a ping. Watch both futures.',
    sub: 'Real numbers from a demo twin trained on 14 days of a developer’s behaviour. The comedy is fiction. The minutes are the model.',
    allow: 'Universe A · You tap', delay: 'Universe B · You hold it',
    cost: 'focus-minutes lost', chance: 'chance you open it', saved: 'minutes saved by holding it',
  },
  how: {
    title: 'How your twin thinks',
    s1: 'Observe', s1d: 'Learns from app switches, notification arrivals and how long you take to come back. Never message contents.',
    s2: 'Predict', s2d: 'Runs 2,000 Monte Carlo futures through your personal models: open, rabbit hole, dwell, resumption.',
    s3: 'Fork', s3d: 'Shows Universe A (allow) beside Universe B (hold back), with confidence and the evidence behind it.',
    s4: 'Learn', s4d: 'You choose. It checks what really happened and recalibrates. Accuracy is shown, not claimed.',
  },
  features: { title: 'Things your twin will do for you' },
  personas: { title: 'One twin, four kinds of busy' },
  research: { title: 'Built on attention research' },
  faq: { title: 'Questions' },
  cta: { lead: 'Start your twin with', placeholder: 'your email', go: 'Fork it' },
  app: {
    home: 'Today', simulator: 'Multiverse', inbox: 'Smart inbox', fingerprint: 'Fingerprint', replay: 'Replay',
    brain: 'Twin brain', accuracy: 'Accuracy', coach: 'Coach', settings: 'Rules & privacy', signout: 'Sign out',
  },
  common: { allow: 'Allow now', delay: 'Hold back', summarize: 'Add to digest', confidence: 'confidence', loading: 'Loading your twin…', back: 'Back' },
  coach: { title: 'Twin coach', placeholder: 'Ask your twin…', listen: 'Listening…', speak: 'Hold to talk', hint: 'Try: “Should I open this Instagram like?”' },
}

type Dict = typeof en

const hi: Dict = {
  nav: { how: 'यह कैसे काम करता है', personas: 'पर्सोना', research: 'शोध', faq: 'सवाल', signin: 'साइन इन', start: 'अपने ट्विन से मिलें', app: 'ऐप खोलें' },
  hero: { title1: 'हर नोटिफिकेशन', title2: 'आपका दिन बाँट देता है।', sub: 'Parallel आपके ध्यान का डिजिटल ट्विन है। टैप करने से पहले यह दोनों भविष्य दिखाता है।', cta: 'अपने ट्विन से मिलें', demo: 'लाइव फोर्क आज़माएँ' },
  live: { title: 'एक नोटिफिकेशन चुनें। दोनों भविष्य देखें।', sub: 'डेमो ट्विन के असली अनुमान। मज़ाक काल्पनिक है, मिनट मॉडल से हैं।', allow: 'ब्रह्मांड A · आप टैप करते हैं', delay: 'ब्रह्मांड B · आप रोकते हैं', cost: 'फोकस-मिनट गए', chance: 'खोलने की संभावना', saved: 'रोकने से बचे मिनट' },
  how: { title: 'आपका ट्विन कैसे सोचता है', s1: 'देखना', s1d: 'ऐप स्विच, नोटिफिकेशन और वापसी के समय से सीखता है। संदेश कभी नहीं पढ़ता।', s2: 'अनुमान', s2d: 'आपके निजी मॉडल से 2,000 संभावित भविष्य चलाता है।', s3: 'फोर्क', s3d: 'ब्रह्मांड A (अनुमति) और ब्रह्मांड B (रोकें) साथ-साथ, भरोसे के साथ।', s4: 'सीखना', s4d: 'आप चुनते हैं। यह असल नतीजे से खुद को सुधारता है।' },
  features: { title: 'आपका ट्विन आपके लिए क्या करेगा' },
  personas: { title: 'एक ट्विन, चार तरह की व्यस्तता' },
  research: { title: 'ध्यान शोध पर आधारित' },
  faq: { title: 'सवाल' },
  cta: { lead: 'अपना ट्विन शुरू करें', placeholder: 'आपका ईमेल', go: 'शुरू करें' },
  app: { home: 'आज', simulator: 'मल्टीवर्स', inbox: 'स्मार्ट इनबॉक्स', fingerprint: 'फिंगरप्रिंट', replay: 'रीप्ले', brain: 'ट्विन ब्रेन', accuracy: 'सटीकता', coach: 'कोच', settings: 'नियम व गोपनीयता', signout: 'साइन आउट' },
  common: { allow: 'अभी आने दें', delay: 'रोकें', summarize: 'डाइजेस्ट में डालें', confidence: 'भरोसा', loading: 'आपका ट्विन लोड हो रहा है…', back: 'वापस' },
  coach: { title: 'ट्विन कोच', placeholder: 'अपने ट्विन से पूछें…', listen: 'सुन रहा हूँ…', speak: 'बोलने के लिए दबाएँ', hint: 'पूछें: “क्या मैं यह इंस्टा लाइक खोलूं?”' },
}

const mr: Dict = {
  nav: { how: 'हे कसे चालते', personas: 'पर्सोना', research: 'संशोधन', faq: 'प्रश्न', signin: 'साइन इन', start: 'तुमच्या ट्विनला भेटा', app: 'ॲप उघडा' },
  hero: { title1: 'प्रत्येक सूचना', title2: 'तुमचा दिवस विभागते.', sub: 'Parallel हा तुमच्या लक्षाचा डिजिटल ट्विन आहे. टॅप करण्याआधी तो दोन्ही भविष्य दाखवतो.', cta: 'तुमच्या ट्विनला भेटा', demo: 'लाइव्ह फोर्क पहा' },
  live: { title: 'एक सूचना निवडा. दोन्ही भविष्य पहा.', sub: 'डेमो ट्विनचे खरे अंदाज. विनोद काल्पनिक, मिनिटे मॉडेलची.', allow: 'विश्व A · तुम्ही टॅप करता', delay: 'विश्व B · तुम्ही थांबवता', cost: 'फोकस-मिनिटे गेली', chance: 'उघडण्याची शक्यता', saved: 'थांबवल्याने वाचलेली मिनिटे' },
  how: { title: 'तुमचा ट्विन कसा विचार करतो', s1: 'निरीक्षण', s1d: 'ॲप बदल, सूचना आणि परत येण्याच्या वेळेतून शिकतो. संदेश कधीच वाचत नाही.', s2: 'अंदाज', s2d: 'तुमच्या वैयक्तिक मॉडेलमधून 2,000 भविष्ये चालवतो.', s3: 'फोर्क', s3d: 'विश्व A आणि विश्व B शेजारी, विश्वासासह.', s4: 'शिकणे', s4d: 'तुम्ही निवडता. तो खऱ्या परिणामातून सुधारतो.' },
  features: { title: 'तुमचा ट्विन तुमच्यासाठी काय करेल' },
  personas: { title: 'एक ट्विन, चार प्रकारची व्यस्तता' },
  research: { title: 'लक्ष संशोधनावर आधारित' },
  faq: { title: 'प्रश्न' },
  cta: { lead: 'तुमचा ट्विन सुरू करा', placeholder: 'तुमचा ईमेल', go: 'सुरू करा' },
  app: { home: 'आज', simulator: 'मल्टिव्हर्स', inbox: 'स्मार्ट इनबॉक्स', fingerprint: 'फिंगरप्रिंट', replay: 'रिप्ले', brain: 'ट्विन ब्रेन', accuracy: 'अचूकता', coach: 'कोच', settings: 'नियम व गोपनीयता', signout: 'साइन आउट' },
  common: { allow: 'आत्ता येऊ द्या', delay: 'थांबवा', summarize: 'डायजेस्टमध्ये टाका', confidence: 'विश्वास', loading: 'तुमचा ट्विन लोड होत आहे…', back: 'मागे' },
  coach: { title: 'ट्विन कोच', placeholder: 'तुमच्या ट्विनला विचारा…', listen: 'ऐकत आहे…', speak: 'बोलण्यासाठी दाबा', hint: 'विचारा: “ही इन्स्टा सूचना उघडू का?”' },
}

const es: Dict = {
  nav: { how: 'Cómo funciona', personas: 'Perfiles', research: 'Investigación', faq: 'FAQ', signin: 'Entrar', start: 'Conoce a tu gemelo', app: 'Abrir app' },
  hero: { title1: 'Cada aviso', title2: 'bifurca tu día.', sub: 'Parallel es un gemelo digital de tu atención. Predice los dos futuros de una notificación antes de tocarla.', cta: 'Conoce a tu gemelo', demo: 'Prueba una bifurcación' },
  live: { title: 'Elige un aviso. Mira ambos futuros.', sub: 'Números reales de un gemelo de demostración. La comedia es ficción; los minutos son del modelo.', allow: 'Universo A · Lo tocas', delay: 'Universo B · Lo retienes', cost: 'minutos de foco perdidos', chance: 'probabilidad de abrirlo', saved: 'minutos ahorrados al retenerlo' },
  how: { title: 'Cómo piensa tu gemelo', s1: 'Observa', s1d: 'Aprende de cambios de app, avisos y cuánto tardas en volver. Nunca lee mensajes.', s2: 'Predice', s2d: 'Simula 2.000 futuros con tus modelos personales.', s3: 'Bifurca', s3d: 'Universo A (permitir) junto a Universo B (retener), con confianza y evidencia.', s4: 'Aprende', s4d: 'Tú eliges. Comprueba qué pasó y se recalibra.' },
  features: { title: 'Lo que tu gemelo hará por ti' },
  personas: { title: 'Un gemelo, cuatro formas de estar ocupado' },
  research: { title: 'Basado en investigación sobre atención' },
  faq: { title: 'Preguntas' },
  cta: { lead: 'Empieza tu gemelo con', placeholder: 'tu email', go: 'Bifurcar' },
  app: { home: 'Hoy', simulator: 'Multiverso', inbox: 'Bandeja inteligente', fingerprint: 'Huella', replay: 'Repetición', brain: 'Cerebro', accuracy: 'Precisión', coach: 'Coach', settings: 'Reglas y privacidad', signout: 'Salir' },
  common: { allow: 'Permitir ahora', delay: 'Retener', summarize: 'Al resumen', confidence: 'confianza', loading: 'Cargando tu gemelo…', back: 'Volver' },
  coach: { title: 'Coach gemelo', placeholder: 'Pregunta a tu gemelo…', listen: 'Escuchando…', speak: 'Mantén para hablar', hint: 'Prueba: “¿Debería abrir este me gusta de Instagram?”' },
}

let saved = 'en'
try { saved = localStorage.getItem('parallel.lang') || navigator.language.slice(0, 2) } catch { /* ignore */ }

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, mr: { translation: mr }, es: { translation: es } },
  lng: ['en', 'hi', 'mr', 'es'].includes(saved) ? saved : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (l) => {
  document.documentElement.lang = l
  try { localStorage.setItem('parallel.lang', l) } catch { /* ignore */ }
})
document.documentElement.lang = i18n.language

export default i18n
