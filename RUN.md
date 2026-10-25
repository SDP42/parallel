# How to run Parallel

Two processes run side by side:
- **Backend:** FastAPI on http://127.0.0.1:8787
- **Frontend:** Vite on http://localhost:5180. It forwards `/api` to the backend.

## Prerequisites (all platforms)
| Tool | Version | Check |
|---|---|---|
| Python | 3.10 – 3.12 | `python3 --version` (Mac/Linux) · `py --version` (Windows) |
| Node.js | 20 or newer | `node -v` |
| Browser | Chrome or Edge (WebGL2; voice input needs Chrome/Edge) | — |

---

## Option A — one command

### macOS / Linux
```bash
cd parallel
./run.sh
```

### Windows (PowerShell)
```powershell
cd parallel
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

The first run takes about 2 minutes. It:
- creates a Python virtual environment and installs the requirements
- generates the dataset and trains the models
- runs `npm install`

Later runs start in seconds. When it's ready, open **http://localhost:5180**.

---

## Option B — step by step (two terminals)

### 1. Backend

**macOS / Linux**
```bash
cd parallel/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m ml.dataset --users 60 --days 30
python -m ml.train
python -m uvicorn app.main:app --port 8787 --reload
```

**Windows (PowerShell)**
```powershell
cd parallel\backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m ml.dataset --users 60 --days 30
python -m ml.train
python -m uvicorn app.main:app --port 8787 --reload
```

**Windows (Command Prompt)**
```bat
cd parallel\backend
py -3 -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
python -m ml.dataset --users 60 --days 30
python -m ml.train
python -m uvicorn app.main:app --port 8787 --reload
```

Check that it's up: open http://127.0.0.1:8787/api/health. It should show `{"ok": true}`. The interactive API docs are at http://127.0.0.1:8787/docs.

### 2. Frontend (new terminal, same on every OS)
```bash
cd parallel/frontend
npm install
npm run dev -- --port 5180
```
Open **http://localhost:5180**.

---

## Signing in
Use the one-click demo buttons on `/signin`, or type one of these:

| Email | Password |
|---|---|
| student@parallel.app | parallel123 |
| developer@parallel.app | parallel123 |
| creator@parallel.app | parallel123 |
| professional@parallel.app | parallel123 |

You can also create your own account. It walks you through persona onboarding, and your twin starts from a labelled warm-up history plus the population model.

## Useful commands
| What | Command (inside `backend/`, venv active) |
|---|---|
| Regenerate the dataset (bigger) | `python -m ml.dataset --users 120 --days 45` |
| Retrain and register a new model version | `python -m ml.train` |
| Run backend tests | `python -m pytest -q tests` |
| Look inside the database | `sqlite3 parallel.db ".tables"` or open it with DB Browser for SQLite |
| Production build of the frontend | `cd ../frontend && npm run build` (output in `frontend/dist`) |

## Environment variables (optional)
| Variable | Where | Purpose |
|---|---|---|
| `PARALLEL_SECRET` | backend | JWT signing secret (set a long random value in production) |
| `PARALLEL_DB` | backend | Path to the SQLite file (default `backend/parallel.db`) |
| `PARALLEL_DEMO_PASSWORD` | backend | Password for the seeded demo accounts |
| `VITE_API_URL` | frontend | Backend URL when frontend and API are hosted separately |
| `VITE_GA_ID` | frontend | Google Analytics 4 ID (loaded only after cookie consent) |
| `VITE_SITE_URL` | frontend | Canonical site URL for SEO tags |

## Troubleshooting
| Problem | Fix |
|---|---|
| `Address already in use` on 8787 or 5180 | Another app is using the port. Start on another one (e.g. `--port 8790`) and update `server.proxy` in `frontend/vite.config.ts`, or stop the other app. |
| Windows: “running scripts is disabled” | Use `run.ps1` with `-ExecutionPolicy Bypass`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. |
| `py` not found on Windows | Install Python from python.org and tick “Add python.exe to PATH”, then use `python` instead of `py -3`. |
| Landing page shows no 3D | Turn on hardware acceleration in your browser and check WebGL2 at https://get.webgl.org/webgl2/. |
| Data & models page says “not generated yet” | Run `python -m ml.dataset` then `python -m ml.train` in `backend/`. |
| “The twin is offline” on the landing page | The backend isn't running. Start step 1. |
| Voice input button missing | Speech recognition needs Chrome or Edge, and microphone permission. |
