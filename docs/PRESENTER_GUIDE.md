# Presenter guide (5-minute demo + Q&A)

## Before you present
1. Run `./run.sh` (or `run.ps1` on Windows) and open http://localhost:5180 in Chrome.
2. Open a second tab already signed in as **developer@parallel.app / parallel123**.
3. Turn on browser hardware acceleration. Close heavy apps so the 3D runs smoothly.

## The 5-minute story

**0:00 — Hook (landing hero).**
"Every ping forks your day. This is your attention's digital twin." Move the mouse: the twin reacts.

**0:30 — The problem (scroll).**
"A like during deep work costs one person 2 minutes and another 40. Every focus app treats them the same."

**1:00 — What it learns (horizontal track).**
Point out that the six cards are the six bullets of the problem statement.

**1:30 — The fork (scroll the pinned chapter).**
This is the exact problem-statement example: +2, +17, +8 = 27 minutes, versus 0.7 minutes held back. Mention the counterfactual check.

**2:00 — Live fork on the landing page.**
Switch persona and notification. "These numbers come from a trained model, not a slide."

**2:30 — In the app: Multiverse.**
1. Pick Instagram.
2. Drag fatigue up and watch the cost rise.
3. Show the 2,000-future histogram and the "why" factors.
4. Show personal vs population vs blended.
5. Click **Hold back**, then do the reality check ("I lost 1 minute") to show the twin grading itself.

**3:30 — Smart inbox.**
Accept the twin's calls. Family and calendar always pass.

**3:50 — Data & models.**
"81,582 events from 60 users. Tested on users the model never saw: AUC 0.845 versus 0.73 for the baseline. Our counterfactual model matches the randomized ground truth within 0.9 minutes."

**4:20 — Coach.**
Switch to हिन्दी and ask by voice: "मैं कब सबसे अच्छा फोकस करता हूँ?"

**4:40 — Close.**
"Parallel doesn't tell you to use your phone less. It shows you what the next 20 minutes cost, lets you choose, and learns from the choice."

## Numbers to remember
- 81,582 notification events × 35 columns · 149,649 sessions · 60 users × 30 days (synthetic)
- p(open) AUC **0.845** vs 0.728 baseline · rabbit-hole AUC **0.802**
- Cost range coverage **79 %** (target 80 %) · T-learner gap **0.9 min**
- Personal twin vs generic notification rule: 10–24 % lower Brier score in backtests
- 22 % randomized holdouts on low-importance alerts only

## Likely judge questions
| Question | Answer |
|---|---|
| Is the data real? | It's synthetic, and we say so everywhere. The generator models per-person quirks, time-of-day focus, fatigue and randomized holdouts. The pipeline already ingests real ActivityWatch and app events (`/api/ingest/activitywatch`, `/api/events`). |
| How is this causal, not correlation? | A small share of low-importance alerts are held back at random. That randomization gives unbiased effects (with bootstrap confidence intervals), and our T-learner is validated against them. |
| What about iPhones? | iOS forbids reading other apps' notifications. We support Android's listener and desktop via ActivityWatch; iOS uses Focus filters. The API exposes a capability matrix. |
| Won't it hide something important? | Family, bank and calendar always pass. Users set rules that override the model, and when confidence is low the twin asks instead of deciding. |
| Is the LLM making up numbers? | There is no LLM in the loop. The coach routes intents to the models; every number comes from scikit-learn models and Monte Carlo rollouts. |
| Privacy? | Metadata only. No message text, keystrokes or screenshots. Pause, retention, export, a portable profile, delete, and a hash-chained audit log. |
| Business model? | A consumer app plus an Attention API: other apps can ask "is now a good moment?". Privacy-first team analytics (aggregates only, k ≥ 5). |
| What's next? | An Android companion, cross-device continuity, on-device/federated learning, a browser extension. |

## Where things live (for code questions)
- Personal model: `backend/app/twin.py`
- Population model and training: `backend/ml/train.py`
- Dataset generator: `backend/ml/dataset.py` and `backend/app/synth.py`
- API: `backend/app/main.py` and `backend/app/platform_api.py`
- 3D landing: `frontend/src/landing/` (`TwinWorld.tsx` holds the GLSL shader)
