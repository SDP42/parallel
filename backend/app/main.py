"""Parallel — Attention Digital Twin API (FastAPI)."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import closing
from pathlib import Path

import jwt
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from .personas import CATEGORIES, PERSONAS
from .assistant import answer
from . import history as hist
from . import population
from .twin import _cache as _twin_cache, get_twin
from .gamify import CAPABILITIES, checkpoint_after, streak, world_state, xp_for
from datetime import date, datetime

DB_PATH = Path(os.getenv("PARALLEL_DB", Path(__file__).resolve().parent.parent / "parallel.db"))
SECRET = os.getenv("PARALLEL_SECRET", "dev-secret-change-me-please-32-bytes-min")

app = FastAPI(title="Parallel — Attention Digital Twin", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
bearer = HTTPBearer(auto_error=False)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


with closing(db()) as c:
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, name TEXT, pw TEXT, salt TEXT,
        persona TEXT, goals TEXT, vip TEXT, xp INTEGER DEFAULT 0, created REAL);
    CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, ts REAL,
        category TEXT, choice TEXT CHECK (choice IN ('allow','delay','summarize')),
        predicted_cost REAL, actual_cost REAL, saved REAL);
    CREATE INDEX IF NOT EXISTS idx_decisions_user ON decisions(user_id, ts);
    CREATE TABLE IF NOT EXISTS rules (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, category TEXT,
        mode TEXT CHECK (mode IN ('auto','always','digest','never')), PRIMARY KEY (user_id, category));
    CREATE TABLE IF NOT EXISTS focus_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        task TEXT, next_step TEXT, started REAL, ended REAL, interruptions INTEGER DEFAULT 0, rating INTEGER);
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        source TEXT, type TEXT, ts TEXT, duration REAL, app TEXT, category TEXT, meta TEXT,
        UNIQUE(user_id, source, type, ts, app));
    CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, ts REAL,
        model_version TEXT, category TEXT, context TEXT, p_open REAL, cost_allow REAL, cost_p10 REAL, cost_p90 REAL,
        cost_delay REAL, recommendation TEXT, confidence REAL, choice TEXT, actual_cost REAL);
    CREATE TABLE IF NOT EXISTS deferred_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        category TEXT, app TEXT, text TEXT, mode TEXT, created REAL, release_at REAL, released REAL);
    CREATE TABLE IF NOT EXISTS xp_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ts REAL, amount INTEGER, reason TEXT);
    CREATE TABLE IF NOT EXISTS quests (
        id TEXT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT, detail TEXT, xp INTEGER,
        status TEXT DEFAULT 'open', created REAL, done REAL, PRIMARY KEY (id, user_id));
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        pause_learning INTEGER DEFAULT 0, retention_days INTEGER DEFAULT 30, platform TEXT DEFAULT 'web');
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, ts);
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ts REAL, role TEXT, lang TEXT, text TEXT, intent TEXT);
    CREATE TABLE IF NOT EXISTS model_registry (version TEXT PRIMARY KEY, created TEXT, path TEXT, status TEXT,
        rows_train INTEGER, rows_test INTEGER, auc_open REAL, brier_open REAL, mae_cost REAL, metrics TEXT);
    CREATE TABLE IF NOT EXISTS user_profile (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT, updated REAL);
    CREATE TABLE IF NOT EXISTS checkins (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ts REAL, energy INTEGER, mood TEXT);
    CREATE TABLE IF NOT EXISTS matter_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ts REAL, category TEXT, mattered INTEGER);
    CREATE TABLE IF NOT EXISTS contact_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, name TEXT, email TEXT, message TEXT);
    """)


with closing(db()) as c:
    hist.ensure_schema(c)


def hash_pw(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 120_000).hex()


def token_for(uid: int) -> str:
    return jwt.encode({"sub": str(uid), "exp": int(time.time()) + 7 * 86400}, SECRET, algorithm="HS256")


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not cred:
        raise HTTPException(401, "Not signed in")
    try:
        uid = int(jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])["sub"])
    except Exception:
        raise HTTPException(401, "Session expired")
    with closing(db()) as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(401, "Unknown user")
    return dict(row)


def public(u: dict):
    return dict(id=u["id"], email=u["email"], name=u["name"], persona=u["persona"],
                goals=json.loads(u["goals"] or "[]"), vip=json.loads(u["vip"] or "[]"), xp=u["xp"])


def twin_of(u: dict):
    """The user's twin, trained from their own rows in user_segments / user_notifications."""
    if not u["persona"]:
        raise HTTPException(409, "Choose a persona first")
    seed = u["id"] * 7919
    with closing(db()) as c:
        profile = load_profile(c, u["id"])
        n = hist.ensure_history(c, u["id"], u["persona"], seed, profile)
        key = (u["persona"], seed, date.today().isoformat(), n)
        h = None if key in _twin_cache else hist.load_history(c, u["id"])
        learned = learned_importance(c, u["id"])
        energy = latest_energy(c, u["id"])
    t = get_twin(u["persona"], seed, h, version=n)
    t.profile, t.learned_importance, t.energy = profile, learned, energy
    return t


def load_profile(c, uid: int) -> dict | None:
    r = c.execute("SELECT data FROM user_profile WHERE user_id=?", (uid,)).fetchone()
    return json.loads(r[0]) if r else None


def learned_importance(c, uid: int) -> dict:
    """Bayesian update of each alert type's importance from the user's "did this matter?" taps."""
    out = {}
    for r in c.execute("SELECT category, SUM(mattered) yes, COUNT(*) n FROM matter_feedback WHERE user_id=? GROUP BY category", (uid,)):
        prior = CATEGORIES[r[0]]["importance"] if r[0] in CATEGORIES else 0.3
        out[r[0]] = round((prior * 6 + r[1]) / (6 + r[2]), 3)
    return out


