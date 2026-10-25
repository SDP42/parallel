"""Train the population attention models from the dataset in SQLite.

    python -m ml.train            # trains, evaluates, saves a new version, registers it

Models (all scikit-learn):
  open      p(open | context)                    HistGradientBoosting + isotonic calibration
  rabbit    p(rabbit hole | opened, context)     HistGradientBoosting + isotonic calibration
  cost_q*   focus-minutes lost if allowed        HistGradientBoosting quantile regressors (p10/p50/p90)
  t_allow / t_hold                               T-learner for the counterfactual: expected cost if shown vs held back

Evaluation is on users the models never saw (GroupShuffleSplit by user), against baselines:
the per-category prior rate and a logistic regression. The T-learner is checked against the
randomized difference-in-means from the exploration policy.
"""

from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, mean_absolute_error, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "parallel.db"
MODELS = ROOT / "models"

NUMERIC = ["hour_sin", "hour_cos", "weekday", "is_weekend", "task_depth", "minutes_in_block", "fatigue", "focus_capacity",
           "recent_switches_15m", "notifs_last_60m", "importance", "is_vip"]
CATEG = ["category", "persona", "environment", "device", "sender_type"]


def featurize(df: pd.DataFrame, columns: list[str] | None = None) -> pd.DataFrame:
    X = pd.concat([df[NUMERIC].astype(float), pd.get_dummies(df[CATEG].astype(str), dtype=float)], axis=1)
    if columns is not None:
        X = X.reindex(columns=columns, fill_value=0.0)
    return X


def calib_bins(p, y, n=8):
    edges = np.linspace(0, 1, n + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum() >= 20:
            out.append(dict(predicted=round(float(p[m].mean()), 3), observed=round(float(y[m].mean()), 3), n=int(m.sum())))
    return out


def clf_metrics(name, p, y):
    return dict(model=name, auc=round(float(roc_auc_score(y, p)), 4), brier=round(float(brier_score_loss(y, p)), 4),
                log_loss=round(float(log_loss(y, np.clip(p, 1e-6, 1 - 1e-6))), 4))


def train_classifier(X_tr, y_tr, X_te, y_te, prior_te, label):
    hgb = CalibratedClassifierCV(HistGradientBoostingClassifier(max_iter=250, learning_rate=0.06, max_leaf_nodes=31,
                                                                l2_regularization=1.0, random_state=0), method="isotonic", cv=3)
    hgb.fit(X_tr, y_tr)
    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, C=0.5)).fit(X_tr, y_tr)
    p_h, p_l = hgb.predict_proba(X_te)[:, 1], lr.predict_proba(X_te)[:, 1]
    report = dict(target=label, n_train=int(len(y_tr)), n_test=int(len(y_te)), base_rate=round(float(y_te.mean()), 4),
                  models=[clf_metrics("prior (category rate)", prior_te, y_te), clf_metrics("logistic regression", p_l, y_te),
                          clf_metrics("gradient boosting (calibrated)", p_h, y_te)],
                  calibration=calib_bins(p_h, y_te.values))
    return hgb, report


