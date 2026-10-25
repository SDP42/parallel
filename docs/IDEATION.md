# Ideation: why Parallel exists

## The real problem
The problem isn't *screen time*. It's that we accept or ignore interruptions **without knowing what they will cost us**. A like during deep work can cost one person 2 minutes and another 40, yet every phone and every focus app treats them the same.

Three things make this hard today:
1. **Small interruptions have large downstream costs.** A glance turns into an app, then a feed, then a slow, foggy return to the task (attention residue).
2. **Notifications are treated alike.** A teammate's question, a bank alert and a like land in the same tray.
3. **Time isn't attention.** An app open for an hour can be deep work or passive drift. Duration alone can't tell the difference.

## Who faces it
- **Students** preparing for exams while Instagram, WhatsApp and Discord keep pinging.
- **Developers** in flow on a hard bug, interrupted by low-value pings.
- **Creators**, whose work tool (social media) is also their biggest distraction.
- **Professionals** with fragmented, meeting-heavy days and inboxes that never stop.

## What exists, and what's missing
| Tool | Does well | Missing |
|---|---|---|
| RescueTime, Rize | Track time, count context switches | Looks backward only; no per-notification prediction |
| Freedom, Opal, ScreenZen | Block apps and sites on rules | Static rules, no learning, no "what if" |
| one sec | Adds friction before opening an app | Acts at app open, not at notification time; not personal |
| Forest | Motivation through gamification | No data model at all |
| Apple Focus / Android Digital Wellbeing | Focus modes, summaries | Manual rules; no cost estimate, no simulation |
| Clockwise / Reclaim | Protects calendar focus time | No device or notification signal |

**The gap:** nobody predicts the *downstream chain* one notification will cause for *this* person, shows the *counterfactual*, and then checks whether the prediction was right.

## Research we stand on (and how carefully we cite it)
- **Gloria Mark:** time on one screen before switching dropped to about 47 s in 2016–2020 field studies. This measures screen switching, not "attention span".
- **Mark et al. (CHI 2005):** interrupted work is resumed after about 25 min, with other tasks in between. We avoid the overstated "every notification costs 23 minutes".
- **Leroy (2009):** attention residue. Switching away from an unfinished task hurts the next one.
- **Mehrotra et al. (CHI 2016):** a study of 10,372 real notifications found that disruption depends on task, sender and personality. This is the case for *personal* models.
- **Fitz et al. (2019):** a randomized trial of 237 people. Batching notifications improved attention and mood, but turning them off entirely raised anxiety and FoMO. This is the case for *triage over blocking*.
- **Pielot et al. (2014, 2015):** about 63.5 notifications a day; boredom can be inferred from phone use (AUC 0.83), so receptive moments are predictable.

## Our differentiators
1. **A counterfactual per notification:** allow vs hold vs digest, with a range and a confidence.
2. **Causal, not just correlated:** randomized holdouts (a micro-randomized trial) plus a T-learner that is validated against them.
3. **Personal, with an honest cold start:** a population prior shrinks toward each user's own history; the twin abstains when unsure.
4. **Two layers:** a comic "two universes" story on top of grounded numbers. Memorable, without lying.
5. **Accuracy shown, not claimed:** calibration, comparison against a generic rule, drift, data quality, prediction-vs-reality checks.
6. **Your rules win:** trusted senders always pass; no shame mechanics; XP for intentional choices only.
7. **A platform, not just an app:** the Attention API and SDK, focus reservations, a portable profile, privacy-safe team aggregates.
8. **Inclusive:** four languages and a voice coach.

## Hard problems and how we handled them
| Problem | Our approach |
|---|---|
| Attention isn't directly observable | Estimate it from behaviour (switches, dwell, return time) with uncertainty; never claim to read minds |
| Proving the counterfactual | Randomized holdouts on low-importance alerts; T-learner checked against them |
| OS restrictions | Android NotificationListener, desktop via ActivityWatch, iOS limited to Focus filters; a capability matrix in the API |
| Fatigue isn't observable | A multi-signal behavioural estimate, labelled as such, with optional self-reports |
| Privacy | Metadata only; message text and window titles dropped; retention, pause, export, delete; hash-chained audit |
| Cold start and drift | Population model plus persona warm-up; PSI drift monitor; versioned model registry |
| Over-blocking | VIP always passes, abstention when unsure, reversible holds, a daily XP cap on holding back |

## Roadmap after the hackathon
- An Android companion app (NotificationListenerService) and an ActivityWatch desktop bridge.
- Cross-device continuity: phone and laptop as one focus context.
- On-device and federated personalization with secure aggregation.
- A browser rabbit-hole interceptor extension.
- Notification-quality analytics for product teams (opt-in, aggregate).
