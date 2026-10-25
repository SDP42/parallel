# Data & ML

## Data inputs the twin uses
| Input | Source | Example | Stored as |
|---|---|---|---|
| Declared routine | Onboarding / Settings | wake 6:30, bed 11 PM, morning person | `user_profile.data` |
| Weekly schedule | Onboarding / Settings (templates) | Mon–Fri 9–1 Lectures | `user_profile.data.blocks` |
| Deadlines & exams | Onboarding / Settings | DBMS mid-sem on 28 Oct | `user_profile.data.deadlines` |
| Tool vs nag apps | Onboarding / Settings | VS Code = tool, Instagram = nag | `user_profile.data.tools/nags` |
| Energy check-ins | Today page (10 s) | energy 2/5 | `checkins` |
| “Did this matter?” taps | Today page | email → mattered | `matter_feedback` |
| Choices & reality checks | Multiverse, Smart inbox | held · actually cost 1 min | `decisions`, `predictions` |
| App activity (real) | ActivityWatch → `POST /api/ingest/activitywatch` | 30 min VS Code | `events` + `user_segments (live)` |
| Generic events | Any client → `POST /api/events` | app_active, notification | `events` |
| Notification metadata (real, roadmap) | Android NotificationListener plugin | package, category, time; **no text** | `user_notifications (live)` |

**Never collected:** message text, notification bodies, window titles, keystrokes, screenshots, microphone audio, or precise location.

## Population dataset (synthetic)
`python -m ml.dataset --users 60 --days 30` writes:
- `data/users.csv`: 60 users. Columns include persona, chronotype, susceptibility, device and consent.
- `data/notifications.csv`: **81,582 events × 35 columns**:
  - time features
  - category, sender type, importance
  - task depth, minutes into block, fatigue, focus capacity
  - switches in the last 15 min, notifications in the last hour
  - environment and device
  - logging policy (allow / randomized hold) and exploration flag
  - outcomes: opened, open latency, rabbit hole, away / resume / total minutes, feedback
- `data/sessions.csv`: **149,649 app sessions × 10 columns**.

The same data is loaded into SQLite as `ds_users`, `ds_notifications` and `ds_sessions`.

The behaviour generator (`app/synth.py`) models:
- per-person quirks
- persona time-of-day focus curves
- fatigue that builds within a day
- rabbit-hole dwell times
- recovery cost that grows with dwell time and task depth
- a **22% randomized hold-back policy** on low-importance alerts, which is what makes counterfactual estimates honest

## Models
### Personal twin (per user, refit when their data changes) — `app/twin.py`
| Component | Model |
|---|---|
| p(open \| context) | LogisticRegression over 16 features |
| p(rabbit hole \| opened) | LogisticRegression |
| Dwell time | Per-category log-normal with empirical-Bayes shrinkage toward the persona prior (strength 8) |
| Resumption delay | LinearRegression on dwell × task depth |
| Counterfactual | Mean cost of the user's own randomized holdouts per category |
| Prediction | 2,000 Monte Carlo rollouts, giving p10/p50/p90, a histogram and the most likely event chain |
| Day archetypes | KMeans (k=3) over 5 daily features |
| Explanations | Logistic contribution of each factor against an average moment |

### Population model (trained once, versioned) — `ml/train.py`
| Target | Model | Unseen-user result | Baseline |
|---|---|---|---|
| p(open) | HistGradientBoosting + isotonic calibration | AUC **0.845**, Brier 0.152 | category rate AUC 0.728 |
| p(rabbit \| open) | HistGradientBoosting + isotonic calibration | AUC **0.802** | — |
| Focus cost p10/p50/p90 | Quantile HistGradientBoosting | MAE 5.5 min · **79%** interval coverage | MAE 6.0 |
| Counterfactual effect | T-learner | **0.9 min** gap vs randomized truth | — |

Evaluation uses `GroupShuffleSplit` by user, so the test users are never seen in training. Each run writes artifacts, `metrics.json` and `MODEL_CARD.md` to `backend/models/<version>/`, and registers itself as active in `model_registry`.

## How learning happens
- **Cold start:** the population model plus a routine-aware warm-up history. The warm-up follows the declared schedule but is *generated*, not observed; the Settings page says so.
- **Every reality check and live event** becomes a row in `user_notifications`/`user_segments` (`source='live'`). The twin refits on the next request.
- **“Did this matter?”:** a Beta-style update of each category's importance (prior weight 6).
- **Energy check-in:** overrides the behavioural fatigue estimate for 3 hours (60/40 blend).
- **Blend:** the personal weight is n / (n + 20), where n is the number of similar moments in the user's history.

## Honest limits
- All accuracy numbers above are on **synthetic** data. The best upgrade for a demo is a few days of your own ActivityWatch data (see [RUN.md](../RUN.md#real-data)).
- The warm-up history follows your routine but is not behaviour you actually showed. Real data replaces it as it arrives.
- Fatigue is a behavioural estimate, never a medical measure.
