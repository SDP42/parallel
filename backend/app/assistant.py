"""Twin Coach: a persona-aware, multilingual assistant.

Deliberately grounded: an intent router picks a question type, the numbers come
from the twin's models, and language/persona only change the wording. The
assistant never invents a number the model didn't produce.
"""

from __future__ import annotations

import re

from .twin import Twin, fmt_h

LANGS = ("en", "hi", "mr", "es")

INTENTS = {
    "simulate": ["allow", "should i", "open", "notification", "ping", "check", "अनुमति", "खोलूं", "खोलू", "नोटिफिकेशन",
                 "उघडू", "सूचना", "permitir", "abrir", "notificación", "debería"],
    "best_time": ["best time", "focus best", "when", "golden", "peak", "कब", "सबसे अच्छा", "केव्हा", "कधी", "cuándo", "mejor hora"],
    "distraction": ["distract", "biggest", "worst app", "which app", "breaks my", "ध्यान भटक", "कौन सा ऐप", "कोणते ॲप", "distrae", "qué app"],
    "fatigue": ["tired", "fatigue", "break", "exhausted", "थक", "आराम", "ब्रेक", "थकलो", "cansad", "descanso"],
    "today": ["today", "how am i", "doing", "status", "आज", "कैसा", "कसा", "hoy", "cómo voy"],
    "recommend": ["recommend", "suggest", "improve", "tips", "what should", "सुझाव", "सल्ला", "सुधार", "recomienda", "consejo"],
    "learned": ["learn", "know about me", "what do you know", "सीखा", "शिकलास", "aprendiste", "sabes de mí"],
}

CATEGORY_WORDS = {
    "social_like": ["instagram", "insta", "like", "linkedin", "post", "इंस्टा", "लाइक", "me gusta"],
    "social_dm": ["dm", "discord", "message from", "friend", "दोस्त", "मित्र", "amigo"],
    "video_reco": ["youtube", "video", "reel", "यूट्यूब", "वीडियो", "व्हिडिओ"],
    "work_chat": ["slack", "teams", "teammate", "pr", "review", "colleague", "टीम", "compañero"],
    "email": ["email", "mail", "gmail", "newsletter", "ईमेल", "correo"],
    "calendar": ["meeting", "calendar", "standup", "मीटिंग", "reunión"],
    "family": ["mom", "mother", "dad", "family", "whatsapp", "माँ", "मम्मी", "आई", "पापा", "mamá", "familia"],
    "promo": ["sale", "offer", "amazon", "discount", "सेल", "ऑफर", "oferta"],
    "news": ["news", "twitter", "x.com", "breaking", "खबर", "बातमी", "noticias"],
    "security": ["bank", "otp", "sign-in", "security", "बैंक", "banco"],
}

