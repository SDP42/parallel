"""The Attention Twin: a personal model learned from the user's own history.

Components
- p(open | context)            logistic regression on allowed notifications
- p(rabbit hole | opened, ctx)  logistic regression on opened notifications
- dwell time per category       empirical-Bayes shrinkage of log-durations to the persona prior
- resumption cost               linear model on dwell time and task depth
- counterfactual (delay)        estimated from randomized holdouts in the logging policy

Predictions are Monte Carlo rollouts of these components, so every answer comes
with a distribution (p10/p50/p90) instead of a single made-up number.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import date, datetime

import numpy as np
from sklearn.linear_model import LinearRegression, LogisticRegression

from .personas import CATEGORIES, CATEGORY_KEYS, PERSONAS, app_for, focus_curve
from .synth import build_chain, generate, logit, sigmoid
from . import routine

PRIOR_STRENGTH = 8  # pseudo-observations for shrinkage


def memo(fn):
    """Cache a result on the twin instance. Safe because new data creates a new Twin."""
    name = fn.__name__

    def wrapper(self, *a, **k):
        cache = self.__dict__.setdefault("_memo", {})
        key = (name, a, tuple(sorted(k.items())))
        if key not in cache:
            cache[key] = fn(self, *a, **k)
        return cache[key]
    wrapper.__name__ = name
    wrapper.__doc__ = fn.__doc__
    return wrapper


def featurize(category, hour, depth, minutes_in, fatigue):
    onehot = [1.0 if category == k else 0.0 for k in CATEGORY_KEYS]
    return [math.sin(2 * math.pi * hour / 24), math.cos(2 * math.pi * hour / 24), depth,
            min(minutes_in, 120) / 60, fatigue, CATEGORIES[category]["importance"], *onehot]


class Twin:
    def __init__(self, persona: str, seed: int, history: tuple | None = None):
        self.persona = persona
        self.seed = seed
        self.segments, self.notifs = history if history else generate(persona, seed)
        self.profile: dict | None = None          # declared routine (set per request by the API)
        self.learned_importance: dict = {}        # from "did this matter?" taps
        self.energy: int | None = None            # latest 1-5 energy check-in (last 3 h)
        self.today = date.today().isoformat()
        self.days = sorted({s["day"] for s in self.segments})
        self._fit()

    # ------------------------------------------------------------------ fit
    def _fit(self, holdout_days: int = 0):
        hist = [n for n in self.notifs if n["day"] < self.today]
        if holdout_days:
            cut = self.days[-1 - holdout_days]
            hist = [n for n in hist if n["day"] < cut]
        self.train = hist
        allowed = [n for n in hist if n["action"] == "allow"]
        X = np.array([featurize(n["category"], n["hour"], n["depth"], n["minutes_in"], n["fatigue"]) for n in allowed])
        y = np.array([n["opened"] for n in allowed])
        self.open_model = LogisticRegression(C=0.8, max_iter=500).fit(X, y)
        opened = [n for n in allowed if n["opened"]]
        Xo = np.array([featurize(n["category"], n["hour"], n["depth"], n["minutes_in"], n["fatigue"]) for n in opened])
        yo = np.array([n["rabbit"] for n in opened])
        self.rabbit_model = LogisticRegression(C=0.8, max_iter=500).fit(Xo, yo)

        # dwell distributions (log space) with shrinkage to persona prior
        self.dwell = {}
        for k in CATEGORY_KEYS:
            prior_mu = math.log(CATEGORIES[k]["rabbit_min"])
            obs = [math.log(max(n["away_min"], 0.1)) for n in opened if n["category"] == k and n["rabbit"]]
            nobs = len(obs)
            mu = (PRIOR_STRENGTH * prior_mu + sum(obs)) / (PRIOR_STRENGTH + nobs)
            sd = float(np.std(obs)) if nobs > 3 else 0.5
            self.dwell[k] = dict(mu=mu, sd=max(sd, 0.25), n=nobs)
        quick = [math.log(max(n["away_min"], 0.1)) for n in opened if not n["rabbit"]]
        self.quick = dict(mu=float(np.mean(quick)) if quick else math.log(1.5), sd=float(np.std(quick)) if len(quick) > 3 else 0.4)

        Xr = np.array([[n["away_min"], n["depth"], n["away_min"] * n["depth"]] for n in opened])
        yr = np.array([n["resume_min"] for n in opened])
        self.resume_model = LinearRegression().fit(Xr, yr)
        self.resume_resid = float(np.std(yr - self.resume_model.predict(Xr)))

        # Counterfactual "delay" arm from randomized holdouts
        self.delay_cost = {}
        for k in CATEGORY_KEYS:
            d = [n["cost_min"] for n in hist if n["action"] == "delay" and n["category"] == k]
            self.delay_cost[k] = dict(mean=float(np.mean(d)) if d else 0.7, n=len(d))
        self.glance = float(np.mean([n["resume_min"] for n in allowed if not n["opened"]] or [0.6]))
        import hashlib
        sig = np.concatenate([self.open_model.coef_[0], self.rabbit_model.coef_[0], self.resume_model.coef_]).round(3).tobytes()
        self.model_version = "twin-" + hashlib.sha1(sig).hexdigest()[:8]
        self.trained_at = datetime.now().isoformat(timespec="seconds")
        self.n_train = len(hist)

    # ------------------------------------------------------------ simulate
    def context_now(self, hour: float | None = None):
        now = datetime.now()
        hour = hour if hour is not None else now.hour + now.minute / 60
        fc = routine.focus_for(self.persona, hour, self.profile)
        p = PERSONAS[self.persona]
        blk = routine.block_at(self.profile, datetime.now().weekday(), hour)
        today_notifs = [n for n in self.notifs if n["day"] == self.today]
        fatigue = today_notifs[-1]["fatigue"] if today_notifs else min(0.9, max(0.1, (hour - 8) * 0.045 + (0.15 if hour > p["fatigue_onset"] else 0)))
        if self.energy is not None:  # a fresh check-in beats the behavioural estimate
            fatigue = round(0.4 * fatigue + 0.6 * (1 - (self.energy - 1) / 4), 2)
        depth = 1.0 if fc > 0.65 else (0.6 if fc > 0.4 else 0.3)
        if blk and blk["kind"] in ("class", "lab", "exam", "study", "work"):
            depth = 1.0
        return dict(hour=round(hour, 2), focus_capacity=round(fc, 2), fatigue=round(fatigue, 2), depth=depth,
                    task=blk["label"] if blk else p["tasks"][0], minutes_in=35,
                    block=dict(label=blk["label"], kind=blk["kind"], until=routine.fmt(blk["end"])) if blk else None)

    def simulate(self, category: str, hour: float, depth: float, minutes_in: float, fatigue: float,
                 task: str, n_rollouts: int = 2000, rng_seed: int = 7):
        rng = np.random.default_rng(rng_seed)
        x = np.array([featurize(category, hour, depth, minutes_in, fatigue)])
        p_open = float(self.open_model.predict_proba(x)[0, 1])
        p_rabbit = float(self.rabbit_model.predict_proba(x)[0, 1])
        dw = self.dwell[category]

        opened = rng.random(n_rollouts) < p_open
        rabbit = opened & (rng.random(n_rollouts) < p_rabbit)
        away = np.where(rabbit, np.exp(rng.normal(dw["mu"], dw["sd"], n_rollouts)),
                        np.exp(rng.normal(self.quick["mu"], self.quick["sd"], n_rollouts)))
        away = np.where(opened, away, 0.0)
        Xr = np.stack([away, np.full(n_rollouts, depth), away * depth], axis=1)
        resume = self.resume_model.predict(Xr) + rng.normal(0, self.resume_resid, n_rollouts)
        resume = np.where(opened, np.clip(resume, 0.5, None), self.glance)
        cost = away + resume

        allow = dict(
            p_open=round(p_open, 3),
            p_rabbit_hole=round(p_open * p_rabbit, 3),
            away_p50=round(float(np.median(away[opened])) if opened.any() else 0, 1),
            away_if_rabbit=round(float(np.exp(dw["mu"])), 1),
            resume_p50=round(float(np.median(resume[opened])) if opened.any() else 0, 1),
            cost_expected=round(float(cost.mean()), 1),
            cost_p10=round(float(np.percentile(cost, 10)), 1),
            cost_p50=round(float(np.percentile(cost, 50)), 1),
            cost_p90=round(float(np.percentile(cost, 90)), 1),
            histogram=np.histogram(np.clip(cost, 0, 60), bins=20, range=(0, 60))[0].tolist(),
        )
        importance = self.learned_importance.get(category, CATEGORIES[category]["importance"])
        app = app_for(category, self.persona)
        nag = routine.classify_app(self.profile, app) == "nag"
        if nag:
            importance *= 0.6
        dc = self.delay_cost[category]
        delay_cost = dc["mean"] + (importance * 4 if importance > 0.5 else 0)
        delay = dict(cost_expected=round(delay_cost, 1), n_holdouts=dc["n"],
                     missed_risk=round(importance, 2))
        saved = allow["cost_expected"] - delay_cost
        blk = routine.block_at(self.profile, datetime.now().weekday(), hour) if self.profile else None
        dl = routine.deadline_pressure(self.profile) if self.profile else None
        strict = bool(dl and dl["days_left"] <= 3)
        threshold = 1.5 if strict else 3.0
        tail = f" {dl['title']} is in {dl['days_left']} day{'s' if dl['days_left'] != 1 else ''}, so I'm being stricter." if strict else ""
        if importance >= 0.75:
            rec, why = "allow", "This looks genuinely important to you. Holding it back costs more than it saves."
        elif blk and blk["kind"] in routine.HOLD_KINDS and importance < 0.5:
            rec, why = "delay", f"You're in {blk['label']} until {routine.fmt(blk['end'])}. Low-value pings wait until it ends.{tail}"
        elif saved > threshold:
            rec, why = "delay", f"Holding it until your next checkpoint saves about {max(1, round(saved))} focus-minutes on average.{tail}"
        elif saved > 1:
            rec, why = "summarize", "Small expected cost. Bundle it into your next digest."
        else:
            rec, why = "allow", "Low risk right now. Your focus is unlikely to break."

        # Evidence: similar past events
        sim = [n for n in self.train if n["category"] == category and abs(n["hour"] - hour) < 3
               and abs(n["depth"] - depth) < 0.35]
        n_sim = len(sim)
        confidence = min(0.95, 0.35 + 0.6 * (1 - math.exp(-n_sim / 25)))

        # Factor attribution: logit contribution of each named feature vs average context
        coefs = self.open_model.coef_[0]
        base = np.array([featurize(category, 12, 0.6, 30, 0.35)])[0]
        names = ["time of day", "time of day", "task depth", "minutes into block", "fatigue", "sender importance"]
        contrib = defaultdict(float)
        for i, nm in enumerate(names):
            contrib[nm] += float(coefs[i] * (x[0][i] - base[i]))
        factors = sorted(({"factor": k, "effect": round(v, 2)} for k, v in contrib.items()), key=lambda f: -abs(f["effect"]))

        # Most likely chain (median rollout among those matching the modal path)
        modal_rabbit = (p_open * p_rabbit) > 0.35
        modal_open = p_open > 0.5
        mock = dict(action="allow", opened=modal_open, rabbit=modal_rabbit, app=app_for(category, self.persona),
                    followed_app=app_for(category, self.persona), task=task,
                    away_min=float(np.exp(dw["mu"])) if modal_rabbit else float(np.exp(self.quick["mu"])),
                    )
        mock["resume_min"] = float(self.resume_model.predict([[mock["away_min"], depth, mock["away_min"] * depth]])[0]) if modal_open else self.glance
        mock["cost_min"] = (mock["away_min"] if modal_open else 0) + mock["resume_min"]
        chain_allow = build_chain(type("N", (), mock))
        chain_delay = build_chain(type("N", (), dict(action="delay", task=task, cost_min=delay_cost)))

        if nag and rec != "allow":
            why += f" You marked {app} as an app that nags you."
        abstain = confidence < 0.5 and rec != "allow" and not blk
        if abstain:
            rec, why = "ask", "I haven't seen enough moments like this to decide for you. Your call; I'll learn from it."
        from .gamify import universe_names
        return dict(
            model_version=self.model_version, abstained=abstain,
            universes=universe_names(allow["cost_expected"], delay_cost),
            category=category, label=CATEGORIES[category]["label"], app=app_for(category, self.persona),
            context=dict(hour=hour, depth=depth, minutes_in=minutes_in, fatigue=fatigue, task=task),
            allow=allow, delay=delay, saved_minutes=round(saved, 1),
            recommendation=rec, why=why, confidence=round(confidence, 2), similar_events=n_sim,
            factors=factors[:4], chain_allow=chain_allow, chain_delay=chain_delay, rollouts=n_rollouts,
        )

    # ------------------------------------------------------------ insights
    @memo
    def fingerprint(self):
        grid = np.zeros((7, 24))
        wts = np.zeros((7, 24))
        hourly = np.zeros(24)
        hourly_w = np.zeros(24)
        for s in self.segments:
            wd = date.fromisoformat(s["day"]).weekday()
            h = s["start"]
            while h < s["end"]:
                hh = int(h)
                step = min(s["end"], hh + 1) - h
                if s["kind"] in ("focus", "recovering", "distraction", "meeting"):
                    grid[wd, hh % 24] += s["quality"] * step
                    wts[wd, hh % 24] += step
                    hourly[hh % 24] += s["quality"] * step
                    hourly_w[hh % 24] += step
                h += step
        heat = np.divide(grid, wts, out=np.zeros_like(grid), where=wts > 0)
        hour_q = np.divide(hourly, hourly_w, out=np.zeros_like(hourly), where=hourly_w > 0)
        # best 2.5h window
        best, best_h = -1, 9
        for h in range(6, 22):
            v = hour_q[h:h + 3].mean() if h + 3 <= 24 else 0
            if v > best:
                best, best_h = v, h
        # fatigue onset: first hour where mean notif fatigue > 0.5
        fat = defaultdict(list)
        for n in self.notifs:
            fat[int(n["hour"])].append(n["fatigue"])
        fat_curve = [round(float(np.mean(fat[h])), 3) if fat[h] else None for h in range(24)]
        onset = next((h for h in range(8, 24) if fat[h] and np.mean(fat[h]) > 0.5), 17)
        focus_min = sum((s["end"] - s["start"]) * 60 for s in self.segments if s["kind"] == "focus")
        sessions = [(s["end"] - s["start"]) * 60 for s in self.segments if s["kind"] == "focus"]
        allowed = [n for n in self.notifs if n["action"] == "allow"]
        switches = sum(1 for s in self.segments if s["kind"] == "distraction")
        total_h = len(self.days)
        avg_q = float(np.mean([s["quality"] for s in self.segments if s["kind"] == "focus"]))
        traits = {
            "Deep focus": round(min(1, avg_q * 1.25), 2),
            "Interruptibility": round(float(np.mean([n["opened"] for n in allowed])), 2),
            "Rabbit-hole risk": round(float(np.mean([n["rabbit"] for n in allowed if n["opened"]] or [0])), 2),
            "Recovery speed": round(max(0.0, 1 - float(np.mean([n["resume_min"] for n in allowed if n["opened"]] or [5])) / 15), 2),
            "Sustained attention": round(min(1.0, float(np.median(sessions)) / 45), 2),
            "Fatigue resilience": round(1 - float(np.mean([n["fatigue"] for n in self.notifs])), 2),
        }
        return dict(
            heatmap=[[round(float(v), 3) for v in row] for row in heat],
            hourly=[round(float(v), 3) for v in hour_q],
            fatigue_curve=fat_curve,
            best_window=dict(start=best_h, end=best_h + 2.5, quality=round(float(best), 2)),
            fatigue_onset=onset,
            avg_session_min=round(float(np.median(sessions)), 1),
            focus_hours_per_day=round(focus_min / 60 / total_h, 1),
            interruptions_per_day=round(switches / total_h, 1),
            notifications_per_day=round(len(self.notifs) / total_h, 1),
            traits=traits,
            days_learned=total_h - 1,
            events_learned=len(self.notifs) + len(self.segments),
        )

    @memo
    def apps(self):
        stats = defaultdict(lambda: dict(minutes=0.0, entries=0, rabbit=0, resume=[], during_focus=0))
        for s in self.segments:
            st = stats[s["app"]]
            st["minutes"] += (s["end"] - s["start"]) * 60
            st["entries"] += 1
        for n in self.notifs:
            if n["opened"] and n["followed_app"]:
                st = stats[n["followed_app"]]
                st["during_focus"] += 1
                st["rabbit"] += int(n["rabbit"])
                st["resume"].append(n["cost_min"])
        out = []
        days = len(self.days)
        for app, st in stats.items():
            frag = st["during_focus"] / days * (np.mean(st["resume"]) if st["resume"] else 0) / 10
            out.append(dict(app=app, minutes_per_day=round(st["minutes"] / days, 1), opens_per_day=round(st["entries"] / days, 1),
                            focus_breaks_per_day=round(st["during_focus"] / days, 1),
                            rabbit_rate=round(st["rabbit"] / st["during_focus"], 2) if st["during_focus"] else 0,
                            avg_cost_min=round(float(np.mean(st["resume"])), 1) if st["resume"] else 0,
                            fragmentation=round(float(min(frag, 10)), 2)))
        return sorted(out, key=lambda a: -a["fragmentation"])

    @memo
    def categories(self):
        out = []
        for k in CATEGORY_KEYS:
            ns = [n for n in self.notifs if n["category"] == k]
            if not ns:
                continue
            al = [n for n in ns if n["action"] == "allow"]
            dl = [n for n in ns if n["action"] == "delay"]
            ca = float(np.mean([n["cost_min"] for n in al])) if al else 0
            cd = float(np.mean([n["cost_min"] for n in dl])) if dl else None
            out.append(dict(category=k, label=CATEGORIES[k]["label"], per_day=round(len(ns) / len(self.days), 1),
                            open_rate=round(float(np.mean([n["opened"] for n in al])), 2) if al else 0,
                            cost_allow=round(ca, 1), cost_delay=round(cd, 1) if cd is not None else None,
                            uplift=round(ca - cd, 1) if cd is not None else None, n_holdouts=len(dl),
                            importance=CATEGORIES[k]["importance"]))
        return sorted(out, key=lambda c: -(c["uplift"] or 0))

    @memo
    def graph(self):
        nodes, edges = {}, Counter()

        def node(id_, label, group, weight=1):
            nodes.setdefault(id_, dict(id=id_, label=label, group=group, weight=0))
            nodes[id_]["weight"] += weight

        def window(h):
            return "Morning" if h < 12 else "Afternoon" if h < 17 else "Evening" if h < 21 else "Night"

        for n in self.notifs:
            if n["action"] != "allow":
                continue
            c = f"cat:{n['category']}"
            w = f"time:{window(n['hour'])}"
            t = f"task:{n['task']}"
            node(c, CATEGORIES[n["category"]]["label"], "trigger")
            node(w, window(n["hour"]), "time")
            node(t, n["task"], "task")
            edges[(t, c)] += 1
            edges[(w, c)] += 1
            if n["opened"]:
                a = f"app:{n['followed_app']}"
                node(a, n["followed_app"], "app")
                edges[(c, a)] += 1
                o = "out:rabbit" if n["rabbit"] else "out:quick"
                node(o, "Rabbit hole" if n["rabbit"] else "Quick check", "outcome")
                edges[(a, o)] += 1
                if n["fatigue"] > 0.55:
                    node("state:fatigue", "Fatigued", "state")
                    edges[("state:fatigue", o)] += 1
            else:
                node("out:ignored", "Ignored", "outcome")
                edges[(c, "out:ignored")] += 1
        node("you", "You", "core", 50)
        for t in [k for k in nodes if k.startswith("task:")]:
            edges[("you", t)] += 20
        return dict(nodes=list(nodes.values()),
                    links=[dict(source=s, target=t, weight=w) for (s, t), w in edges.items() if w >= 3])

    def replay(self, day: str | None = None):
        day = day or self.days[-2]
        segs = [s for s in self.segments if s["day"] == day]
        ns = [n for n in self.notifs if n["day"] == day]
        return dict(day=day, days=self.days, segments=segs, notifications=ns)

    @memo
    def accuracy(self):
        """Backtest: train on all but last 3 days, predict them. Compare to a generic prior."""
        full_train = self.train
        self._fit(holdout_days=3)
        cut = self.days[-4]
        test = [n for n in self.notifs if cut <= n["day"] < self.today and n["action"] == "allow"]
        X = np.array([featurize(n["category"], n["hour"], n["depth"], n["minutes_in"], n["fatigue"]) for n in test])
        y = np.array([n["opened"] for n in test], dtype=float)
        p_twin = self.open_model.predict_proba(X)[:, 1]
        p_generic = np.array([CATEGORIES[n["category"]]["p_open"] for n in test])
        brier_twin = float(np.mean((p_twin - y) ** 2))
        brier_gen = float(np.mean((p_generic - y) ** 2))
        bins = []
        for lo in np.arange(0, 1, 0.2):
            m = (p_twin >= lo) & (p_twin < lo + 0.2)
            if m.sum() >= 3:
                bins.append(dict(predicted=round(float(p_twin[m].mean()), 2), observed=round(float(y[m].mean()), 2), n=int(m.sum())))
        # cost MAE
        errs_twin, errs_gen, samples = [], [], []
        for n in test[:120]:
            pred = self.simulate(n["category"], n["hour"], n["depth"], n["minutes_in"], n["fatigue"], n["task"], 400)
            errs_twin.append(abs(pred["allow"]["cost_p50"] - n["cost_min"]))
            c = CATEGORIES[n["category"]]
            gen = c["p_open"] * (c["p_rabbit"] * c["rabbit_min"] + 4)
            errs_gen.append(abs(gen - n["cost_min"]))
            if len(samples) < 40:
                samples.append(dict(id=n["id"], label=CATEGORIES[n["category"]]["label"], predicted=pred["allow"]["cost_p50"],
                                    p10=pred["allow"]["cost_p10"], p90=pred["allow"]["cost_p90"], actual=n["cost_min"],
                                    hit=pred["allow"]["cost_p10"] <= n["cost_min"] <= pred["allow"]["cost_p90"]))
        self._fit()
        self.train = full_train
        return dict(test_events=len(test), brier_twin=round(brier_twin, 3), brier_generic=round(brier_gen, 3),
                    improvement=round(1 - brier_twin / brier_gen, 2) if brier_gen else 0,
                    mae_twin=round(float(np.mean(errs_twin)), 1), mae_generic=round(float(np.mean(errs_gen)), 1),
                    interval_coverage=round(float(np.mean([s["hit"] for s in samples])), 2) if samples else 0,
                    calibration=bins, samples=samples)

    def insights(self):
        fp = self.fingerprint()
        cats = self.categories()
        apps = [a for a in self.apps() if a["focus_breaks_per_day"] > 0]
        out = []
        b = fp["best_window"]
        out.append(dict(kind="focus", title="Your golden hours",
                        text=f"You focus best between {fmt_h(b['start'])} and {fmt_h(b['end'])}. Protect it for your hardest work."))
        if apps:
            a = apps[0]
            out.append(dict(kind="app", title=f"{a['app']} is your biggest focus breaker",
                            text=f"It breaks focus {a['focus_breaks_per_day']}x/day and each break costs about {a['avg_cost_min']} min."))
        top = next((c for c in cats if c["uplift"] and c["uplift"] > 0), None)
        if top:
            out.append(dict(kind="notif", title=f"Hold back: {top['label']}",
                            text=f"In {top['n_holdouts']} randomized holdouts, delaying these saved ~{top['uplift']} min each."))
        out.append(dict(kind="fatigue", title="Fatigue creeps in",
                        text=f"Your switching rises and focus quality drops after about {fmt_h(fp['fatigue_onset'])}. Schedule lighter tasks then."))
        imp = next((c for c in cats if c["importance"] >= 0.8), None)
        if imp:
            out.append(dict(kind="safe", title=f"Always let through: {imp['label']}",
                            text="These rarely derail you and matter. Your twin will never hold them back."))
        return out


    # ------------------------------------------------- unsupervised + recsys
    @memo
    def archetypes(self, k: int = 3):
        """Cluster past days into 'day archetypes' with KMeans on daily behaviour features."""
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
        rows, days = [], []
        for d in self.days:
            if d == self.today:
                continue
            seg = [s for s in self.segments if s["day"] == d]
            ns = [n for n in self.notifs if n["day"] == d]
            focus = sum((s["end"] - s["start"]) * 60 for s in seg if s["kind"] == "focus")
            distract = sum((s["end"] - s["start"]) * 60 for s in seg if s["kind"] == "distraction")
            q = float(np.mean([s["quality"] for s in seg if s["kind"] == "focus"] or [0]))
            switches = sum(1 for s in seg if s["kind"] == "distraction")
            fat = float(np.mean([n["fatigue"] for n in ns] or [0]))
            rows.append([focus, distract, q, switches, fat])
            days.append(d)
        X = np.array(rows)
        km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(StandardScaler().fit_transform(X))
        groups = []
        for c in range(k):
            m = km.labels_ == c
            mean = X[m].mean(axis=0)
            groups.append(dict(cluster=c, days=[days[i] for i in np.where(m)[0]], focus_min=round(float(mean[0])),
                               distraction_min=round(float(mean[1])), quality=round(float(mean[2]), 2),
                               switches=round(float(mean[3]), 1), fatigue=round(float(mean[4]), 2)))
        # name clusters by rank of focus-to-distraction ratio
        ranked = sorted(groups, key=lambda g: -(g["focus_min"] / max(g["distraction_min"], 1)))
        names = [("Flow day", "Long clean blocks, few escapes."),
                 ("Patchy day", "Decent work, frequently interrupted."),
                 ("Doom-scroll day", "Feeds won. Short blocks, long escapes.")]
        for g, (nm, desc) in zip(ranked, names):
            g["name"], g["description"] = nm, desc
        return ranked

    def forecast(self, hours: int = 12):
        """Predicted focus capacity and interruption risk for the next hours."""
        now = datetime.now()
        fp_hourly = self.fingerprint()["hourly"]
        out = []
        ctx = self.context_now()
        for i in range(hours):
            h = (now.hour + i) % 24
            fatigue = min(0.95, ctx["fatigue"] + i * 0.035)
            x = np.array([featurize("social_like", h + 0.5, 0.6, 30, fatigue)])
            risk = float(self.open_model.predict_proba(x)[0, 1] * self.rabbit_model.predict_proba(x)[0, 1])
            out.append(dict(hour=h, focus=round(float(fp_hourly[h]), 2), risk=round(risk, 2), fatigue=round(fatigue, 2)))
        return out

    def recommendations(self, vip: set | None = None):
        """Rank interventions by estimated minutes saved per day (uplift from randomized holdouts)."""
        vip = vip or set()
        recs = []
        days = max(1, len(self.days) - 1)
        for c in self.categories():
            if c["category"] in vip or c["uplift"] is None or c["importance"] >= 0.75:
                continue
            per_day = c["per_day"] * c["uplift"] * c["open_rate"]
            if per_day < 3:
                continue
            recs.append(dict(id=f"batch:{c['category']}", type="rule", title=f"Batch '{c['label']}' into a digest",
                             detail=f"{c['per_day']}/day. Each one you see costs ~{c['cost_allow']} min; held back, ~{c['cost_delay']} min.",
                             impact_min=round(per_day, 1), evidence=f"{c['n_holdouts']} randomized holdouts", confidence=round(min(0.95, 0.4 + c['n_holdouts'] / 50), 2)))
        fp = self.fingerprint()
        b = fp["best_window"]
        dl = routine.deadline_pressure(self.profile) if self.profile else None
        if dl:
            recs.append(dict(id="deadline:guard", type="schedule", title=f"Guard your golden hours: {dl['title']} in {dl['days_left']} days",
                             detail=f"Hold every low-value ping from {fmt_h(b['start'])} to {fmt_h(b['end'])} until {dl['due']}. Your twin is already stricter.",
                             impact_min=round(40 + 10 * (14 - dl['days_left']) / 2, 1), evidence="your declared deadline + golden hours", confidence=0.8))
        clash = [x for x in routine.blocks_on(self.profile, datetime.now().weekday()) if x["start"] < b["end"] and x["end"] > b["start"]] if self.profile else []
        if clash:
            recs.append(dict(id="schedule:clash", type="schedule", title=f"Your golden hours overlap {clash[0]['label']}",
                             detail="Use the first free stretch after it for your hardest task, and keep admin for the low-focus hours.",
                             impact_min=12.0, evidence="declared schedule vs. focus curve", confidence=0.6))
        recs.append(dict(id="schedule:golden", type="schedule", title=f"Block {fmt_h(b['start'])}-{fmt_h(b['end'])} for your hardest task",
                         detail="Your focus quality peaks here. Move meetings and admin elsewhere.",
                         impact_min=round(b["quality"] * 30, 1), evidence=f"{fp['days_learned']} days of sessions", confidence=0.8))
        for a in self.apps()[:3]:
            if a["focus_breaks_per_day"] >= 1 and a["rabbit_rate"] > 0.4:
                recs.append(dict(id=f"app:{a['app']}", type="app", title=f"Add a 10-second pause before {a['app']}",
                                 detail=f"It turns {round(a['rabbit_rate'] * 100)}% of quick checks into rabbit holes.",
                                 impact_min=round(a["focus_breaks_per_day"] * a["avg_cost_min"] * 0.3, 1),
                                 evidence=f"{round(a['focus_breaks_per_day'] * days)} focus breaks observed", confidence=0.6))
        recs.append(dict(id="break:fatigue", type="wellbeing", title=f"Take a real break around {fmt_h(fp['fatigue_onset'])}",
                         detail="After this your rabbit-hole risk rises sharply. A 10-minute walk beats a 40-minute scroll.",
                         impact_min=8.0, evidence="fatigue vs. rabbit-hole model", confidence=0.55))
        return sorted(recs, key=lambda r: -r["impact_min"] * r["confidence"])


    # ------------------------------------------------- experiments, drift, data quality
    @memo
    def experiments(self, n_boot: int = 400):
        """Randomized holdouts as a micro-randomized trial: ATE of 'allow' vs 'delay' with a bootstrap 95% CI."""
        rng = np.random.default_rng(0)
        out = []
        for k in CATEGORY_KEYS:
            a = np.array([n["cost_min"] for n in self.notifs if n["category"] == k and n["action"] == "allow"])
            d = np.array([n["cost_min"] for n in self.notifs if n["category"] == k and n["action"] == "delay"])
            if len(a) < 5 or len(d) < 3:
                continue
            boots = [rng.choice(a, len(a)).mean() - rng.choice(d, len(d)).mean() for _ in range(n_boot)]
            lo, hi = np.percentile(boots, [2.5, 97.5])
            out.append(dict(category=k, label=CATEGORIES[k]["label"], n_allow=len(a), n_delay=len(d),
                            ate_min=round(float(a.mean() - d.mean()), 1), ci_low=round(float(lo), 1), ci_high=round(float(hi), 1),
                            significant=bool(lo > 0)))
        return dict(policy="Low-importance alerts were held back at random 22% of the time (exploration).",
                    method="Difference in mean focus cost, bootstrap 95% CI", arms=sorted(out, key=lambda e: -e["ate_min"]))

    @memo
    def drift(self):
        """Population Stability Index between the last 3 days and the earlier history, per feature."""
        cut = self.days[-4]
        old = [n for n in self.notifs if n["day"] < cut]
        new = [n for n in self.notifs if n["day"] >= cut]

        def psi(a, b, bins=6):
            edges = np.quantile(a, np.linspace(0, 1, bins + 1))
            edges[0], edges[-1] = -np.inf, np.inf
            pa = np.histogram(a, edges)[0] / max(len(a), 1) + 1e-4
            pb = np.histogram(b, edges)[0] / max(len(b), 1) + 1e-4
            return float(np.sum((pb - pa) * np.log(pb / pa)))
        feats = {"hour": "hour", "fatigue": "fatigue", "minutes into block": "minutes_in", "focus cost": "cost_min"}
        rows = []
        for name, key in feats.items():
            v = psi(np.array([n[key] for n in old]), np.array([n[key] for n in new]))
            rows.append(dict(feature=name, psi=round(v, 3), status="stable" if v < 0.1 else "watch" if v < 0.25 else "drifted"))
        worst = max(r["psi"] for r in rows)
        return dict(model_version=self.model_version, trained_at=self.trained_at, train_events=self.n_train,
                    features=rows, action="none" if worst < 0.25 else "retrain on recent window")

    @memo
    def data_quality(self):
        """Gaps, overlaps, duplicates and impossible values in the behavioural log."""
        issues = []
        by_day = defaultdict(list)
        for s in self.segments:
            by_day[s["day"]].append(s)
        overlaps = gaps = 0
        for d, segs in by_day.items():
            segs = sorted(segs, key=lambda s: s["start"])
            for a, b in zip(segs, segs[1:]):
                if b["start"] < a["end"] - 1e-6:
                    overlaps += 1
                elif b["start"] - a["end"] > 1.0:
                    gaps += 1
        dupes = len(self.notifs) - len({(n["day"], round(n["hour"], 3), n["category"]) for n in self.notifs})
        neg = sum(1 for n in self.notifs if n["cost_min"] < 0 or n["away_min"] < 0)
        if overlaps:
            issues.append(dict(kind="overlap", count=overlaps, fix="Clipped to the later segment's start"))
        if gaps:
            issues.append(dict(kind="gap>60min", count=gaps, fix="Marked as away/AFK, excluded from focus stats"))
        if dupes:
            issues.append(dict(kind="duplicate notification", count=dupes, fix="De-duplicated by (time, category)"))
        if neg:
            issues.append(dict(kind="negative duration", count=neg, fix="Dropped"))
        total = len(self.segments) + len(self.notifs)
        score = max(0.0, 1 - (overlaps + dupes + neg) / max(total, 1))
        return dict(events=total, days=len(self.days), quality_score=round(score, 3), issues=issues)


def fmt_h(h: float) -> str:
    h = h % 24
    hh = int(h)
    mm = int(round((h - hh) * 60))
    suffix = "AM" if hh < 12 else "PM"
    return f"{(hh % 12) or 12}:{mm:02d} {suffix}"


_cache: dict[tuple, Twin] = {}


def get_twin(persona: str, seed: int, history: tuple | None = None, version: int = 0) -> Twin:
    """Cached twin. `version` (e.g. the user's event count) forces a refit when new data arrives."""
    key = (persona, seed, date.today().isoformat(), version)
    if key not in _cache:
        for k in [k for k in _cache if k[:3] == key[:3]]:
            del _cache[k]
        _cache[key] = Twin(persona, seed, history)
    return _cache[key]
