# Contributing

## Setup
Follow [RUN.md](RUN.md). In short: `./run.sh` (macOS/Linux) or `run.ps1` (Windows).

## Before you push
```bash
cd backend && python -m pytest -q tests              # API tests must pass
cd ../frontend && npx tsc --noEmit -p tsconfig.app.json && npm run build
```

## Conventions
- **Backend:** FastAPI routers per feature area (`*_api.py`), Pydantic models for inputs, SQLite via `sqlite3`. Every number shown to users must come from a model or a query, never from hard-coded copy.
- **Frontend:** React 19 + TypeScript + Tailwind v4 tokens (`src/index.css`).
  - Colours: orange `#ff4a1f` = chaos / Universe A, mint `#3ee6b5` = calm / Universe B. No violet.
  - Charts use `src/components/charts.tsx` and the validated chart tokens.
  - Every page must work at 375px wide with no horizontal scroll.
- **Privacy:** never store message text, window titles or keystrokes. New data goes into `/api/me/export` and is removed by `DELETE /api/me`.
- **Honesty:** label synthetic and generated data as such in the UI and the docs.

## Branches and commits
Use feature branches (`feat/android-listener`), small commits with imperative messages, and open a PR to `main`.
