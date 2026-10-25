# API reference

Base URL `http://127.0.0.1:8787/api`. Interactive docs are at `/docs` (Swagger UI).

Authentication is `Authorization: Bearer <token>`, from sign-in, sign-up or a demo login. Exceptions:
- endpoints marked 🌐 are public
- `/v1/interrupt` uses the `X-API-Key` header instead

## Auth & profile
| Method | Path | Purpose |
|---|---|---|
| POST | /auth/signup · /auth/signin | Create an account or sign in (PBKDF2 password hashing, JWT) |
| POST | /auth/demo?persona=… 🌐 | One-click demo login |
| GET | /auth/demo-accounts 🌐 | Seeded demo credentials |
| GET, PUT | /me · /me/persona · /me/settings | Profile, onboarding, learning and retention settings |
| GET | /me/data · /me/export | Your row counts; full JSON export |
| DELETE | /me | Delete account and data |
| GET, POST | /profile/portable | Portable attention profile export / import |

## Twin & prediction
| Method | Path | Purpose |
|---|---|---|
| GET | /twin/overview | Fingerprint, insights, current state, categories, apps, stats |
| GET | /attention/profile · /attention/timeline | Fingerprint; day replay |
| GET | /twin/graph · /twin/archetypes · /twin/forecast · /twin/accuracy | Knowledge graph, KMeans day types, forecast, backtest |
| POST | /simulations | Allow/hold futures with ranges, explanation, population blend; prediction is logged |
| POST | /simulate · /notifications/{category}/predict | Same, without logging / for a category |
| GET | /notifications/queue | Live triage queue |
| GET | /recommendations · /insights/daily | Uplift-ranked actions; daily insights |
| POST | /interventions · /outcomes | Record a choice; record what really happened (XP, live data) |
| GET | /outcomes · /digest | Predictions vs reality; deferred queue |
| POST | /digest/release | Deliver the queued digest now |
| GET | /experiments · /models · /data-quality | Randomized effects with confidence intervals; drift; data quality |
| POST | /assistant | Multilingual coach (`{text, lang}`) |

## Routine & ongoing inputs
| Method | Path | Purpose |
|---|---|---|
| GET, PUT | /me/profile | Declared routine: wake/bed, chronotype, weekly `blocks`, `deadlines`, `tools`, `nags`. PUT regenerates the warm-up history |
| GET | /routine/templates | Weekly schedule templates (college, office, remote dev, creator) |
| POST, GET | /checkins | 10-second energy check-in (`{energy: 1..5}`); overrides the fatigue estimate for 3 h |
| POST, GET | /feedback/matter | “Did this matter?” (`{category, mattered}`); returns generic vs learned importance |
| GET | /twin/knowledge | How well the twin knows you (0–100) and what to add next |
| GET | /check-moments | Best moments today to check held pings |
| POST | /ingest/activitywatch?tz_offset_min=330 | Import ActivityWatch window events: deduplicated, titles dropped, stored as live segments |
| GET | /twin/timemachine | 30 days of current habits vs following the twin |
| GET | /population/doppelganger | Closest behavioural match among the population users, and what worked for them |
| GET | /autoreply?category=social_dm&lang=hi | Drafted auto-reply naming your current block (never sent automatically) |

## ML & data
| Method | Path | Purpose |
|---|---|---|
| GET | /ml/model 🌐 | Latest population-model metrics |
| GET | /ml/registry 🌐 | All registered model versions |
| GET | /ml/dataset 🌐 | Dataset summary and sample rows |
| GET | /population/compare | Your percentiles among the 60 dataset users |
| POST | /events | Ingest normalized events |
| GET | /events | List your stored events |

## Rules, sessions, gamification
| Method | Path | Purpose |
|---|---|---|
| GET, PUT | /rules | Per-category rule: auto · always · digest · never |
| POST, GET | /sessions · /sessions/current · /sessions/end | Focus sessions with a next-step checkpoint |
| GET, POST | /quests · /quests/{id}/complete | Quests (validated against real activity) |
| GET | /gamification/profile · /companion | XP, level, world, streak, achievements; Echo |
| GET, PUT | /budget | Attention budget |
| GET | /debt | Attention debt ledger |
| POST, GET, DELETE | /focus/reserve · /focus/status | Focus reservation |
| POST, GET | /rooms · /rooms/{code} · /rooms/{code}/join · /rooms/{code}/done | Co-focus rooms |
| POST, GET | /habits | 7-day habit experiments |
| GET | /planner | Next-hours plan |
| GET | /team/health | Aggregate team view (k ≥ 5) |
| GET | /audit | Hash-chained audit log + verification |

## Developer platform
| Method | Path | Purpose |
|---|---|---|
| POST, GET | /developer/keys | Create or list API keys |
| GET | /v1/interrupt?category=… | `X-API-Key`. Returns `{decision: now/defer/digest, reason, deliver_after, confidence}` |
| GET | /platform/capabilities 🌐 | What each OS allows |
| POST | /contact 🌐 | Contact form (stored in the database) |
| GET | /demo/simulate · /demo/persona/{p} 🌐 | Landing-page demo data |
