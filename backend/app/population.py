"""Serve the population models trained by ml/train.py (the cold-start prior for every twin)."""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd

from .personas import CATEGORIES, focus_curve

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"

SENDER = {"social_like": "acquaintance", "social_dm": "friend", "video_reco": "algorithm", "work_chat": "colleague",
          "email": "brand", "calendar": "system", "family": "family", "promo": "brand", "news": "algorithm", "security": "system"}


@lru_cache(maxsize=1)
def load():
    latest = MODELS / "LATEST"
    if not latest.exists():
        return None
    d = MODELS / latest.read_text().strip()
    try:
        return dict(
            version=d.name, dir=d, features=json.loads((d / "features.json").read_text())["columns"],
            metrics=json.loads((d / "metrics.json").read_text()),
            open=joblib.load(d / "open.joblib"), rabbit=joblib.load(d / "rabbit.joblib"),
            q10=joblib.load(d / "cost_q10.joblib"), q50=joblib.load(d / "cost_q50.joblib"), q90=joblib.load(d / "cost_q90.joblib"),
            t_allow=joblib.load(d / "t_allow.joblib"), t_hold=joblib.load(d / "t_hold.joblib"),
        )
    except FileNotFoundError:
        return None


def predict(persona: str, category: str, hour: float, depth: float, minutes_in: float, fatigue: float, weekday: int = 2,
            environment: str = "home", device: str = "laptop", recent_switches: int = 1, notifs_last_hour: int = 2):
    m = load()
    if not m:
        return None
    row = dict(hour_sin=math.sin(2 * math.pi * hour / 24), hour_cos=math.cos(2 * math.pi * hour / 24), weekday=weekday,
               is_weekend=int(weekday >= 5), task_depth=depth, minutes_in_block=minutes_in, fatigue=fatigue,
               focus_capacity=focus_curve(persona, hour), recent_switches_15m=recent_switches, notifs_last_60m=notifs_last_hour,
               importance=CATEGORIES[category]["importance"], is_vip=int(category in ("family", "security", "calendar")),
               category=category, persona=persona, environment=environment, device=device, sender_type=SENDER[category])
    df = pd.DataFrame([row])
    X = pd.concat([df.drop(columns=["category", "persona", "environment", "device", "sender_type"]).astype(float),
                   pd.get_dummies(df[["category", "persona", "environment", "device", "sender_type"]], dtype=float)], axis=1)
    X = X.reindex(columns=m["features"], fill_value=0.0)
    p_open = float(m["open"].predict_proba(X)[0, 1])
    p_rabbit = float(m["rabbit"].predict_proba(X)[0, 1])
    q = [max(0.0, float(m[k].predict(X)[0])) for k in ("q10", "q50", "q90")]
    effect = float(m["t_allow"].predict(X)[0] - m["t_hold"].predict(X)[0])
    return dict(version=m["version"], p_open=round(p_open, 3), p_rabbit_hole=round(p_open * p_rabbit, 3),
                cost_p10=round(q[0], 1), cost_p50=round(q[1], 1), cost_p90=round(max(q[2], q[1]), 1),
                counterfactual_effect_min=round(effect, 1))