def main():
    t0 = time.time()
    with sqlite3.connect(DB) as c:
        df = pd.read_sql("SELECT * FROM ds_notifications", c)
    print(f"Loaded {len(df):,} notification events for {df.user_id.nunique()} users")
    version = "pop-" + datetime.now().strftime("%Y%m%d-%H%M%S")
    out = MODELS / version
    out.mkdir(parents=True, exist_ok=True)

    tr_idx, te_idx = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=7).split(df, groups=df.user_id))
    tr, te = df.iloc[tr_idx], df.iloc[te_idx]
    cols = list(featurize(tr).columns)
    metrics: dict = dict(version=version, trained_at=datetime.now().isoformat(timespec="seconds"),
                         split=dict(train_users=int(tr.user_id.nunique()), test_users=int(te.user_id.nunique()), method="GroupShuffleSplit by user"),
                         dataset=dict(rows=int(len(df)), columns=int(df.shape[1]), users=int(df.user_id.nunique()),
                                      days=int(df.date.nunique()), exploration_rate=round(float(df.exploration.mean()), 4)))

    # ---------------- p(open)
    a_tr, a_te = tr[tr.policy_action == "allow"], te[te.policy_action == "allow"]
    prior = a_tr.groupby("category").opened.mean()
    open_model, metrics["open"] = train_classifier(featurize(a_tr, cols), a_tr.opened, featurize(a_te, cols), a_te.opened,
                                                   a_te.category.map(prior).fillna(a_tr.opened.mean()).values, "opened")
    print("open:", metrics["open"]["models"][-1], "vs prior", metrics["open"]["models"][0]["auc"])

    # ---------------- p(rabbit | open)
    o_tr, o_te = a_tr[a_tr.opened == 1], a_te[a_te.opened == 1]
    prior_r = o_tr.groupby("category").rabbit_hole.mean()
    rabbit_model, metrics["rabbit"] = train_classifier(featurize(o_tr, cols), o_tr.rabbit_hole, featurize(o_te, cols), o_te.rabbit_hole,
                                                       o_te.category.map(prior_r).fillna(o_tr.rabbit_hole.mean()).values, "rabbit_hole")
    print("rabbit:", metrics["rabbit"]["models"][-1])

    # ---------------- focus-cost quantiles (if allowed)
    q_models = {}
    Xa_tr, Xa_te = featurize(a_tr, cols), featurize(a_te, cols)
    for q in (0.1, 0.5, 0.9):
        q_models[q] = HistGradientBoostingRegressor(loss="quantile", quantile=q, max_iter=300, learning_rate=0.05, random_state=0).fit(Xa_tr, a_tr.cost_min)
    p10, p50, p90 = (q_models[q].predict(Xa_te) for q in (0.1, 0.5, 0.9))
    med = a_tr.groupby("category").cost_min.median()
    base_p50 = a_te.category.map(med).fillna(a_tr.cost_min.median()).values
    metrics["cost"] = dict(target="cost_min if allowed", n_train=int(len(a_tr)), n_test=int(len(a_te)),
                           mae_p50=round(float(mean_absolute_error(a_te.cost_min, p50)), 3),
                           mae_baseline_category_median=round(float(mean_absolute_error(a_te.cost_min, base_p50)), 3),
                           interval_coverage_p10_p90=round(float(((a_te.cost_min >= p10) & (a_te.cost_min <= p90)).mean()), 3),
                           mean_interval_width=round(float(np.mean(p90 - p10)), 2))
    print("cost:", metrics["cost"])

    # ---------------- T-learner counterfactual: cost if shown vs held back
    low = df[df.importance < 0.5]
    l_tr, l_te = low[low.user_id.isin(tr.user_id.unique())], low[low.user_id.isin(te.user_id.unique())]
    t_allow = HistGradientBoostingRegressor(max_iter=250, learning_rate=0.05, random_state=0).fit(
        featurize(l_tr[l_tr.policy_action == "allow"], cols), l_tr[l_tr.policy_action == "allow"].cost_min)
    t_hold = HistGradientBoostingRegressor(max_iter=150, learning_rate=0.05, random_state=0).fit(
        featurize(l_tr[l_tr.policy_action == "delay"], cols), l_tr[l_tr.policy_action == "delay"].cost_min)
    Xl = featurize(l_te, cols)
    cate = t_allow.predict(Xl) - t_hold.predict(Xl)
    rows = []
    for cat, g in l_te.assign(cate=cate).groupby("category"):
        a, h = g[g.policy_action == "allow"].cost_min, g[g.policy_action == "delay"].cost_min
        if len(h) < 10:
            continue
        rows.append(dict(category=cat, t_learner_effect=round(float(g.cate.mean()), 2),
                         randomized_diff_in_means=round(float(a.mean() - h.mean()), 2), n_allow=int(len(a)), n_hold=int(len(h))))
    err = np.mean([abs(r["t_learner_effect"] - r["randomized_diff_in_means"]) for r in rows]) if rows else None
    # policy value on unseen users: hold when predicted effect > 3 min
    hold = cate > 3
    saved_per_user_day = float(cate[hold].sum() / max(1, l_te.user_id.nunique() * l_te.date.nunique()))
    metrics["counterfactual"] = dict(method="T-learner (two gradient-boosted outcome models)", by_category=rows,
                                     mean_abs_gap_vs_randomized=round(float(err), 2) if err is not None else None,
                                     policy="hold when predicted effect > 3 min", share_held=round(float(hold.mean()), 3),
                                     est_minutes_saved_per_user_day=round(saved_per_user_day, 1))
    print("counterfactual gap vs randomized:", metrics["counterfactual"]["mean_abs_gap_vs_randomized"], "· saved/user-day:", round(saved_per_user_day, 1))

    # ---------------- what drives opening (permutation importance on a sample)
    samp = a_te.sample(min(4000, len(a_te)), random_state=0)
    pi = permutation_importance(open_model, featurize(samp, cols), samp.opened, n_repeats=4, random_state=0, scoring="roc_auc")
    imp = sorted(zip(cols, pi.importances_mean), key=lambda x: -x[1])[:12]
    metrics["open_feature_importance"] = [dict(feature=f, importance=round(float(v), 4)) for f, v in imp]

    # ---------------- save artifacts + registry
    joblib.dump(open_model, out / "open.joblib")
    joblib.dump(rabbit_model, out / "rabbit.joblib")
    for q, m in q_models.items():
        joblib.dump(m, out / f"cost_q{int(q * 100)}.joblib")
    joblib.dump(t_allow, out / "t_allow.joblib")
    joblib.dump(t_hold, out / "t_hold.joblib")
    (out / "features.json").write_text(json.dumps(dict(columns=cols, numeric=NUMERIC, categorical=CATEG), indent=2))
    metrics["train_seconds"] = round(time.time() - t0, 1)
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (out / "MODEL_CARD.md").write_text(model_card(metrics))
    (MODELS / "LATEST").write_text(version)
    with sqlite3.connect(DB) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS model_registry (version TEXT PRIMARY KEY, created TEXT, path TEXT, status TEXT,
                     rows_train INTEGER, rows_test INTEGER, auc_open REAL, brier_open REAL, mae_cost REAL, metrics TEXT)""")
        c.execute("UPDATE model_registry SET status='archived' WHERE status='active'")
        best = metrics["open"]["models"][-1]
        c.execute("INSERT INTO model_registry VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (version, metrics["trained_at"], str(out.relative_to(ROOT)), "active", int(len(tr)), int(len(te)),
                   best["auc"], best["brier"], metrics["cost"]["mae_p50"], json.dumps(metrics)))
    print(f"Saved {version} to {out.relative_to(ROOT)} in {metrics['train_seconds']}s and registered it as active")


def model_card(m: dict) -> str:
    o = m["open"]["models"]
    lines = [
        f"# Model card · {m['version']}",
        "",
        "Population attention models for Parallel. Trained on a **synthetic** dataset that stands in for consented",
        "ActivityWatch / Android NotificationListener logs. Do not read these numbers as claims about real people.",
        "",
        f"- Dataset: {m['dataset']['rows']:,} notification events, {m['dataset']['columns']} columns, {m['dataset']['users']} users, {m['dataset']['days']} days",
        f"- Split: {m['split']['method']} ({m['split']['train_users']} train users / {m['split']['test_users']} unseen test users)",
        f"- Exploration (randomized hold-back) rate: {m['dataset']['exploration_rate']:.1%}",
        "",
        "## p(open | context)",
        "| Model | AUC | Brier | Log loss |", "|---|---|---|---|",
        *[f"| {x['model']} | {x['auc']} | {x['brier']} | {x['log_loss']} |" for x in o],
        "",
        "## p(rabbit hole | opened)",
        "| Model | AUC | Brier | Log loss |", "|---|---|---|---|",
        *[f"| {x['model']} | {x['auc']} | {x['brier']} | {x['log_loss']} |" for x in m["rabbit"]["models"]],
        "",
        "## Focus cost if allowed (quantile regression)",
        f"- MAE of p50: {m['cost']['mae_p50']} min (category-median baseline: {m['cost']['mae_baseline_category_median']} min)",
        f"- p10–p90 interval coverage: {m['cost']['interval_coverage_p10_p90']:.0%} (target ≈ 80%)",
        "",
        "## Counterfactual (T-learner)",
        f"- Mean gap vs randomized difference-in-means: {m['counterfactual']['mean_abs_gap_vs_randomized']} min",
        f"- Policy “{m['counterfactual']['policy']}” holds {m['counterfactual']['share_held']:.0%} of low-importance pings and saves ≈ {m['counterfactual']['est_minutes_saved_per_user_day']} min per user-day on unseen users",
        "",
        "## Limits",
        "- Synthetic behaviour: the generator's assumptions bound what the model can learn.",
        "- Personal twins shrink these population predictions towards each user's own history; the population model is the cold-start prior.",
        "- Fatigue is a behavioural estimate, not a medical measurement.",
    ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