T = {
    "en": {
        "sim": "If you open this {label} now, I expect a {p}% chance you check it, typically costing {cost} min (range {lo}-{hi}). Held back, it costs ~{d} min. My call: {rec}. {why}",
        "best": "Your golden hours are {s}-{e}. Focus quality there is {q}% of your best. {persona}",
        "distract": "{app} breaks your focus about {n}x a day, and each break costs ~{c} min. {pct}% of quick checks turn into rabbit holes.",
        "fatigue": "Right now your estimated fatigue is {f}%. Fatigue usually kicks in around {onset}. {advice}",
        "today": "You've made {d} intentional decisions and protected ~{m} minutes so far. Level {lvl}, {xp} XP. {persona}",
        "rec": "Top move: {t}. It should save about {i} min a day ({ev}).",
        "learned": "In {days} days I've learned from {n} events. I'm {imp}% better than a generic notification rule at predicting what you'll open.",
        "help": "Ask me things like: 'Should I open this Instagram like?', 'When do I focus best?', 'Which app distracts me most?', or 'Am I tired?'",
        "rec_words": {"allow": "let it through", "delay": "hold it until your next checkpoint", "summarize": "add it to your digest"},
        "fatigue_hi": "Take a 10-minute walk before your next block.", "fatigue_lo": "You're good to keep going.",
    },
    "hi": {
        "sim": "अगर आप यह {label} अभी खोलते हैं, तो {p}% संभावना है कि आप इसे देखेंगे, जिसकी कीमत आमतौर पर {cost} मिनट होती है (रेंज {lo}-{hi})। रोकने पर ~{d} मिनट। मेरी सलाह: {rec}।",
        "best": "आपके गोल्डन घंटे {s}-{e} हैं। वहाँ फोकस गुणवत्ता आपके सर्वश्रेष्ठ का {q}% है। {persona}",
        "distract": "{app} दिन में लगभग {n} बार आपका फोकस तोड़ता है, और हर बार ~{c} मिनट लगते हैं। {pct}% छोटी जाँचें लंबे स्क्रॉल में बदल जाती हैं।",
        "fatigue": "अभी आपकी अनुमानित थकान {f}% है। थकान आमतौर पर {onset} के आसपास शुरू होती है। {advice}",
        "today": "आपने {d} सोच-समझकर फैसले लिए और ~{m} मिनट बचाए। लेवल {lvl}, {xp} XP। {persona}",
        "rec": "सबसे अच्छा कदम: {t}। इससे रोज़ लगभग {i} मिनट बचेंगे ({ev})।",
        "learned": "{days} दिनों में मैंने {n} घटनाओं से सीखा है। मैं सामान्य नियम से {imp}% बेहतर अनुमान लगाता हूँ।",
        "help": "मुझसे पूछें: 'क्या मैं यह इंस्टा लाइक खोलूं?', 'मैं कब सबसे अच्छा फोकस करता हूँ?', 'कौन सा ऐप ध्यान भटकाता है?'",
        "rec_words": {"allow": "आने दें", "delay": "अगले चेकपॉइंट तक रोकें", "summarize": "डाइजेस्ट में डालें"},
        "fatigue_hi": "अगले ब्लॉक से पहले 10 मिनट टहल लें।", "fatigue_lo": "आप ठीक हैं, जारी रखें।",
    },
    "mr": {
        "sim": "तुम्ही ही {label} आत्ता उघडली तर {p}% शक्यता आहे की तुम्ही ती पाहाल, साधारण {cost} मिनिटे जातील ({lo}-{hi})। थांबवल्यास ~{d} मिनिटे. माझा सल्ला: {rec}.",
        "best": "तुमचे सर्वोत्तम तास {s}-{e} आहेत. तिथे फोकस {q}% असतो. {persona}",
        "distract": "{app} दिवसातून सुमारे {n} वेळा तुमचा फोकस तोडते, प्रत्येक वेळी ~{c} मिनिटे. {pct}% छोट्या तपासण्या लांब स्क्रोलमध्ये बदलतात.",
        "fatigue": "सध्या तुमचा अंदाजे थकवा {f}% आहे. थकवा साधारण {onset} च्या आसपास सुरू होतो. {advice}",
        "today": "तुम्ही {d} विचारपूर्वक निर्णय घेतले आणि ~{m} मिनिटे वाचवली. लेव्हल {lvl}, {xp} XP. {persona}",
        "rec": "सर्वोत्तम पाऊल: {t}. यामुळे रोज सुमारे {i} मिनिटे वाचतील ({ev}).",
        "learned": "{days} दिवसांत मी {n} घटनांमधून शिकलो. सामान्य नियमापेक्षा मी {imp}% अचूक आहे.",
        "help": "मला विचारा: 'ही इन्स्टा सूचना उघडू का?', 'माझा फोकस केव्हा सर्वोत्तम असतो?', 'कोणते ॲप लक्ष विचलित करते?'",
        "rec_words": {"allow": "येऊ द्या", "delay": "पुढच्या चेकपॉइंटपर्यंत थांबवा", "summarize": "डायजेस्टमध्ये टाका"},
        "fatigue_hi": "पुढच्या ब्लॉकआधी 10 मिनिटे चाला.", "fatigue_lo": "तुम्ही ठीक आहात, चालू ठेवा.",
    },
    "es": {
        "sim": "Si abres este {label} ahora, hay un {p}% de probabilidad de que lo mires, con un coste típico de {cost} min (rango {lo}-{hi}). Retenido, ~{d} min. Mi consejo: {rec}.",
        "best": "Tus horas doradas son {s}-{e}. Ahí tu foco está al {q}% de tu mejor nivel. {persona}",
        "distract": "{app} rompe tu foco unas {n} veces al día y cada vez cuesta ~{c} min. El {pct}% de los vistazos se vuelven madrigueras.",
        "fatigue": "Tu fatiga estimada ahora es {f}%. Suele empezar alrededor de las {onset}. {advice}",
        "today": "Has tomado {d} decisiones intencionales y protegido ~{m} minutos. Nivel {lvl}, {xp} XP. {persona}",
        "rec": "Mejor movimiento: {t}. Debería ahorrarte unos {i} min al día ({ev}).",
        "learned": "En {days} días aprendí de {n} eventos. Predigo un {imp}% mejor que una regla genérica.",
        "help": "Pregúntame: '¿Debería abrir este me gusta de Instagram?', '¿Cuándo me concentro mejor?', '¿Qué app me distrae más?'",
        "rec_words": {"allow": "déjalo pasar", "delay": "retenlo hasta tu próximo punto de control", "summarize": "añádelo al resumen"},
        "fatigue_hi": "Camina 10 minutos antes del siguiente bloque.", "fatigue_lo": "Vas bien, sigue.",
    },
}

