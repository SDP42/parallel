"""Platform features (backlog 51-75): budget, debt, reservations, developer API,
audit chain, co-focus rooms, planner, habit experiments, portable profile,
team health and the companion character."""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from contextlib import closing
from datetime import date, datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .main import CATEGORIES, PERSONAS, db, current_user, get_twin, stats_for, twin_of, vip_of
from .twin import fmt_h

router = APIRouter(prefix="/api")

with closing(db()) as c:
    c.executescript("""
    CREATE TABLE IF NOT EXISTS budgets (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, daily_min INTEGER DEFAULT 45);
    CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        starts REAL, ends REAL, intent TEXT, exceptions TEXT);
    CREATE TABLE IF NOT EXISTS api_keys (
        key_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, label TEXT, created REAL,
        calls INTEGER DEFAULT 0, quota INTEGER DEFAULT 1000);
    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, ts REAL, kind TEXT, payload TEXT, prev_hash TEXT, hash TEXT);
    CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY, name TEXT, goal TEXT, host INTEGER, created REAL, ends REAL);
    CREATE TABLE IF NOT EXISTS room_members (
        code TEXT REFERENCES rooms(code) ON DELETE CASCADE, user_id INTEGER, name TEXT, joined REAL, done INTEGER DEFAULT 0,
        PRIMARY KEY (code, user_id));
    CREATE TABLE IF NOT EXISTS habit_experiments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT,
        category TEXT, rule TEXT, started REAL, days INTEGER, baseline_cost REAL, status TEXT DEFAULT 'running');
    """)


