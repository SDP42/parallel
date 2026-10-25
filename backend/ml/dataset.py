"""Build the Parallel synthetic attention dataset.

    python -m ml.dataset --users 60 --days 30

Writes three CSVs to backend/data/ and loads them into the SQLite database as
ds_users, ds_notifications and ds_sessions. The behaviour model behind it lives in
app/synth.py: per-user quirks, time-of-day focus curves, fatigue that builds within
a day, and a logging policy that holds back ~22% of low-importance alerts at random
(that randomization is what makes counterfactual estimates possible).

The data is synthetic and says so everywhere it is shown. It stands in for consented
logs from ActivityWatch (desktop) or Android's NotificationListenerService.
"""

from __future__ import annotations

import argparse
import math
import random
import sqlite3
import time
from bisect import bisect_left, bisect_right
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

from app.personas import CATEGORIES, PERSONAS, focus_curve
from app.synth import generate

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DB = ROOT / "parallel.db"

SENDER = {"social_like": "acquaintance", "social_dm": "friend", "video_reco": "algorithm", "work_chat": "colleague",
          "email": "brand", "calendar": "system", "family": "family", "promo": "brand", "news": "algorithm", "security": "system"}
OCCUPATION = {"student": "undergraduate", "developer": "software engineer", "creator": "content creator", "professional": "analyst"}


def environment(rng: random.Random, persona: str, hour: float, weekend: bool) -> str:
    if weekend:
        return rng.choice(["home", "home", "cafe"])
    if persona == "student":
        return "campus" if 9 <= hour < 17 else ("commute" if 17 <= hour < 18 else "hostel")
    if 9.5 <= hour < 18:
        return rng.choice(["office", "office", "home"]) if persona != "creator" else rng.choice(["studio", "home"])
    return "commute" if 18 <= hour < 19 else "home"


