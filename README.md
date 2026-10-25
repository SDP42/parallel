# Parallel — your attention digital twin

> Every ping forks your day. Parallel shows you both futures before you tap.

Built for **CASCADE ’26 · Theme 3 · Problem 3: The Attention Digital Twin**.

The problem statement asks for a personal twin that learns when you focus best, what causes interruptions, which content causes prolonged sessions, which notifications actually matter, when you're fatigued and which apps fragment concentration. It must also simulate *“If I allow this notification right now, what is likely to happen?”*, including the counterfactual.

Parallel does that with real, trained models, a database-backed history per user, and an interface built as a 3D story.

---

## The idea in one minute

You're coding. *“Someone liked your post.”*

| Universe A — you allow it | Universe B — your twin holds it |
|---|---|
| +2 min interruption → Instagram opened → +17 min browsing → +8 min to regain focus = **27 focus-minutes gone** | Silenced until your next checkpoint, read in a digest = **~0.7 min** |

The minutes come from your personal model (2,000 Monte Carlo rollouts, with a p10–p90 range and a confidence). The funny "Scrollfather vs Main Character" stories are a comedy layer on top. They are clearly fiction; the numbers are not.

**How it estimates what would have happened:** a small share (22%) of low-importance alerts were held back at random. Comparing those with alerts that went through gives an honest causal estimate with a confidence interval, not just a correlation. A T-learner trained on the same data matches those randomized estimates to within about 0.9 minutes.

---

## What's inside

### Core twin (the problem statement, point by point)
| Requirement | How Parallel learns it | Where you see it |
|---|---|---|
| When the user focuses best | Focus quality by weekday × hour from sessions; best 2.5 h window | Fingerprint heatmap, 3D fingerprint ring |
| What causes interruptions | Calibrated p(open \| context) model: task depth, fatigue, time, sender, recent switches | Multiverse "why" factors, Twin brain |
| Content that causes prolonged sessions | p(rabbit hole \| opened) + dwell-time model per app/category | Fragmentation bars, Replay |
| Which notifications matter | Importance + your rules + randomized uplift per category | Smart inbox, recommendations |
| When the user is fatigued | Behavioural fatigue estimate (switching, block length, time on task). Not a diagnosis. | Today, planner, coach |
| Apps that fragment concentration | Focus breaks/day × cost per break | Fingerprint, attention debt |
| “If I allow this now?” + counterfactual | Allow vs hold vs digest futures, randomized holdouts, T-learner | **Multiverse** (hero feature) |

### Features that go beyond the brief
- **Multiverse simulator.** What-if sliders, two comic universes, a 2,000-future histogram, a step-by-step chain, an explanation, then a *reality check* that grades the prediction.
- **Smart inbox.** Live triage, a deferred queue and a digest; trusted senders always pass.
- **Abstention.** When the twin is unsure it asks instead of deciding.
- **Population + personal blend.** New users start from a population model trained on 60 users and gradually shift to their own data.
- **Accuracy center.** Calibration, comparison against a generic rule, drift (PSI), data quality, and a tamper-evident audit chain.
- **Data & models page.** The dataset, model registry, AUC against baselines, counterfactual validation, and where you rank among the 60 users.
- **Twin brain.** A knowledge graph of tasks, times, triggers, apps and outcomes; click any node for the evidence behind it.
- **Replay.** Scrub through any day minute by minute.
- **Coach.** A voice and text assistant in **English, हिन्दी, मराठी and Español**. It is persona-aware and grounded in your numbers.
- **Gamification without guilt.** XP for *intentional* choices and honest feedback; an anti-farming ledger; quests validated against real activity; streaks with forgiveness; a world that grows from your desk to an orbital station.
- **Lab:**
  - attention budget and attention debt
  - co-focus rooms
  - 7-day habit experiments against your own baseline
  - a developer **Attention API** with keys, quotas and a JS SDK
  - team health with aggregates only and k-anonymity ≥ 5
  - a platform capability matrix
- **Privacy:**
  - local-first by design
  - message text never stored
  - pause learning, retention window, export everything
  - portable attention profile you can export and import
  - one-click delete

### The 3D landing page
One persistent WebGL scene of about 15k GPU particles. As you scroll it morphs through the story: **a human head (your twin) → its brain → the 7×24 attention fingerprint ring → the notification fork → the knowledge graph → you and your twin face to face.** Other elements: a wall-break intro, pinned horizontal chapters, scroll-scrubbed counters, Lenis smooth scrolling, and a live fork you can play with on real model output.

---

## Architecture

