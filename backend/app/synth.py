"""Synthetic but behaviourally-grounded history generator.

Produces 14 days of app-usage segments and notification events for a persona.
Past notifications follow a logging policy that randomly *holds back* ~20% of
low-risk alerts (an exploration policy). Those randomized holdouts are what let
the twin estimate counterfactual outcomes without simply trusting correlations.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta

from .personas import CATEGORIES, PERSONAS, app_for, focus_curve
from . import routine

HISTORY_DAYS = 14
EXPLORE_RATE = 0.22


@dataclass
class Segment:
    day: str
    start: float      # hour of day (float)
    end: float
    app: str
    kind: str         # focus | recovering | distraction | comm | break | meeting
    task: str
    quality: float    # 0..1 estimated focus quality


@dataclass
class Notif:
    id: str
    day: str
    hour: float
    category: str
    app: str
    task: str
    depth: float          # 0 light .. 1 deep
    minutes_in: float     # minutes into current focus block
    fatigue: float
    action: str           # allow | delay (logging policy)
    opened: bool
    rabbit: bool
    away_min: float       # time away from task
    resume_min: float     # extra time to regain focus after returning
    cost_min: float       # away + resume (+ missed urgency penalty when delayed)
    followed_app: str | None = None
    chain: list = field(default_factory=list)


def _lognormal(rng: random.Random, median: float, sigma: float) -> float:
    return median * math.exp(rng.gauss(0, sigma))


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def true_outcome(rng, persona, category, depth, minutes_in, fatigue, hour, action, quirks=None):
    """Ground-truth behaviour model (hidden from the twin). The twin must learn it."""
    c = CATEGORIES[category]
    p = PERSONAS[persona]
    sus = p["susceptibility"]
    if action == "delay":
        # Reviewed later at a checkpoint: brief handling, no rabbit hole while working,
        # but delaying something important carries a cost.
        handle = 0.4 + rng.random() * 0.6
        penalty = c["importance"] * rng.choice([0, 0, 2, 6]) if c["importance"] > 0.5 else 0.0
        return False, False, 0.0, 0.0, handle + penalty, None
    q = (quirks or {}).get(category, (0.0, 0.0))
    x = logit(c["p_open"]) + q[0] + 2.4 * fatigue - 1.6 * depth + 1.5 * sus - 0.3
    if minutes_in > 50:
        x += 0.5  # long blocks invite escape
    opened = rng.random() < sigmoid(x)
    if not opened:
        # Glance cost even when not opened (attention residue)
        resume = 0.3 + depth * 0.8 * rng.random()
        return False, False, 0.0, resume, resume, None
    pr = logit(c["p_rabbit"]) + q[1] + 2.2 * fatigue + 0.8 * sus - 0.9 * depth - 0.9
    if hour >= 21:
        pr += 0.5
    rabbit = rng.random() < sigmoid(pr)
    app = app_for(category, persona)
    if rabbit:
        away = _lognormal(rng, c["rabbit_min"] * (0.8 + fatigue * 0.6 + sus), 0.45)
    else:
        away = _lognormal(rng, 1.6, 0.4)
    resume = (1.5 + 0.22 * away) * (0.6 + depth) + rng.random() * 2
    return True, rabbit, away, resume, away + resume, app


def build_chain(n: Notif) -> list:
    """Human readable chain of events for a notification outcome."""
    if n.action == "delay":
        return [
            {"t": 0, "label": "Held back", "detail": "Silenced and queued for your next checkpoint"},
            {"t": 0, "label": f"Kept {n.task.lower()}", "detail": "Focus block continues"},
            {"t": round(n.cost_min, 1), "label": "Reviewed in digest", "detail": "Handled in under a minute"},
        ]
    if not n.opened:
        return [
            {"t": 0, "label": "Glanced", "detail": "Saw the banner, didn't open"},
            {"t": round(n.resume_min, 1), "label": "Back on task", "detail": "Minor attention residue"},
        ]
    steps = [{"t": 0, "label": "Notification seen", "detail": f"{n.app} banner"},
             {"t": 0.5, "label": f"{n.followed_app} opened", "detail": "Quick check"}]
    if n.rabbit:
        steps.append({"t": round(2.0, 1), "label": "Rabbit hole", "detail": "Feed / autoplay takes over"})
    steps.append({"t": round(n.away_min, 1), "label": f"Back to {n.task.lower()}", "detail": "Context partly lost"})
    steps.append({"t": round(n.cost_min, 1), "label": "Focus recovered",
                  "detail": f"~{round(n.resume_min)} min to regain flow"})
    return steps


def generate(persona: str, seed: int, today: date | None = None, days: int = HISTORY_DAYS, profile: dict | None = None):
    """`profile` (wake/bed, chronotype, weekly blocks) makes the day follow the user's declared routine."""
    rng = random.Random(seed)
    p = PERSONAS[persona]
    today = today or date.today()
    segments: list[Segment] = []
    notifs: list[Notif] = []
    nid = 0
    # Personal quirks: everyone reacts differently to the same kind of alert.
    quirks = {k: (rng.gauss(0, 1.0), rng.gauss(0, 0.8)) for k in CATEGORIES}
    for d in range(days, -1, -1):  # d == 0 is today (partial)
        day = today - timedelta(days=d)
        dstr = day.isoformat()
        weekend = day.weekday() >= 5
        now_h = datetime.now().hour + datetime.now().minute / 60 if d == 0 else 24.0
        prof = routine.merge(profile) if profile else None
        if prof and prof["bed"] > prof["wake"]:
            t = prof["wake"] + 0.4 + rng.random() * 0.6 + (0.8 if weekend else 0)
            end_h = min(prof["bed"] - 0.2 + rng.random() * 0.4, now_h)
        else:
            t = 8.0 + rng.random() * 1.2 + (1.0 if weekend else 0)
            end_h = min(23.8 + rng.random() * 0.5, now_h)
        fatigue = 0.05 + rng.random() * 0.1
        while t < end_h:
            h = t
            fc = routine.focus_for(persona, h, prof) if prof else focus_curve(persona, h)
            blk = routine.block_at(prof, day.weekday(), t) if prof else None
            if blk and blk["kind"] in ("class", "lab", "exam", "meeting"):
                # declared class/meeting: phone mostly away, attention spoken for
                b_end = min(float(blk["end"]), end_h)
                segments.append(Segment(dstr, t, b_end, "Calendar", "meeting", blk.get("label", "Class"), 0.5))
                t = b_end + rng.uniform(0.02, 0.1)
                fatigue = min(1, fatigue + 0.04 * (b_end - h))
                continue
            # meeting blocks for professionals / developers on weekdays
            if not weekend and persona in ("professional", "developer") and rng.random() < (0.22 if persona == "professional" else 0.1) and 9.5 < h < 17:
                length = rng.choice([0.5, 0.5, 1.0])
                segments.append(Segment(dstr, t, min(t + length, end_h), "Teams" if persona == "professional" else "Slack",
                                        "meeting", "Meeting", 0.45))
                t += length
                fatigue = min(1, fatigue + 0.03)
                continue
            # leisure / break block
            if rng.random() < (0.28 if not weekend else 0.5) * (1.2 - fc):
                length = rng.uniform(0.25, 0.8)
                app = rng.choice(["YouTube", "Instagram", "Spotify", "WhatsApp"])
                segments.append(Segment(dstr, t, min(t + length, end_h), app, "break", "Break", 0.1))
                t += length
                fatigue = max(0.0, fatigue - 0.12 * length * 2)
                continue
            # focus block
            task = blk.get("label", rng.choice(p["tasks"])) if blk else rng.choice(p["tasks"])
            work_app = rng.choice(p["work_apps"])
            depth = 1.0 if fc > 0.65 else (0.6 if fc > 0.4 else 0.3)
            block_len = rng.uniform(0.6, 1.8) * (0.6 + fc)
            block_end = min(t + block_len, end_h, float(blk["end"]) if blk else 99)
            if prof and not blk:  # don't run a free block into the next declared class
                nxt = [b["start"] for b in routine.blocks_on(prof, day.weekday()) if b["start"] > t]
                if nxt:
                    block_end = min(block_end, max(t + 0.1, min(nxt)))
            cur = t
            seg_start = t
            while cur < block_end:
                # next notification arrival (Poisson over all categories)
                total_rate = sum(p["rates"].values()) * (0.7 + 0.6 * (1 - fc))
                gap = rng.expovariate(total_rate)
                nxt = cur + gap
                if nxt >= block_end:
                    minutes = (block_end - cur) * 60
                    fatigue = min(1.0, fatigue + minutes * 0.0016 * (2.2 if h > p["fatigue_onset"] else 1.0))
                    break
                minutes = (nxt - cur) * 60
                fatigue = min(1.0, fatigue + minutes * 0.0016 * (2.2 if nxt > p["fatigue_onset"] else 1.0))
                cur = nxt
                cats = list(p["rates"].keys())
                cat = rng.choices(cats, weights=[p["rates"][k] for k in cats])[0]
                importance = CATEGORIES[cat]["importance"]
                action = "delay" if (importance < 0.5 and rng.random() < EXPLORE_RATE) else "allow"
                opened, rabbit, away, resume, cost, followed = true_outcome(
                    rng, persona, cat, depth, (cur - t) * 60, fatigue, cur, action, quirks)
                n = Notif(id=f"n{nid}", day=dstr, hour=round(cur, 3), category=cat, app=app_for(cat, persona),
                          task=task, depth=depth, minutes_in=round((cur - t) * 60, 1), fatigue=round(fatigue, 3),
                          action=action, opened=opened, rabbit=rabbit, away_min=round(away, 2),
                          resume_min=round(resume, 2), cost_min=round(cost, 2), followed_app=followed)
                n.chain = build_chain(n)
                notifs.append(n)
                nid += 1
                if opened:
                    q = fc * (1 - 0.5 * fatigue)
                    segments.append(Segment(dstr, seg_start, cur, work_app, "focus", task, round(q, 3)))
                    a_end = min(cur + away / 60, end_h)
                    segments.append(Segment(dstr, cur, a_end, followed, "distraction", task, 0.05))
                    r_end = min(a_end + resume / 60, end_h)
                    segments.append(Segment(dstr, a_end, r_end, work_app, "recovering", task, round(q * 0.45, 3)))
                    cur = r_end
                    seg_start = r_end
                    block_end = min(block_end + away / 60 * 0.5, end_h)  # interruptions stretch the block
            if seg_start < block_end:
                q = fc * (1 - 0.5 * fatigue)
                segments.append(Segment(dstr, seg_start, block_end, work_app, "focus", task, round(q, 3)))
            t = block_end
            # self-interruption when fatigued
            if rng.random() < 0.15 + 0.5 * fatigue * p["susceptibility"] * 3 and t < end_h:
                app = rng.choice(["Instagram", "YouTube", "X"])
                length = _lognormal(rng, 8 + 10 * fatigue, 0.5) / 60
                segments.append(Segment(dstr, t, min(t + length, end_h), app, "distraction", "Self-interrupt", 0.05))
                t += length
            t += rng.uniform(0.02, 0.15)
    return [asdict(s) for s in segments], [asdict(n) for n in notifs]