def build(n_users: int, days: int, seed: int = 2026):
    rng = random.Random(seed)
    personas = list(PERSONAS)
    end = date.today() - timedelta(days=1)
    users, notes, sessions = [], [], []
    nid = sid = 0
    t0 = time.time()
    for u in range(1, n_users + 1):
        persona = personas[(u - 1) % len(personas)]
        useed = seed * 1000 + u
        segs, ns = generate(persona, useed, today=end, days=days - 1)
        chrono = "morning" if PERSONAS[persona]["peaks"][0][0] < 11 else "evening"
        if rng.random() < 0.25:
            chrono = "evening" if chrono == "morning" else "morning"
        users.append(dict(user_id=u, handle=f"user_{u:03d}", persona=persona, occupation=OCCUPATION[persona],
                          chronotype=chrono, susceptibility=round(PERSONAS[persona]["susceptibility"] + rng.gauss(0, 0.06), 3),
                          age_band=rng.choice(["18-22", "18-22", "23-28", "29-35"] if persona == "student" else ["23-28", "29-35", "36-45"]),
                          primary_device=rng.choice(["laptop", "laptop", "phone"]), timezone="Asia/Kolkata",
                          consent_experiments=1, signup_date=(end - timedelta(days=days + rng.randint(0, 60))).isoformat()))
        # sessions
        by_day_switch: dict[str, list[float]] = {}
        for s in segs:
            sid += 1
            d = date.fromisoformat(s["day"])
            st = datetime.combine(d, datetime.min.time()) + timedelta(hours=s["start"])
            en = datetime.combine(d, datetime.min.time()) + timedelta(hours=s["end"])
            sessions.append(dict(session_id=sid, user_id=u, date=s["day"], start_ts=st.isoformat(timespec="seconds"),
                                 end_ts=en.isoformat(timespec="seconds"), duration_min=round((s["end"] - s["start"]) * 60, 2),
                                 app=s["app"], kind=s["kind"], task=s["task"], focus_quality=s["quality"]))
            if s["kind"] in ("distraction", "break"):
                by_day_switch.setdefault(s["day"], []).append(s["start"])
        for v in by_day_switch.values():
            v.sort()
        # notifications with context features from the user's own timeline
        hours_by_day: dict[str, list[float]] = {}
        for n in ns:
            hours_by_day.setdefault(n["day"], []).append(n["hour"])
        for v in hours_by_day.values():
            v.sort()
        vip = {"family", "security", "calendar"}
        for n in ns:
            nid += 1
            d = date.fromisoformat(n["day"])
            ts = datetime.combine(d, datetime.min.time()) + timedelta(hours=n["hour"])
            sw = by_day_switch.get(n["day"], [])
            recent_sw = bisect_right(sw, n["hour"]) - bisect_left(sw, n["hour"] - 0.25)
            hs = hours_by_day[n["day"]]
            last_hour = bisect_left(hs, n["hour"]) - bisect_left(hs, n["hour"] - 1)
            weekend = d.weekday() >= 5
            fb = ""
            if n["opened"] and rng.random() < 0.08:
                fb = "regret" if n["rabbit"] else "useful"
            notes.append(dict(
                event_id=nid, user_id=u, persona=persona, ts=ts.isoformat(timespec="seconds"), date=n["day"],
                weekday=d.weekday(), is_weekend=int(weekend), hour=int(n["hour"]), minute=int((n["hour"] % 1) * 60),
                hour_sin=round(math.sin(2 * math.pi * n["hour"] / 24), 4), hour_cos=round(math.cos(2 * math.pi * n["hour"] / 24), 4),
                category=n["category"], app=n["app"], sender_type=SENDER[n["category"]],
                importance=CATEGORIES[n["category"]]["importance"], is_vip=int(n["category"] in vip),
                task=n["task"], task_depth=n["depth"], minutes_in_block=n["minutes_in"], fatigue=n["fatigue"],
                focus_capacity=round(focus_curve(persona, n["hour"]), 3), recent_switches_15m=recent_sw, notifs_last_60m=last_hour,
                environment=environment(rng, persona, n["hour"], weekend), device=rng.choice(["laptop", "laptop", "phone"]),
                policy_action=n["action"], exploration=int(n["action"] == "delay"),
                opened=int(n["opened"]), open_latency_s=round(rng.lognormvariate(math.log(25), 0.8), 1) if n["opened"] else None,
                rabbit_hole=int(n["rabbit"]), followed_app=n["followed_app"] or "", away_min=n["away_min"],
                resume_min=n["resume_min"], cost_min=n["cost_min"], feedback=fb,
            ))
        if u % 10 == 0:
            print(f"  {u}/{n_users} users · {nid:,} notifications · {sid:,} sessions · {time.time() - t0:.1f}s")
    return pd.DataFrame(users), pd.DataFrame(notes), pd.DataFrame(sessions)


def save(users: pd.DataFrame, notes: pd.DataFrame, sessions: pd.DataFrame, db_path: Path = DB):
    DATA.mkdir(exist_ok=True)
    users.to_csv(DATA / "users.csv", index=False)
    notes.to_csv(DATA / "notifications.csv", index=False)
    sessions.to_csv(DATA / "sessions.csv", index=False)
    with sqlite3.connect(db_path) as c:
        users.to_sql("ds_users", c, if_exists="replace", index=False)
        notes.to_sql("ds_notifications", c, if_exists="replace", index=False, chunksize=5000)
        sessions.to_sql("ds_sessions", c, if_exists="replace", index=False, chunksize=5000)
        c.executescript("""
            CREATE INDEX IF NOT EXISTS idx_dsn_user ON ds_notifications(user_id, ts);
            CREATE INDEX IF NOT EXISTS idx_dsn_cat ON ds_notifications(category);
            CREATE INDEX IF NOT EXISTS idx_dss_user ON ds_sessions(user_id, start_ts);
        """)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--users", type=int, default=60)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--seed", type=int, default=2026)
    a = ap.parse_args()
    print(f"Generating {a.users} users × {a.days} days …")
    users, notes, sessions = build(a.users, a.days, a.seed)
    save(users, notes, sessions)
    print(f"Done: {len(users)} users, {len(notes):,} notifications ({notes.shape[1]} columns), {len(sessions):,} sessions ({sessions.shape[1]} columns)")
    print(f"CSVs in {DATA}/ and tables ds_users, ds_notifications, ds_sessions in {DB.name}")


if __name__ == "__main__":
    main()