```
            ┌───────────────────────── frontend (Vite · React 19 · TS · Tailwind v4) ─────────────────────────┐
            │ 3D landing (react-three-fiber, custom GLSL, GSAP, Lenis)   App: Today · Multiverse · Inbox ·     │
            │ i18n (en/hi/mr/es) · Web Speech voice coach · SEO + schema  Fingerprint · Replay · Brain · Lab · …│
            └───────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                            │ REST /api (JWT)
            ┌───────────────────────────────────────────────┴────────────────────────────────────────────────┐
            │ FastAPI backend                                                                                │
            │  auth · rules · sessions · interventions/outcomes · digest · quests · rooms · developer API    │
            │  Personal twin (per user): LogisticRegression ×2 · empirical-Bayes dwell · LinearRegression ·   │
            │                             Monte Carlo rollouts · randomized-holdout counterfactual · KMeans   │
            │  Population model (ml/):    HistGradientBoosting (+isotonic) · quantile GBMs · T-learner        │
            │  Assistant: intent router + templates in 4 languages, numbers from the models only             │
            └───────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                            │
            ┌───────────────────────────────────────────────┴────────────────────────────────────────────────┐
            │ SQLite: users · user_notifications · user_segments · decisions · predictions · rules ·         │
            │         deferred_queue · xp_ledger · quests · rooms · audit_log (hash-chained) · model_registry │
            │         ds_users · ds_notifications (81k × 35) · ds_sessions (150k × 10)                        │
            └─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Data & ML (honest version)
- `python -m ml.dataset` generates a **synthetic** behavioural dataset: 60 users × 30 days, **81,582 notification events × 35 columns** and **149,649 app sessions**. It stands in for consented logs from ActivityWatch (desktop) or Android's NotificationListenerService. CSVs go to `backend/data/`; tables go to SQLite.
- `python -m ml.train` trains on that data, evaluates on **users never seen in training** (GroupShuffleSplit by user), saves versioned artifacts plus a `MODEL_CARD.md`, and registers the run in `model_registry`.

| Target | Model | Unseen-user result | Baseline |
|---|---|---|---|
| p(open) | HistGradientBoosting + isotonic | **AUC 0.845**, Brier 0.152 | category rate AUC 0.728 |
| p(rabbit hole \| open) | HistGradientBoosting + isotonic | **AUC 0.802** | — |
| Focus cost (p10/p50/p90) | Quantile GBMs | MAE 5.5 min, **79 % interval coverage** | category median MAE 6.0 |
| Counterfactual effect | T-learner | **0.9 min** mean gap vs randomized truth | — |

- Every account stores its own history in `user_notifications` / `user_segments`. New accounts get a clearly labelled 14-day persona warm-up; real outcomes are appended as `source='live'` and the twin refits from the database.

## Demo accounts
| Email | Password |
|---|---|
| student@parallel.app | parallel123 |
| developer@parallel.app | parallel123 |
| creator@parallel.app | parallel123 |
| professional@parallel.app | parallel123 |

You can also use the one-click demo buttons on the sign-in page.

## Run it
See **[RUN.md](RUN.md)** for Mac, Linux and Windows. The short version:

```bash
./run.sh
```

Then open http://localhost:5180.

## Project structure
```
parallel/
├─ README.md · RUN.md · run.sh · run.ps1
├─ docs/            IDEATION.md · PRESENTER_GUIDE.md · FEATURES.md · API.md
├─ sdk/             parallel-sdk.js (Attention API client)
├─ backend/
│  ├─ app/          main.py (API) · twin.py (personal model) · synth.py (behaviour generator) · history.py
│  │                population.py · assistant.py · platform_api.py · gamify.py · personas.py
│  ├─ ml/           dataset.py · train.py
│  ├─ models/       versioned model artifacts + MODEL_CARD.md
│  ├─ data/         generated CSVs
│  └─ tests/        test_api.py (end-to-end API tests)
└─ frontend/
   ├─ src/landing/  TwinWorld.tsx (WebGL world) · shapes.ts · scroll.ts
   ├─ src/pages/    Landing · Auth · Onboarding · Privacy · Contact · NotFound
   ├─ src/app/      Home · Simulator · Inbox · Fingerprint · Replay · Brain · Accuracy · Models · Lab · Coach · Settings
   ├─ src/components/ charts · Universes · VoiceCoach · SiteChrome · React Bits (CountUp, Magnet, ClickSpark, …)
   └─ public/       robots.txt · sitemap.xml · og-image.png/.webp · _redirects · site.webmanifest
```

## Launch checklist (SEO and site hygiene)
- Unique title, description and canonical tag per route; Open Graph and Twitter images.
- Organization + WebApplication JSON-LD; BreadcrumbList on inner pages.
- One `<h1>` per page.
- `robots.txt`, `sitemap.xml`, a custom 404, and 301 redirects (`public/_redirects`, `vercel.json`).
- Alt text and ARIA labels, lazy-loaded routes and 3D, a WebP OG image.
- Consent-gated Google Analytics (`VITE_GA_ID`) and a Search Console verification tag.
- A privacy policy page and a working contact form that stores to the database.
- Server-side rendering is not used: this is a Vite SPA. For SSR, port the public pages to Vite SSR or Next.js; the app pages don't need it.

## Honest limits
- The dataset is synthetic, so the models learn the generator's assumptions. The pipeline is ready for real consented logs (`POST /api/ingest/activitywatch`, `POST /api/events`).
- iOS doesn't let apps read other apps' notifications. Android and desktop (via ActivityWatch) are the realistic first platforms; see `GET /api/platform/capabilities`.
- Fatigue is a behavioural estimate, never a medical claim.
