"""The user's declared routine: wake/bed time, chronotype, weekly blocks, deadlines and app roles.

Everything here is declared by the user during onboarding (or in Settings) and changes how
the twin reasons: the focus curve shifts to their day, pings during a class or work block are
held with the block named in the reason, and a close deadline makes the twin stricter.
"""

from __future__ import annotations

from datetime import date, datetime

from .personas import focus_curve

DEFAULT = dict(wake=7.5, bed=23.5, chronotype="neutral", blocks=[], deadlines=[], tools=[], nags=[])
HOLD_KINDS = {"class", "work", "lab", "exam", "meeting", "study"}
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Templates for the weekly schedule editor (days: 0 = Monday)
TEMPLATES = {
    "college": dict(label="College timetable", blocks=[
        *[dict(day=d, start=9.0, end=13.0, kind="class", label="Lectures") for d in range(5)],
        *[dict(day=d, start=14.0, end=16.0, kind="lab", label="Lab") for d in (1, 3)],
        *[dict(day=d, start=19.0, end=21.0, kind="study", label="Self-study") for d in range(5)],
    ]),
    "office": dict(label="Office 9:30–6", blocks=[
        *[dict(day=d, start=9.5, end=18.0, kind="work", label="Work") for d in range(5)],
        *[dict(day=d, start=10.0, end=10.25, kind="meeting", label="Standup") for d in range(5)],
    ]),
    "remote_dev": dict(label="Remote developer", blocks=[
        *[dict(day=d, start=10.0, end=13.0, kind="work", label="Deep work") for d in range(5)],
        *[dict(day=d, start=15.0, end=18.5, kind="work", label="Build & review") for d in range(5)],
    ]),
    "creator": dict(label="Creator week", blocks=[
        *[dict(day=d, start=11.0, end=15.0, kind="work", label="Create") for d in (0, 1, 2, 3, 4, 5)],
        dict(day=6, start=17.0, end=19.0, kind="work", label="Plan next week"),
    ]),
}


def merge(profile: dict | None) -> dict:
    out = dict(DEFAULT)
    if profile:
        out.update({k: v for k, v in profile.items() if v is not None})
    return out


def shift_for(profile: dict) -> float:
    """How many hours to shift the persona's focus curve: chronotype plus wake time."""
    chrono = {"morning": -1.5, "neutral": 0.0, "evening": 1.5}.get(profile.get("chronotype", "neutral"), 0.0)
    return chrono + (float(profile.get("wake", 7.5)) - 7.5) * 0.6


def awake(profile: dict, hour: float) -> bool:
    wake, bed = float(profile["wake"]), float(profile["bed"])
    if bed <= wake:  # bed after midnight
        return hour >= wake or hour < bed
    return wake <= hour < bed


def focus_for(persona: str, hour: float, profile: dict | None) -> float:
    """Focus capacity at this hour, following the user's declared day."""
    if not profile:
        return focus_curve(persona, hour)
    p = merge(profile)
    v = focus_curve(persona, (hour - shift_for(p)) % 24)
    return round(v if awake(p, hour) else v * 0.25, 3)


def block_at(profile: dict | None, weekday: int, hour: float) -> dict | None:
    if not profile:
        return None
    for b in profile.get("blocks") or []:
        if int(b["day"]) == weekday and float(b["start"]) <= hour < float(b["end"]):
            return b
    return None


def blocks_on(profile: dict | None, weekday: int) -> list[dict]:
    return sorted([b for b in (profile or {}).get("blocks") or [] if int(b["day"]) == weekday], key=lambda b: b["start"])


def deadline_pressure(profile: dict | None, today: date | None = None) -> dict | None:
    """The closest upcoming deadline within two weeks."""
    today = today or date.today()
    best = None
    for d in (profile or {}).get("deadlines") or []:
        try:
            due = date.fromisoformat(str(d["due"])[:10])
        except ValueError:
            continue
        left = (due - today).days
        if 0 <= left <= 14 and (best is None or left < best["days_left"]):
            best = dict(title=d.get("title", "Deadline"), kind=d.get("kind", "deadline"), due=due.isoformat(), days_left=left)
    return best


def fmt(h: float) -> str:
    h = h % 24
    hh, mm = int(h), int(round((h % 1) * 60))
    if mm == 60:
        hh, mm = hh + 1, 0
    return f"{(hh % 12) or 12}:{mm:02d} {'AM' if hh < 12 else 'PM'}"


def check_moments(profile: dict | None, now: datetime | None = None, golden: tuple[float, float] | None = None) -> list[dict]:
    """Best moments today to check held pings: when declared blocks end, plus natural breaks."""
    now = now or datetime.now()
    h = now.hour + now.minute / 60
    p = merge(profile)
    out = []
    for b in blocks_on(p, now.weekday()):
        if b["end"] > h:
            out.append(dict(at=fmt(b["end"]), hour=b["end"], reason=f"{b['label']} ends"))
    if golden and golden[1] > h:
        out.append(dict(at=fmt(golden[1]), hour=golden[1], reason="Your golden hours end"))
    if not out:
        nxt = (int(h) + 1) if h < p["bed"] - 1 else None
        if nxt:
            out.append(dict(at=fmt(nxt), hour=nxt, reason="Top of the hour, a natural pause"))
    if float(p["bed"]) - 1 > h:
        out.append(dict(at=fmt(float(p["bed"]) - 1), hour=float(p["bed"]) - 1, reason="Last check before winding down"))
    seen, uniq = set(), []
    for m in sorted(out, key=lambda m: m["hour"]):
        if m["at"] not in seen:
            seen.add(m["at"])
            uniq.append(m)
    return uniq[:4]


def classify_app(profile: dict | None, app: str) -> str:
    """'tool' / 'nag' / 'neutral' from the user's declared app roles."""
    a = (app or "").lower()
    p = profile or {}
    if any(a == t.lower() or t.lower() in a for t in p.get("tools") or []):
        return "tool"
    if any(a == t.lower() or t.lower() in a for t in p.get("nags") or []):
        return "nag"
    return "neutral"
