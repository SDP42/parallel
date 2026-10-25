# Changelog

## v0.2.0 — routine-aware twin, mobile app, brain-first landing
### Added
- **7-step onboarding:**
  - persona and goals
  - wake/bed time and chronotype
  - weekly schedule editor with templates (skippable)
  - deadlines and exams (skippable)
  - tool vs nag apps
  - who always gets through

  The same editor is in Settings.
- **The twin uses your schedule:**
  - the focus curve, day-0 history, planner and recommendations all follow it
  - during a class or work block, low-value pings are held and the reason names the block
  - a deadline within 3 days makes the twin stricter and adds a "guard your golden hours" recommendation
- **Ongoing inputs on Today:**
  - a 10-second energy check-in
  - "did this matter?" taps that replace the generic importance of each alert type
  - a meter showing how well the twin knows you and what to add next
- **"Best moments to check held pings"**, based on when your declared blocks end. On native, these can become local reminders.
- **Time machine:** 30 simulated days, your current habits vs following the twin.
- **Attention doppelgänger:** your closest behavioural match among the 60 population users, and what worked for them.
- **Auto-reply drafts** for held DMs and work chat, in en/hi/mr/es. Never sent automatically.
- **Mobile:**
  - PWA (manifest, icons, offline shell)
  - Capacitor 8 with `android/` and `ios/` projects
  - safe areas
  - phone tab bar with a More sheet
  - haptics and the Android back button
- **Landing:** brain-first opening. Scrolling zooms through the brain into the twin's head.
- **Docs:** ARCHITECTURE, MOBILE, DATA_AND_ML, ROADMAP, CONTRIBUTING, and a Word project report.

### Fixed
- ActivityWatch ingest: it wrote to a removed `title` column. It now stores deduplicated events, turns them into live segments the fingerprint learns from, and accepts `tz_offset_min` because ActivityWatch times are UTC (pass 330 for IST).
- Horizontal overflow on phones from grids without explicit columns.
- The phone tab bar pointed at the wrong page after the Data & models page was added.

### Known limits
- Day-0 history is still generated. It now follows your declared routine, but it is not behaviour you actually showed; the Settings page says so, and real data replaces it as it arrives.
- Accuracy numbers are still on synthetic data. The best upgrade for a demo is a few days of your own ActivityWatch data.
- The ChatGPT share link in the brief never loaded, so none of its ideas are in this build.

## v0.1.0 — hackathon build
- Personal twin, Multiverse simulator, smart inbox, fingerprint, replay, twin brain, accuracy center, Lab, coach, 3D landing, population dataset and trained models.
