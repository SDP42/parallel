#!/usr/bin/env bash
# Parallel: one-command setup + run for macOS / Linux.
# Usage: ./run.sh            (first run installs everything, builds the dataset and trains models)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  echo "→ Creating Python virtual environment"
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
if [ ! -f models/LATEST ]; then
  echo "→ Generating the synthetic dataset (60 users × 30 days) and training models (~1 min)"
  python -m ml.dataset --users 60 --days 30
  python -m ml.train
fi
echo "→ Starting API on http://127.0.0.1:8787"
python -m uvicorn app.main:app --port 8787 &
API_PID=$!
trap "kill $API_PID 2>/dev/null" EXIT
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
echo "→ Starting web app on http://localhost:5180"
npm run dev -- --port 5180