def latest_energy(c, uid: int) -> int | None:
    r = c.execute("SELECT energy FROM checkins WHERE user_id=? AND ts>? ORDER BY ts DESC LIMIT 1", (uid, time.time() - 3 * 3600)).fetchone()
    return r[0] if r else None


# ----------------------------------------------------------------- auth
class SignUp(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: EmailStr
    password: str = Field(min_length=6)


class SignIn(BaseModel):
    email: EmailStr
    password: str


@app.post("/api/auth/signup")
def signup(body: SignUp):
    salt = secrets.token_hex(8)
    try:
        with closing(db()) as c, c:
            cur = c.execute("INSERT INTO users(email,name,pw,salt,created) VALUES(?,?,?,?,?)",
                            (body.email.lower(), body.name, hash_pw(body.password, salt), salt, time.time()))
            uid = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists")
    with closing(db()) as c:
        u = dict(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())
    return dict(token=token_for(uid), user=public(u))


@app.post("/api/auth/signin")
def signin(body: SignIn):
    with closing(db()) as c:
        row = c.execute("SELECT * FROM users WHERE email=?", (body.email.lower(),)).fetchone()
    if not row or not row["pw"] or not hmac.compare_digest(row["pw"], hash_pw(body.password, row["salt"])):
        raise HTTPException(401, "Wrong email or password")
    return dict(token=token_for(row["id"]), user=public(dict(row)))


DEMO_PASSWORD = os.getenv("PARALLEL_DEMO_PASSWORD", "parallel123")
DEMO_GOALS = {"student": ["Ace my exams", "Less doomscrolling"], "developer": ["Ship deep work", "Fewer context switches"],
              "creator": ["Create first, post later", "Protect my evenings"], "professional": ["Fewer context switches", "Better breaks"]}


def demo_routine(persona: str) -> dict:
    """A believable declared routine for each demo persona, so routine-aware features show up immediately."""
    from datetime import timedelta
    from .routine import TEMPLATES
    tpl = {"student": "college", "developer": "remote_dev", "creator": "creator", "professional": "office"}[persona]
    soon = (date.today() + timedelta(days=3)).isoformat()
    return dict(
        wake={"student": 6.5, "developer": 8.5, "creator": 9.0, "professional": 7.0}[persona],
        bed={"student": 23.5, "developer": 24.0, "creator": 24.0, "professional": 23.0}[persona],
        chronotype={"student": "morning", "developer": "evening", "creator": "evening", "professional": "morning"}[persona],
        blocks=TEMPLATES[tpl]["blocks"],
        deadlines=[dict(title={"student": "DBMS mid-sem", "developer": "Sprint demo", "creator": "Brand video delivery",
                               "professional": "Quarterly review"}[persona], due=soon, kind="exam" if persona == "student" else "deadline")],
        tools={"student": ["Notion", "Docs"], "developer": ["VS Code", "Terminal", "GitHub"], "creator": ["Figma", "Docs"],
               "professional": ["Excel", "Docs"]}[persona],
        nags={"student": ["Instagram", "YouTube"], "developer": ["X", "YouTube"], "creator": ["Instagram", "Reddit"],
              "professional": ["LinkedIn", "Amazon"]}[persona],
    )


def seed_demo_accounts():
    """Four demo accounts with a known password, so judges can sign in through the real form."""
    with closing(db()) as c, c:
        for persona, p in PERSONAS.items():
            email = f"{persona}@parallel.app"
            if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                continue
            salt = secrets.token_hex(8)
            cur = c.execute("INSERT INTO users(email,name,pw,salt,persona,goals,vip,created) VALUES(?,?,?,?,?,?,?,?)",
                            (email, f"Demo {p['label']}", hash_pw(DEMO_PASSWORD, salt), salt, persona,
                             json.dumps(DEMO_GOALS[persona]), json.dumps(["family", "security", "calendar"]), time.time()))
            c.execute("INSERT OR REPLACE INTO user_profile(user_id,data,updated) VALUES(?,?,?)",
                      (cur.lastrowid, json.dumps(demo_routine(persona)), time.time()))


seed_demo_accounts()


@app.post("/api/auth/demo")
def demo(persona: str = "developer"):
    """One-click sign-in to a seeded demo account (same as typing <persona>@parallel.app / parallel123)."""
    if persona not in PERSONAS:
        raise HTTPException(400, "Unknown persona")
    seed_demo_accounts()
    with closing(db()) as c:
        row = c.execute("SELECT * FROM users WHERE email=?", (f"{persona}@parallel.app",)).fetchone()
    return dict(token=token_for(row["id"]), user=public(dict(row)))


@app.get("/api/auth/demo-accounts")
def demo_accounts():
    return [dict(email=f"{k}@parallel.app", password=DEMO_PASSWORD, persona=k, label=v["label"]) for k, v in PERSONAS.items()]


@app.get("/api/me")
def me(u=Depends(current_user)):
    return public(u)


class Onboard(BaseModel):
    persona: str
    goals: list[str] = []
    vip: list[str] = []


@app.put("/api/me/persona")
def set_persona(body: Onboard, u=Depends(current_user)):
    if body.persona not in PERSONAS:
        raise HTTPException(400, "Unknown persona")
    with closing(db()) as c, c:
        c.execute("UPDATE users SET persona=?, goals=?, vip=? WHERE id=?",
                  (body.persona, json.dumps(body.goals), json.dumps(body.vip), u["id"]))
        row = dict(c.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone())
    return public(row)


@app.get("/api/personas")
def personas():
    return [dict(key=k, label=v["label"], tagline=v["tagline"], tasks=v["tasks"]) for k, v in PERSONAS.items()]


@app.get("/api/categories")
def categories_meta():
    return [dict(key=k, **v) for k, v in CATEGORIES.items()]


# ----------------------------------------------------------------- twin
@app.get("/api/twin/overview")
def overview(u=Depends(current_user)):
    t = twin_of(u)
    return dict(fingerprint=t.fingerprint(), insights=t.insights(), now=t.context_now(),
                categories=t.categories(), apps=t.apps()[:8], stats=stats_for(u))


@app.get("/api/twin/graph")
def graph(u=Depends(current_user)):
    return twin_of(u).graph()


@app.get("/api/twin/replay")
def replay(day: str | None = None, u=Depends(current_user)):
    return twin_of(u).replay(day)


@app.get("/api/twin/accuracy")
def accuracy(u=Depends(current_user)):
    return twin_of(u).accuracy()


class SimRequest(BaseModel):
    category: str
    hour: float | None = None
    depth: float | None = None
    minutes_in: float = 35
    fatigue: float | None = None
    task: str | None = None


@app.post("/api/simulate")
def simulate(body: SimRequest, u=Depends(current_user)):
    if body.category not in CATEGORIES:
        raise HTTPException(400, "Unknown category")
    t = twin_of(u)
    now = t.context_now(body.hour)
    res = t.simulate(body.category, now["hour"], body.depth if body.depth is not None else now["depth"],
                     body.minutes_in, body.fatigue if body.fatigue is not None else now["fatigue"],
                     body.task or now["task"])
    pop = population.predict(u["persona"], body.category, res["context"]["hour"], res["context"]["depth"],
                             res["context"]["minutes_in"], res["context"]["fatigue"], weekday=date.today().weekday())
    if pop:
        w = res["similar_events"] / (res["similar_events"] + 20)  # personal weight grows with personal evidence
        res["population"] = pop
        res["blend"] = dict(personal_weight=round(w, 2),
                            p_open=round(w * res["allow"]["p_open"] + (1 - w) * pop["p_open"], 3),
                            cost_p50=round(w * res["allow"]["cost_p50"] + (1 - w) * pop["cost_p50"], 1))
    mode = rule_modes(u).get(body.category)
    if body.category in vip_of(u) or mode == "always":
        res["recommendation"], res["why"] = "allow", "You marked this as always-allowed. Your rules win."
    elif mode == "digest":
        res["recommendation"], res["why"] = "summarize", "Your rule sends these to the digest."
    elif mode == "never":
        res["recommendation"], res["why"] = "delay", "You muted this category. It waits in the queue until you look."
    return res


def rule_modes(u) -> dict:
    with closing(db()) as c:
        return {r["category"]: r["mode"] for r in c.execute("SELECT category, mode FROM rules WHERE user_id=?", (u["id"],))}


SAMPLE_TEXT = {
    "social_like": "aarav_07 and 12 others liked your post",
    "social_dm": "Riya: bro did you see this 😂",
    "video_reco": "New video: 'I coded for 24 hours straight'",
    "work_chat": "Teammate: can you review my PR when free?",
    "email": "Newsletter: 10 productivity hacks",
    "calendar": "Standup in 10 minutes",
    "family": "Mom: call me when you're free",
    "promo": "FLASH SALE 70% off ends tonight!",
    "news": "Breaking: markets react to …",
    "security": "New sign-in to your bank account",
}


@app.get("/api/notifications/queue")
def queue(u=Depends(current_user)):
    t = twin_of(u)
    now = t.context_now()
    vip = vip_of(u)
    modes = rule_modes(u)
    out = []
    for i, k in enumerate(["social_like", "work_chat", "video_reco", "family", "promo", "social_dm", "calendar", "news"]):
        r = t.simulate(k, now["hour"], now["depth"], 35, now["fatigue"], now["task"], 600, rng_seed=i)
        rec = "allow" if k in vip else {"digest": "summarize", "never": "delay"}.get(modes.get(k), r["recommendation"])
        if rec != r["recommendation"]:
            r["why"] = "Your rule decides this one."
        out.append(dict(id=f"q{i}", category=k, label=r["label"], app=r["app"], text=SAMPLE_TEXT[k],
                        minutes_ago=i * 3 + 1, recommendation=rec, why=r["why"], cost=r["allow"]["cost_expected"],
                        saved=r["saved_minutes"], p_open=r["allow"]["p_open"], confidence=r["confidence"]))
    return out


@app.get("/api/demo/simulate")
def demo_simulate(category: str = "social_like", persona: str = "developer"):
    """Public, no-login simulation on the landing page (uses a demo twin)."""
    if category not in CATEGORIES or persona not in PERSONAS:
        raise HTTPException(400, "Unknown category or persona")
    t = get_twin(persona, 4242)
    p = PERSONAS[persona]
    return t.simulate(category, 11.0, 1.0, 40, 0.45, p["tasks"][0], 1500)


@app.get("/api/demo/persona/{persona}")
def demo_persona(persona: str):
    """Public snapshot of a demo twin per persona for the landing page."""
    if persona not in PERSONAS:
        raise HTTPException(404, "Unknown persona")
    t = get_twin(persona, 4242)
    fp = t.fingerprint()
    breaker = next((a for a in t.apps() if a["focus_breaks_per_day"] > 0), None)
    return dict(persona=persona, label=PERSONAS[persona]["label"], tagline=PERSONAS[persona]["tagline"],
                best_window=fp["best_window"], fatigue_onset=fp["fatigue_onset"], hourly=fp["hourly"],
                traits=fp["traits"], breaker=breaker, notifications_per_day=fp["notifications_per_day"])


class Decision(BaseModel):
    category: str
    choice: str  # allow | delay | summarize
    predicted_cost: float
    actual_cost: float | None = None
    saved: float = 0


def stats_for(u):
    with closing(db()) as c:
        rows = c.execute("SELECT * FROM decisions WHERE user_id=? ORDER BY ts DESC", (u["id"],)).fetchall()
        xp = c.execute("SELECT xp FROM users WHERE id=?", (u["id"],)).fetchone()["xp"]
    saved = sum(r["saved"] for r in rows if r["choice"] != "allow")
    level = 1 + xp // 100
    held = sum(1 for r in rows if r["choice"] != "allow")
    honest = sum(1 for r in rows if r["actual_cost"] is not None)
    achievements = [
        dict(id="first", title="First fork", desc="Made your first intentional choice", got=len(rows) >= 1),
        dict(id="reel", title="Resisted the Infinite Reel", desc="Held back 3 social pings", got=sum(1 for r in rows if r["choice"] != "allow" and r["category"].startswith("social")) >= 3),
        dict(id="honest", title="Reality checker", desc="Told your twin what actually happened 3 times", got=honest >= 3),
        dict(id="hour", title="An hour reclaimed", desc="Protected 60 focus-minutes", got=saved >= 60),
        dict(id="balance", title="Not a robot", desc="Chose to allow a ping on purpose. Breaks are allowed.", got=any(r["choice"] == "allow" for r in rows)),
        dict(id="ten", title="Main character arc", desc="10 decisions made with your twin", got=len(rows) >= 10),
    ]
    return dict(decisions=len(rows), held_back=held, minutes_saved=round(saved, 1), xp=xp, level=level,
                next_level_xp=level * 100, achievements=achievements, recent=[dict(r) for r in rows[:8]])


# ------------------------------------------------- ML extras & recommender
def vip_of(u):
    vip = set(json.loads(u["vip"] or "[]"))
    with closing(db()) as c:
        for r in c.execute("SELECT category, mode FROM rules WHERE user_id=?", (u["id"],)):
            if r["mode"] == "always":
                vip.add(r["category"])
    return vip


@app.get("/api/twin/archetypes")
def archetypes(u=Depends(current_user)):
    return twin_of(u).archetypes()


@app.get("/api/twin/forecast")
def forecast(u=Depends(current_user)):
    return twin_of(u).forecast()


@app.get("/api/recommendations")
def recommendations(u=Depends(current_user)):
    return twin_of(u).recommendations(vip_of(u))


# ----------------------------------------------------------------- rules
@app.get("/api/rules")
def get_rules(u=Depends(current_user)):
    with closing(db()) as c:
        rows = {r["category"]: r["mode"] for r in c.execute("SELECT * FROM rules WHERE user_id=?", (u["id"],))}
    return [dict(category=k, label=v["label"], importance=v["importance"], mode=rows.get(k, "auto")) for k, v in CATEGORIES.items()]


class Rule(BaseModel):
    category: str
    mode: str


@app.put("/api/rules")
def put_rule(body: Rule, u=Depends(current_user)):
    if body.category not in CATEGORIES or body.mode not in ("auto", "always", "digest", "never"):
        raise HTTPException(400, "Bad rule")
    with closing(db()) as c, c:
        c.execute("INSERT INTO rules(user_id,category,mode) VALUES(?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET mode=excluded.mode",
                  (u["id"], body.category, body.mode))
    return get_rules(u)


# ------------------------------------------------- focus sessions (Context Save)
class SessionStart(BaseModel):
    task: str
    next_step: str = ""


@app.post("/api/sessions")
def start_session(body: SessionStart, u=Depends(current_user)):
    with closing(db()) as c, c:
        c.execute("UPDATE focus_sessions SET ended=? WHERE user_id=? AND ended IS NULL", (time.time(), u["id"]))
        cur = c.execute("INSERT INTO focus_sessions(user_id,task,next_step,started) VALUES(?,?,?,?)",
                        (u["id"], body.task, body.next_step, time.time()))
    return dict(id=cur.lastrowid, task=body.task, next_step=body.next_step, started=time.time())


@app.get("/api/sessions/current")
def current_session(u=Depends(current_user)):
    with closing(db()) as c:
        r = c.execute("SELECT * FROM focus_sessions WHERE user_id=? AND ended IS NULL ORDER BY started DESC LIMIT 1", (u["id"],)).fetchone()
    return dict(r) if r else None


class SessionEnd(BaseModel):
    rating: int | None = None
    next_step: str | None = None


@app.post("/api/sessions/end")
def end_session(body: SessionEnd, u=Depends(current_user)):
    with closing(db()) as c, c:
        c.execute("UPDATE focus_sessions SET ended=?, rating=?, next_step=COALESCE(?, next_step) WHERE user_id=? AND ended IS NULL",
                  (time.time(), body.rating, body.next_step, u["id"]))
    return {"ok": True}


@app.get("/api/sessions")
def list_sessions(u=Depends(current_user)):
    with closing(db()) as c:
        return [dict(r) for r in c.execute("SELECT * FROM focus_sessions WHERE user_id=? ORDER BY started DESC LIMIT 20", (u["id"],))]


# ------------------------------------------------- assistant
class Ask(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    lang: str = "en"


@app.post("/api/assistant")
def assistant(body: Ask, u=Depends(current_user)):
    res = answer(twin_of(u), body.text, body.lang, u["persona"], stats_for(u), vip_of(u))
    with closing(db()) as c, c:
        c.executemany("INSERT INTO chat_messages(user_id,ts,role,lang,text,intent) VALUES(?,?,?,?,?,?)",
                      [(u["id"], time.time(), "user", body.lang, body.text, res["intent"]),
                       (u["id"], time.time(), "twin", res["lang"], res["reply"], res["intent"])])
    return res


# ------------------------------------------------- privacy
@app.get("/api/me/export")
def export(u=Depends(current_user)):
    out = dict(user=public(u))
    with closing(db()) as c:
        for tbl in ("decisions", "rules", "focus_sessions", "events", "chat_messages", "checkins", "matter_feedback", "user_profile", "predictions", "deferred_queue", "xp_ledger", "quests"):
            out[tbl] = [dict(r) for r in c.execute(f"SELECT * FROM {tbl} WHERE user_id=?", (u["id"],))]
    return out


@app.delete("/api/me")
def delete_me(u=Depends(current_user)):
    with closing(db()) as c, c:
        c.execute("DELETE FROM users WHERE id=?", (u["id"],))
    return {"deleted": True}


# ------------------------------------------------- contact form
class Contact(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    message: str = Field(min_length=5, max_length=2000)


@app.post("/api/contact")
def contact(body: Contact):
    with closing(db()) as c, c:
        c.execute("INSERT INTO contact_messages(ts,name,email,message) VALUES(?,?,?,?)",
                  (time.time(), body.name, body.email, body.message))
    return {"ok": True, "message": "Thanks! We'll get back to you within a day."}


# ------------------------------------------------- unified events + data quality
class Event(BaseModel):
    type: str = Field(pattern="^(app_active|notification|focus_start|focus_end|switch|feedback)$")
    ts: str
    duration: float = 0
    app: str | None = None
    category: str | None = None
    meta: dict = {}
    source: str = "client"


def learning_paused(u) -> bool:
    with closing(db()) as c:
        r = c.execute("SELECT pause_learning FROM user_settings WHERE user_id=?", (u["id"],)).fetchone()
    return bool(r and r["pause_learning"])


@app.post("/api/events")
def ingest_events(events: list[Event], u=Depends(current_user)):
    """Normalized event collector. Duplicates are ignored by a unique key; message contents are never stored."""
    if learning_paused(u):
        return dict(ingested=0, paused=True)
    with closing(db()) as c, c:
        before = c.total_changes
        c.executemany("INSERT OR IGNORE INTO events(user_id,source,type,ts,duration,app,category,meta) VALUES(?,?,?,?,?,?,?,?)",
                      [(u["id"], e.source, e.type, e.ts, max(e.duration, 0), e.app, e.category,
                        json.dumps({k: v for k, v in e.meta.items() if k not in ("text", "title", "body")})) for e in events])
        added = c.total_changes - before
    return dict(ingested=added, duplicates=len(events) - added)


@app.get("/api/events")
def list_events(limit: int = 50, u=Depends(current_user)):
    with closing(db()) as c:
        return [dict(r) for r in c.execute("SELECT * FROM events WHERE user_id=? ORDER BY ts DESC LIMIT ?", (u["id"], min(limit, 500)))]


@app.get("/api/data-quality")
def data_quality(u=Depends(current_user)):
    return twin_of(u).data_quality()


# ------------------------------------------------- spec-style aliases
@app.get("/api/attention/profile")
def attention_profile(u=Depends(current_user)):
    return twin_of(u).fingerprint()


@app.get("/api/attention/timeline")
def attention_timeline(day: str | None = None, u=Depends(current_user)):
    return twin_of(u).replay(day)


@app.get("/api/insights/daily")
def insights_daily(u=Depends(current_user)):
    t = twin_of(u)
    return dict(day=date.today().isoformat(), model_version=t.model_version, insights=t.insights())


@app.post("/api/simulations")
def simulations(body: SimRequest, u=Depends(current_user)):
    """Simulate allow / delay / summarize futures and log the prediction for later evaluation."""
    res = simulate(body, u)
    with closing(db()) as c, c:
        cur = c.execute("""INSERT INTO predictions(user_id,ts,model_version,category,context,p_open,cost_allow,cost_p10,cost_p90,
                           cost_delay,recommendation,confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (u["id"], time.time(), res["model_version"], res["category"], json.dumps(res["context"]), res["allow"]["p_open"],
                         res["allow"]["cost_expected"], res["allow"]["cost_p10"], res["allow"]["cost_p90"], res["delay"]["cost_expected"],
                         res["recommendation"], res["confidence"]))
    res["prediction_id"] = cur.lastrowid
    audit(u["id"], "prediction", dict(id=cur.lastrowid, model=res["model_version"], category=res["category"], rec=res["recommendation"]))
    return res


@app.post("/api/notifications/{category}/predict")
def predict_notification(category: str, u=Depends(current_user)):
    return simulations(SimRequest(category=category), u)


# ------------------------------------------------- interventions, outcomes, queue
class Intervention(BaseModel):
    prediction_id: int | None = None
    category: str
    choice: str = Field(pattern="^(allow|delay|summarize)$")
    predicted_cost: float = 0
    saved: float = 0
    text: str | None = None


def award(c, uid: int, amount: int, reasons: list[str]):
    c.execute("INSERT INTO xp_ledger(user_id,ts,amount,reason) VALUES(?,?,?,?)", (uid, time.time(), amount, "; ".join(reasons)))
    c.execute("UPDATE users SET xp=xp+? WHERE id=?", (amount, uid))


@app.post("/api/interventions")
def intervene(body: Intervention, u=Depends(current_user)):
    if body.category not in CATEGORIES:
        raise HTTPException(400, "Unknown category")
    now = time.time()
    with closing(db()) as c, c:
        cur = c.execute("INSERT INTO decisions(user_id,ts,category,choice,predicted_cost,actual_cost,saved) VALUES(?,?,?,?,?,?,?)",
                        (u["id"], now, body.category, body.choice, body.predicted_cost, None, max(body.saved, 0)))
        if body.prediction_id:
            c.execute("UPDATE predictions SET choice=? WHERE id=? AND user_id=?", (body.choice, body.prediction_id, u["id"]))
        if body.choice != "allow":
            release = checkpoint_after(datetime.now()).timestamp() if body.choice == "delay" else \
                datetime.now().replace(hour=19, minute=0, second=0).timestamp()
            if release < now:
                release = now + 3600
            c.execute("INSERT INTO deferred_queue(user_id,category,app,text,mode,created,release_at) VALUES(?,?,?,?,?,?,?)",
                      (u["id"], body.category, None, body.text or CATEGORIES[body.category]["label"], body.choice, now, release))
        recent_same = c.execute("SELECT COUNT(*) n FROM decisions WHERE user_id=? AND category=? AND choice=? AND ts>?",
                                (u["id"], body.category, body.choice, now - 120)).fetchone()["n"] - 1
        day0 = datetime.combine(date.today(), datetime.min.time()).timestamp()
        today_delay_xp = c.execute("SELECT COALESCE(SUM(amount),0) s FROM xp_ledger WHERE user_id=? AND ts>? AND reason LIKE '%protected focus%'",
                                   (u["id"], day0)).fetchone()["s"]
        gain, reasons = xp_for(body.choice, CATEGORIES[body.category]["importance"], body.saved, False, recent_same, today_delay_xp)
        award(c, u["id"], gain, reasons)
    audit(u["id"], "intervention", dict(category=body.category, choice=body.choice, prediction_id=body.prediction_id))
    return dict(decision_id=cur.lastrowid, xp_gained=gain, reasons=reasons, stats=stats_for(u))


@app.post("/api/decisions")
def decide(body: Intervention, u=Depends(current_user)):
    return intervene(body, u)


class Outcome(BaseModel):
    prediction_id: int | None = None
    decision_id: int | None = None
    actual_cost: float = Field(ge=0, le=600)


@app.post("/api/outcomes")
def record_outcome(body: Outcome, u=Depends(current_user)):
    """What really happened. Compared with the prediction and rewarded for honesty (not for the number)."""
    with closing(db()) as c, c:
        pred = None
        if body.prediction_id:
            c.execute("UPDATE predictions SET actual_cost=? WHERE id=? AND user_id=?", (body.actual_cost, body.prediction_id, u["id"]))
            pred = c.execute("SELECT * FROM predictions WHERE id=? AND user_id=?", (body.prediction_id, u["id"])).fetchone()
        if body.decision_id:
            c.execute("UPDATE decisions SET actual_cost=? WHERE id=? AND user_id=?", (body.actual_cost, body.decision_id, u["id"]))
        award(c, u["id"], 15, ["+15 told your twin what really happened"])
        if pred:
            ctx = json.loads(pred["context"] or "{}")
            allowed = pred["choice"] in (None, "allow")
            away = body.actual_cost * 0.7 if allowed and body.actual_cost > 1 else 0.0
            c.execute("""INSERT INTO user_notifications(user_id,day,hour,category,app,task,depth,minutes_in,fatigue,action,opened,rabbit,
                         away_min,resume_min,cost_min,followed_app,chain,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'live')""",
                      (u["id"], date.today().isoformat(), ctx.get("hour", datetime.now().hour), pred["category"], None, ctx.get("task", ""),
                       ctx.get("depth", 0.6), ctx.get("minutes_in", 30), ctx.get("fatigue", 0.3), "allow" if allowed else "delay",
                       int(allowed and body.actual_cost > 1), int(allowed and body.actual_cost > 10), round(away, 2),
                       round(body.actual_cost - away, 2), body.actual_cost, None, "[]"))
    verdict = None
    if pred and pred["choice"] in (None, "allow"):
        inside = pred["cost_p10"] <= body.actual_cost <= pred["cost_p90"]
        verdict = dict(predicted=pred["cost_allow"], actual=body.actual_cost, within_range=inside,
                       message="Called it." if inside else ("You beat the prediction. The algorithm got humbled." if body.actual_cost < pred["cost_p10"] else "Worse than predicted. Noted for next time."))
    return dict(ok=True, verdict=verdict, stats=stats_for(u))


@app.get("/api/outcomes")
def list_outcomes(u=Depends(current_user)):
    with closing(db()) as c:
        return [dict(r) for r in c.execute("SELECT * FROM predictions WHERE user_id=? ORDER BY ts DESC LIMIT 30", (u["id"],))]


@app.get("/api/digest")
def digest(u=Depends(current_user)):
    now = time.time()
    with closing(db()) as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM deferred_queue WHERE user_id=? AND released IS NULL ORDER BY release_at", (u["id"],))]
    groups = {}
    for r in rows:
        g = groups.setdefault(r["category"], dict(category=r["category"], label=CATEGORIES[r["category"]]["label"], items=[], next_release=r["release_at"]))
        g["items"].append(r)
    return dict(pending=len(rows), due=sum(1 for r in rows if r["release_at"] <= now), groups=list(groups.values()))


@app.post("/api/digest/release")
def release_digest(u=Depends(current_user)):
    with closing(db()) as c, c:
        n = c.execute("UPDATE deferred_queue SET released=? WHERE user_id=? AND released IS NULL", (time.time(), u["id"])).rowcount
    return dict(released=n)


# ------------------------------------------------- gamification
def ensure_quests(u):
    t = twin_of(u)
    recs = t.recommendations(vip_of(u))[:3]
    templates = [
        dict(id="q-hold3", title="Hold back 3 low-value pings today", detail="Use the Smart inbox. Breaks are still allowed.", xp=30),
        dict(id="q-golden", title="One deep block in your golden hours", detail=recs[0]["title"] if recs else "Protect your best window.", xp=40),
        dict(id="q-honest", title="Tell your twin what really happened twice", detail="Record outcomes in the Multiverse.", xp=25),
        dict(id="q-context", title="Save your next step before a break", detail="Start a focus session with a next step note.", xp=20),
    ]
    with closing(db()) as c, c:
        for q in templates:
            c.execute("INSERT OR IGNORE INTO quests(id,user_id,title,detail,xp,created) VALUES(?,?,?,?,?,?)",
                      (q["id"], u["id"], q["title"], q["detail"], q["xp"], time.time()))


@app.get("/api/quests")
def quests(u=Depends(current_user)):
    ensure_quests(u)
    with closing(db()) as c:
        return [dict(r) for r in c.execute("SELECT * FROM quests WHERE user_id=? ORDER BY status DESC, xp DESC", (u["id"],))]


@app.post("/api/quests/{qid}/complete")
def complete_quest(qid: str, u=Depends(current_user)):
    with closing(db()) as c, c:
        q = c.execute("SELECT * FROM quests WHERE id=? AND user_id=?", (qid, u["id"])).fetchone()
        if not q:
            raise HTTPException(404, "Quest not found")
        if q["status"] == "done":
            return dict(ok=True, xp_gained=0)
        # Fair reward validation: quests must be backed by real activity
        checks = {
            "q-hold3": "SELECT COUNT(*) n FROM decisions WHERE user_id=? AND choice!='allow' AND ts>?",
            "q-honest": "SELECT COUNT(*) n FROM decisions WHERE user_id=? AND actual_cost IS NOT NULL AND ts>?",
            "q-context": "SELECT COUNT(*) n FROM focus_sessions WHERE user_id=? AND next_step!='' AND started>?",
        }
        need = {"q-hold3": 3, "q-honest": 2, "q-context": 1}
        if qid in checks:
            n = c.execute(checks[qid], (u["id"], time.time() - 86400)).fetchone()["n"]
            if n < need[qid]:
                raise HTTPException(409, f"Not yet: {n}/{need[qid]} done today")
        c.execute("UPDATE quests SET status='done', done=? WHERE id=? AND user_id=?", (time.time(), qid, u["id"]))
        award(c, u["id"], q["xp"], [f"+{q['xp']} quest: {q['title']}"])
    return dict(ok=True, xp_gained=q["xp"])


@app.get("/api/gamification/profile")
def gamification(u=Depends(current_user)):
    st = stats_for(u)
    with closing(db()) as c:
        days = {date.fromtimestamp(r["ts"]).isoformat() for r in c.execute("SELECT ts FROM decisions WHERE user_id=?", (u["id"],))}
        days |= {date.fromtimestamp(r["started"]).isoformat() for r in c.execute("SELECT started FROM focus_sessions WHERE user_id=?", (u["id"],))}
        ledger = [dict(r) for r in c.execute("SELECT * FROM xp_ledger WHERE user_id=? ORDER BY ts DESC LIMIT 15", (u["id"],))]
    return dict(**st, world=world_state(st["xp"]), streak=streak(days), ledger=ledger)


# ------------------------------------------------- science & ops
@app.get("/api/experiments")
def experiments(u=Depends(current_user)):
    return twin_of(u).experiments()


@app.get("/api/models")
def models(u=Depends(current_user)):
    t = twin_of(u)
    return dict(**t.drift(), components=[
        dict(name="p(open)", kind="LogisticRegression", features=16),
        dict(name="p(rabbit hole | open)", kind="LogisticRegression", features=16),
        dict(name="dwell time", kind="Empirical-Bayes log-normal per category", prior_strength=8),
        dict(name="resumption", kind="LinearRegression (dwell × depth)"),
        dict(name="counterfactual hold-back", kind="Randomized holdout means (22% exploration)"),
        dict(name="day archetypes", kind="KMeans k=3 on 5 daily features"),
    ])


@app.get("/api/platform/capabilities")
def capabilities(platform: str | None = None):
    if not platform:
        return CAPABILITIES
    if platform not in CAPABILITIES:
        raise HTTPException(404, "Unknown platform")
    return CAPABILITIES[platform]


class UserSettings(BaseModel):
    pause_learning: bool = False
    retention_days: int = Field(30, ge=1, le=365)
    platform: str = "web"


@app.get("/api/me/settings")
def get_settings(u=Depends(current_user)):
    with closing(db()) as c:
        r = c.execute("SELECT * FROM user_settings WHERE user_id=?", (u["id"],)).fetchone()
    return dict(pause_learning=bool(r["pause_learning"]), retention_days=r["retention_days"], platform=r["platform"]) if r else \
        dict(pause_learning=False, retention_days=30, platform="web")


@app.put("/api/me/settings")
def put_settings(body: UserSettings, u=Depends(current_user)):
    with closing(db()) as c, c:
        c.execute("""INSERT INTO user_settings(user_id,pause_learning,retention_days,platform) VALUES(?,?,?,?)
                     ON CONFLICT(user_id) DO UPDATE SET pause_learning=excluded.pause_learning,
                     retention_days=excluded.retention_days, platform=excluded.platform""",
                  (u["id"], int(body.pause_learning), body.retention_days, body.platform))
    enforce_retention()
    audit(u["id"], "consent_settings", body.model_dump())
    return get_settings(u)


def enforce_retention():
    """Retention job: delete raw events older than each user's retention window."""
    with closing(db()) as c, c:
        for r in c.execute("SELECT user_id, retention_days FROM user_settings").fetchall():
            cutoff = datetime.fromtimestamp(time.time() - r["retention_days"] * 86400).isoformat()
            c.execute("DELETE FROM events WHERE user_id=? AND ts < ?", (r["user_id"], cutoff))


@app.on_event("startup")
def _startup():
    enforce_retention()


# ------------------------------------------------- ML registry, dataset and population comparisons
@app.get("/api/ml/registry")
def ml_registry():
    with closing(db()) as c:
        rows = [dict(r) for r in c.execute("SELECT version, created, path, status, rows_train, rows_test, auc_open, brier_open, mae_cost FROM model_registry ORDER BY created DESC")]
    return rows


@app.get("/api/ml/model")
def ml_model():
    m = population.load()
    if not m:
        raise HTTPException(404, "No trained population model yet. Run: python -m ml.dataset && python -m ml.train")
    return m["metrics"]


@app.get("/api/ml/dataset")
def ml_dataset(sample: int = 8):
    with closing(db()) as c:
        try:
            n = c.execute("SELECT COUNT(*) FROM ds_notifications").fetchone()[0]
        except sqlite3.OperationalError:
            raise HTTPException(404, "Dataset not generated yet. Run: python -m ml.dataset")
        cols = [r[1] for r in c.execute("PRAGMA table_info(ds_notifications)")]
        users = c.execute("SELECT COUNT(*) FROM ds_users").fetchone()[0]
        sessions = c.execute("SELECT COUNT(*) FROM ds_sessions").fetchone()[0]
        span = c.execute("SELECT MIN(date), MAX(date) FROM ds_notifications").fetchone()
        by_persona = [dict(r) for r in c.execute("""SELECT persona, COUNT(DISTINCT user_id) users, COUNT(*) events,
            ROUND(AVG(opened),3) open_rate, ROUND(AVG(rabbit_hole),3) rabbit_rate, ROUND(AVG(cost_min),2) avg_cost
            FROM ds_notifications WHERE policy_action='allow' GROUP BY persona""")]
        by_cat = [dict(r) for r in c.execute("""SELECT category, COUNT(*) events, ROUND(AVG(CASE WHEN policy_action='allow' THEN opened END),3) open_rate,
            ROUND(AVG(CASE WHEN policy_action='allow' THEN cost_min END),2) cost_allow, ROUND(AVG(CASE WHEN policy_action='delay' THEN cost_min END),2) cost_hold
            FROM ds_notifications GROUP BY category ORDER BY events DESC""")]
        rows = [dict(r) for r in c.execute("SELECT * FROM ds_notifications ORDER BY RANDOM() LIMIT ?", (min(sample, 50),))]
        live_users = c.execute("SELECT COUNT(DISTINCT user_id) FROM user_notifications").fetchone()[0]
        live_events = c.execute("SELECT COUNT(*) FROM user_notifications WHERE source='live'").fetchone()[0]
    return dict(rows=n, columns=cols, users=users, sessions=sessions, date_from=span[0], date_to=span[1],
                by_persona=by_persona, by_category=by_cat, sample=rows,
                app_users_with_history=live_users, app_live_events=live_events,
                note="Synthetic population dataset (stands in for consented ActivityWatch / Android logs).")


@app.get("/api/population/compare")
def population_compare(u=Depends(current_user)):
    """Where this user sits among the population on key behaviours (percentiles)."""
    t = twin_of(u)
    fp = t.fingerprint()
    allowed = [n for n in t.notifs if n["action"] == "allow"]
    mine = dict(open_rate=sum(n["opened"] for n in allowed) / max(1, len(allowed)),
                rabbit_rate=sum(n["rabbit"] for n in allowed if n["opened"]) / max(1, sum(n["opened"] for n in allowed)),
                cost=sum(n["cost_min"] for n in allowed) / max(1, len(allowed)), pings=fp["notifications_per_day"])
    with closing(db()) as c:
        try:
            pop = [dict(r) for r in c.execute("""SELECT user_id, AVG(CASE WHEN policy_action='allow' THEN opened END) open_rate,
                   SUM(CASE WHEN opened=1 THEN rabbit_hole END)*1.0/MAX(1,SUM(opened)) rabbit_rate,
                   AVG(CASE WHEN policy_action='allow' THEN cost_min END) cost, COUNT(*)*1.0/COUNT(DISTINCT date) pings
                   FROM ds_notifications GROUP BY user_id""")]
        except sqlite3.OperationalError:
            raise HTTPException(404, "Dataset not generated yet")
    def pct(key):
        vals = sorted(p[key] or 0 for p in pop)
        return round(100 * sum(v <= mine[key] for v in vals) / len(vals))
    labels = dict(open_rate="Opens pings", rabbit_rate="Falls into rabbit holes", cost="Focus lost per ping", pings="Pings per day")
    return dict(population=len(pop), metrics=[dict(key=k, label=labels[k], you=round(mine[k], 3),
                population_median=round(sorted(p[k] or 0 for p in pop)[len(pop) // 2], 3), percentile=pct(k)) for k in labels])


@app.get("/api/me/data")
def my_data(u=Depends(current_user)):
    with closing(db()) as c:
        return hist.counts(c, u["id"])


@app.get("/api/health")
def health():
    return {"ok": True}


# Platform features (budget, debt, reservations, developer API, audit, rooms, planner, habits, team, companion)
from .platform_api import audit, router as platform_router  # noqa: E402
from .routine_api import router as routine_router  # noqa: E402

app.include_router(platform_router)
app.include_router(routine_router)