PERSONA_LINE = {
    "student": {"en": "Put your toughest chapter there, not your notes cleanup.", "hi": "सबसे कठिन अध्याय वहीं पढ़ें।",
                "mr": "सर्वात कठीण धडा तेव्हाच अभ्यासा.", "es": "Pon ahí tu tema más difícil."},
    "developer": {"en": "Save that window for the gnarliest bug, not code review.", "hi": "उस समय सबसे कठिन बग ठीक करें।",
                  "mr": "त्या वेळेत सर्वात कठीण बग सोडवा.", "es": "Guarda esa ventana para el bug más difícil."},
    "creator": {"en": "Create first, post later. Your feed can wait for your edit.", "hi": "पहले बनाइए, बाद में पोस्ट कीजिए।",
                "mr": "आधी तयार करा, नंतर पोस्ट करा.", "es": "Primero crea, luego publica."},
    "professional": {"en": "Guard it from meetings. Deep analysis lives there.", "hi": "इसे मीटिंग्स से बचाइए।",
                     "mr": "ही वेळ मीटिंगपासून वाचवा.", "es": "Protégela de las reuniones."},
}


def detect(text: str, table: dict) -> str | None:
    t = text.lower()
    best, score = None, 0
    for key, words in table.items():
        s = sum(1 for w in words if re.search(r"(?<!\w)" + re.escape(w.lower()), t))
        if s > score:
            best, score = key, s
    return best


def answer(twin: Twin, text: str, lang: str, persona: str, stats: dict, vip: set) -> dict:
    lang = lang if lang in LANGS else "en"
    L = T[lang]
    pline = PERSONA_LINE.get(persona, PERSONA_LINE["developer"])[lang]
    cat = detect(text, CATEGORY_WORDS)
    intent = detect(text, INTENTS)
    if cat and intent in (None, "simulate", "today"):
        intent = "simulate"
    card = None
    if intent == "simulate":
        cat = cat or "social_like"
        ctx = twin.context_now()
        r = twin.simulate(cat, ctx["hour"], ctx["depth"], 35, ctx["fatigue"], ctx["task"], 600)
        rec = "allow" if cat in vip else r["recommendation"]
        msg = L["sim"].format(label=r["label"].lower(), p=round(r["allow"]["p_open"] * 100), cost=r["allow"]["cost_p50"],
                              lo=r["allow"]["cost_p10"], hi=r["allow"]["cost_p90"], d=r["delay"]["cost_expected"],
                              rec=L["rec_words"][rec], why=r["why"] if lang == "en" else "")
        card = dict(type="simulate", category=cat)
    elif intent == "best_time":
        fp = twin.fingerprint()
        b = fp["best_window"]
        msg = L["best"].format(s=fmt_h(b["start"]), e=fmt_h(b["end"]), q=round(b["quality"] / max(max(fp["hourly"]), 0.01) * 100), persona=pline)
        card = dict(type="fingerprint")
    elif intent == "distraction":
        a = next((a for a in twin.apps() if a["focus_breaks_per_day"] > 0), None)
        msg = L["distract"].format(app=a["app"], n=a["focus_breaks_per_day"], c=a["avg_cost_min"], pct=round(a["rabbit_rate"] * 100))
        card = dict(type="apps")
    elif intent == "fatigue":
        ctx = twin.context_now()
        fp = twin.fingerprint()
        msg = L["fatigue"].format(f=round(ctx["fatigue"] * 100), onset=fmt_h(fp["fatigue_onset"]),
                                  advice=L["fatigue_hi"] if ctx["fatigue"] > 0.5 else L["fatigue_lo"])
    elif intent == "recommend":
        r = twin.recommendations(vip)[0]
        msg = L["rec"].format(t=r["title"], i=r["impact_min"], ev=r["evidence"])
        card = dict(type="recommendations")
    elif intent == "learned":
        fp = twin.fingerprint()
        acc = twin.accuracy()
        msg = L["learned"].format(days=fp["days_learned"], n=fp["events_learned"], imp=round(acc["improvement"] * 100))
        card = dict(type="accuracy")
    elif intent == "today":
        msg = L["today"].format(d=stats["decisions"], m=stats["minutes_saved"], lvl=stats["level"], xp=stats["xp"], persona="")
    else:
        msg = L["help"]
    return dict(reply=msg.strip(), intent=intent or "help", lang=lang, card=card)
