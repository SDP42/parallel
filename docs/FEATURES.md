# Feature map

Status against the 75-item backlog: ✅ built · 🟡 partial or simulated · 🗺️ roadmap.

## A. Data collection & processing (1–10)
| # | Feature | Status | Where |
|---|---|---|---|
| 1 | Unified event collector | ✅ | `POST /api/events` (deduplicated, content-free) |
| 2 | Application activity tracker | 🟡 | `POST /api/ingest/activitywatch`; demo history from the generator |
| 3 | Notification event registry | ✅ | `user_notifications`, `ds_notifications` |
| 4 | Focus session manager | ✅ | `/api/sessions` (+ next-step checkpoint) |
| 5 | App-switching detector | ✅ | `recent_switches_15m` feature, Replay |
| 6 | Task-resumption tracker | ✅ | `resume_min` model |
| 7 | Behavioural timeline | ✅ | `/api/attention/timeline`, Replay |
| 8 | Context feature builder | ✅ | `ml/dataset.py`, `twin.featurize` |
| 9 | Personal history store | ✅ | per-user tables in SQLite |
| 10 | Data-quality detector | ✅ | `/api/data-quality` |

## B. Personal intelligence (11–20)
| # | Feature | Status | Where |
|---|---|---|---|
| 11 | Attention fingerprint | ✅ | Fingerprint page, 3D ring |
| 12 | Focus-window predictor | ✅ | `/api/twin/forecast`, planner |
| 13 | Interruption susceptibility | ✅ | p(open) models |
| 14 | Notification-open probability | ✅ | personal LR + population GBM |
| 15 | Distraction-duration predictor | ✅ | dwell + quantile models |
| 16 | Recovery-time predictor | ✅ | resumption model |
| 17 | Rabbit-hole detector | ✅ | p(rabbit hole) |
| 18 | App fragmentation score | ✅ | `/api/twin/overview` |
| 19 | Fatigue estimator | ✅ | behavioural estimate |
| 20 | Adaptive personalization | ✅ | refit on new live rows; population→personal blend |

## C. Counterfactual engine (21–30)
| # | Feature | Status | Where |
|---|---|---|---|
| 21–24 | Outcome engine, multi-branch scenarios, distributions, attention cost | ✅ | `/api/simulations` |
| 25 | Utility estimator | ✅ | importance + rules + uplift |
| 26 | Intervention recommender | ✅ | `/api/recommendations` |
| 27 | What-if parameters | ✅ | Multiverse sliders |
| 28 | Explanations | ✅ | factor attribution |
| 29 | Abstention | ✅ | `recommendation: "ask"` |
| 30 | Outcome evaluator | ✅ | `/api/outcomes`, Accuracy |

## D. Gamification (31–40)
| # | Feature | Status | Where |
|---|---|---|---|
| 31–33 | Narratives, universe archetypes, story timeline | ✅ | Universes component, `universes` field |
| 34 | XP ledger | ✅ | `xp_ledger` |
| 35 | Quests | ✅ | `/api/quests` (activity-validated) |
| 36 | Streaks with forgiveness | ✅ | `/api/gamification/profile` |
| 37 | Virtual world | ✅ | desk → orbital station |
| 38 | Personal humour | 🟡 | per-category templates with task names |
| 39 | Outcome reveal | ✅ | reality check |
| 40 | Fair rewards | ✅ | caps, repeat dampening, no XP for holding urgent items |

## E. Safety, evaluation & reliability (41–50)
| # | Feature | Status | Where |
|---|---|---|---|
| 41 | Priority classifier | ✅ | — |
| 42 | Deferred queue | ✅ | — |
| 43 | Digest | ✅ | — |
| 44 | Trusted senders | ✅ | — |
| 45 | Calibration monitor | ✅ | — |
| 46 | A/B experiments | ✅ | `/api/experiments` |
| 47 | Privacy manager | ✅ | — |
| 48 | Capability adapter | ✅ | — |
| 49 | Model registry + drift | ✅ | — |
| 50 | Daily insights | ✅ | — |

## 51–75 (platform)
| # | Feature | Status |
|---|---|---|
| 51 | Attention budget | ✅ |
| 52 | Attention debt ledger | ✅ |
| 53 | Task-aware twin | ✅ (task depth) |
| 54 | Focus reservation | ✅ |
| 55 | Personalized consequences | ✅ |
| 56 | Causal lab | ✅ |
| 57 | Data vault | ✅ |
| 58 | Prediction benchmark | ✅ (MODEL_CARD.md) |
| 59 | Cross-device continuity | 🗺️ |
| 60 | Federated learning | 🗺️ |
| 61 | Companion "Echo" | ✅ |
| 62 | Notification preview | ✅ (digest) |
| 63 | Co-focus rooms | ✅ |
| 64 | Workload planner | ✅ |
| 65 | Browser interceptor | 🗺️ |
| 66 | Context checkpoint | ✅ |
| 67 | Adaptive challenges | 🟡 |
| 68 | Habit experiments | ✅ |
| 69 | Environment context | ✅ (dataset feature) |
| 70 | Portable profile | ✅ |
| 71 | Attention API | ✅ |
| 72 | Team health | ✅ (k ≥ 5) |
| 73 | SDK | ✅ |
| 74 | Product-team analytics | 🗺️ |
| 75 | Audit layer | ✅ (hash chain) |