# ---------------------------------------------------------------- audit (75)
def audit(uid: int | None, kind: str, payload: dict):
    """Tamper-evident log: every row's hash covers the previous row's hash."""
    with closing(db()) as c, c:
        prev = c.execute("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
        prev_hash = prev["hash"] if prev else "genesis"
        ts = time.time()
        body = json.dumps(payload, sort_keys=True)
        h = hashlib.sha256(f"{prev_hash}|{uid}|{ts}|{kind}|{body}".encode()).hexdigest()
        c.execute("INSERT INTO audit_log(user_id,ts,kind,payload,prev_hash,hash) VALUES(?,?,?,?,?,?)", (uid, ts, kind, body, prev_hash, h))


@router.get("/audit")
def audit_view(u=Depends(current_user)):
    with closing(db()) as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM audit_log ORDER BY id")]
    ok, prev = True, "genesis"
    for r in rows:
        h = hashlib.sha256(f"{prev}|{r['user_id']}|{r['ts']}|{r['kind']}|{r['payload']}".encode()).hexdigest()
        if r["prev_hash"] != prev or r["hash"] != h:
            ok = False
            break
        prev = r["hash"]
    mine = [r for r in rows if r["user_id"] == u["id"]][-25:]
    return dict(chain_valid=ok, total_entries=len(rows), entries=list(reversed(mine)))


# ---------------------------------------------------------------- budget (51) + debt (52)
def today_allowed_cost(u):
    t = twin_of(u)
    today = date.today().isoformat()
    sim_cost = sum(n["cost_min"] for n in t.notifs if n["day"] == today and n["action"] == "allow" and n["opened"])
    day0 = datetime.combine(date.today(), datetime.min.time()).timestamp()
    with closing(db()) as c:
        mine = c.execute("SELECT COALESCE(SUM(predicted_cost),0) s FROM decisions WHERE user_id=? AND choice='allow' AND ts>?",
                         (u["id"], day0)).fetchone()["s"]
    return sim_cost, mine


@router.get("/budget")
def budget(u=Depends(current_user)):
    with closing(db()) as c:
        r = c.execute("SELECT daily_min FROM budgets WHERE user_id=?", (u["id"],)).fetchone()
    daily = r["daily_min"] if r else 45
    sim_cost, mine = today_allowed_cost(u)
    spent = round(sim_cost + mine, 1)
    hour = datetime.now().hour + datetime.now().minute / 60
    day_frac = min(1, max(0.05, (hour - 8) / 15))
    pace = spent / day_frac if day_frac else spent
    return dict(daily_min=daily, spent_min=spent, remaining_min=round(max(0, daily - spent), 1),
                projected_end_of_day=round(pace, 1), on_track=pace <= daily,
                note="Discretionary interruption minutes: a budget you spend on purpose, not a screen-time limit.")


class BudgetSet(BaseModel):
    daily_min: int = Field(ge=5, le=300)


@router.put("/budget")
def set_budget(body: BudgetSet, u=Depends(current_user)):
    with closing(db()) as c, c:
        c.execute("INSERT INTO budgets(user_id,daily_min) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET daily_min=excluded.daily_min",
                  (u["id"], body.daily_min))
    return budget(u)


@router.get("/debt")
def debt(u=Depends(current_user)):
    t = twin_of(u)
    days = t.days[-7:]
    rows = []
    for d in days:
        ns = [n for n in t.notifs if n["day"] == d and n["opened"]]
        rows.append(dict(day=d, switches=len(ns), away_min=round(sum(n["away_min"] for n in ns), 1),
                         recovery_min=round(sum(n["resume_min"] for n in ns), 1)))
    biggest = sorted([n for n in t.notifs if n["day"] in days and n["opened"]], key=lambda n: -n["cost_min"])[:5]
    return dict(week=rows, total_recovery_min=round(sum(r["recovery_min"] for r in rows), 1),
                biggest=[dict(day=n["day"], at=fmt_h(n["hour"]), app=n["followed_app"], cost=n["cost_min"], task=n["task"]) for n in biggest],
                caveat="An estimate of recovery time after switches, not a debt that compounds linearly.")


# ---------------------------------------------------------------- focus reservation (54)
class Reserve(BaseModel):
    minutes: int = Field(ge=5, le=240)
    intent: str = "Deep work"
    exceptions: list[str] = ["security", "family", "calendar"]


@router.post("/focus/reserve")
def reserve(body: Reserve, u=Depends(current_user)):
    now = time.time()
    with closing(db()) as c, c:
        c.execute("DELETE FROM reservations WHERE user_id=? AND ends>?", (u["id"], now))
        c.execute("INSERT INTO reservations(user_id,starts,ends,intent,exceptions) VALUES(?,?,?,?,?)",
                  (u["id"], now, now + body.minutes * 60, body.intent, json.dumps(body.exceptions)))
    audit(u["id"], "focus_reserved", body.model_dump())
    return focus_status(u)


def active_reservation(uid: int):
    with closing(db()) as c:
        r = c.execute("SELECT * FROM reservations WHERE user_id=? AND ends>? ORDER BY ends DESC LIMIT 1", (uid, time.time())).fetchone()
    return dict(r) if r else None


@router.get("/focus/status")
def focus_status(u=Depends(current_user)):
    r = active_reservation(u["id"])
    if not r:
        return dict(reserved=False)
    return dict(reserved=True, intent=r["intent"], until=r["ends"], minutes_left=round((r["ends"] - time.time()) / 60),
                exceptions=json.loads(r["exceptions"]))


@router.delete("/focus/reserve")
def cancel_reserve(u=Depends(current_user)):
    with closing(db()) as c, c:
        c.execute("UPDATE reservations SET ends=? WHERE user_id=? AND ends>?", (time.time(), u["id"], time.time()))
    return dict(reserved=False)


# ---------------------------------------------------------------- developer API (71, 73)
class KeyReq(BaseModel):
    label: str = "My integration"


@router.post("/developer/keys")
def create_key(body: KeyReq, u=Depends(current_user)):
    key = "pk_" + secrets.token_urlsafe(24)
    with closing(db()) as c, c:
        c.execute("INSERT INTO api_keys(key_hash,user_id,label,created) VALUES(?,?,?,?)",
                  (hashlib.sha256(key.encode()).hexdigest(), u["id"], body.label, time.time()))
    audit(u["id"], "api_key_created", dict(label=body.label))
    return dict(key=key, note="Shown once. Store it safely.")


@router.get("/developer/keys")
def list_keys(u=Depends(current_user)):
    with closing(db()) as c:
        return [dict(label=r["label"], created=r["created"], calls=r["calls"], quota=r["quota"], prefix=r["key_hash"][:8])
                for r in c.execute("SELECT * FROM api_keys WHERE user_id=?", (u["id"],))]


@router.get("/v1/interrupt")
def should_interrupt(category: str, x_api_key: str = Header(...)):
    """Third-party apps ask: is this a good moment to interrupt this user?"""
    kh = hashlib.sha256(x_api_key.encode()).hexdigest()
    with closing(db()) as c, c:
        k = c.execute("SELECT * FROM api_keys WHERE key_hash=?", (kh,)).fetchone()
        if not k:
            raise HTTPException(401, "Invalid API key")
        if k["calls"] >= k["quota"]:
            raise HTTPException(429, "Quota exceeded")
        c.execute("UPDATE api_keys SET calls=calls+1 WHERE key_hash=?", (kh,))
        u = dict(c.execute("SELECT * FROM users WHERE id=?", (k["user_id"],)).fetchone())
    if category not in CATEGORIES:
        raise HTTPException(400, "Unknown category")
    res = active_reservation(u["id"])
    t = twin_of(u)
    ctx = t.context_now()
    sim = t.simulate(category, ctx["hour"], ctx["depth"], 35, ctx["fatigue"], ctx["task"], 500)
    vip = vip_of(u)
    if category in vip or (res and category in json.loads(res["exceptions"])):
        decision, reason = "now", "User marked this as always allowed."
    elif res:
        decision, reason = "defer", f"User reserved focus for '{res['intent']}' until {datetime.fromtimestamp(res['ends']).strftime('%H:%M')}."
    else:
        decision = {"allow": "now", "delay": "defer", "summarize": "digest", "ask": "now"}[sim["recommendation"]]
        reason = sim["why"]
    audit(u["id"], "api_interrupt_query", dict(category=category, decision=decision))
    return dict(decision=decision, reason=reason, deliver_after=res["ends"] if res and decision == "defer" else None,
                confidence=sim["confidence"], model_version=sim["model_version"])


# ---------------------------------------------------------------- co-focus rooms (63)
class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    goal: str = ""
    minutes: int = Field(50, ge=10, le=180)


@router.post("/rooms")
def create_room(body: RoomCreate, u=Depends(current_user)):
    code = secrets.token_hex(3).upper()
    with closing(db()) as c, c:
        c.execute("INSERT INTO rooms(code,name,goal,host,created,ends) VALUES(?,?,?,?,?,?)",
                  (code, body.name, body.goal, u["id"], time.time(), time.time() + body.minutes * 60))
        c.execute("INSERT INTO room_members(code,user_id,name,joined) VALUES(?,?,?,?)", (code, u["id"], u["name"], time.time()))
    return room(code, u)


@router.post("/rooms/{code}/join")
def join_room(code: str, u=Depends(current_user)):
    with closing(db()) as c, c:
        if not c.execute("SELECT 1 FROM rooms WHERE code=?", (code.upper(),)).fetchone():
            raise HTTPException(404, "Room not found")
        c.execute("INSERT OR IGNORE INTO room_members(code,user_id,name,joined) VALUES(?,?,?,?)", (code.upper(), u["id"], u["name"], time.time()))
    return room(code, u)


@router.post("/rooms/{code}/done")
def room_done(code: str, u=Depends(current_user)):
    with closing(db()) as c, c:
        c.execute("UPDATE room_members SET done=1 WHERE code=? AND user_id=?", (code.upper(), u["id"]))
    return room(code, u)


@router.get("/rooms/{code}")
def room(code: str, u=Depends(current_user)):
    with closing(db()) as c:
        r = c.execute("SELECT * FROM rooms WHERE code=?", (code.upper(),)).fetchone()
        if not r:
            raise HTTPException(404, "Room not found")
        members = [dict(name=m["name"], done=bool(m["done"]), you=m["user_id"] == u["id"])
                   for m in c.execute("SELECT * FROM room_members WHERE code=?", (code.upper(),))]
    return dict(code=r["code"], name=r["name"], goal=r["goal"], ends=r["ends"],
                minutes_left=max(0, round((r["ends"] - time.time()) / 60)), members=members)


@router.get("/rooms")
def my_rooms(u=Depends(current_user)):
    with closing(db()) as c:
        codes = [r["code"] for r in c.execute("SELECT r.code FROM rooms r JOIN room_members m ON m.code=r.code WHERE m.user_id=? AND r.ends>? ORDER BY r.created DESC", (u["id"], time.time()))]
    return [room(cd, u) for cd in codes]


# ---------------------------------------------------------------- planner (64)
@router.get("/planner")
def planner(u=Depends(current_user)):
    t = twin_of(u)
    fc = t.forecast(14)
    p = PERSONAS[u["persona"]]
    plan = []
    for f in fc:
        score = f["focus"] * (1 - f["risk"]) * (1 - f["fatigue"] * 0.6)
        if f["hour"] < 7 or f["hour"] >= 24:
            kind = "rest"
        elif f["fatigue"] > 0.7:
            kind = "break"
        elif score > 0.35:
            kind = "deep"
        elif score > 0.18:
            kind = "routine"
        else:
            kind = "light"
        plan.append(dict(hour=f["hour"], label=fmt_h(f["hour"]), kind=kind, score=round(score, 2),
                         suggestion={"deep": f"{p['tasks'][0]}: hardest part first", "routine": "Email, reviews, admin",
                                     "light": "Reading, planning, errands", "break": "Walk, water, no feeds", "rest": "Sleep. Your twin insists."}[kind]))
    return dict(plan=plan, method="Focus forecast × (1 − interruption risk) × fatigue penalty")


# ---------------------------------------------------------------- habit experiments (68)
class HabitReq(BaseModel):
    category: str
    days: int = Field(7, ge=3, le=21)


@router.post("/habits")
def start_habit(body: HabitReq, u=Depends(current_user)):
    if body.category not in CATEGORIES:
        raise HTTPException(400, "Unknown category")
    t = twin_of(u)
    cat = next((c for c in t.categories() if c["category"] == body.category), None)
    base = cat["cost_allow"] * cat["per_day"] * cat["open_rate"] if cat else 0
    title = f"Hold '{CATEGORIES[body.category]['label']}' during focus for {body.days} days"
    with closing(db()) as c, c:
        c.execute("INSERT INTO habit_experiments(user_id,title,category,rule,started,days,baseline_cost) VALUES(?,?,?,?,?,?,?)",
                  (u["id"], title, body.category, "delay-during-focus", time.time(), body.days, round(base, 1)))
    audit(u["id"], "habit_started", body.model_dump())
    return habits(u)


@router.get("/habits")
def habits(u=Depends(current_user)):
    out = []
    with closing(db()) as c:
        for h in c.execute("SELECT * FROM habit_experiments WHERE user_id=? ORDER BY started DESC", (u["id"],)):
            h = dict(h)
            elapsed = (time.time() - h["started"]) / 86400
            day0 = h["started"]
            n = c.execute("SELECT COUNT(*) n, COALESCE(SUM(saved),0) s FROM decisions WHERE user_id=? AND category=? AND ts>? AND choice!='allow'",
                          (u["id"], h["category"], day0)).fetchone()
            h.update(day=min(h["days"], int(elapsed) + 1), adherence_events=n["n"], minutes_saved=round(n["s"], 1),
                     baseline_per_day=h["baseline_cost"], status="done" if elapsed >= h["days"] else "running")
            out.append(h)
    return out


# ---------------------------------------------------------------- portable profile (70)
@router.get("/profile/portable")
def portable(u=Depends(current_user)):
    t = twin_of(u)
    fp = t.fingerprint()
    with closing(db()) as c:
        rules = {r["category"]: r["mode"] for r in c.execute("SELECT * FROM rules WHERE user_id=?", (u["id"],))}
    return {
        "$schema": "https://parallel-twin.app/schema/attention-profile/v1.json",
        "version": "1.0", "exported": datetime.now().isoformat(timespec="seconds"),
        "persona": u["persona"],
        "focus_windows": [dict(start=fp["best_window"]["start"], end=fp["best_window"]["end"], quality=fp["best_window"]["quality"])],
        "fatigue_onset_hour": fp["fatigue_onset"],
        "traits": fp["traits"],
        "notification_policy": {k: rules.get(k, "auto") for k in CATEGORIES},
        "always_allow": sorted(vip_of(u)),
        "model_version": t.model_version,
        "contains_raw_events": False,
    }


class Portable(BaseModel):
    version: str
    notification_policy: dict[str, str] = {}
    always_allow: list[str] = []


@router.post("/profile/portable")
def import_portable(body: Portable, u=Depends(current_user)):
    if not body.version.startswith("1."):
        raise HTTPException(400, "Unsupported profile version")
    n = 0
    with closing(db()) as c, c:
        for k, mode in body.notification_policy.items():
            if k in CATEGORIES and mode in ("auto", "always", "digest", "never"):
                c.execute("INSERT INTO rules(user_id,category,mode) VALUES(?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET mode=excluded.mode",
                          (u["id"], k, mode))
                n += 1
    audit(u["id"], "profile_imported", dict(rules=n))
    return dict(imported_rules=n)


# ---------------------------------------------------------------- team health (72)
K_MIN = 5


@router.get("/team/health")
def team_health(u=Depends(current_user)):
    """Aggregate-only team view. Refuses to report a group smaller than K_MIN (k-anonymity)."""
    seeds = [11, 23, 37, 41, 59, 61]
    personas = ["developer", "developer", "professional", "creator", "developer", "professional"]
    twins = [get_twin(p, s) for p, s in zip(personas, seeds)]
    if len(twins) < K_MIN:
        return dict(hidden=True, reason=f"Fewer than {K_MIN} members; aggregate withheld to protect individuals.")
    by_hour = [0.0] * 24
    frag = []
    for tw in twins:
        fp = tw.fingerprint()
        for h, v in enumerate(fp["hourly"]):
            by_hour[h] += v / len(twins)
        frag.append(fp["interruptions_per_day"])
    meet = sum(1 for tw in twins for s in tw.segments if s["kind"] == "meeting") / len(twins) / 14
    return dict(members=len(twins), k_min=K_MIN, focus_by_hour=[round(v, 2) for v in by_hour],
                interruptions_per_person_day=round(sum(frag) / len(frag), 1), meetings_per_person_day=round(meet, 1),
                suggestion="Team-wide quiet hours 10:00-12:00 would cover the shared focus peak.",
                privacy="No individual scores are stored or shown. Managers see only this aggregate.")


# ---------------------------------------------------------------- companion (61)
@router.get("/companion")
def companion(u=Depends(current_user)):
    st = stats_for(u)
    t = twin_of(u)
    ctx = t.context_now()
    if st["decisions"] == 0:
        mood, line = "curious", "Hi! I'm Echo, your twin. Try the Multiverse and I'll start learning you."
    elif ctx["fatigue"] > 0.6:
        mood, line = "sleepy", "We've been at it a while. A short walk would make me very happy."
    elif st["minutes_saved"] > 30:
        mood, line = "proud", f"{round(st['minutes_saved'])} focus-minutes protected. Universe B is looking good."
    else:
        mood, line = "cheerful", "Every choice teaches me something. Breaks count too."
    return dict(name="Echo", mood=mood, line=line, level=st["level"])
