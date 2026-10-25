"""End-to-end API test: sign up → persona → simulate → intervene → outcome → gamification.
Run: cd backend && PARALLEL_DB=/tmp/parallel-test.db python -m pytest -q"""
import os
import tempfile

os.environ.setdefault("PARALLEL_DB", os.path.join(tempfile.mkdtemp(), "test.db"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def auth():
    r = client.post("/api/auth/signup", json={"name": "Asha", "email": "asha@example.com", "password": "secret123"})
    if r.status_code == 409:
        r = client.post("/api/auth/signin", json={"email": "asha@example.com", "password": "secret123"})
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    client.put("/api/me/persona", json={"persona": "student", "goals": ["Exams"], "vip": ["family"]}, headers=h)
    return h


def test_full_loop():
    h = auth()
    sim = client.post("/api/simulations", json={"category": "social_like", "hour": 11, "depth": 1.0, "fatigue": 0.3}, headers=h).json()
    assert 0 <= sim["allow"]["p_open"] <= 1
    assert sim["allow"]["cost_p10"] <= sim["allow"]["cost_p50"] <= sim["allow"]["cost_p90"]
    assert sim["recommendation"] in ("allow", "delay", "summarize", "ask")
    iv = client.post("/api/interventions", json={"prediction_id": sim["prediction_id"], "category": "social_like", "choice": "delay",
                                                 "predicted_cost": sim["allow"]["cost_expected"], "saved": sim["saved_minutes"]}, headers=h).json()
    assert iv["xp_gained"] > 0
    out = client.post("/api/outcomes", json={"prediction_id": sim["prediction_id"], "decision_id": iv["decision_id"], "actual_cost": 1.0}, headers=h)
    assert out.status_code == 200
    assert client.get("/api/digest", headers=h).json()["pending"] == 1
    g = client.get("/api/gamification/profile", headers=h).json()
    assert g["xp"] >= 20 and g["world"]["current"]["name"]


def test_vip_overrides_and_rules():
    h = auth()
    r = client.post("/api/simulate", json={"category": "family"}, headers=h).json()
    assert r["recommendation"] == "allow"


def test_insights_and_models():
    h = auth()
    for path in ["/api/twin/overview", "/api/attention/profile", "/api/attention/timeline", "/api/insights/daily", "/api/recommendations",
                 "/api/twin/archetypes", "/api/twin/forecast", "/api/experiments", "/api/models", "/api/data-quality", "/api/quests", "/api/twin/graph"]:
        assert client.get(path, headers=h).status_code == 200, path


def test_assistant_multilingual():
    h = auth()
    for lang, q in [("en", "Should I open this instagram like?"), ("hi", "मैं कब सबसे अच्छा फोकस करता हूँ?"), ("es", "¿Qué app me distrae más?")]:
        r = client.post("/api/assistant", json={"text": q, "lang": lang}, headers=h).json()
        assert r["lang"] == lang and len(r["reply"]) > 10


def test_events_dedupe_and_privacy():
    h = auth()
    ev = [{"type": "app_active", "ts": "2026-10-25T10:00:00", "duration": 120, "app": "VS Code", "meta": {"title": "secret.py"}}]
    assert client.post("/api/events", json=ev, headers=h).json()["ingested"] == 1
    assert client.post("/api/events", json=ev, headers=h).json()["duplicates"] == 1
    stored = client.get("/api/events", headers=h).json()[0]
    assert "secret" not in (stored["meta"] or "")


def test_contact_and_auth_errors():
    assert client.post("/api/contact", json={"name": "A", "email": "a@b.co", "message": "Hello team"}).status_code == 200
    assert client.get("/api/me").status_code == 401
    assert client.post("/api/auth/signin", json={"email": "nobody@x.co", "password": "x"}).status_code == 401


def test_platform_features():
    h = auth()
    assert client.put("/api/budget", json={"daily_min": 60}, headers=h).json()["daily_min"] == 60
    assert "week" in client.get("/api/debt", headers=h).json()
    assert client.post("/api/focus/reserve", json={"minutes": 30}, headers=h).json()["reserved"]
    key = client.post("/api/developer/keys", json={"label": "IDE"}, headers=h).json()["key"]
    r = client.get("/api/v1/interrupt?category=social_like", headers={"X-API-Key": key}).json()
    assert r["decision"] == "defer"
    assert client.get("/api/v1/interrupt?category=family", headers={"X-API-Key": key}).json()["decision"] == "now"
    room = client.post("/api/rooms", json={"name": "DSA grind", "goal": "3 problems"}, headers=h).json()
    assert client.post(f"/api/rooms/{room['code']}/done", headers=h).json()["members"][0]["done"]
    assert len(client.get("/api/planner", headers=h).json()["plan"]) == 14
    assert client.post("/api/habits", json={"category": "social_like"}, headers=h).status_code == 200
    prof = client.get("/api/profile/portable", headers=h).json()
    assert prof["contains_raw_events"] is False
    assert client.post("/api/profile/portable", json=prof, headers=h).json()["imported_rules"] == 10
    assert client.get("/api/team/health", headers=h).json()["members"] >= 5
    assert client.get("/api/audit", headers=h).json()["chain_valid"]
    assert client.get("/api/companion", headers=h).json()["name"] == "Echo"
