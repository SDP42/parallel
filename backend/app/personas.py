"""Persona priors. These are the population-level starting points the twin
uses before it has personal history (cold start), and the generator uses them
to synthesise a consented demo history."""

import math

# Notification categories: base open propensity, chance a check turns into a
# rabbit hole, median rabbit-hole minutes, importance (0 = noise, 1 = urgent).
CATEGORIES = {
    "social_like":   dict(label="Social like",      p_open=0.55, p_rabbit=0.55, rabbit_min=17, importance=0.05),
    "social_dm":     dict(label="Direct message",   p_open=0.75, p_rabbit=0.35, rabbit_min=11, importance=0.35),
    "video_reco":    dict(label="Video suggestion", p_open=0.35, p_rabbit=0.70, rabbit_min=24, importance=0.02),
    "work_chat":     dict(label="Work chat",        p_open=0.80, p_rabbit=0.10, rabbit_min=6,  importance=0.65),
    "email":         dict(label="Email",            p_open=0.50, p_rabbit=0.12, rabbit_min=7,  importance=0.40),
    "calendar":      dict(label="Calendar",         p_open=0.85, p_rabbit=0.02, rabbit_min=3,  importance=0.80),
    "family":        dict(label="Family / close",   p_open=0.85, p_rabbit=0.15, rabbit_min=8,  importance=0.85),
    "promo":         dict(label="Promotion",        p_open=0.15, p_rabbit=0.30, rabbit_min=9,  importance=0.01),
    "news":          dict(label="News alert",       p_open=0.35, p_rabbit=0.45, rabbit_min=12, importance=0.10),
    "security":      dict(label="Security / bank",  p_open=0.90, p_rabbit=0.02, rabbit_min=2,  importance=0.95),
}
CATEGORY_KEYS = list(CATEGORIES.keys())

APPS = {
    "VS Code":   dict(kind="work",    cat=None),
    "Terminal":  dict(kind="work",    cat=None),
    "GitHub":    dict(kind="work",    cat=None),
    "Notion":    dict(kind="work",    cat=None),
    "Docs":      dict(kind="work",    cat=None),
    "Figma":     dict(kind="work",    cat=None),
    "Excel":     dict(kind="work",    cat=None),
    "Lecture":   dict(kind="work",    cat=None),
    "Slack":     dict(kind="comm",    cat="work_chat"),
    "Teams":     dict(kind="comm",    cat="work_chat"),
    "Gmail":     dict(kind="comm",    cat="email"),
    "Calendar":  dict(kind="comm",    cat="calendar"),
    "WhatsApp":  dict(kind="comm",    cat="family"),
    "Bank":      dict(kind="comm",    cat="security"),
    "Instagram": dict(kind="distract", cat="social_like"),
    "Discord":   dict(kind="distract", cat="social_dm"),
    "YouTube":   dict(kind="distract", cat="video_reco"),
    "X":         dict(kind="distract", cat="news"),
    "LinkedIn":  dict(kind="distract", cat="social_like"),
    "Amazon":    dict(kind="distract", cat="promo"),
    "Spotify":   dict(kind="neutral", cat=None),
}

# Which app delivers each category, per persona.
def app_for(category: str, persona: str) -> str:
    table = {
        "social_like": "LinkedIn" if persona == "professional" else "Instagram",
        "social_dm": "Discord" if persona in ("student", "developer") else "Instagram",
        "video_reco": "YouTube",
        "work_chat": "Teams" if persona == "professional" else ("WhatsApp" if persona == "student" else "Slack"),
        "email": "Gmail",
        "calendar": "Calendar",
        "family": "WhatsApp",
        "promo": "Amazon",
        "news": "X",
        "security": "Bank",
    }
    return table[category]


def _bump(center: float, width: float, h: float) -> float:
    return math.exp(-((h - center) ** 2) / (2 * width ** 2))


PERSONAS = {
    "student": dict(
        label="Student",
        tagline="Exams, assignments, and a phone that never sleeps.",
        tasks=["Studying", "Assignment", "Lecture"],
        work_apps=["Notion", "Docs", "Lecture"],
        peaks=[(10.0, 1.6, 1.0), (21.5, 1.4, 0.75)],
        fatigue_onset=16.0,
        rates={"social_like": 1.6, "social_dm": 1.4, "video_reco": 0.9, "work_chat": 0.6, "email": 0.4,
               "calendar": 0.1, "family": 0.4, "promo": 0.5, "news": 0.3, "security": 0.03},
        susceptibility=0.35,
    ),
    "developer": dict(
        label="Developer",
        tagline="Deep work, flow state, and Slack pings mid-debug.",
        tasks=["Coding", "Code review", "Debugging"],
        work_apps=["VS Code", "Terminal", "GitHub"],
        peaks=[(11.0, 1.5, 1.0), (23.0, 1.2, 0.85)],
        fatigue_onset=16.5,
        rates={"social_like": 0.9, "social_dm": 0.6, "video_reco": 0.6, "work_chat": 1.8, "email": 0.7,
               "calendar": 0.25, "family": 0.3, "promo": 0.3, "news": 0.6, "security": 0.04},
        susceptibility=0.15,
    ),
    "creator": dict(
        label="Creator",
        tagline="Where your work tool is also your biggest distraction.",
        tasks=["Editing", "Designing", "Scripting"],
        work_apps=["Figma", "Docs", "Notion"],
        peaks=[(14.0, 2.0, 1.0), (20.0, 1.3, 0.8)],
        fatigue_onset=18.0,
        rates={"social_like": 2.2, "social_dm": 1.2, "video_reco": 0.8, "work_chat": 0.7, "email": 0.6,
               "calendar": 0.15, "family": 0.3, "promo": 0.4, "news": 0.3, "security": 0.03},
        susceptibility=0.30,
    ),
    "professional": dict(
        label="Professional",
        tagline="Back-to-back meetings and an inbox with opinions.",
        tasks=["Analysis", "Writing", "Planning"],
        work_apps=["Excel", "Docs", "Notion"],
        peaks=[(9.5, 1.4, 1.0), (15.0, 1.2, 0.6)],
        fatigue_onset=15.0,
        rates={"social_like": 0.6, "social_dm": 0.3, "video_reco": 0.3, "work_chat": 2.2, "email": 1.8,
               "calendar": 0.5, "family": 0.3, "promo": 0.4, "news": 0.5, "security": 0.04},
        susceptibility=0.10,
    ),
}


def focus_curve(persona: str, hour: float) -> float:
    """Persona prior: relative focus capacity (0..1) by time of day."""
    p = PERSONAS[persona]
    v = 0.25 + sum(a * _bump(c, w, hour) for c, w, a in p["peaks"])
    if hour < 8 or hour > 24:
        v *= 0.4
    # post-lunch dip
    v -= 0.18 * _bump(14.0, 0.8, hour)
    return max(0.05, min(1.0, v))
