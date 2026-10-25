# Roadmap & how to build on Parallel

## Now (hackathon build)
- [x] Personal twin, counterfactual simulator, smart inbox, population models, data & model registry
- [x] Routine-aware twin: 7-step onboarding, weekly schedule, deadlines, tool and nag apps
- [x] Ongoing inputs: energy check-in, “did this matter?”, knowledge meter, check moments
- [x] Time machine, doppelgänger, auto-reply drafts, multilingual voice coach
- [x] Fixed ActivityWatch ingest (dedup, `tz_offset_min`, live segments)
- [x] PWA plus Capacitor Android and iOS projects

## Next (2–4 weeks)
1. **Android NotificationListener plugin.** Real notifications in, holds and re-posts out (see [MOBILE.md](MOBILE.md)).
2. **ActivityWatch bridge script.** Poll `localhost:5600` every few minutes and push to the API.
3. **Calendar import.** Read-only `.ics` import to fill the weekly schedule automatically.
4. **Personal experiments UI.** Opt-in micro-randomized trials per category, with results that update live.
5. **PostgreSQL + Alembic migrations**, plus a deploy (Render/Fly for the API, Vercel/Netlify for the web).

## Later
- Cross-device continuity: phone and laptop as one focus context.
- On-device personalization with federated averaging and secure aggregation.
- A browser rabbit-hole interceptor extension.
- An Attention API for third-party apps (keys and SDK already exist), plus a privacy-first team dashboard.

## Where to add things
| You want to… | Touch |
|---|---|
| Add an API endpoint | a router in `backend/app/*_api.py` (follow `routine_api.py`), plus a test in `backend/tests/test_api.py` |
| Change how decisions are made | `backend/app/twin.py` → `simulate()` (keep numbers model-driven) |
| Add a routine rule | `backend/app/routine.py` |
| Retrain or change models | `backend/ml/train.py`, then run `python -m ml.train` |
| Add an app page | `frontend/src/app/<Page>.tsx`, a route in `src/App.tsx`, nav in `src/app/AppShell.tsx` |
| Add a landing chapter | `frontend/src/pages/Landing.tsx` + `src/landing/*` |
| Add a language | `frontend/src/lib/i18n.ts` and `backend/app/assistant.py` |
| Add a native feature | `frontend/src/lib/native.ts` (no-op on web) |
