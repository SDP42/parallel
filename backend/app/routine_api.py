"""Routine, ongoing inputs and the newer twin features.

Routine: wake/bed, chronotype, weekly blocks, deadlines, tool vs nag apps (onboarding + Settings).
Ongoing inputs: 10-second energy check-in, "did this matter?" taps, a "how well the twin knows you" meter.
Real data: ActivityWatch ingest with timezone handling, stored as deduplicated events and live segments.
Extras: time machine (two simulated months), behavioural doppelgänger, auto-reply drafts for held pings.
"""

from __future__ import annotations

import json
import math
import sqlite3
import time
from contextlib import closing
from datetime import date, datetime, timedelta

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import history as hist
from . import routine
from .main import CATEGORIES, PERSONAS, current_user, db, load_profile, stats_for, twin_of
from .personas import app_for

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- routine profile
class Block(BaseModel):
    day: int = Field(ge=0, le=6)
    start: float = Field(ge=0, le=24)
    end: float = Field(ge=0, le=24)
    kind: str = Field(pattern="^(class|lab|exam|work|meeting|study|gym|commute|other)$")
    label: str = Field(min_length=1, max_length=40)


class Deadline(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    due: str
    kind: str = "deadline"


class Profile(BaseModel):
    wake: float = Field(7.5, ge=3, le=13)
    bed: float = Field(23.5, ge=18, le=28)
    chronotype: str = Field("neutral", pattern="^(morning|neutral|evening)$")
    blocks: list[Block] = []
    deadlines: list[Deadline] = []
    tools: list[str] = []
    nags: list[str] = []


@router.get("/routine/templates")
def templates():
    return {k: dict(label=v["label"], blocks=v["blocks"]) for k, v in routine.TEMPLATES.items()}


@router.get("/me/profile")
def get_profile(u=Depends(current_user)):
    with closing(db()) as c:
        p = load_profile(c, u["id"])
    return dict(declared=p is not None, profile=routine.merge(p),
                note="Your day-0 history is generated from this routine, not observed. Real data replaces it as it arrives.")


@router.put("/me/profile")
def put_profile(body: Profile, u=Depends(current_user)):
    for b in body.blocks:
        if b.end <= b.start:
            raise HTTPException(400, f"Block '{b.label}' ends before it starts")
    data = body.model_dump()
    data["bed"] = data["bed"] if data["bed"] <= 24 else data["bed"] - 24
    with closing(db()) as c:
        c.execute("INSERT INTO user_profile(user_id,data,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated=excluded.updated",
                  (u["id"], json.dumps(data), time.time()))
        c.commit()
        if u["persona"]:
            hist.regenerate_warmup(c, u["id"], u["persona"], u["id"] * 7919, data)
    return get_profile(u)


# ---------------------------------------------------------------- ongoing inputs
class Checkin(BaseModel):
    energy: int = Field(ge=1, le=5)
    mood: str = ""


@router.post("/checkins")
def checkin(body: Checkin, u=Depends(current_user)):
    with closing(db()) as c, c:
        c.execute("INSERT INTO checkins(user_id,ts,energy,mood) VALUES(?,?,?,?)", (u["id"], time.time(), body.energy, body.mood[:30]))
    t = twin_of(u)
    return dict(ok=True, now=t.context_now(), message=["Running on empty. I'll guard you harder.", "Low battery noted.", "Steady. Carry on.",
                                                         "Good energy. Use it on the hard thing.", "Peak energy. Golden hours mode."][body.energy - 1])


@router.get("/checkins")
def list_checkins(u=Depends(current_user)):
    with closing(db()) as c:
        return [dict(r) for r in c.execute("SELECT ts, energy, mood FROM checkins WHERE user_id=? ORDER BY ts DESC LIMIT 14", (u["id"],))]


class Matter(BaseModel):
    category: str
    mattered: bool


@router.post("/feedback/matter")
def matter(body: Matter, u=Depends(current_user)):
    if body.category not in CATEGORIES:
        raise HTTPException(400, "Unknown category")
    with closing(db()) as c, c:
        c.execute("INSERT INTO matter_feedback(user_id,ts,category,mattered) VALUES(?,?,?,?)", (u["id"], time.time(), body.category, int(body.mattered)))
    t = twin_of(u)
    return dict(category=body.category, generic=CATEGORIES[body.category]["importance"], learned=t.learned_importance.get(body.category))


@router.get("/feedback/matter")
def matter_summary(u=Depends(current_user)):
    t = twin_of(u)
    return [dict(category=k, label=v["label"], generic=v["importance"], learned=t.learned_importance.get(k)) for k, v in CATEGORIES.items()]


@router.get("/twin/knowledge")
def knowledge(u=Depends(current_user)):
    """How well the twin knows you (0–100) and the single most useful thing to add next."""
    with closing(db()) as c:
        p = load_profile(c, u["id"])
        n_check = c.execute("SELECT COUNT(*) FROM checkins WHERE user_id=?", (u["id"],)).fetchone()[0]
        n_matter = c.execute("SELECT COUNT(*) FROM matter_feedback WHERE user_id=?", (u["id"],)).fetchone()[0]
        n_out = c.execute("SELECT COUNT(*) FROM decisions WHERE user_id=? AND actual_cost IS NOT NULL", (u["id"],)).fetchone()[0]
        counts = hist.counts(c, u["id"])
    parts = [
        dict(key="routine", label="Daily routine", got=bool(p), points=15, add="Tell me your wake and bed time and chronotype"),
        dict(key="schedule", label="Weekly schedule", got=bool(p and p.get("blocks")), points=15, add="Add your classes or work blocks"),
        dict(key="deadlines", label="Deadlines & exams", got=bool(p and p.get("deadlines")), points=5, add="Add your next exam or deadline"),
        dict(key="apps", label="Tool vs nag apps", got=bool(p and (p.get("tools") or p.get("nags"))), points=5, add="Mark which apps are tools and which nag you"),
        dict(key="energy", label="Energy check-ins", got=n_check >= 3, points=min(15, n_check * 5), add="Do a 10-second energy check-in"),
        dict(key="matter", label="“Did this matter?” taps", got=n_matter >= 5, points=min(15, n_matter * 3), add="Tap whether a few recent pings mattered"),
        dict(key="outcomes", label="Reality checks", got=n_out >= 3, points=min(10, n_out * 4), add="Run a fork and tell the twin what really happened"),
        dict(key="real", label="Real activity data", got=counts["live_segments"] > 20, points=min(20, counts["live_segments"] // 5),
             add="Connect ActivityWatch so I learn from real behaviour"),
    ]
    score = min(100, sum(x["points"] if x["got"] or x["key"] in ("energy", "matter", "outcomes", "real") else 0 for x in parts))
    nxt = next((x for x in parts if not x["got"]), None)
    return dict(score=score, parts=parts, next=nxt["add"] if nxt else "Keep going. Your twin is learning every day.",
                data_source="mostly observed" if counts["live_segments"] > 200 else "mostly generated warm-up")


@router.get("/check-moments")
def check_moments(u=Depends(current_user)):
    t = twin_of(u)
    b = t.fingerprint()["best_window"]
    with closing(db()) as c:
        p = load_profile(c, u["id"])
        pending = c.execute("SELECT COUNT(*) FROM deferred_queue WHERE user_id=? AND released IS NULL", (u["id"],)).fetchone()[0]
    return dict(pending=pending, moments=routine.check_moments(p, golden=(b["start"], b["end"])))


# ---------------------------------------------------------------- real data: ActivityWatch
class AWEvent(BaseModel):
    timestamp: str
    duration: float
    data: dict


@router.post("/ingest/activitywatch")
def ingest_activitywatch(events: list[AWEvent], tz_offset_min: int = 0, afk: bool = False, u=Depends(current_user)):
    """Import ActivityWatch events (aw-watcher-window, or aw-watcher-afk with afk=true).

    ActivityWatch timestamps are UTC: pass tz_offset_min (330 for IST) so days and hours land in local time.
    Window titles are dropped. Events are deduplicated and turned into live segments the fingerprint learns from.
    """
    with closing(db()) as c:
        prof = load_profile(c, u["id"])
        before = c.total_changes
        segs = []
        for e in events:
            try:
                ts = datetime.fromisoformat(e.timestamp.replace("Z", "+00:00")).replace(tzinfo=None) + timedelta(minutes=tz_offset_min)
            except ValueError:
                continue
            if e.duration < 5:  # ignore sub-5-second blips
                continue
            app = str(e.data.get("app", e.data.get("status", "")))[:60]
            c.execute("INSERT OR IGNORE INTO events(user_id,source,type,ts,duration,app,category,meta) VALUES(?,?,?,?,?,?,?,?)",
                      (u["id"], "activitywatch", "afk" if afk else "app_active", ts.isoformat(timespec="seconds"), e.duration, app, None, "{}"))
            if c.total_changes == before:
                continue  # duplicate
            before = c.total_changes
            if afk:
                continue
            role = routine.classify_app(prof, app)
            kind = "focus" if role == "tool" else "distraction" if role == "nag" else "break"
            start = ts.hour + ts.minute / 60 + ts.second / 3600
            end = min(24.0, start + e.duration / 3600)
            segs.append((u["id"], ts.date().isoformat(), round(start, 4), round(end, 4), app, kind, "Observed",
                         0.75 if kind == "focus" else 0.05 if kind == "distraction" else 0.2))
        c.executemany("INSERT INTO user_segments(user_id,day,start,end,app,kind,task,quality,source) VALUES(?,?,?,?,?,?,?,?,'live')", segs)
        c.commit()
        live = c.execute("SELECT COUNT(*) FROM user_segments WHERE user_id=? AND source='live'", (u["id"],)).fetchone()[0]
    return dict(received=len(events), stored_segments=len(segs), live_segments_total=live, tz_offset_min=tz_offset_min,
                tip="Mark your tool and nag apps in Settings so observed time is classified correctly.")


# ---------------------------------------------------------------- time machine
@router.get("/twin/timemachine")
def time_machine(days: int = 30, u=Depends(current_user)):
    """Two simulated months: keep today's habits vs follow the twin's top recommendations."""
    t = twin_of(u)
    recs = t.recommendations()
    fp = t.fingerprint()
    rng = np.random.default_rng(u["id"])
    base_focus = fp["focus_hours_per_day"]
    daily_cost = sum(c["cost_allow"] * c["per_day"] * c["open_rate"] for c in t.categories()) / 60  # hours lost to pings
    gain = sum(r["impact_min"] * r["confidence"] for r in recs[:3]) / 60
    a, b = [], []
    fa = fb = 0.0
    for d in range(days):
        adopt = min(1.0, 0.35 + d / (days * 0.8))  # habits take a few weeks to stick
        noise = rng.normal(0, 0.35)
        fa += max(0, base_focus + noise)
        fb += max(0, base_focus + noise + gain * adopt * 0.6)
        a.append(round(fa, 1))
        b.append(round(fb, 1))
    extra = b[-1] - a[-1]
    return dict(days=days, keep=a, follow=b, extra_focus_hours=round(extra, 1), lost_to_pings_per_day=round(daily_cost, 1),
                headline=f"Following your twin for {days} days ≈ {round(extra)} extra hours of deep work.",
                equivalent=f"That's about {max(1, round(extra / 2.5))} full golden-hour sessions.",
                actions=[r["title"] for r in recs[:3]],
                caveat="A projection from your model, assuming the recommended habits stick gradually. Not a promise.")


# ---------------------------------------------------------------- doppelgänger
@router.get("/population/doppelganger")
def doppelganger(u=Depends(current_user)):
    """Find the dataset user whose attention behaves most like yours, and what worked for them."""
    t = twin_of(u)
    allowed = [n for n in t.notifs if n["action"] == "allow"]
    me = np.array([
        np.mean([n["opened"] for n in allowed]) if allowed else 0.5,
        np.mean([n["rabbit"] for n in allowed if n["opened"]] or [0.3]),
        np.mean([n["cost_min"] for n in allowed]) / 30 if allowed else 0.2,
        float(np.mean([n["fatigue"] for n in t.notifs])) if t.notifs else 0.3,
        t.fingerprint()["best_window"]["start"] / 24,
    ])
    with closing(db()) as c:
        c.row_factory = sqlite3.Row
        try:
            rows = c.execute("""SELECT user_id, persona, AVG(CASE WHEN policy_action='allow' THEN opened END) o,
                SUM(CASE WHEN opened=1 THEN rabbit_hole END)*1.0/MAX(1,SUM(opened)) r, AVG(CASE WHEN policy_action='allow' THEN cost_min END)/30.0 k,
                AVG(fatigue) f FROM ds_notifications GROUP BY user_id""").fetchall()
            peaks = {r["user_id"]: r["h"] for r in c.execute("""SELECT user_id, hour h FROM (SELECT user_id, hour, AVG(focus_capacity) q,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY AVG(focus_capacity) DESC) rn FROM ds_notifications GROUP BY user_id, hour) WHERE rn=1""")}
        except sqlite3.OperationalError:
            raise HTTPException(404, "Dataset not generated yet. Run: python -m ml.dataset")
        best, bd = None, 1e9
        for r in rows:
            v = np.array([r["o"] or 0, r["r"] or 0, r["k"] or 0, r["f"] or 0, (peaks.get(r["user_id"], 10)) / 24])
            d = float(np.linalg.norm((v - me) * np.array([1, 1, 1, 0.7, 0.8])))
            if d < bd:
                best, bd = r, d
        uid = best["user_id"]
        worked = [dict(r) for r in c.execute("""SELECT category, AVG(CASE WHEN policy_action='allow' THEN cost_min END) - AVG(CASE WHEN policy_action='delay' THEN cost_min END) saved,
            SUM(policy_action='delay') holds FROM ds_notifications WHERE user_id=? AND importance<0.5 GROUP BY category HAVING holds>=5 ORDER BY saved DESC LIMIT 3""", (uid,))]
        handle = c.execute("SELECT handle, chronotype, occupation FROM ds_users WHERE user_id=?", (uid,)).fetchone()
    similarity = round(100 * math.exp(-bd * 2.2))
    return dict(match=dict(handle=handle["handle"], persona=best["persona"], chronotype=handle["chronotype"], occupation=handle["occupation"]),
                similarity=similarity,
                what_worked=[dict(category=w["category"], label=CATEGORIES[w["category"]]["label"], saved_per_hold=round(w["saved"] or 0, 1)) for w in worked],
                line=f"Your attention twin-of-a-twin is {handle['handle']}, a {handle['chronotype']}-type {handle['occupation']}. Holding these pings saved them the most time.")


# ---------------------------------------------------------------- auto-reply drafts
REPLIES = {
    "en": "Hey! I'm in {block} until {until}. I'll get back to you right after. If it's urgent, call me.",
    "hi": "नमस्ते! मैं {until} तक {block} में हूँ। उसके तुरंत बाद जवाब दूँगा। ज़रूरी हो तो कॉल करें।",
    "mr": "नमस्कार! मी {until} पर्यंत {block} मध्ये आहे. त्यानंतर लगेच उत्तर देतो. तातडीचे असेल तर फोन करा.",
    "es": "¡Hola! Estoy en {block} hasta las {until}. Te respondo justo después. Si es urgente, llámame.",
}


@router.get("/autoreply")
def autoreply(category: str = "social_dm", lang: str = "en", u=Depends(current_user)):
    """A polite auto-reply for a held message, naming your current block and when you'll be free."""
    if category not in CATEGORIES:
        raise HTTPException(400, "Unknown category")
    t = twin_of(u)
    ctx = t.context_now()
    with closing(db()) as c:
        p = load_profile(c, u["id"])
    now = datetime.now()
    h = now.hour + now.minute / 60
    blk = routine.block_at(p, now.weekday(), h)
    b = t.fingerprint()["best_window"]
    if blk:
        block, until = blk["label"].lower(), routine.fmt(blk["end"])
    elif b["start"] <= h < b["end"]:
        block, until = "deep work", routine.fmt(b["end"])
    else:
        block, until = "a focus block", routine.fmt(math.ceil(h + 0.75))
    lang = lang if lang in REPLIES else "en"
    return dict(category=category, app=app_for(category, u["persona"] or "developer"), lang=lang,
                text=REPLIES[lang].format(block=block, until=until), sendable=category in ("social_dm", "work_chat", "family"),
                note="Drafted on your device. Parallel never sends messages for you.", context=dict(until=until, block=block, fatigue=ctx["fatigue"]))
