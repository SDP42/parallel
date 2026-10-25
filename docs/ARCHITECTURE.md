# Architecture

Parallel is a **modular monolith**: one FastAPI service, one SQLite database, and one React app that runs as a website, an installable PWA, and a native Android/iOS app via Capacitor. Each piece is small enough for a new teammate to read in an afternoon.

```
 ┌──────────────────────────── Clients (one React codebase) ────────────────────────────┐
 │  Web (Vite SPA)        PWA (manifest + sw.js)        Android / iOS (Capacitor shell)  │
 │  3D landing (R3F + GLSL) · App pages · i18n (en/hi/mr/es) · voice coach (Web Speech)  │
 └──────────────────────────────────────┬────────────────────────────────────────────────┘
                                        │ HTTPS · JSON · JWT (Bearer)
 ┌──────────────────────────────────────┴────────────────────────────────────────────────┐
 │ FastAPI (backend/app)                                                                  │
 │  main.py         auth, twin endpoints, simulations, interventions/outcomes, ML/data    │
 │  routine_api.py  profile & schedule, check-ins, "did this matter?", knowledge meter,   │
 │                  ActivityWatch ingest, time machine, doppelgänger, auto-reply          │
 │  platform_api.py budget, debt, focus reservation, developer API, audit chain, rooms,  │
 │                  planner, habits, portable profile, team health, companion             │
 │  twin.py         the personal model (fit, simulate, fingerprint, recommendations)      │
 │  routine.py      declared routine logic (focus curve shift, blocks, deadlines)         │
 │  population.py   serves the trained population models (cold-start prior)              │
 │  history.py      per-user history in SQLite (warm-up vs live rows)                     │
 │  synth.py        behaviour generator (warm-up history + dataset)                       │
 │  assistant.py    multilingual intent router (numbers come from the models only)       │
 └──────────────────────────────────────┬────────────────────────────────────────────────┘
                                        │ sqlite3
 ┌──────────────────────────────────────┴────────────────────────────────────────────────┐
 │ SQLite (backend/parallel.db)                                                           │
 │  users · user_profile · user_segments · user_notifications · events · checkins        │
 │  matter_feedback · decisions · predictions · rules · deferred_queue · focus_sessions  │
 │  xp_ledger · quests · rooms · habit_experiments · audit_log (hash chain)              │
 │  ds_users · ds_notifications · ds_sessions (population dataset) · model_registry      │
 └────────────────────────────────────────────────────────────────────────────────────────┘
        ▲                                                   ▲
        │ python -m ml.dataset                              │ python -m ml.train
   synthetic population (60 users × 30 days)        versioned models in backend/models/<version>/
```

## How one prediction is made
1. **Context.** The client calls `POST /api/simulations` with a notification category (plus optional what-if values).
2. **Twin load.** `twin_of(user)`:
   - loads the user's rows from `user_segments` and `user_notifications`
   - creates a routine-aware warm-up history if the user has none
   - attaches their declared routine (`user_profile`), the importance learned from their "did this matter?" taps, and their latest energy check-in
3. **Personal model** (`twin.py`):
   - two logistic regressions: p(open) and p(rabbit hole)
   - an empirical-Bayes dwell-time model per category
   - a linear resumption model
   - 2,000 Monte Carlo rollouts, giving a cost distribution with p10/p50/p90
4. **Counterfactual.** The cost of holding the ping comes from randomized holdouts in the user's history.
5. **Routine and rules**, in order:
   1. trusted senders always pass
   2. during a declared class or work block, low-value pings are held and the reason names the block
   3. a deadline within 3 days lowers the hold threshold
   4. apps marked as nags get less benefit of the doubt
   5. low evidence leads to "ask"
6. **Population blend** (`population.py`): gradient-boosted population predictions are mixed with the personal ones. The personal weight is n / (n + 20), where n is the number of similar moments in the user's history.
7. **Logging.** The prediction goes into `predictions` and the hash-chained `audit_log`. A later `POST /api/outcomes` grades it and appends a `live` row, so the twin refits from the database.

## Data model highlights
| Table | Purpose |
|---|---|
| `user_profile` | Declared routine as JSON: wake/bed, chronotype, weekly blocks, deadlines, tool/nag apps |
| `user_segments` | Activity timeline (`source` = `warmup` or `live`) used by the fingerprint, replay and heatmap |
| `user_notifications` | Notification events with outcomes (`warmup` or `live`) used to train the personal model |
| `events` | Raw ingested events, deduplicated by a unique key; message text and window titles are never stored |
| `checkins`, `matter_feedback` | Ongoing explicit inputs |
| `predictions`, `decisions` | What the twin predicted, what the user chose, and what really happened |
| `audit_log` | Tamper-evident trail (each row hashes the previous one) |
| `model_registry` | Population model versions and their metrics |

## Why these choices
- **SQLite:** zero setup for a hackathon, real SQL, easy to inspect. The schema is plain enough to move to PostgreSQL.
- **scikit-learn over deep learning:** the dataset is small and tabular, so we want calibration and explainability over size. Every prediction can explain itself.
- **No LLM in the decision loop:** numbers must be reproducible and auditable. The comedy layer and the coach reword model outputs; they never invent them.
- **Capacitor over a separate native codebase:** one React codebase ships to web, PWA, Android and iOS. Native-only capabilities (Android's NotificationListener) are added as plugins; see [MOBILE.md](MOBILE.md).
